import { Logger } from './logger';
import { CreateWebWorkerMLCEngine, InitProgressCallback, WebWorkerMLCEngine, hasModelInCache, AppConfig, prebuiltAppConfig } from '@mlc-ai/web-llm';
import { db } from './db';
import { decryptString } from './cryptoVault';
import { checkNetworkConsent } from '../utils/networkGuard';
import { findSimilarReviews, findRelevantEnterpriseContext } from './ragEngine';
import { queryEAContext } from './ragOrchestrator';
import { globalArena } from './SemanticArena';
import { DeepParsedQuery } from './StructuralVectoriser';

export const DEFAULT_PRIMARY_MODEL_ID = 'Phi-3-mini-4k-instruct-q4f16_1-MLC';
export const DEFAULT_TINY_MODEL_ID = 'gemma-2b-it-q4f16_1-MLC';

// Removed static CUSTOM_APP_CONFIG. We now build this dynamically via getDynamicAppConfig()


export async function getActiveModelId(type: 'Core' | 'Tiny'): Promise<string> {
  try {
    const models = await db.model_registry.toArray();
    if (type === 'Core') {
      const primary = models.find(m => m.type === 'PRIMARY' && m.isActive);
      return primary?.name || DEFAULT_PRIMARY_MODEL_ID;
    } else {
      const secondary = models.find(m => m.type === 'SECONDARY' && m.isActive);
      // Fallback to primary if no secondary is defined, avoiding null breaks
      const fallback = models.find(m => m.type === 'PRIMARY' && m.isActive);
      return secondary?.name || fallback?.name || DEFAULT_TINY_MODEL_ID;
    }
  } catch {
    return type === 'Core' ? DEFAULT_PRIMARY_MODEL_ID : DEFAULT_TINY_MODEL_ID;
  }
}

export async function getDynamicAppConfig(): Promise<AppConfig> {
  // Pull core agents from app_settings
  const primarySetting = await db.app_settings.get('core-primary');
  const triageSetting = await db.app_settings.get('core-triage');

  const primaryConfig = primarySetting?.value;
  const triageConfig = triageSetting?.value;

  const model_list: any[] = [];

  // NATIVE VERSION MATCHER: Extract WASM URL from installed @mlc-ai/web-llm package
  const getNativeWasmUrl = (modelId: string, dbWasmUrl?: string): string => {
    // 1. Check if this model is built-in to the installed WebLLM package
    const builtInModel = prebuiltAppConfig.model_list.find(m => m.model_id === modelId);

    // 2. If found in native registry, use it (guarantees ABI compatibility)
    if (builtInModel?.model_lib) {
      Logger.log(`[NATIVE MATCHER] Using version-matched WASM for ${modelId} from @mlc-ai/web-llm`);
      return builtInModel.model_lib;
    }

    // 3. Otherwise, trust the DB (for custom/sideloaded models only)
    return dbWasmUrl || '';
  };

  // Register Primary — use native matching for built-in models, DB for custom
  if (primaryConfig && primaryConfig.modelSourceMode === 'Remote URL') {
    const record: any = { model_id: primaryConfig.id, model: primaryConfig.url };
    // Get WASM URL: native registry first, then DB config
    const finalWasmUrl = getNativeWasmUrl(primaryConfig.id, primaryConfig.modelLibUrl);
    if (finalWasmUrl && finalWasmUrl.trim() !== '') {
      record.model_lib = finalWasmUrl;
    }
    model_list.push(record);
  } else {
    // Default primary fallback — extract native WASM if available
    const record: any = { model_id: DEFAULT_PRIMARY_MODEL_ID, model: 'https://huggingface.co/mlc-ai/Phi-3-mini-4k-instruct-q4f16_1-MLC/resolve/main/' };
    const finalWasmUrl = getNativeWasmUrl(DEFAULT_PRIMARY_MODEL_ID);
    if (finalWasmUrl && finalWasmUrl.trim() !== '') {
      record.model_lib = finalWasmUrl;
    }
    model_list.push(record);
  }

  // Register Triage — use native matching for built-in models, DB for custom
  if (triageConfig && triageConfig.modelSourceMode === 'Remote URL') {
    const record: any = { model_id: triageConfig.id, model: triageConfig.url };
    // Get WASM URL: native registry first, then DB config
    const finalWasmUrl = getNativeWasmUrl(triageConfig.id, triageConfig.modelLibUrl);
    if (finalWasmUrl && finalWasmUrl.trim() !== '') {
      record.model_lib = finalWasmUrl;
    }
    model_list.push(record);
  } else {
    // Default triage fallback — extract native WASM if available
    const record: any = { model_id: DEFAULT_TINY_MODEL_ID, model: 'https://huggingface.co/mlc-ai/gemma-2b-it-q4f16_1-MLC/resolve/main/' };
    const finalWasmUrl = getNativeWasmUrl(DEFAULT_TINY_MODEL_ID);
    if (finalWasmUrl && finalWasmUrl.trim() !== '') {
      record.model_lib = finalWasmUrl;
    }
    model_list.push(record);
  }

  const activeModels = await db.model_registry.filter(m => !!m.isActive).toArray();

  if (activeModels.length > 0) {
    activeModels.forEach(m => {
      // For custom registry models, try native first, then DB
      const finalWasmUrl = getNativeWasmUrl(m.name, m.wasmUrl);
      const record: any = { model_id: m.name, model: m.modelUrl };
      if (finalWasmUrl && finalWasmUrl.trim() !== '') {
        record.model_lib = finalWasmUrl;
      }
      model_list.push(record);
    });
  }

  return { model_list };
}

