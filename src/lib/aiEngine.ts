import { Logger } from './logger';
import { db } from './db';
import { decryptString } from './cryptoVault';
import { validateEndpointUrl, checkNetworkConsent } from './networkGuard';
import { globalArena, vectoriser, parser, globalSynthesizer } from './SemanticArena';
import { sovereignEngine } from './wasm/SovereignEngine';
import { OPFSManager } from './storage/opfsManager';
import { localDaemon } from './providers/LocalDaemonProvider';
import { queryEAContextWithTags, ProcessQueryResult } from './ragOrchestrator';
import { epistemicShadow } from './EpistemicShadow';
import { clampGenerationBudget, getRuntimeModelProfile } from './modelRuntime';
import type { DeepParsedQuery } from './StructuralVectoriser';

// Active MITRA persona — set via EA_MITRA_CHANGED event from the UI
interface ActiveMitraProfile {
  id: number;
  systemPrompt: string;
  ragTags: string[];
  domain?: string;
}

let activeMitraProfile: ActiveMitraProfile | null = null;

// Foolproof KV Cache Isolation — tracks the last persona that held the engine context
let lastActivePersonaId: number | null = null;

/**
 * Dead Man's Switch watchdog — wraps a generation promise with a
 * 120-second timeout. If the underlying WASM worker hangs (OOM,
 * infinite loop, KV-cache exhaustion), the watchdog fires and
 * surfaces a recoverable error to the UI instead of blocking
 * the chat forever.
 *
 * The chosen budget (120s) is intentionally generous: a 1.1B
 * Q4_0 model on the Wasm SIMD CPU lane can take 60-90s for a
 * 1k-token completion. Anything longer than 2 minutes is almost
 * always a worker hang and should be surfaced to the user.
 */
const GENERATION_WATCHDOG_MS = 120_000;

async function withGenerationWatchdog<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(
        `GENERATION_WATCHDOG_TIMEOUT: ${label} did not complete within ${GENERATION_WATCHDOG_MS / 1000}s. The WASM worker is hung; please retry with a shorter prompt.`,
      ));
    }, GENERATION_WATCHDOG_MS);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

// On module load (including HMR reloads), read the active persona from DB
if (typeof window !== 'undefined') {
  db.mitra_profiles.filter(p => p.isActive).first().then(profile => {
    if (profile) {
      activeMitraProfile = {
        id: profile.id!,
        systemPrompt: profile.systemPrompt,
        ragTags: profile.ragTags || [],
        domain: profile.domain,
      };
    }
  }).catch(() => {
    // DB not ready yet — activeMitraProfile stays null, will be set by user action
  });

  window.addEventListener('EA_MITRA_CHANGED', (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail) {
      activeMitraProfile = {
        id: detail.profileId,
        systemPrompt: detail.systemPrompt,
        ragTags: detail.ragTags || [],
        domain: detail.domain,
      };
      Logger.info(`[MITRA] Active persona switched to: ${detail.name}`);
    } else {
      // Profile was deleted — fall back to the default system persona
      activeMitraProfile = null;
      Logger.info('[MITRA] Active persona removed. Reverted to default.');
    }
  });
}

// ─── Dynamic Context Budget Calculator (Hybrid: Model Cap ∩ Hardware Cap) ────

async function getModelContextCap(): Promise<number> {
  try {
    const models = await db.model_registry.toArray();
    const active = models.find(m => m.isActive);
    if (active?.contextWindow && active.contextWindow > 0) return active.contextWindow;
  } catch {
    // DB unavailable
  }
  return 4096; // Sensible default when no model config exists
}

function getHardwareCap(isDaemonActive: boolean): number {
  if (isDaemonActive) return 32768; // Native OS bypasses browser VRAM limits

  const isApple = /iPhone|iPad|iPod|Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent);
  if (isApple) return 2048; // Strict Safari/iOS VRAM limits

  // @ts-expect-error - deviceMemory is Chromium-only
  const mem = navigator.deviceMemory || 4;
  if (mem >= 16) return 8192;
  if (mem >= 8) return 4096;
  return 2048;
}

