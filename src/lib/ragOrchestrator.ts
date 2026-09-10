import { db } from './db';
import { ArenaSearchResult, globalArena, globalSynthesizer, vectoriser, parser } from './SemanticArena';
import { globalGraphStore, hydrateGraphStore, MultiHopResult, EvidenceTrail, HydrationStats } from './graphStore';

// TASK 2: Exact Word Match Helper (Regex word-boundary checks with plural tolerance)
function exactWordMatch(text: string, keyword: string): boolean {
  if (!keyword) return false;
  try {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}(?:s|es)?\\b`, 'i').test(text);
  } catch {
    return false;
  }
}

// --- Epistemic Reasoning: Working Memory for Curiosity Loop ---
let pendingCuriosity: { s: string, i: string, t: string } | null = null;

export interface ProcessQueryResult {
  text: string;
  status: 'hit' | 'disambiguate' | 'guardrail' | 'curiosity' | 'fallback' | 'unknown';
  topScore?: number;
  facts: {
    subject: string;
    intent: string;
    target: string;
    sourceSentence: string;
    score?: number;
    weightedScore?: number;
    beliefState?: number;
    source?: 'canonical' | 'arena' | 'principle';
  }[];
}

const CANONICAL_ARCHITECTURE_FACTS: Record<string, string> = {
  bian: 'BIAN (Banking Industry Architecture Network) is a banking industry architecture standard for defining service domains, business capabilities, and common banking service patterns.',
  togaf: 'TOGAF is an enterprise architecture framework that structures architecture work across business, data, application, and technology domains.',
  samiksha: 'SAMIKSHA is the EA-NITI architecture review workflow for structured assessment, evidence capture, and governance decisions.',
  'ea-niti': 'EA-NITI is an edge-first enterprise architecture agent that combines deterministic epistemic retrieval with local LLM inference.',
  ddq: 'A DDQ is a due diligence questionnaire used to collect structured evidence about controls, risks, architecture, and compliance posture.',
  nsi: 'NSI means New System Implementation, an architecture review path for assessing a new platform, application, or capability before adoption.',
  er: 'ER means Enhancement Review, an architecture review path for evaluating material changes to an existing system or capability.',
  stride: 'STRIDE is a threat modeling taxonomy covering spoofing, tampering, repudiation, information disclosure, denial of service, and elevation of privilege.',
};

const DEFINITION_INTENTS = new Set(['mean', 'define', 'describe', 'explain', 'summarize', 'summarise', 'be']);

function normalizeKey(value?: string | null): string {
  return (value || '').toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim();
}

function canonicalAnswerFor(subject?: string | null, intent?: string | null): ProcessQueryResult | null {
  const key = normalizeKey(subject);
  const normalizedIntent = normalizeKey(intent);
  if (!key || (normalizedIntent && !DEFINITION_INTENTS.has(normalizedIntent))) return null;

  const answer = CANONICAL_ARCHITECTURE_FACTS[key];
  if (!answer) return null;

  return {
    text: answer,
    status: 'hit',
    topScore: 1,
    facts: [{
      subject: key,
      intent: 'define',
      target: answer,
      sourceSentence: answer,
      score: 1,
      weightedScore: 1,
      beliefState: 3,
      source: 'canonical',
    }],
  };
}

function canonicalAnswerFromPrompt(prompt: string): ProcessQueryResult | null {
  const lower = prompt.toLowerCase();
  const asksForDefinition = /\b(what\s+is|define|describe|explain|summari[sz]e|one\s+sentence|meaning\s+of)\b/.test(lower);
  if (!asksForDefinition) return null;

  const key = Object.keys(CANONICAL_ARCHITECTURE_FACTS).find(term => exactWordMatch(lower, term));
  return key ? canonicalAnswerFor(key, 'define') : null;
}

function formatTriplet(subject: string, intent: string, target: string): string {
  const clean = [subject, intent, target].filter(Boolean).join(' ').trim();
  return clean ? `I found this local structural fact: ${clean}.` : 'I have no source-backed structural memory for that query.';
}

function isTrustedMatch(match: ArenaSearchResult): boolean {
  if (match.target === 'concept' && !match.hasSource) return false;
  if (match.hasSource && match.weightedScore >= 0.18) return true;
  if (match.beliefState >= 2 && match.weightedScore >= 0.24) return true;
  return match.weightedScore >= 0.42;
}

function sourceBackedResponse(facts: ProcessQueryResult['facts']): string | null {
  const seen = new Set<string>();
  const sourceSentences = facts
    .map(f => f.sourceSentence.trim())
    .filter(sentence => {
      const key = sentence.toLowerCase();
      if (!sentence || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (sourceSentences.length === 0) return null;
  return sourceSentences.slice(0, 3).join('\n');
}

export async function processQuery(userPrompt: string, chatHistory: {role: string, content: string}[] = [], ragTags?: string[]): Promise<ProcessQueryResult> {
  // --- User Feedback Loop (Working Memory) ---
  if (pendingCuriosity) {
    const lowerPrompt = userPrompt.toLowerCase().trim();
    if (['yes', 'y', 'correct', 'it does', 'true', 'right'].some(w => lowerPrompt.includes(w))) {
      globalArena.addMemory(
        { Subject: pendingCuriosity.s, Intent: pendingCuriosity.i, Target: pendingCuriosity.t } as any,
        1,
        false,
        `User confirmed curiosity hypothesis: ${pendingCuriosity.s} ${pendingCuriosity.i} ${pendingCuriosity.t}`
      );
      const saved = pendingCuriosity;
      pendingCuriosity = null;
      return { text: `Understood. I have saved "${saved.s} ${saved.i} ${saved.t}" to my unverified memory.`, status: 'curiosity', facts: [] };
    } else if (['no', 'n', 'incorrect', 'wrong', 'false', 'nah'].some(w => lowerPrompt.includes(w))) {
      pendingCuriosity = null;
      return { text: `Understood. I will discard that assumption.`, status: 'curiosity', facts: [] };
    }
  }

  // TASK 3: Context-Aware Decision Tree Resolution
  let resolvedPrompt = userPrompt;
  const promptLower = userPrompt.toLowerCase().trim();
  const isAffirmative = ['yes', 'y', 'correct', 'exactly'].includes(promptLower);
  const isNumericSelection = /^[1-9]$/.test(promptLower);

  if ((isAffirmative || isNumericSelection) && chatHistory.length > 0) {
    const lastBotMessage = chatHistory[chatHistory.length - 1];
    if (lastBotMessage.role === 'assistant' && lastBotMessage.content.includes('Did you mean:')) {
      if (isNumericSelection) {
        try {
          const regex = new RegExp(`${promptLower}\\.\\s*(.*?)(?:\\n|$)`, 'i');
          const match = lastBotMessage.content.match(regex);
          if (match) {
            resolvedPrompt = match[1];
          }
        } catch {
          resolvedPrompt = userPrompt;
        }
      } else if (isAffirmative) {
        return { text: "Please select a specific number from the options provided above.", status: 'disambiguate', facts: [] };
      }
    }
  }

  // 1. Perception (Lexical Parsing + Zoned Orthogonal Vectorisation)
  const parsed = parser.parse(resolvedPrompt);
  const queryVector = vectoriser.vectorise(parsed);

  // 2. Security (Pre-flight Guardrail Check - 0.40 Threshold)
  const violation = globalArena.checkGuardrails(queryVector, 0.30);
  if (violation) {
    return { text: `[CRITICAL GUARDRAIL INTERCEPT] Policy Violation: ${violation}`, status: 'guardrail', facts: [] };
  }

  const canonical = canonicalAnswerFor(parsed.Subject, parsed.Intent) || canonicalAnswerFromPrompt(resolvedPrompt);
  if (canonical) return canonical;

  // --- BEGIN EPISTEMIC ROUTER INJECTION ---
  let expectedCoreBits = 0;
  if (parsed.Subject) expectedCoreBits += 3;
  if (parsed.Intent) expectedCoreBits += 3;
  if (parsed.Target) expectedCoreBits += 3;

  // 1. Check for ambiguous subject (Decision Tree)
  if (parsed.Subject && !parsed.Intent) {
      const options = globalArena.getCrossQuestions(queryVector, expectedCoreBits, parsed);
      if (options.length > 0) {
          let reply = `I found multiple architectural contexts for **${parsed.Subject}**. Did you mean:\n\n`;
          options.forEach((idx, i) => {
              const comps = globalSynthesizer.getRawComponents(idx);
              reply += `${i + 1}. How it **${comps.i}** ${comps.t}?\n`;
          });
          return { text: reply, status: 'disambiguate', facts: [] };
      }
  }

// 2. Retrieval (Memory Search - 0.18 Threshold)
  // CRITICAL GATE: Do not search the arena if we lack an Intent. 3-bit searches return random noise.
  if (parsed.Subject && parsed.Intent) {
    const matchResults = globalArena.searchWithScores(queryVector, 0.18, ragTags).filter(isTrustedMatch);

    // 3. JIT Transitive Curiosity: Scan for causal gaps
    const curiosityGaps = globalArena.scanNeighborhood(matchResults.map(m => m.index));

    // 4. Synthesis (Reconstruct triplet from binary indices)
    if (matchResults.length > 0) {
      let response = '';
      const topMatch = matchResults[0];
      // Check beliefState - if Unverified (1), prefix with caution
      // For now, generate the response
      const facts = matchResults.slice(0, 5).map(m => {
          return {
            subject: m.subject || '',
            intent: m.intent || '',
            target: m.target || '',
            sourceSentence: m.sourceSentence || '',
            score: m.score,
            weightedScore: m.weightedScore,
            beliefState: m.beliefState,
            source: 'arena' as const,
          };
      });
      response = sourceBackedResponse(facts)
        || (topMatch.beliefState === 1
          ? `I have an unverified local memory: ${[topMatch.subject, topMatch.intent, topMatch.target].filter(Boolean).join(' ')}.`
          : formatTriplet(topMatch.subject, topMatch.intent, topMatch.target));

      // If curiosity gap found, append question
      if (curiosityGaps.length > 0) {
        const gap = curiosityGaps[0];
        pendingCuriosity = { s: gap.s, i: gap.i, t: gap.t };
        response += `\n\nI noticed that ${gap.s} ${gap.i} ${gap.t}. Does ${gap.s} also directly affect ${gap.t}?`;
      }
      return { text: response, status: 'hit', topScore: topMatch.weightedScore, facts };
    }

    // 5. Epistemic Agency (Unknowns) - Only if search failed
    if (parsed.Unknowns && parsed.Unknowns.length > 0) {
      const knowns =[parsed.Subject, parsed.Intent, parsed.Target].filter(Boolean);
      if (knowns.length > 0) {
        return { text: `I understand concepts like ${knowns.join(' and ')}, but I haven't learned what "${parsed.Unknowns.join(', ')}" means in this context. Can you explain it?`, status: 'unknown', facts: [] };
      }
      return { text: `I don't recognize the terms "${parsed.Unknowns.join(', ')}". Are these new architectural components?`, status: 'unknown', facts: [] };
    }

    if (parsed.Subject && parsed.Intent && parsed.Target) {
      return { text: `I know about ${parsed.Subject} and ${parsed.Target}, but I have no structural record of ${parsed.Subject} ${parsed.Intent}-ing ${parsed.Target}. Is this a new architectural decision?`, status: 'unknown', facts: [] };
    } else if (parsed.Subject && parsed.Intent) {
      return { text: `I know ${parsed.Subject} can ${parsed.Intent}, but I'm not sure *what* it targets. Could you clarify?`, status: 'unknown', facts: [] };
    }
  }
  // --- END EPISTEMIC ROUTER INJECTION ---