export async function getActiveModelUrl(modelId: string): Promise<string> {
  const config = await getDynamicAppConfig();
  const custom = config.model_list.find(m => m.model_id === modelId);
  if (custom && custom.model) return custom.model;
  return `https://huggingface.co/mlc-ai/${modelId}-GGUF`;
}


let engine: WebWorkerMLCEngine | null = null;
let currentActiveModelId: string | null = null;
let activeWorker: Worker | null = null;

export let globalMoETarget: string = 'Auto-Route (MoE)';

export function triggerSwarmSync() {
  if (activeWorker) {
    activeWorker.postMessage({ type: 'SWARM_SYNC_TRIGGER' });
  } else {
    // Fallback if worker not initialized yet
    const channel = new BroadcastChannel('ea-niti-swarm');
    channel.postMessage({ type: 'PING', agent: 'SME', intent: 'SYNC_RAG' });
    setTimeout(() => {
      channel.postMessage({ type: 'ACK', agent: 'SEC', status: 'RAG_SYNCED' });
    }, 1500);
  }
}

export function setGlobalMoETarget(target: string) {
  globalMoETarget = target;
}

export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    const config = await getDynamicAppConfig();
    return await hasModelInCache(modelId, config);
  } catch (e) {
    Logger.warn(`Could not check cache for ${modelId}:`, e);
    return false;
  }
}

export async function scanLocalModels(): Promise<{ modelId: string, isCached: boolean }[]> {
  try {
    const config = await getDynamicAppConfig();
    const results = [];
    for (const model of config.model_list) {
      const isCached = await hasModelInCache(model.model_id, config);
      results.push({ modelId: model.model_id, isCached });
    }
    return results;
  } catch (e) {
    Logger.warn("Error scanning local models:", e);
    return [];
  }
}

export async function unloadAIEngine(): Promise<void> {
  if (engine) {
    Logger.log(`Unloading active AI Engine (${currentActiveModelId}) from VRAM...`);
    await engine.unload();
    engine = null;
    currentActiveModelId = null;
  }
}

export async function purgeWebLLMCache(): Promise<void> {
  try {
    const cacheKeys = await caches.keys();
    for (const key of cacheKeys) {
      if (key.toLowerCase().includes('webllm') || key.toLowerCase().includes('mlc')) {
        await caches.delete(key);
        Logger.log(`[Cache Purge] Deleted orphaned AI cache: ${key}`);
      }
    }
  } catch (e) {
    Logger.warn('[Cache Purge] Failed to purge WebLLM caches:', e);
  }
}