async function calculateDynamicBudget(isDaemonActive: boolean): Promise<number> {
  const modelCap = await getModelContextCap();
  const hardwareCap = getHardwareCap(isDaemonActive);
  return Math.min(modelCap, hardwareCap);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Sentence-Boundary Truncation ────────────────────────────────────────────

function truncateToBudget(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;

  const sentences = text.split(/(?<=[.!?])\s+/);
  let accumulated = '';
  for (const sentence of sentences) {
    const candidate = accumulated ? `${accumulated} ${sentence}` : sentence;
    if (estimateTokens(candidate) > maxTokens) break;
    accumulated = candidate;
  }
  return accumulated || text.slice(0, maxTokens * 4);
}

// ─── RAG Context Enrichment (Parallel Fetch + Weighted Budget Allocation) ────

interface EnrichedContext {
  epistemicFacts: string;
  epistemicStatus: ProcessQueryResult['status'];
  reviewContext: string;
  enterpriseContext: string;
  allFacts: string;
}

interface RAGWeights {
  epistemic: number;
  vector: number;
  enterprise: number;
}

async function getRAGWeights(): Promise<RAGWeights> {
  try {
    const [ep, vec, ent] = await Promise.all([
      db.app_settings.get('ragWeightEpistemic'),
      db.app_settings.get('ragWeightVector'),
      db.app_settings.get('ragWeightEnterprise'),
    ]);
    const epistemic = ep?.value ?? 0.5;
    const vector = vec?.value ?? 0.3;
    const enterprise = ent?.value ?? 0.2;
    const total = epistemic + vector + enterprise;
    return {
      epistemic: epistemic / total,
      vector: vector / total,
      enterprise: enterprise / total,
    };
  } catch {
    return { epistemic: 0.5, vector: 0.3, enterprise: 0.2 };
  }
}

async function enrichPrompt(
  userPrompt: string,
  tokenBudget: number,
  ragTags?: string[],
  chatHistory: { role: string; content: string }[] = []
): Promise<EnrichedContext> {
  const weights = await getRAGWeights();

  const epistemicBudget = Math.floor(tokenBudget * weights.epistemic);
  const vectorBudget = Math.floor(tokenBudget * weights.vector);
  const enterpriseBudget = Math.floor(tokenBudget * weights.enterprise);

  const [epistemicResult, arenaResult, enterpriseResult] = await Promise.allSettled([
    queryEAContextWithTags(userPrompt, ragTags, chatHistory),
    (async () => {
      const parsed = parser.parse(userPrompt);
      if (!parsed.Subject || !parsed.Intent) return [];
      const queryVector = vectoriser.vectorise(parsed);
      const results = globalArena.searchWithScores(queryVector, 0.18, ragTags);
      return results.map(r => {
        const comps = globalSynthesizer.getRawComponents(r.index);
        return comps.sourceSentence
          || (comps.orthogonal ? JSON.stringify(comps.orthogonal) : [comps.s, comps.i, comps.t].filter(Boolean).join(' '));
      });
    })(),
    (async () => {
      const memories = await db.semantic_memory
        .where('source')
        .anyOf(['enterprise_ingestion', 'legacy_embedding'])
        .toArray();
      if (memories.length === 0) return [];
      const parsed = parser.parse(userPrompt);
      const queryVector = vectoriser.vectorise(parsed);
      const scored = memories
        .filter(m => m.vector && m.vector.length === 64)
        .map(m => {
          let intersection = 0;
          let union = 0;
          for (let j = 0; j < 64; j++) {
            intersection += popcnt32(queryVector[j] & m.vector[j]);
            union += popcnt32(queryVector[j] | m.vector[j]);
          }
          return { memory: m, score: union > 0 ? intersection / union : 0 };
        })
        .filter(x => x.score >= 0.18)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(x => x.memory.context || `${x.memory.subject} ${x.memory.predicate} ${x.memory.object}`);
      return scored;
    })(),
  ]);

  const epistemicFacts = epistemicResult.status === 'fulfilled'
    ? truncateToBudget((epistemicResult.value as ProcessQueryResult).text || '', epistemicBudget)
    : '';
  const epistemicStatus = epistemicResult.status === 'fulfilled'
    ? (epistemicResult.value as ProcessQueryResult).status
    : 'fallback';

  const reviewContext = arenaResult.status === 'fulfilled'
    ? truncateToBudget((arenaResult.value as string[]).join('\n\n'), vectorBudget)
    : '';

  const enterpriseContext = enterpriseResult.status === 'fulfilled'
    ? truncateToBudget((enterpriseResult.value as string[]).join('\n\n'), enterpriseBudget)
    : '';

  const allFacts = [epistemicFacts, reviewContext, enterpriseContext]
    .filter(Boolean)
    .join('\n\n');

  return { epistemicFacts, epistemicStatus, reviewContext, enterpriseContext, allFacts };
}

function popcnt32(n: number): number {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return ((n + (n >>> 4) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

// ─── 3-Tier MoE Cognitive Routing (Arena-Based Scoring) ──────────────────────

type MoETier = 'EPISTEMIC' | 'TINY' | 'PRIMARY';

export type ChatEngineKind = 'epistemic' | 'sovereign-wasm' | 'daemon' | 'byom-network';

export interface ChatWithAgentResult {
  text: string;
  engineUsed: ChatEngineKind;
  routeReason: string;
  epistemicStatus?: ProcessQueryResult['status'];
}

async function getMoEThreshold(): Promise<number> {
  try {
    const setting = await db.app_settings.get('moEThreshold');
    return setting?.value ?? 0.18;
  } catch {
    return 0.18;
  }
}

async function routeMoE(
  prompt: string,
  executionTarget: string,
  epistemicStatus?: ProcessQueryResult['status']
): Promise<MoETier> {
  if (executionTarget === 'Tiny Triage Agent (Epistemic)') return 'EPISTEMIC';
  if (executionTarget === 'Primary EA Agent') return 'PRIMARY';
  if (executionTarget === 'Tiny Triage Agent') return 'TINY';

  if (executionTarget === 'Auto-Route (MoE)') {
    if (epistemicStatus && ['hit', 'guardrail', 'disambiguate', 'curiosity'].includes(epistemicStatus)) {
      return 'EPISTEMIC';
    }
  }

  if (globalMoETarget === 'Tiny Triage Agent (Epistemic)') return 'EPISTEMIC';

  try {
    const parsed = parser.parse(prompt);
    if (!parsed.Subject || !parsed.Intent) {
      return 'TINY'; // Insufficient structure for arena search
    }

    const queryVector = vectoriser.vectorise(parsed);
    const threshold = await getMoEThreshold();
    const results = globalArena.searchWithScores(queryVector, threshold);

    if (results.length > 0 && results[0].weightedScore >= threshold && !(results[0].target === 'concept' && !results[0].hasSource)) {
      return 'EPISTEMIC'; // High-confidence arena match — deterministic synthesis
    }

    return 'TINY'; // Below threshold — escalate to LLM
  } catch {
    return 'TINY'; // Arena unavailable — escalate to LLM
  }
}

export async function getSystemPrompt(currentScope: string = 'GLOBAL'): Promise<string> {
  let basePrompt = "You are the EA-NITI Synthesis Engine. You do not hallucinate. You will be provided with a user query and a list of verified [FACTS]. Your ONLY job is to synthesize these [FACTS] into a polite, professional, and crisp response. Do not add outside knowledge. If the [FACTS] do not contain the answer, output exactly: 'I lack the structural data to answer this query.'";

  try {
    const masterPersona = await db.prompt_templates.where('name').equals('Master System Persona').first();
    if (masterPersona && masterPersona.promptText) {
      basePrompt = masterPersona.promptText;
    }
  } catch (e) {
    Logger.warn("Failed to fetch Master System Persona, falling back to default.", e);
  }

  try {
    const activeGuardrails = await db.privacy_guardrails.filter(g => g.isActive === true).toArray();
    const scopedGuardrails = activeGuardrails.filter(g => {
      if (!g.enforcementScope || g.enforcementScope.length === 0) return true;
      return g.enforcementScope.includes('GLOBAL') || g.enforcementScope.includes(currentScope);
    });

    if (scopedGuardrails.length > 0) {
      const rulesBlock = scopedGuardrails
        .map((g) => `- [${g.title}]: ${g.ruleText}`)
        .join('\n');
      basePrompt += `\n\nCRITICAL COMPLIANCE GUARDRAILS:\n${rulesBlock}`;
    }
  } catch (e) {
    Logger.warn("Failed to fetch privacy guardrails, proceeding without.", e);
  }

  return basePrompt;
}

// ─── Greeting Resolution (Identity over Domain) ──────────────────────────────

async function resolveGreeting(mitraProfileId: number | null): Promise<string> {
  try {
    // If a specific persona is requested, try to find a greeting for that persona's domain
    if (mitraProfileId) {
      const profile = await db.mitra_profiles.get(mitraProfileId);
      if (profile?.domain) {
        const domainGreeting = await db.prompt_templates
          .where('type').equals('greeting')
          .and(p => p.category === profile.domain)
          .first();
        if (domainGreeting?.promptText) return domainGreeting.promptText;
      }
    }

    // Fall back to global EA_CHAT_GREETING
    const globalGreeting = await db.prompt_templates
      .where('name').equals('EA_CHAT_GREETING')
      .first();
    if (globalGreeting?.promptText) return globalGreeting.promptText;
  } catch {
    // DB unavailable — use hardcoded fallback
  }

  return "Hello! I am **EA-NITI**, your enterprise-grade edge AI agent. I run completely air-gapped in your browser with Sovereign Engine (OPFS pipeline active).\n\nI can assist with any **SAMIKSHA** review process — Enhancement Reviews (ER), New System Implementation (NSI) — as well as DDQ audits, threat modeling, and all pre-configured workflows in your vault. How can I help?";
}

// ─── Foolproof KV Cache Isolation Gatekeeper ──────────────────────────────────

async function ensurePersonaActive(mitraProfileId: number | null): Promise<void> {
  if (mitraProfileId !== lastActivePersonaId) {
    sovereignEngine.clearContext();
    if (localDaemon.isConnected) localDaemon.resetSession();
    lastActivePersonaId = mitraProfileId;
    Logger.info(`[KV Cache] Persona switched to ${mitraProfileId ?? 'default'}. Context flushed.`);
  }
}

// ─── Persona Resolution Helper ───────────────────────────────────────────────

async function resolvePersona(mitraProfileId: number | null): Promise<ActiveMitraProfile | null> {
  if (!mitraProfileId) return activeMitraProfile;

  try {
    const profile = await db.mitra_profiles.get(mitraProfileId);
    if (profile) {
      return {
        id: profile.id!,
        systemPrompt: profile.systemPrompt,
        ragTags: profile.ragTags || [],
        domain: profile.domain,
      };
    }
  } catch {
    // DB unavailable — fall back to active global persona
  }

  return activeMitraProfile;
}

// ─── Model ID Resolution from Execution Target ───────────────────────────────

async function resolveModelId(executionTarget: string): Promise<string | null> {
  try {
    const dbKey = executionTarget === 'Primary EA Agent' ? 'core-primary' : 'core-triage';
    const config = await db.app_settings.get(dbKey);
    if (config?.value?.id) {
      return config.value.id;
    }
  } catch {
    Logger.warn(`[ModelResolver] Failed to resolve modelId for target: ${executionTarget}`);
  }
  return null;
}

async function ensureModelCached(modelId: string): Promise<void> {
  const hasModel = await OPFSManager.hasModel(modelId);
  if (!hasModel) {
    throw new Error(`MODEL_NOT_CACHED: Model "${modelId}" is not cached in OPFS. Please download it first via System Health or sideload via Upload Model.`);
  }
  await sovereignEngine.ensureInitialized(modelId);
}

function resolveBrowserGenerationBudget(modelId: string | null, requested?: number): number {
  return clampGenerationBudget(modelId, requested);
}

function isRecoverableWasmGenerationError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || '');
  return [
    'TIMEOUT',
    'WATCHDOG_TIMEOUT',
    'NO_VISIBLE_TOKENS',
    'Single token generation exceeded',
    'Total generation exceeded',
  ].some(marker => msg.includes(marker));
}

function synthesizeEpistemicFallback(enrichedContext: EnrichedContext): string | null {
  const facts = enrichedContext.epistemicFacts || enrichedContext.reviewContext || enrichedContext.enterpriseContext;
  if (!facts.trim()) return null;
  return facts.trim();
}

// ─── generateReview: Multi-Persona Workflow Handoff ──────────────────────────

export async function generateReview(
  prompt: string,
  onUpdate: (text: string) => void,
  _executionTarget?: string,
  options?: { mitraProfileId?: number }
): Promise<string> {
  const requestedPersonaId = options?.mitraProfileId ?? activeMitraProfile?.id ?? null;
  await ensurePersonaActive(requestedPersonaId);

  const persona = await resolvePersona(requestedPersonaId);
  const ragTags = persona?.ragTags;

  const isDaemonActive = localDaemon.isConnected;
  const tokenBudget = await calculateDynamicBudget(isDaemonActive);
  const enrichedContext = await enrichPrompt(prompt, tokenBudget, ragTags);

  const taskPrompt = `[FACTS]\n${enrichedContext.allFacts}\n\n[USER]\n${prompt}`;

  // Build message array: persona identity + neuro-symbolic grounding in a single system message
  const personaPrompt = persona?.systemPrompt || await getSystemPrompt();
  const systemContent = `${personaPrompt}\n\nCRITICAL DIRECTIVE: You are the EA-NITI Synthesis Engine. Answer EXCLUSIVELY using the [VERIFIED ARCHITECTURAL CONTEXT].`;

  const messages = [
    { role: 'system' as const, content: systemContent },
    { role: 'user' as const, content: taskPrompt },
  ];

  if (isDaemonActive) {
    return localDaemon.generateText(messages, (token) => { if (onUpdate) onUpdate(token); });
  }

  const modelId = await resolveModelId(_executionTarget || 'Primary EA Agent');
  if (!modelId) {
    throw new Error('NO_MODEL_CONFIGURED: No model is configured for this execution target. Please configure a model in Agent Settings.');
  }
  await ensureModelCached(modelId);
  const maxNewTokens = resolveBrowserGenerationBudget(modelId);
  return sovereignEngine.generateText(messages, (token) => { if (onUpdate) onUpdate(token); }, maxNewTokens);
}

// --- Small Talk Regex: matches common greetings / identity queries ---
const SMALL_TALK_RE = /^\s*(h(i|ello|ey|owdy)|yo|sup|good\s*(morning|afternoon|evening)|greetings|what'?s\s*up|who\s+are\s+you|what\s+are\s+you|are\s+you\s+an?\s+ai|thanks?|thank\s*you|ok|okay|bye|goodbye|see\s*ya)[!?.,\s]*$/i;

export async function chatWithAgentDetailed(
  messages: { role: 'user' | 'assistant' | 'system', content: string }[],
  onUpdate: (text: string) => void,
  _executionTarget: string = 'Tiny Triage Agent'
): Promise<ChatWithAgentResult> {
  const userPrompt = messages[messages.length - 1]?.content || '';

  if (SMALL_TALK_RE.test(userPrompt) && userPrompt.length < 50) {
    const greeting = await resolveGreeting(activeMitraProfile?.id ?? null);
    onUpdate(greeting);
    return { text: greeting, engineUsed: 'epistemic', routeReason: 'small-talk' };
  }

  // Foolproof KV Cache Isolation — gatekeeper at the very beginning
  await ensurePersonaActive(activeMitraProfile?.id ?? null);

  // Stop any background distillation and abort in-flight generations — user prompt takes priority
  epistemicShadow.interrupt();
  if (localDaemon.isConnected) localDaemon.abortGeneration();
  if (sovereignEngine.isIdle === false) sovereignEngine.abortGeneration();

  // RAG tag boundary from the active persona — filters the corpus to relevant domain
  const activeRagTags = activeMitraProfile?.ragTags;
  const chatHistory = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));

  // Inject the active MITRA persona's system prompt, or fall back to the default
  let effectiveSystemPrompt: string;
  if (activeMitraProfile?.systemPrompt) {
    effectiveSystemPrompt = activeMitraProfile.systemPrompt;
  } else {
    effectiveSystemPrompt = await getSystemPrompt();
  }

  // BYOM Network Model routing (preserved — external API, not Sovereign Engine)
  const models = await db.model_registry.toArray();
  const targetModel = models.find(m => m.name === _executionTarget);

  if (targetModel && targetModel.type === 'BYOM_NETWORK') {
    Logger.info(`[BYOM Router] Routing to Custom Enterprise Endpoint: ${targetModel.name}...`);
    const consent = await checkNetworkConsent();
    if (!consent) {
      onUpdate('\n\n[Security Block] Network access disabled. Enable the network feature to use BYOM endpoints.');
      throw new Error('Network access disabled.');
    }
    try { await validateEndpointUrl(targetModel.modelUrl); } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onUpdate(`\n\n[Security Block] Endpoint validation failed: ${msg}`);
      throw new Error(`Endpoint blocked: ${msg}`);
    }

    let bearerToken: string | undefined;
    if (targetModel.encryptedApiKey) {
      try { bearerToken = await decryptString(targetModel.encryptedApiKey); } catch { /* fallback to empty */ }
    }

    // Concatenate persona + grounding into a single system message for tokenizer safety
    const systemContent = `${effectiveSystemPrompt}\n\nCRITICAL DIRECTIVE: You are the EA-NITI Synthesis Engine. Answer EXCLUSIVELY using the [VERIFIED ARCHITECTURAL CONTEXT].`;

    const hasSystemMessage = messages.some(m => m.role === 'system');
    const routedMessages = hasSystemMessage
      ? messages.map(m => m.role === 'system' ? { ...m, content: systemContent } : m)
      : [{ role: 'system' as const, content: systemContent }, ...messages];

    try {
      const response = await withGenerationWatchdog(
        fetch(targetModel.modelUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(bearerToken ? { 'Authorization': `Bearer ${bearerToken}` } : {})
          },
          body: JSON.stringify({
            model: targetModel.name,
            messages: routedMessages,
            temperature: 0.3,
            stream: false
          }),
          redirect: 'error',
        }),
        `byom:${targetModel.name}`,
      );

      if (!response.ok) throw new Error(`Endpoint returned ${response.status}: ${response.statusText}`);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || JSON.stringify(data);
      onUpdate(content);

      // Queue this exchange for background learning
      epistemicShadow.enqueueDelta(userPrompt, content);

      return { text: content, engineUsed: 'byom-network', routeReason: `byom:${targetModel.name}` };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      const failMsg = `[BYOM Router Error] Failed to reach endpoint. Error: ${errorMsg}`;
      onUpdate(failMsg);
      throw new Error(failMsg);
    }
  }

  // ── Phase 1.6: Decoupled Context → Cognition → Execution ──

  // 1. Context Enrichment
  const isDaemonActive = localDaemon.isConnected;
  const tokenBudget = await calculateDynamicBudget(isDaemonActive);
  const enrichedContext = await enrichPrompt(userPrompt, tokenBudget, activeRagTags, chatHistory);

  // 2. Cognitive Routing (MoE) — Arena-based scoring (Grammar Orthogonal Vector Synthesis)
  const moETier = await routeMoE(userPrompt, _executionTarget, enrichedContext.epistemicStatus);

  // TIER 1: EPISTEMIC — Pure deterministic synthesis via MoatVectoriser + SemanticArena
  // O(1) mathematical lookup. No Wasm. No Daemon. TypeScript-only.
  if (moETier === 'EPISTEMIC') {
    const response = enrichedContext.epistemicFacts || 'I lack the structural data to answer this query.';
    onUpdate(response);

    return {
      text: response,
      engineUsed: 'epistemic',
      routeReason: `epistemic:${enrichedContext.epistemicStatus}`,
      epistemicStatus: enrichedContext.epistemicStatus,
    };
  }

  // 3. Execution Routing (Tiers 2 & 3) — Local Daemon > Sovereign Wasm
  const taskPrompt = `[FACTS]\n${enrichedContext.allFacts}\n\n[USER]\n${userPrompt}`;

  // Concatenate persona + grounding into a single system message
  const systemContent = `${effectiveSystemPrompt}\n\nCRITICAL DIRECTIVE: You are the EA-NITI Synthesis Engine. Answer EXCLUSIVELY using the [VERIFIED ARCHITECTURAL CONTEXT].`;
  const engineMessages = [
    { role: 'system' as const, content: systemContent },
    { role: 'user' as const, content: taskPrompt },
  ];

  let response: string;
  if (isDaemonActive) {
    Logger.info('[Router] Local Daemon active. Offloading to native OS.');
    response = await withGenerationWatchdog(
      localDaemon.generateText(engineMessages, (token) => { if (onUpdate) onUpdate(token); }),
      'local-daemon',
    );
  } else {
    Logger.info('[Router] Daemon offline. Using Sovereign Wasm Engine.');
    const modelId = await resolveModelId(_executionTarget);
    if (!modelId) {
      throw new Error('NO_MODEL_CONFIGURED: No model is configured for this execution target. Please configure a model in Agent Settings.');
    }
    await ensureModelCached(modelId);
    const profile = getRuntimeModelProfile(modelId);
    const maxNewTokens = resolveBrowserGenerationBudget(modelId);
    Logger.info(`[Router] Sovereign Wasm profile=${profile.modelId} template=${profile.templateFamily} maxNewTokens=${maxNewTokens}`);
    try {
      response = await sovereignEngine.generateText(engineMessages, (token) => { if (onUpdate) onUpdate(token); }, maxNewTokens);
    } catch (error) {
      if (isRecoverableWasmGenerationError(error)) {
        const fallback = synthesizeEpistemicFallback(enrichedContext);
        if (fallback) {
          Logger.warn('[Router] Sovereign Wasm failed before a usable answer. Returning deterministic epistemic fallback.', error);
          onUpdate(fallback);
          return {
            text: fallback,
            engineUsed: 'epistemic',
            routeReason: `wasm-recoverable-fallback:${error instanceof Error ? error.message : String(error)}`,
            epistemicStatus: enrichedContext.epistemicStatus,
          };
        }
      }
      throw error;
    }
  }

  // Phase 1.8: Enqueue for background distillation
  epistemicShadow.enqueueDelta(userPrompt, response);

  return {
    text: response,
    engineUsed: isDaemonActive ? 'daemon' : 'sovereign-wasm',
    routeReason: moETier === 'PRIMARY' ? 'llm-primary' : 'llm-triage',
    epistemicStatus: enrichedContext.epistemicStatus,
  };
}