// 5. Fallback (Dexie Architecture Principles lookup)
// ONLY use Subject and Target for keyword matching. Verbs cause false positives.
const searchTerms = [parsed.Subject, parsed.Target].filter((t): t is string => t !== null);

if (searchTerms.length > 0) {
  // Try multi-hop graph traversal before Dexie fallback.
  // Lazy-hydrate the graph from production memory first (once, fail-silent).
  if (parsed.Subject) {
    await ensureGraphHydrated();
    const seedId = globalGraphStore.findNodeBySubject(parsed.Subject);
    if (seedId >= 0) {
      const graphResult = globalGraphStore.multiHopBFS(seedId, 3, 5);
      if (graphResult.trails.length > 0) {
        const trailTexts = graphResult.trails.slice(0, 3).map((trail, i) => {
          const pathStr = trail.nodes.map(n => `${n.subject} ${n.predicate} ${n.object}`).join(' → ');
          return `${i + 1}. ${pathStr}`;
        });
        const facts = graphResult.trails[0].nodes.slice(1).map(node => ({
          subject: node.subject,
          intent: node.predicate,
          target: node.object,
          sourceSentence: `${node.subject} ${node.predicate} ${node.object}`,
          source: 'arena' as const,
        }));
        return {
          text: `Graph relationships:\n${trailTexts.join('\n')}`,
          status: 'hit',
          topScore: graphResult.trails[0]?.score,
          facts,
        };
      }
    }
  }

  try {
    const principles = await db.architecture_principles.toArray();
    for (const principle of principles) {
      const text = `${principle.name} ${principle.statement}`.toLowerCase();
      if (searchTerms.some(term => exactWordMatch(text, term))) {
        return {
          text: `Based on architecture principle (${principle.name}): ${principle.statement}`,
          status: 'hit',
          facts: [{
            subject: principle.name,
            intent: 'states',
            target: principle.statement,
            sourceSentence: principle.statement,
            source: 'principle',
          }],
        };
      }
    }
  } catch {
    // Dexie not available (Node.js test environment)
  }
}