export async function initAIEngine(
  progressCallback: InitProgressCallback,
  forceDownload: boolean = false,
  requestedTarget: string = 'Tiny Triage Agent',
  targetUrl?: string
): Promise<WebWorkerMLCEngine> {
  let targetModelId = requestedTarget;
  if (requestedTarget === 'Primary EA Agent') {
    const configSetting = await db.app_settings.get('core-primary');
    targetModelId = configSetting?.value?.id || DEFAULT_PRIMARY_MODEL_ID;
  } else if (requestedTarget === 'Tiny Triage Agent' || requestedTarget === 'Tiny Triage Agent') {
    const configSetting = await db.app_settings.get('core-triage');
    targetModelId = configSetting?.value?.id || DEFAULT_TINY_MODEL_ID;
  }

  // If engine is already loaded with the requested model, return it
  if (engine && currentActiveModelId === targetModelId) {
    return engine;
  }

  // If a different model is loaded, we heavily prioritize VRAM by unloading it first
  if (engine && currentActiveModelId !== targetModelId) {
    await unloadAIEngine();
  }

  const isModelAvailable = await isModelCached(targetModelId);
  const needsDownload = !isModelAvailable;

  // Consent and security blocking
  if (needsDownload && !forceDownload) {
    let networkEnabled = false;
    try {
      networkEnabled = await checkNetworkConsent();
    } catch {
      networkEnabled = false;
    }
    
    // Trigger global UI modal
    window.dispatchEvent(new CustomEvent('EA_AI_CONSENT_REQUIRED', {
      detail: { networkEnabled, targetModelId, executionTarget: requestedTarget }
    }));
    
    if (!networkEnabled) {
      throw new Error(`CONSENT_REQUIRED_OFFLINE: ${targetModelId} is missing. Please enable explicit Internet Access in Network & Privacy to download it.`);
    } else {
      throw new Error(`CONSENT_REQUIRED: Action requires downloading ${targetModelId} weights. Do you consent?`);
    }
  }

  const worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
  activeWorker = worker;

  const killSwitchHandler = async () => {
    Logger.warn("KILL SWITCH ACTIVATED: Terminating AI Worker and purging cache.");
    if (activeWorker) {
      activeWorker.terminate();
      activeWorker = null;
    }
    engine = null;
    currentActiveModelId = null;
    await purgeWebLLMCache();
    window.dispatchEvent(new CustomEvent('EA_AI_PROGRESS', { 
      detail: { text: 'Download aborted by user.', progress: 0 }
    }));
    window.removeEventListener('APP_NETWORK_FORCE_KILLED', killSwitchHandler);
  };
  window.addEventListener('APP_NETWORK_FORCE_KILLED', killSwitchHandler);
  
  currentActiveModelId = targetModelId;
  const interceptProgress: InitProgressCallback = (progress) => {
    // Bubble to any global listeners (e.g. EngineDiagnostics UI)
    window.dispatchEvent(new CustomEvent('EA_AI_PROGRESS', { 
      detail: { text: progress.text, progress: progress.progress }
    }));
    // Call the original caller's callback (e.g. ModelConsentModal)
    progressCallback(progress);
  };

  const config = await getDynamicAppConfig();

  if (targetUrl) {
    // NATIVE VERSION MATCHER: Use package's built-in WASM for native models
    const dbConfig = (await db.app_settings.get('core-primary'))?.value?.id === targetModelId
      ? (await db.app_settings.get('core-primary'))?.value
      : (await db.app_settings.get('core-triage'))?.value;

    // Check for native WASM first, then fall back to DB config
    const builtInModel = prebuiltAppConfig.model_list.find(m => m.model_id === targetModelId);
    const finalWasmUrl = builtInModel?.model_lib || dbConfig?.modelLibUrl;

    if (!config.model_list.some(m => m.model_id === targetModelId)) {
      const record: any = { model_id: targetModelId, model: targetUrl };
      // WebLLM demands explicit model_lib for custom model URLs
      if (finalWasmUrl && finalWasmUrl.trim() !== '') {
        record.model_lib = finalWasmUrl;
      }
      config.model_list.push(record);
    }
  }
  
  engine = await CreateWebWorkerMLCEngine(
    worker,
    targetModelId,
    { 
      initProgressCallback: interceptProgress,
      appConfig: config
    }
  );
  
  return engine;
}