export async function chatWithAgent(
  messages: { role: 'user' | 'assistant' | 'system', content: string }[],
  onUpdate: (text: string) => void,
  executionTarget: string = 'Tiny Triage Agent'
): Promise<string> {
  const result = await chatWithAgentDetailed(messages, onUpdate, executionTarget);
  return result.text;
}

export async function buildRagOnlyResponse(
  _userPrompt: string,
  eaContext: string,
  onUpdate: (text: string) => void
): Promise<string> {
  if (eaContext.includes('[CRITICAL GUARDRAIL INTERCEPT]')) {
    onUpdate(eaContext);
    return eaContext;
  }
  if (!eaContext || eaContext.length === 0) {
    const fallbackMsg = `⚡ **Neuro-Symbolic Fallback**\n\nI currently have no structural data, policies, or architectural blueprints in my local vault regarding your query.`;
    onUpdate(fallbackMsg);
    return fallbackMsg;
  }
  onUpdate(eaContext);
  return eaContext;
}

export async function analyzeWebTrends(
  webData: string,
  onUpdate: (text: string) => void
): Promise<string> {
  const prompt = `Analyze these recent internet search results regarding Enterprise Architecture. Extract 3 new, critical principles as plain English sentences.

Search Results:
${webData}

Output exactly ONE plain English sentence per line. No markdown, no bullet points, no JSON.
Each sentence must follow the pattern: Subject performs-action on Target.
Example:
TOGAF governs enterprise architecture development
BIAN standardizes banking service domains
Zero-trust architecture eliminates implicit network trust`;

  const persona = activeMitraProfile;
  const isDaemonActive = localDaemon.isConnected;
  const tokenBudget = await calculateDynamicBudget(isDaemonActive);
  const enrichedContext = await enrichPrompt(prompt, tokenBudget, persona?.ragTags);

  const personaPrompt = persona?.systemPrompt || await getSystemPrompt();
  const systemContent = `${personaPrompt}\n\nCRITICAL DIRECTIVE: You are the EA-NITI Synthesis Engine. Answer EXCLUSIVELY using the [VERIFIED ARCHITECTURAL CONTEXT].`;

  const messages = [
    { role: 'system' as const, content: systemContent },
    { role: 'user' as const, content: `[FACTS]\n${enrichedContext.enterpriseContext}\n\n[PROMPT]\n${prompt}` },
  ];

  let reply: string;
  if (isDaemonActive) {
    reply = await withGenerationWatchdog(
      localDaemon.generateText(messages, (token) => { if (onUpdate) onUpdate(token); }),
      'local-daemon',
    );
  } else {
    const modelId = await resolveModelId('Primary EA Agent');
    if (!modelId) {
      throw new Error('NO_MODEL_CONFIGURED: No model is configured. Please configure a model in Agent Settings.');
    }
    await ensureModelCached(modelId);
    reply = await withGenerationWatchdog(
      sovereignEngine.generateText(messages, (token) => { if (onUpdate) onUpdate(token); }, resolveBrowserGenerationBudget(modelId, 64)),
      `sovereign:${modelId}`,
    );
  }

  // Non-blocking distillation: continuous learning in background
  setTimeout(() => {
    try {
      const triplets = parser.parseOrthogonalLayersFromText(reply);
      for (const triplet of triplets) {
        globalArena.addMemory(triplet, 2);
      }
      if (triplets.length > 0) {
        Logger.info(`[Distillation] Absorbed ${triplets.length} new facts from web analysis.`);
      }
    } catch (e) {
      Logger.warn('[Distillation] Failed to parse LLM output for distillation', e);
    }
  }, 0);

  return reply;
}