return { text: "I do not have source-backed structural data for that query yet.", status: 'fallback', facts: [] };
}

// ---------------------------------------------------------------------------
// GraphRAG production hydration — lazy, once-per-session, fail-silent.
// The global graph starts empty; the first graph query bulk-loads the most
// recent semantic_memory triplets (capped) so multi-hop BFS traverses real
// production data. Never throws: Dexie absence (unit tests) or empty tables
// simply yield null and the caller falls through to existing fallbacks.
// ---------------------------------------------------------------------------

let graphHydrationAttempted = false;

/** Test-only reset for the hydration once-flag. */
export function __resetGraphHydrationForTests(): void {
  graphHydrationAttempted = false;
}

/**
 * Bulk-load recent semantic_memory rows into the global graph store.
 * Returns hydration stats, or null when already attempted / no data /
 * persistence unavailable. Safe to call on every graph query.
 */
export async function ensureGraphHydrated(limit: number = 500): Promise<HydrationStats | null> {
  if (graphHydrationAttempted) return null;
  graphHydrationAttempted = true;
  try {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(2000, Math.floor(limit))) : 500;
    const rows = await db.semantic_memory.orderBy('createdAt').reverse().limit(safeLimit).toArray();
    if (rows.length === 0) return null;
    return hydrateGraphStore(
      globalGraphStore,
      rows.map((r) => ({
        subject: r.subject,
        predicate: r.predicate,
        object: r.object,
        beliefState: r.beliefState,
        source: r.source ?? 'semantic-memory',
      })),
    );
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GraphRAG Multi-Hop Query — 3-depth BFS traversal with evidence ranking
// ---------------------------------------------------------------------------

/**
 * Multi-hop graph traversal from a seed subject.
 * Combines vector search (SemanticArena) with graph traversal (GraphStore)
 * to produce chained evidence trails for complex queries.
 */
export async function multiHopQuery(
  userPrompt: string,
  maxDepth: number = 3,
  maxTrails: number = 5,
): Promise<ProcessQueryResult & { trails?: EvidenceTrail[] }> {
  const parsed = parser.parse(userPrompt);
  if (!parsed.Subject) {
    return { text: 'I need a subject to explore graph relationships.', status: 'fallback', facts: [], trails: [] };
  }

  // Lazy-hydrate the graph from production memory first (once, fail-silent).
  await ensureGraphHydrated();

  // 1. Find seed node in GraphStore
  let seedId = globalGraphStore.findNodeBySubject(parsed.Subject);
  if (seedId < 0 && parsed.Target) {
    seedId = globalGraphStore.findNodeByTriplet(parsed.Subject, undefined, parsed.Target);
  }

  // 2. If no graph node found, try vector search and index the result
  if (seedId < 0) {
    const queryVector = vectoriser.vectorise(parsed);
    const matches = globalArena.searchWithScores(queryVector, 0.18).slice(0, 3);

    if (matches.length > 0) {
      // Index top match into graph store for future traversal
      const top = matches[0];
      seedId = globalGraphStore.addNode(
        top.subject || parsed.Subject || '',
        top.intent || parsed.Intent || '',
        top.target || parsed.Target || '',
        top.beliefState || 2,
        'arena-vector',
      );
    }
  }

  if (seedId < 0) {
    return {
      text: `I don't have graph data for "${parsed.Subject}". Try asking about a known architectural concept.`,
      status: 'fallback',
      facts: [],
      trails: [],
    };
  }

  // 3. Multi-hop BFS traversal
  const result: MultiHopResult = globalGraphStore.multiHopBFS(seedId, maxDepth, maxTrails);

  if (result.trails.length === 0) {
    const node = globalGraphStore.getNode(seedId);
    return {
      text: `I know about ${node?.subject || parsed.Subject}, but I don't have multi-hop relationships for it yet.`,
      status: 'fallback',
      facts: [],
      trails: [],
    };
  }

  // 4. Format evidence trails as response
  const trailTexts = result.trails.slice(0, 3).map((trail, i) => {
    const pathStr = trail.nodes.map(n => n.subject).join(' → ');
    const edgeStr = trail.edges.map(e => `[${e.type}]`).join(' ');
    const scoreStr = `(confidence: ${(trail.score * 100).toFixed(0)}%)`;
    return `${i + 1}. ${pathStr} ${edgeStr} ${scoreStr}`;
  });

  const facts = result.trails.flatMap(trail =>
    trail.nodes.slice(1).map(node => ({
      subject: node.subject,
      intent: node.predicate,
      target: node.object,
      sourceSentence: `${node.subject} ${node.predicate} ${node.object}`,
      score: trail.score,
      weightedScore: trail.score,
      beliefState: node.beliefState,
      source: 'arena' as const,
    })),
  );

  return {
    text: `Multi-hop relationships for **${parsed.Subject}** (${result.totalNodesVisited} nodes explored):\n\n${trailTexts.join('\n')}`,
    status: 'hit',
    topScore: result.trails[0]?.score,
    facts,
    trails: result.trails,
  };
}

// Backward compatibility for existing code
export const queryEAContext = processQuery;

// RAG tag-filtered query alias — used by aiEngine when a MITRA persona is active
export async function queryEAContextWithTags(userPrompt: string, ragTags?: string[], chatHistory: {role: string, content: string}[] = []): Promise<ProcessQueryResult> {
  return processQuery(userPrompt, chatHistory, ragTags);
}