export async function getSystemPrompt(currentScope: string = 'GLOBAL'): Promise<string> {
  let basePrompt = "You are EA-NITI (Network-isolated, In-browser, Triage & Inference). Elite, air-gapped Enterprise Architecture AI. Strict TOGAF/BIAN/0-trust focus. 0 cloud egress.";
  
  try {
    const masterPersona = await db.prompt_templates.where('name').equals('Master System Persona').first();
    if (masterPersona && masterPersona.promptText) {
      basePrompt = masterPersona.promptText;
    }
  } catch (e) {
    Logger.warn("Failed to fetch Master System Persona, falling back to default.", e);
  }

  // Inject active Privacy Guardrails as strict boundary conditions
  try {
    const activeGuardrails = await db.privacy_guardrails.filter(g => g.isActive === true).toArray();
    
    // Filter by enforcement scope
    const scopedGuardrails = activeGuardrails.filter(g => {
      if (!g.enforcementScope || g.enforcementScope.length === 0) return true; // Default to global if no scope defined
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

export async function generateReview(
  prompt: string,
  onUpdate: (text: string) => void,
  executionTarget: string = 'Tiny Triage Agent'
): Promise<string> {
  // If Auto-Route (MoE) is selected, we parse the prompt intent.
  // We identify "DDQ", "Architecture Layer", or "STRIDE" to route to the Primary EA Agent.
  let target = globalMoETarget !== 'Auto-Route (MoE)' ? globalMoETarget : executionTarget;
  if (target === 'Auto-Route (MoE)') {
    const isCoreEA = /DDQ|scorecard|architecture layer|STRIDE/i.test(prompt);
    target = isCoreEA ? 'Primary EA Agent' : 'Tiny Triage Agent';
    Logger.info(`[Auto-Router] Identified intent. Routing to ${target}...`);
  }

  let finalPrompt = prompt;
  if (target === 'Primary EA Agent' || target === 'Tiny Triage Agent' || globalMoETarget === 'Auto-Route (MoE)') {
    Logger.info(`[RAG Engine] Querying Long-Term Semantic Memory & Enterprise Context...`);
    try {
      const historicalContextsPromise = findSimilarReviews(prompt);
      const enterpriseContextsPromise = findRelevantEnterpriseContext(prompt);
      
      const [historicalContexts, enterpriseContexts] = await Promise.all([historicalContextsPromise, enterpriseContextsPromise]);
      
      let contextInjection = "";

      if (enterpriseContexts.length > 0) {
        Logger.info(`[RAG Engine] Found ${enterpriseContexts.length} relevant proprietary enterprise facts.`);
        contextInjection += `[PROPRIETARY ENTERPRISE CONTEXT]\nThe following are mandatory rules, constraints, and facts specific to this enterprise. You MUST abide by them:\n\n${enterpriseContexts.join("\n\n")}\n[END PROPRIETARY CONTEXT]\n\n`;
      }

      if (historicalContexts.length > 0) {
        Logger.info(`[RAG Engine] Found ${historicalContexts.length} relevant historical architectural decisions.`);
        contextInjection += `[ENTERPRISE HISTORICAL CONTEXT]\nThe following are historical architectural decisions previously made by this enterprise. Use them to ensure your current review does not blindly conflict with past approved architectures:\n\n${historicalContexts.join("\n\n")}\n[END HISTORICAL CONTEXT]\n\n`;
      }
      
      if (contextInjection) {
         finalPrompt = contextInjection + prompt;
      }
      
    } catch (e) {
      Logger.warn("RAG query failed, proceeding without extended context.", e);
    }
  }

  let eaContext = "";
  try {
    eaContext = await queryEAContext(prompt);
  } catch (e) {
    Logger.warn("Failed to fetch EA Context", e);
  }

  const sysPrompt = await getSystemPrompt();
  const systemMessage = eaContext 
    ? `${sysPrompt}\n\n${eaContext}` 
    : sysPrompt;

  // Check if target is a BYOM_NETWORK model
  const models = await db.model_registry.toArray();
  const targetModel = models.find(m => m.name === target);

  if (targetModel && targetModel.type === 'BYOM_NETWORK') {
    Logger.info(`[BYOM Router] Routing to Custom Enterprise Endpoint: ${targetModel.name}...`);
    let bearerToken = targetModel.apiKey;
    if (!bearerToken && targetModel.encryptedApiKey) {
      try {
        bearerToken = await decryptString(targetModel.encryptedApiKey);
      } catch (e) {
        Logger.warn('[BYOM Router] Failed to decrypt model registry API key. Falling back to empty Authorization header.', e);
      }
    }

    try {
      const response = await fetch(targetModel.modelUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(bearerToken ? { 'Authorization': `Bearer ${bearerToken}` } : {})
        },
        body: JSON.stringify({
          model: targetModel.name,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: finalPrompt }
          ],
          temperature: target === 'Primary EA Agent' ? 0.2 : 0.7,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Endpoint returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || JSON.stringify(data);
      onUpdate(content);
      return content;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      const failMsg = `[BYOM Router Error] Failed to reach endpoint ${targetModel.modelUrl}. Ensure your local server (e.g., Ollama) is running and accessible. Error: ${errorMsg}`;
      onUpdate(failMsg);
      throw new Error(failMsg);
    }
  }

  // Ensure the appropriate model is initialized, swapping VRAM if needed.
  await initAIEngine(() => {}, false, target);

  if (!engine) throw new Error('AI Engine failed to initialize');

  const chunks = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: finalPrompt }
    ],
    temperature: target === 'Primary EA Agent' ? 0.2 : 0.7, // Lower temperature for Primary EA Agent to prevent hallucination
    stream: true,
  });
  
  let reply = "";
  for await (const chunk of chunks) {
    const content = chunk.choices[0]?.delta?.content || "";
    reply += content;
    onUpdate(reply);
  }
  
  return reply;
}

