import { db } from './db';
import { globalArena, globalSynthesizer, vectoriser, parser } from './SemanticArena';

// --- Epistemic Reasoning: Working Memory for Curiosity Loop ---
let pendingCuriosity: { s: string, i: string, t: string } | null = null;

export async function processQuery(userPrompt: string): Promise<string> {
  // --- User Feedback Loop (Working Memory) ---
  if (pendingCuriosity) {
    const lowerPrompt = userPrompt.toLowerCase().trim();
    if (['yes', 'y', 'correct', 'it does', 'true', 'right'].some(w => lowerPrompt.includes(w))) {
      globalArena.addMemory({ Subject: pendingCuriosity.s, Intent: pendingCuriosity.i, Target: pendingCuriosity.t } as any, 1); // belief=1 (Unverified)
      const saved = pendingCuriosity;
      pendingCuriosity = null;
      return `Understood. I have saved "${saved.s} ${saved.i} ${saved.t}" to my unverified memory.`;
    } else if (['no', 'n', 'incorrect', 'wrong', 'false', 'nah'].some(w => lowerPrompt.includes(w))) {
      pendingCuriosity = null;
      return `Understood. I will discard that assumption.`;
    }
  }

  // 1. Perception (Lexical Parsing + Zoned Orthogonal Vectorisation)
  const parsed = parser.parse(userPrompt);
  const queryVector = vectoriser.vectorise(parsed);

  // 2. Security (Pre-flight Guardrail Check - 0.40 Threshold)
  const violation = globalArena.checkGuardrails(queryVector, 0.30);
  if (violation) {
    return `[CRITICAL GUARDRAIL INTERCEPT] Policy Violation: ${violation}`;
  }

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
          return reply;
      }
  }

// 2. Retrieval (Memory Search - 0.18 Threshold)
  if (parsed.Subject && parsed.Intent) {
    const matchIndices = globalArena.search(queryVector, 0.18);

    // 3. JIT Transitive Curiosity: Scan for causal gaps
    const curiosityGaps = globalArena.scanNeighborhood(matchIndices);

    // 4. Synthesis (Reconstruct triplet from binary indices)
    if (matchIndices.length > 0) {
      let response = '';
      // Check beliefState - if Unverified (1), prefix with caution
      // For now, generate the response
      response = globalSynthesizer.generate(matchIndices[0], parsed);

      // If curiosity gap found, append question
      if (curiosityGaps.length > 0) {
        const gap = curiosityGaps[0];
        pendingCuriosity = { s: gap.s, i: gap.i, t: gap.t };
        response += `\n\nI noticed that ${gap.s} ${gap.i} ${gap.t}. Does ${gap.s} also directly affect ${gap.t}?`;
      }
      return response;
    }

    // 5. Epistemic Agency (Unknowns) - Only if search failed
    if (parsed.Unknowns && parsed.Unknowns.length > 0) {
      const knowns =[parsed.Subject, parsed.Intent, parsed.Target].filter(Boolean);
      if (knowns.length > 0) {
        return `I understand concepts like ${knowns.join(' and ')}, but I haven't learned what "${parsed.Unknowns.join(', ')}" means in this context. Can you explain it?`;
      }
      return `I don't recognize the terms "${parsed.Unknowns.join(', ')}". Are these new architectural components?`;
    }

    if (parsed.Subject && parsed.Intent && parsed.Target) {
      return `I know about ${parsed.Subject} and ${parsed.Target}, but I have no structural record of ${parsed.Subject} ${parsed.Intent}-ing ${parsed.Target}. Is this a new architectural decision?`;
    } else if (parsed.Subject && parsed.Intent) {
      return `I know ${parsed.Subject} can ${parsed.Intent}, but I'm not sure *what* it targets. Could you clarify?`;
    }
  }
  // --- END EPISTEMIC ROUTER INJECTION ---

// 5. Fallback (Dexie Architecture Principles lookup)
  const keywords = [parsed.Subject, parsed.Intent, parsed.Target].filter(Boolean).map(k => k!.toLowerCase());

  if (keywords.length > 0) {
    try {
      const principles = await db.architecture_principles.toArray();
      for (const principle of principles) {
        const text = `${principle.name} ${principle.statement}`.toLowerCase();
        if (keywords.some(k => text.includes(k))) {
          return `Based on architecture principle (${principle.name}): ${principle.statement}`;
        }
      }
    } catch {
      // Dexie not available (Node.js test environment)
    }
  }

  return "⚡ **Neuro-Symbolic Fallback** No structural data found.";
}

// Backward compatibility for existing code
export const queryEAContext = processQuery;
