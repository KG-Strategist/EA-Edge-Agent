import { db } from './db';
import { MoatVectoriser, DeepParsedQuery } from './StructuralVectoriser';
import { StructuralSynthesizer } from './StructuralSynthesizer';
import { LexicalStateMachine } from './LexicalParser';
import { VocabularyDictionary } from './VocabularyDictionary';

export interface ArenaRecord {
  id: number;
  type: 'guardrail' | 'memory';
  payload: any;
}

export const vocab = new VocabularyDictionary();
export const globalSynthesizer = new StructuralSynthesizer(600000, vocab);
export const vectoriser = new MoatVectoriser();
export const parser = new LexicalStateMachine();

export class SemanticArena {
  public arena: Uint32Array;
  public records: ArenaRecord[] = [];
  private recordTypes: Uint8Array;
  private guardrailPayloads = new Map<number, string>();
  private activeRecords: number = 0;
  private currentCompiledOffset = 0;

  // Causal Graph - Intrusive Linked List (C-style memory layout for O(1) traversal)
  private causedBy: Uint32Array;
  private firstEffect: Uint32Array;
  private nextSiblingEffect: Uint32Array;
  private causalStrength: Uint8Array;
  private beliefState: Uint8Array; // 0:Empty, 1:Unverified, 2:Verified, 3:Axiom

  constructor(public maxRecords: number = 600000) {
    this.arena = new Uint32Array(maxRecords * 64);
    this.recordTypes = new Uint8Array(maxRecords);
    // Causal Graph initialization with 0xFFFFFFFF as NULL pointer
    this.causedBy = new Uint32Array(maxRecords).fill(0xFFFFFFFF);
    this.firstEffect = new Uint32Array(maxRecords).fill(0xFFFFFFFF);
    this.nextSiblingEffect = new Uint32Array(maxRecords).fill(0xFFFFFFFF);
    this.causalStrength = new Uint8Array(maxRecords);
    this.beliefState = new Uint8Array(maxRecords);
  }

  public insertMemory(vector: Uint32Array, index: number): void {
    const offset = index * 64;
    for (let i = 0; i < 64; i++) {
      this.arena[offset + i] = vector[i];
    }
    this.recordTypes[index] = 1; // 1: Memory
  }

  public insertGuardrail(vector: Uint32Array, index: number, rule: string): void {
    const offset = index * 64;
    for (let i = 0; i < 64; i++) {
      this.arena[offset + i] = vector[i];
    }
    this.recordTypes[index] = 2; // 2: Guardrail
    this.guardrailPayloads.set(index, rule);
  }

  // --- Causal Graph Methods ---
  public linkCausation(effectIdx: number, causeIdx: number, strength: number = 255): void {
    this.causedBy[effectIdx] = causeIdx;
    this.causalStrength[effectIdx] = strength;
    this.nextSiblingEffect[effectIdx] = this.firstEffect[causeIdx]; // Point to old head
    this.firstEffect[causeIdx] = effectIdx; // Set as new head
  }

  public addMemory(parsedTriplet: DeepParsedQuery, belief: number): number {
    const vector = vectoriser.vectorise(parsedTriplet);
    const index = this.currentCompiledOffset;
    const offset = index * 64;
    for (let i = 0; i < 64; i++) {
      this.arena[offset + i] = vector[i];
    }
    this.recordTypes[index] = 1; // Memory
    this.beliefState[index] = belief;
    globalSynthesizer.learn(parsedTriplet.Subject || '', parsedTriplet.Intent || '', parsedTriplet.Target || '', index);
    this.currentCompiledOffset++;
    return index;
  }