/**
 * ARCHITECTURAL PLACEHOLDER: In-Browser LoRA Tuning
 * 
 * Future implementation for Epic 7: Train via Web.
 * This will utilize WebGPU to perform low-rank adaptation (LoRA) 
 * on the base model using the local EADatabase as the training corpus.
 * Weights will be saved strictly to OPFS.
 */
export async function initiateLocalLoRATraining(_corpus: string[], onProgress: (p: number) => void): Promise<void> {
  Logger.warn("LoRA training is currently an architectural placeholder. WebLLM training support pending.");
  // 1. Load base model into WebGPU
  // 2. Initialize LoRA adapters
  // 3. Iterate over corpus, compute gradients, update adapters
  // 4. Save adapted weights to OPFS
  onProgress(100);
}

// --- Small Talk Regex: matches common greetings / identity queries ---
const SMALL_TALK_RE = /^\s*(h(i|ello|ey|owdy)|yo|sup|good\s*(morning|afternoon|evening)|greetings|what'?s\s*up|who\s+are\s+you|what\s+are\s+you|are\s+you\s+an?\s+ai|thanks?|thank\s*you|ok|okay|bye|goodbye|see\s*ya)[!?.,\s]*$/i;

const GREETING_RESPONSE =
  "Hello! I am **EA-NITI**, your air-gapped Enterprise Architecture assistant. " +
  "I am currently operating in **lightweight mode** (RAG-only — no generative LLM loaded).\n\n" +
  "I can still search your local knowledge base for architecture principles, BIAN domains, " +
  "and historical review context. How can I assist with your architecture reviews today?";

export async function chatWithAgent(
  messages: { role: 'user' | 'assistant' | 'system', content: string }[],
  onUpdate: (text: string) => void,
  executionTarget: string = 'Tiny Triage Agent'
): Promise<string> {
  const userPrompt = messages[messages.length - 1]?.content || '';

  // ── 1. Small-Talk Interceptor ─────────────────────────────────────
  // Bypass vector search + LLM entirely for trivial greetings.
  if (SMALL_TALK_RE.test(userPrompt)) {
    onUpdate(GREETING_RESPONSE);
    return GREETING_RESPONSE;
  }

  // ── 2. MoE Auto-Routing ───────────────────────────────────────────
  let target = globalMoETarget !== 'Auto-Route (MoE)' ? globalMoETarget : executionTarget;
  if (target === 'Auto-Route (MoE)') {
    const isCoreEA = /DDQ|scorecard|architecture layer|STRIDE/i.test(userPrompt);
    target = isCoreEA ? 'Primary EA Agent' : 'Tiny Triage Agent';
    Logger.info(`[Auto-Router] Routing to ${target}...`);
  }

  // ── 3. Gather EA Context (lightweight Dexie lookup) ───────────────
  let eaContext = "";
  try {
    eaContext = await queryEAContext(userPrompt);
  } catch (e) {
    Logger.warn("Failed to fetch EA Context", e);
  }

  const sysPrompt = await getSystemPrompt();
  const systemMessage = eaContext 
    ? `${sysPrompt}\n\n${eaContext}` 
    : sysPrompt;

  const messagesWithSystem = [...messages];
  if (messagesWithSystem.length === 0 || messagesWithSystem[0].role !== 'system') {
    messagesWithSystem.unshift({ role: 'system', content: systemMessage });
  } else {
    messagesWithSystem[0].content = `${systemMessage}\n\n${messagesWithSystem[0].content}`;
  }

  // ── 4. BYOM Network Model ─────────────────────────────────────────
  const models = await db.model_registry.toArray();
  const targetModel = models.find(m => m.name === target);

  if (targetModel && targetModel.type === 'BYOM_NETWORK') {
    Logger.info(`[BYOM Router] Routing to Custom Enterprise Endpoint: ${targetModel.name}...`);
    try {
      const response = await fetch(targetModel.modelUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(targetModel.apiKey ? { 'Authorization': `Bearer ${targetModel.apiKey}` } : {})
        },
        body: JSON.stringify({
          model: targetModel.name,
          messages: messagesWithSystem,
          temperature: executionTarget === 'Primary EA Agent' ? 0.3 : 0.7,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Endpoint returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || JSON.stringify(data);
      onUpdate(content);
      return content;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      const failMsg = `\n\n[BYOM Router Error] Failed to reach endpoint ${targetModel.modelUrl}. Ensure your local server (e.g., Ollama) is running and accessible. Error: ${errorMsg}`;
      onUpdate(failMsg);
      throw new Error(failMsg);
    }
  }

  // ── 5. Local LLM — with tiered generative fallback ─────────────────
  // Priority: requested model → any cached model → RAG-only (no generation)
  
  let targetModelId = target;
  if (target === 'Primary EA Agent') {
    targetModelId = (await db.app_settings.get('core-primary'))?.value?.id || DEFAULT_PRIMARY_MODEL_ID;
  } else if (target === 'Tiny Triage Agent') {
    targetModelId = (await db.app_settings.get('core-triage'))?.value?.id || DEFAULT_TINY_MODEL_ID;
  }

  const cachedModels = await scanLocalModels();
  const available = cachedModels.filter(m => m.isCached);

  if (available.length === 0) {
    // No generative models cached at all → RAG-only
    return await buildRagOnlyResponse(userPrompt, eaContext, onUpdate);
  }

  const isTargetCached = available.some(m => m.modelId === targetModelId);

  if (isTargetCached) {
    await initAIEngine(() => {}, false, target);
  } else {
    Logger.warn(`[chatWithAgent] Primary target "${targetModelId}" unavailable. Scanning for cached fallback…`);
    
    // Prefer SECONDARY (tiny) over PRIMARY (heavy) for fast fallback
    const tinyModelId = await getActiveModelId('Tiny');
    const preferTiny = available.find(m => m.modelId === tinyModelId);
    const fallbackId = preferTiny ? preferTiny.modelId : available[0].modelId;

    Logger.warn(`[chatWithAgent] Primary model unavailable. Falling back to cached model: ${fallbackId}…`);
    
    // Pass the fallbackId directly to initAIEngine. Since we know it's cached, 
    // it will NOT trigger the download/consent loop.
    await initAIEngine(() => {}, false, fallbackId); 
  }

  if (!engine) {
    // Engine ref null after init (should not happen, but guard anyway)
    return await buildRagOnlyResponse(userPrompt, eaContext, onUpdate);
  }

  const chunks = await engine.chat.completions.create({
    messages: messagesWithSystem,
    temperature: executionTarget === 'Primary EA Agent' ? 0.3 : 0.7,
    stream: true,
  });
  
  let reply = "";
  for await (const chunk of chunks) {
    const content = chunk.choices[0]?.delta?.content || "";
    reply += content;
    onUpdate(reply);
  }
  
  return reply;
}

/**
 * Constructs a formatted RAG-only response when no generative LLM is loaded.
 * Merges lightweight Dexie context + vector store results into a readable reply.
 */
export async function buildRagOnlyResponse(
  _userPrompt: string,
  eaContext: string,
  onUpdate: (text: string) => void
): Promise<string> {
  // 1. Check for Deterministic Guardrail Block
  if (eaContext.includes('[CRITICAL GUARDRAIL INTERCEPT]')) {
    onUpdate(eaContext);
    return eaContext;
  }

  // 2. Check for Empty Context
  if (!eaContext || eaContext.length === 0) {
    const fallbackMsg = `⚡ **Neuro-Symbolic Fallback**\n\nI currently have no structural data, policies, or architectural blueprints in my local vault regarding your query. Please adjust your search or import the relevant Service Domains into the EA-NITI database.`;
    onUpdate(fallbackMsg);
    return fallbackMsg;
  }

  // 3. Output the Synthesized Tier-3 Response (clean — no markdown header)
  onUpdate(eaContext);
  return eaContext;
}

export async function analyzeWebTrends(
  webData: string,
  onUpdate: (text: string) => void
): Promise<string> {
  if (!engine) throw new Error('AI Engine not initialized');

  const prompt = `Analyze these recent internet search results regarding Enterprise Architecture. Extract 3 new, critical principles. Output as JSON matching our architecture_principles schema.

Search Results:
${webData}

Output format must be a raw JSON array of objects with the following keys:
- name (string)
- statement (string)
- rationale (string)
- implications (string)
- layerId (number, use 1 as default)
- status (string, use "Needs Review")

Do not include any markdown formatting or explanation, just the raw JSON array.`;

  const chunks = await engine.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    stream: true,
  });

  let reply = "";
  for await (const chunk of chunks) {
    const content = chunk.choices[0]?.delta?.content || "";
    reply += content;
    onUpdate(reply);
  }
  distillTripletsFromResponse(reply);
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

        if (Array.isArray(parsed)) {
          return JSON.stringify(parsed);
        }

        if (parsed.choices && Array.isArray(parsed.choices)) {
          const content = parsed.choices[0]?.message?.content || parsed.choices[0]?.delta?.content || '';
          return content;
        }

        return JSON.stringify(parsed);
      } catch {
        // Treat as text response
        return webData;
      }
    }

    throw new Error(`Unknown provider type: ${providerType}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onUpdate(`Error in hybrid analysis: ${message}`);
    throw new Error(message);
  }
}

// --- LLM Distillation Gatekeeper ---
export function distillTripletsFromResponse(responseText: string): void {
  try {
    const jsonMatch = responseText.match(/\[\s*\{.*?\}\s*\]/s);
    if (!jsonMatch) return;
    const tripletArray = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(tripletArray)) return;
    for (const triplet of tripletArray) {
      if (triplet.s && triplet.i && triplet.t) {
        globalArena.addMemory({ Subject: triplet.s, Intent: triplet.i, Target: triplet.t } as DeepParsedQuery, 2);
      }
    }
  } catch { /* best-effort */ }
}