export async function analyzeWithHybridProvider(
  webData: string,
  providerType: 'WebSearchAPI' | 'CloudLLMAPI' | 'CustomEnterprise',
  onUpdate: (text: string) => void
): Promise<string> {
  try {
    if (providerType === 'WebSearchAPI' || providerType === 'CustomEnterprise') {
      return await analyzeWebTrends(webData, onUpdate);
    }
    if (providerType === 'CloudLLMAPI') {
      onUpdate('Parsing Cloud LLM response...');
      try {
        const parsed = JSON.parse(webData);
        if (Array.isArray(parsed)) return JSON.stringify(parsed);
        if (parsed.choices && Array.isArray(parsed.choices)) {
          const content = parsed.choices[0]?.message?.content || parsed.choices[0]?.delta?.content || '';
          return content;
        }
        return JSON.stringify(parsed);
      } catch { return webData; }
    }
    throw new Error(`Unknown provider type: ${providerType}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onUpdate(`Error in hybrid analysis: ${message}`);
    throw new Error(message);
  }
}

export function distillTripletsFromResponse(responseText: string): void {
  setTimeout(() => {
    try {
      const triplets = parser.parseOrthogonalLayersFromText(responseText).filter(isDistillableTriplet);
      for (const triplet of triplets) {
        globalArena.addMemory(triplet, 2, false, responseText);
      }
      if (triplets.length > 0) {
        Logger.info(`[Distillation] Absorbed ${triplets.length} new facts from response.`);
      }
    } catch (e) {
      Logger.warn('[Distillation] Failed to distill triplets from response', e);
    }
  }, 0);
}

function isDistillableTriplet(triplet: DeepParsedQuery): boolean {
  const subject = (triplet.Subject || '').trim().toLowerCase();
  const intent = (triplet.Intent || '').trim().toLowerCase();
  const target = (triplet.Target || '').trim().toLowerCase();
  if (!subject || !intent || !target) return false;
  if (target === 'concept') return false;

  const text = `${subject} ${intent} ${target}`;
  if (text.length < 8) return false;
  if (/\b(updats|areincorporat|reincorporat)\b/.test(text)) return false;

  const blocked = [
    'structurally',
    'unsupported_tensor_type',
    'cached gguf',
    'worker not available',
    'watchdog_timeout',
    'neuro-symbolic fallback',
    'critical guardrail intercept',
  ];

  return !blocked.some(marker => text.includes(marker));
}

/**
 * Parse triplets from conversation text and persist as unverified beliefs.
 * Respects AbortSignal so the foreground user prompt can cancel mid-flight.
 */
export async function distillDelta(text: string, signal: AbortSignal): Promise<void> {
  const triplets = parser.parseOrthogonalLayersFromText(text).filter(isDistillableTriplet);
  for (const triplet of triplets) {
    if (signal.aborted) throw new Error('AbortError');
    globalArena.addMemory(triplet, 1, false, text); // Unverified — background distillation
  }
  if (triplets.length > 0) {
    Logger.info(`[Distillation] Background absorbed ${triplets.length} facts (belief=Unverified).`);
  }
}

export let globalMoETarget = 'Tiny Triage Agent (Epistemic)';

export function setGlobalMoETarget(target: string) {
  globalMoETarget = target;
}