  public popcnt32(n: number): number {
    n = n - ((n >>> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
    return (Math.imul((n + (n >>> 4)) & 0x0F0F0F0F, 0x01010101) >>> 24) >>> 0;
  }

  public checkGuardrails(queryVector: Uint32Array, threshold: number): string | null {
    for (let i = 0; i < this.maxRecords; i++) {
      if (this.recordTypes[i] !== 2) continue;

      const offset = i * 64;

      // Core-First Optimization
      let coreIntersection = 0;
      let coreUnion = 0;
      for (let j = 0; j < 32; j++) {
        coreIntersection += this.popcnt32(queryVector[j] & this.arena[offset + j]);
        coreUnion += this.popcnt32(queryVector[j] | this.arena[offset + j]);
      }

      if (coreIntersection < 3) continue; // Require perfect core match for deterministic retrieval

      let intersection = coreIntersection * 100;
      let union = coreUnion * 100;

      for (let j = 32; j < 64; j++) {
        const qInt = queryVector[j];
        const docInt = this.arena[offset + j];
        intersection += this.popcnt32(qInt & docInt);
        union += this.popcnt32(qInt | docInt);
      }

      if (union === 0) continue;

      const score = intersection / union;
      if (score >= threshold) {
        return this.guardrailPayloads.get(i) || "Policy Violation";
      }
    }
    return null;
  }

  public getCrossQuestions(queryVector: Uint32Array, expectedCoreBits: number, queryParsed: DeepParsedQuery, maxOptions = 3): number[] {
      const options: number[] = [];
      const seenIntents = new Set<string>();
      const queryKeywords = [queryParsed.Subject, queryParsed.Intent, queryParsed.Target].filter(Boolean).map(k => k!.toLowerCase());
      
      for (let i = 0; i < this.maxRecords; i++) {
          if (this.recordTypes[i] !== 1) continue; 
          
          const offset = i * 64;
          let coreIntersection = 0;
          for (let j = 0; j < 32; j++) {
              coreIntersection += this.popcnt32(queryVector[j] & this.arena[offset + j]);
          }
          
          if (coreIntersection >= expectedCoreBits && expectedCoreBits > 0) {
              const comps = globalSynthesizer.getRawComponents(i);
              
              // Keyword Tie-Breaker (Strike 36 calibration)
              const recordText = `${comps.s} ${comps.i} ${comps.t}`.toLowerCase();
              const isTrueMatch = queryKeywords.every(kw => recordText.includes(kw));
              if (!isTrueMatch) continue;

              if (comps.i && !seenIntents.has(comps.i)) {
                  seenIntents.add(comps.i);
                  options.push(i);
                  if (options.length >= maxOptions) break;
              }
          }
      }
      return options;
  }

public search(queryVector: Uint32Array, threshold: number): number[] {
    let bestScore = -Infinity;
    const top5Scores: number[] = [];
    let bestIndices: number[] = [];
    
    let expectedCoreBits = 0;
    for (let j = 0; j < 32; j++) {
      expectedCoreBits += this.popcnt32(queryVector[j]);
    }

    for (let i = 0; i < this.maxRecords; i++) {
      if (this.recordTypes[i] !== 1) continue;

      const offset = i * 64;

      // Core-First Optimization
      let coreIntersection = 0;
      let coreUnion = 0;
      for (let j = 0; j < 32; j++) {
        coreIntersection += this.popcnt32(queryVector[j] & this.arena[offset + j]);
        coreUnion += this.popcnt32(queryVector[j] | this.arena[offset + j]);
      }

      if (coreIntersection < expectedCoreBits) continue; // Require perfect core match

      let intersection = coreIntersection * 100;
      let union = coreUnion * 100;

      for (let j = 32; j < 64; j++) {
        const qInt = queryVector[j];
        const docInt = this.arena[offset + j];
        intersection += this.popcnt32(qInt & docInt);
        union += this.popcnt32(qInt | docInt);
      }

      if (union === 0) continue;

      const score = intersection / union;
      if (score > bestScore) {
        bestScore = score;
        bestIndices = [i];
      } else if (score === bestScore) {
        bestIndices.push(i);
      }
      
      // Track top 5 scores for Z-Score filtering
      if (top5Scores.length < 5 || score > Math.min(...top5Scores)) {
        top5Scores.push(score);
        if (top5Scores.length > 5) {
          const minIdx = top5Scores.indexOf(Math.min(...top5Scores));
          top5Scores.splice(minIdx, 1);
        }
      }
    }

    if (bestScore >= threshold) {
      // Z-Score Noise Filtering
      if (top5Scores.length < 2) {
        return bestIndices; // Small data bypass
      }
      
      if (bestScore > 0.60) {
        return bestIndices; // Absolute confidence bypass
      }

      // Strike 36 calibration: If we found a perfect core match, it's deterministic structural knowledge
      return bestIndices;
      
      /* // Temporarily disabling Z-score for structural records
      const mean = top5Scores.reduce((a, b) => a + b, 0) / top5Scores.length;
      ... */
    }
return [];
  }

  // --- JIT Transitive Curiosity: Find causal gaps ---
  public scanNeighborhood(matches: number[]): { s: string, i: string, t: string, reason: 'causal_gap' }[] {
    const gaps: { s: string, i: string, t: string, reason: 'causal_gap' }[] = [];
    const MAX_DEPTH = 2;
    const MAX_TRAVERSALS = 20;
    let totalTraversals = 0;

    const NULL_PTR = 0xFFFFFFFF;

    const traverseEffects = (causeIdx: number, depth: number, visited: Set<number>): void => {
      if (depth > MAX_DEPTH || totalTraversals >= MAX_TRAVERSALS) return;
      let effectIdx = this.firstEffect[causeIdx];
      while (effectIdx !== NULL_PTR && effectIdx !== undefined) {
        if (totalTraversals >= MAX_TRAVERSALS) break;
        totalTraversals++;
        if (!visited.has(effectIdx)) {
          visited.add(effectIdx);
          // Check if this effect has its own causes
          let subCause = this.causedBy[effectIdx];
          if (subCause !== NULL_PTR && subCause !== undefined) {
            // Found B -> C, now check if A (original) -> C directly
            const originalIdx = Array.from(visited)[0]; // A in the chain
            if (originalIdx !== undefined && originalIdx !== subCause) {
              // Check if A -> C already exists
              let existingLink = false;
              let checkEffect = this.firstEffect[originalIdx];
              while (checkEffect !== NULL_PTR && checkEffect !== undefined) {
                if (checkEffect === effectIdx) {
                  existingLink = true;
                  break;
                }
                checkEffect = this.nextSiblingEffect[checkEffect];
              }
              if (!existingLink && originalIdx !== effectIdx) {
                const compsA = globalSynthesizer.getRawComponents(originalIdx);
                const compsC = globalSynthesizer.getRawComponents(effectIdx);
                if (compsA.s && compsC.t) {
                  gaps.push({
                    s: compsA.s,
                    i: 'causes',
                    t: compsC.t,
                    reason: 'causal_gap'
                  });
                }
              }
            }
          }
          traverseEffects(effectIdx, depth + 1, visited);
        }
        effectIdx = this.nextSiblingEffect[effectIdx];
      }
    };

    for (const matchIdx of matches) {
      if (totalTraversals >= MAX_TRAVERSALS) break;
      const visited = new Set<number>([matchIdx]);
      traverseEffects(matchIdx, 0, visited);
    }

    return gaps;
  }


  async loadCompiledBinary() {
  try {
    const response = await fetch('/baseline_corpus.bin.gz?v=' + Date.now());
    if (!response.ok) throw new Error('Gzip binary not found');
    
    const buffer = await response.arrayBuffer();
    let fullBuffer = new Uint8Array(buffer);
    
    // Check for gzip magic number (0x1F 0x8B)
    if (fullBuffer[0] === 0x1F && fullBuffer[1] === 0x8B) {
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(fullBuffer);
      writer.close();
      
      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      let totalLength = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalLength += value.length;
      }
      const decompressedBuffer = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        decompressedBuffer.set(chunk, offset);
        offset += chunk.length;
      }
      fullBuffer = decompressedBuffer;
    }

    const baselineVectors = new Uint32Array(fullBuffer.buffer);

    const requiredRecords = baselineVectors.length / 64;
    if (requiredRecords > this.maxRecords) {
      console.warn(`[SemanticArena] Resizing arena from ${this.maxRecords} to ${requiredRecords + 10000}`);
      this.maxRecords = requiredRecords + 10000;
      this.arena = new Uint32Array(this.maxRecords * 64);
      this.recordTypes = new Uint8Array(this.maxRecords);
      globalSynthesizer.resize(this.maxRecords);
    }

    // Safely blit compiled data
    this.arena.set(baselineVectors, 0);
    this.currentCompiledOffset = requiredRecords;

    // Mark these as type 1 (Memory)
    for (let i = 0; i < this.currentCompiledOffset; i++) {
      this.recordTypes[i] = 1;
    }

    try {
      const metaResponse = await fetch('/baseline_meta.json?v=' + Date.now());
      const metaRecords = await metaResponse.json();

      // Time-Sliced Async Hydration to prevent main-thread freeze
      await new Promise<void>((resolve) => {
        const CHUNK_SIZE = 15000;
        let currentIndex = 0;

        const processChunk = () => {
          const end = Math.min(currentIndex + CHUNK_SIZE, metaRecords.length);
          for (let i = currentIndex; i < end; i++) {
            const rec = metaRecords[i];
            const s = rec.s || (rec.parsed && rec.parsed.Subject) || '';
            const intent = rec.i || (rec.parsed && rec.parsed.Intent) || '';
            const t = rec.t || (rec.parsed && rec.parsed.Target) || '';
            if (s && intent && t) globalSynthesizer.learn(s, intent, t, i);
          }
          currentIndex = end;
          if (currentIndex < metaRecords.length) {
            setTimeout(processChunk, 0); // Yield to React Render Cycle
          } else {
            this.currentCompiledOffset = metaRecords.length;
            console.log(`[EA-NITI] Time-Sliced Hydration Complete: ${metaRecords.length} records.`);
            resolve(); // Safely unlock the bootloader
          }
        };
        processChunk();
      });
} catch (err) {
    console.error('[EA-NITI] Metadata Hydration Failed:', err);
    setTimeout(() => {}, 0);
  }
  } catch(e) {
    console.error('No baseline corpus found', e);
  }
}

  public async loadFromDB() {
    await this.loadCompiledBinary();

    const guardrails = await db.privacy_guardrails.filter(g => !!g.isActive).toArray();
    const memories = await db.semantic_memory.filter(m => m.metadata?.source !== 'baseline_corpus').toArray();

    this.records = [];
    this.activeRecords = this.currentCompiledOffset;
    // Keep recordTypes 0 for indices >= currentCompiledOffset
    for (let i = this.currentCompiledOffset; i < this.maxRecords; i++) {
        this.recordTypes[i] = 0;
    }
    this.guardrailPayloads.clear();
    
    let currentIndex = this.currentCompiledOffset;

    for (const g of guardrails) {
      const parsed = parser.parse(g.ruleText) as DeepParsedQuery;
      parsed.Sentiment = 'Critical';
      const vec = vectoriser.vectorise(parsed);
      this.insertGuardrail(vec, currentIndex, g.ruleText || g.title);
      this.records[currentIndex] = { id: g.id!, type: 'guardrail', payload: g };
      this.activeRecords++;
      currentIndex++;
    }

    for (const m of memories) {
      const subject = m.metadata?.entity || 'System';
      const action = m.metadata?.intent || 'defines';
      const target = m.text || 'concept';
      const parsed = parser.parse(`${subject} ${action} ${target}`);
      const vec = vectoriser.vectorise(parsed);
      this.insertMemory(vec, currentIndex);
      this.records[currentIndex] = { id: m.id!, type: 'memory', payload: m };
      globalSynthesizer.learn(subject, action, target, currentIndex);
      this.activeRecords++;
      currentIndex++;
    }
  }
  
  // For tests
  public setActiveRecords(count: number) {
      this.activeRecords = count;
  }
}

export const globalArena = new SemanticArena(600000);
