import { Logger } from './logger';
import { db } from './db';
import { MoatVectoriser, DeepParsedQuery } from './StructuralVectoriser';
import { StructuralSynthesizer } from './StructuralSynthesizer';
import { LexicalStateMachine } from './LexicalParser';
import { VocabularyDictionary } from './VocabularyDictionary';
import { fetchJsonAsset } from './compressedAssets';

// TASK 2: Exact Word Match Helper — pure string ops, no RegExp allocation
function exactWordMatch(text: string, keyword: string): boolean {
  if (!keyword || keyword.length > 100) return false;
  const keywordLower = keyword.toLowerCase();
  const keywordPluralS = keywordLower + 's';
  const keywordPluralEs = keywordLower + 'es';

  // Split text into words and check each one
  const words = text.split(/\s+/);
  for (const word of words) {
    const wordLower = word.toLowerCase();
    // Strip trailing punctuation for word boundary matching
    const cleaned = wordLower.replace(/[.,;:!?'"()[\]{}]+$/, '');
    if (cleaned === keywordLower || cleaned === keywordPluralS || cleaned === keywordPluralEs) {
      return true;
    }
  }
  return false;
}

export interface ArenaRecord {
  id: number;
  type: 'guardrail' | 'memory';
  payload: any;
}

export interface ArenaSearchResult {
  index: number;
  score: number;
  weightedScore: number;
  recordType: number;
  beliefState: number;
  hasSource: boolean;
  sourceSentence: string;
  subject: string;
  intent: string;
  target: string;
}

export const vocab = new VocabularyDictionary();
export const globalSynthesizer = new StructuralSynthesizer(600000, vocab);
export const vectoriser = new MoatVectoriser();
export const parser = new LexicalStateMachine();

const RECORD_EMPTY = 0;
const RECORD_EA_MEMORY = 1;
const RECORD_GUARDRAIL = 2;
const RECORD_DICT_MEMORY = 4;

const BELIEF_UNVERIFIED = 1;
const BELIEF_VERIFIED = 2;
const BELIEF_AXIOM = 3;

export class SemanticArena {
  public arena: Uint32Array;
  public records: ArenaRecord[] = [];
  private recordTypes: Uint8Array;
  private guardrailPayloads = new Map<number, string>();
  private guardrailIndices: number[] = [];
  private currentCompiledOffset = 0;
  private recordTagText: string[];
  private sourceReliability: Float32Array;

  // Causal Graph - Intrusive Linked List (C-style memory layout for O(1) traversal)
  private causedBy: Uint32Array;
  private firstEffect: Uint32Array;
  private nextSiblingEffect: Uint32Array;
  private causalStrength: Uint8Array;
  private beliefState: Uint8Array; // 0:Empty, 1:Unverified, 2:Verified, 3:Axiom

  constructor(public maxRecords: number = 600000) {
    this.arena = new Uint32Array(maxRecords * 64);
    this.recordTypes = new Uint8Array(maxRecords);
    this.recordTagText = new Array(maxRecords).fill('');
    this.sourceReliability = new Float32Array(maxRecords);
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
    this.recordTypes[index] = RECORD_EA_MEMORY;
    this.beliefState[index] = BELIEF_VERIFIED;
    this.recordTagText[index] = '';
    this.sourceReliability[index] = 0.75;
  }

  public insertGuardrail(vector: Uint32Array, index: number, rule: string): void {
    const offset = index * 64;
    for (let i = 0; i < 64; i++) {
      this.arena[offset + i] = vector[i];
    }
    this.recordTypes[index] = RECORD_GUARDRAIL;
    this.recordTagText[index] = '';
    this.sourceReliability[index] = 1;
    this.guardrailPayloads.set(index, rule);
    this.guardrailIndices.push(index);
  }

  // --- Causal Graph Methods ---
  public linkCausation(effectIdx: number, causeIdx: number, strength: number = 255): void {
    this.causedBy[effectIdx] = causeIdx;
    this.causalStrength[effectIdx] = strength;
    this.nextSiblingEffect[effectIdx] = this.firstEffect[causeIdx]; // Point to old head
    this.firstEffect[causeIdx] = effectIdx; // Set as new head
  }

  public addMemory(parsedTriplet: DeepParsedQuery, belief: number, isDict: boolean = false, sourceSentence: string = ''): number {
    const vector = vectoriser.vectorise(parsedTriplet);
    const index = this.currentCompiledOffset;
    const offset = index * 64;
    for (let i = 0; i < 64; i++) {
      this.arena[offset + i] = vector[i];
    }
    // Domain Partitioning: 1=EA_MEMORY, 4=DICT_MEMORY
    this.recordTypes[index] = isDict ? RECORD_DICT_MEMORY : RECORD_EA_MEMORY;
    this.beliefState[index] = belief;
    globalSynthesizer.learn(parsedTriplet, index, sourceSentence);
    this.recordTagText[index] = '';
    this.sourceReliability[index] = isDict ? 0.55 : 0.75;
    this.currentCompiledOffset++;

    // Persist to IndexedDB with pre-computed vector and full orthogonal components
    // CRITICAL: .slice() to avoid serializing backing ArrayBuffer
    db.semantic_memory.add({
      subject: parsedTriplet.Subject || '',
      predicate: parsedTriplet.Intent || '',
      object: parsedTriplet.Target || '',
      context: sourceSentence,
      orthogonal_components: parsedTriplet,
      vector: vector.slice(),
      beliefState: belief,
      source: 'epistemic_engine',
      createdAt: new Date()
    }).catch(e => {
      Logger.error('[SemanticArena] Failed to persist knowledge triplet', e);
    });

    return index;
  }

  /**
   * Blit a pre-computed vector directly into RAM during hydration.
   * Skips the DB write — the vector already exists in IndexedDB.
   */
  private _injectToRAM(vector: Uint32Array, id: number, subject: string, predicate: string, object: string, context: string, belief: number, orthogonal?: DeepParsedQuery): void {
    const index = this.currentCompiledOffset;
    const offset = index * 64;
    for (let i = 0; i < 64; i++) {
      this.arena[offset + i] = vector[i];
    }
    this.recordTypes[index] = RECORD_EA_MEMORY;
    this.beliefState[index] = belief;
    this.recordTagText[index] = '';
    this.sourceReliability[index] = 0.75;
    const fullOrthogonal = orthogonal || {
      Subject: subject,
      Intent: predicate,
      Target: object,
      Tense: 'Present' as const,
      Voice: 'Active' as const,
      Adverbs: [],
      Adjectives: [],
      Prepositions: [],
      Sentiment: 'Neutral' as const
    };
    globalSynthesizer.learn(fullOrthogonal, index, context);
    this.records[index] = { id, type: 'memory', payload: { subject, predicate, object, context } };
    this.currentCompiledOffset++;
  }

  // 256-entry popcount lookup table — built once at class load
  private static POPCNT_TABLE: Uint8Array | null = null;

  private static buildPopcntTable(): Uint8Array {
    const table = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      let n = i;
      let count = 0;
      while (n > 0) {
        count += n & 1;
        n >>>= 1;
      }
      table[i] = count;
    }
    return table;
  }

  public popcnt32(n: number): number {
    if (!SemanticArena.POPCNT_TABLE) {
      SemanticArena.POPCNT_TABLE = SemanticArena.buildPopcntTable();
    }
    const t = SemanticArena.POPCNT_TABLE;
    return t[n & 0xFF] + t[(n >>> 8) & 0xFF] + t[(n >>> 16) & 0xFF] + t[(n >>> 24) & 0xFF];
  }

  public checkGuardrails(queryVector: Uint32Array, threshold: number): string | null {
    // Iterate only guardrail indices instead of scanning all 600K records
    for (let idx = 0; idx < this.guardrailIndices.length; idx++) {
      const i = this.guardrailIndices[idx];
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
          if (this.recordTypes[i] !== RECORD_EA_MEMORY || this.beliefState[i] === BELIEF_UNVERIFIED) continue;
          
          const offset = i * 64;
          let coreIntersection = 0;
          for (let j = 0; j < 32; j++) {
              coreIntersection += this.popcnt32(queryVector[j] & this.arena[offset + j]);
          }
          
          if (coreIntersection >= expectedCoreBits && expectedCoreBits > 0) {
              const comps = globalSynthesizer.getRawComponents(i);
              
              // Keyword Tie-Breaker (Strike 36 calibration)
              const recordText = `${comps.s} ${comps.i} ${comps.t}`.toLowerCase();
              const isTrueMatch = queryKeywords.every(kw => exactWordMatch(recordText, kw));
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

  public getBeliefState(index: number): number {
    return this.beliefState[index] || 0;
  }

  public getRecordType(index: number): number {
    return this.recordTypes[index] || RECORD_EMPTY;
  }

public searchWithScores(queryVector: Uint32Array, threshold: number = 0.18, ragTags?: string[]): ArenaSearchResult[] {
  let queryPopcnt = 0;
  for (let j = 0; j < 64; j++) queryPopcnt += this.popcnt32(queryVector[j]);
  if (queryPopcnt === 0) return [];

  const thresholdSq = threshold * threshold; // Pre-calculate squared threshold
  const eaResults: ArenaSearchResult[] = [];
  const dictResults: ArenaSearchResult[] = [];

  for (let i = 0; i < this.maxRecords; i++) {
    const rType = this.recordTypes[i];
    if (rType !== RECORD_EA_MEMORY && rType !== RECORD_GUARDRAIL && rType !== RECORD_DICT_MEMORY) continue;

    const offset = i * 64;

    // CORE-FIRST OPTIMIZATION: Check first 32 dimensions
    let coreIntersection = 0;
    for (let j = 0; j < 32; j++) {
      coreIntersection += this.popcnt32(queryVector[j] & this.arena[offset + j]);
    }
    if (coreIntersection < 2) continue; // Strict Gatekeeper

    let intersectionPopcnt = coreIntersection;
    let docPopcnt = 0;
    for (let j = 0; j < 32; j++) docPopcnt += this.popcnt32(this.arena[offset + j]);
    for (let j = 32; j < 64; j++) {
      const docInt = this.arena[offset + j];
      intersectionPopcnt += this.popcnt32(queryVector[j] & docInt);
      docPopcnt += this.popcnt32(docInt);
    }

    if (docPopcnt === 0) continue;

    // SQUARED COMPARISON OPTIMIZATION (No Math.sqrt in hot loop)
    const scoreSq = (intersectionPopcnt * intersectionPopcnt) / (queryPopcnt * docPopcnt);

    if (scoreSq >= thresholdSq) {
      const comps = globalSynthesizer.getRawComponents(i);
      const recordText = `${comps.s} ${comps.i} ${comps.t}`.toLowerCase();
      const tagText = this.recordTagText[i] || '';

      // Filter by the active persona's RAG tags — skip records that don't mention any of them
      if (ragTags && ragTags.length > 0) {
        const hasMatch = ragTags.some(tag => {
          const normalizedTag = tag.toLowerCase();
          return recordText.includes(normalizedTag) || tagText.includes(normalizedTag);
        });
        if (!hasMatch) continue;
      }

      // Only calculate actual float for the tiny fraction that pass the gate
      const actualScore = Math.sqrt(scoreSq);
      const belief = this.beliefState[i] || (rType === RECORD_DICT_MEMORY ? BELIEF_VERIFIED : BELIEF_AXIOM);
      const sourceSentence = comps.sourceSentence || '';
      const hasSource = sourceSentence.trim().length > 0;
      const beliefBoost = belief >= BELIEF_AXIOM ? 0.12 : belief === BELIEF_VERIFIED ? 0.06 : -0.14;
      const sourceBoost = hasSource ? 0.08 : -0.04;
      const reliabilityBoost = ((this.sourceReliability[i] || 0.5) - 0.5) * 0.08;
      const typeBoost = rType === RECORD_EA_MEMORY ? 0.04 : rType === RECORD_DICT_MEMORY ? -0.08 : -0.12;
      const genericPenalty = comps.t === 'concept' && !hasSource ? -0.12 : 0;
      const weightedScore = Math.max(0, Math.min(1, actualScore + beliefBoost + sourceBoost + reliabilityBoost + typeBoost + genericPenalty));
      const result: ArenaSearchResult = {
        index: i,
        score: actualScore,
        weightedScore,
        recordType: rType,
        beliefState: belief,
        hasSource,
        sourceSentence,
        subject: comps.s || '',
        intent: comps.i || '',
        target: comps.t || '',
      };

      if (rType === RECORD_DICT_MEMORY) dictResults.push(result);
      else eaResults.push(result);
    }
  }

  // DOMAIN PRECEDENCE: EA_MEMORY results first, then DICT_MEMORY
  if (eaResults.length > 0) return eaResults.sort((a, b) => b.weightedScore - a.weightedScore || b.score - a.score);
  return dictResults.sort((a, b) => b.weightedScore - a.weightedScore || b.score - a.score);
}

  public search(queryVector: Uint32Array, threshold: number = 0.18): number[] {
    return this.searchWithScores(queryVector, threshold).map(r => r.index);
  }

  /**
   * Find A→B→C causal chains where A→C is missing — these are knowledge gaps
   * worth exploring. Pure bitwise scan over the arena, no object allocation in the hot loop.
   */
  public scanTransitiveChains(maxResults: number = 10): { s: string, i: string, t: string, score: number }[] {
    const NULL_PTR = 0xFFFFFFFF;
    const results: { s: string, i: string, t: string, score: number }[] = [];
    const activeCount = this.currentCompiledOffset;

    // Pre-compute popcnt for each active record's core (first 32 dims)
    // Stored in a flat Int32Array to avoid object allocation
    const corePopcnts = new Int32Array(activeCount);
    for (let i = 0; i < activeCount; i++) {
      if (this.recordTypes[i] !== 1) continue;
      let pop = 0;
      const offset = i * 64;
      for (let j = 0; j < 32; j++) {
        pop += this.popcnt32(this.arena[offset + j]);
      }
      corePopcnts[i] = pop;
    }

    // O(N) scan: find A→B→C chains
    for (let a = 0; a < activeCount; a++) {
      if (results.length >= maxResults) break;
      if (corePopcnts[a] === 0) continue; // Inactive or non-memory

      // Iterate B via firstEffect linked list
      let bIdx = this.firstEffect[a];
      while (bIdx !== NULL_PTR && bIdx < activeCount) {
        if (corePopcnts[bIdx] === 0) {
          bIdx = this.nextSiblingEffect[bIdx];
          continue;
        }

        // Iterate C via B's effects
        let cIdx = this.firstEffect[bIdx];
        while (cIdx !== NULL_PTR && cIdx < activeCount) {
          if (corePopcnts[cIdx] === 0 || cIdx === a) {
            cIdx = this.nextSiblingEffect[cIdx];
            continue;
          }

          // Check if A→C direct link already exists
          let directLink = false;
          let checkIdx = this.firstEffect[a];
          while (checkIdx !== NULL_PTR && checkIdx < activeCount) {
            if (checkIdx === cIdx) {
              directLink = true;
              break;
            }
            checkIdx = this.nextSiblingEffect[checkIdx];
          }

          if (!directLink) {
            // A→B→C exists but A→C missing — curiosity gap found
            const compsA = globalSynthesizer.getRawComponents(a);
            const compsC = globalSynthesizer.getRawComponents(cIdx);
            if (compsA.s && compsC.t) {
              // Bitwise relevance score: intersection of A and C cores
              let intersection = 0;
              const offsetA = a * 64;
              const offsetC = cIdx * 64;
              for (let j = 0; j < 32; j++) {
                intersection += this.popcnt32(this.arena[offsetA + j] & this.arena[offsetC + j]);
              }
              const score = intersection / (corePopcnts[a] + corePopcnts[cIdx] - intersection + 1);

              results.push({
                s: compsA.s,
                i: 'causes',
                t: compsC.t,
                score,
              });

              if (results.length >= maxResults) break;
            }
          }

          cIdx = this.nextSiblingEffect[cIdx];
        }

        if (results.length >= maxResults) break;
        bIdx = this.nextSiblingEffect[bIdx];
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
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
    const response = await fetch('/baseline_corpus.bin.gz');
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

    if (fullBuffer.byteLength % 4 !== 0) {
      throw new Error(`Invalid baseline corpus byte length: ${fullBuffer.byteLength}`);
    }

    const baselineVectors = new Uint32Array(fullBuffer.buffer, fullBuffer.byteOffset, fullBuffer.byteLength / 4);
    if (baselineVectors.length % 64 !== 0) {
      throw new Error(`Invalid baseline corpus vector length: ${baselineVectors.length}`);
    }

    const requiredRecords = baselineVectors.length / 64;
    if (requiredRecords > this.maxRecords) {
      Logger.warn(`[SemanticArena] Resizing arena from ${this.maxRecords} to ${requiredRecords + 10000}`);
      this.maxRecords = requiredRecords + 10000;
      this.arena = new Uint32Array(this.maxRecords * 64);
      this.recordTypes = new Uint8Array(this.maxRecords);
      this.causedBy = new Uint32Array(this.maxRecords).fill(0xFFFFFFFF);
      this.firstEffect = new Uint32Array(this.maxRecords).fill(0xFFFFFFFF);
      this.nextSiblingEffect = new Uint32Array(this.maxRecords).fill(0xFFFFFFFF);
      this.causalStrength = new Uint8Array(this.maxRecords);
      this.beliefState = new Uint8Array(this.maxRecords);
      this.recordTagText = new Array(this.maxRecords).fill('');
      this.sourceReliability = new Float32Array(this.maxRecords);
      globalSynthesizer.resize(this.maxRecords);
    }

    // Safely blit compiled data
    this.arena.set(baselineVectors, 0);
    this.currentCompiledOffset = requiredRecords;

    // Mark these as type 1 (Memory)
    for (let i = 0; i < this.currentCompiledOffset; i++) {
      this.recordTypes[i] = RECORD_EA_MEMORY;
      this.beliefState[i] = BELIEF_AXIOM;
    }

    try {
      const metaRecords = await fetchJsonAsset<any[]>(
        '/baseline_meta.json.gz',
        '/baseline_meta.json'
      );
      if (!Array.isArray(metaRecords)) {
        throw new Error('baseline_meta.json is not an array');
      }

      const searchableRecords = Math.min(metaRecords.length, requiredRecords);
      if (metaRecords.length !== requiredRecords) {
        Logger.warn(`[SemanticArena] Corpus/meta mismatch. vectors=${requiredRecords}, metadata=${metaRecords.length}. Only ${searchableRecords} aligned records will be searchable.`);
        for (let i = searchableRecords; i < requiredRecords; i++) {
          this.recordTypes[i] = RECORD_EMPTY;
          this.beliefState[i] = 0;
        }
      }

      // Time-Sliced Async Hydration to prevent main-thread freeze
      await new Promise<void>((resolve) => {
        const CHUNK_SIZE = 1000;
        let currentIndex = 0;

        const processChunk = () => {
          const end = Math.min(currentIndex + CHUNK_SIZE, searchableRecords);
          for (let i = currentIndex; i < end; i++) {
            const rec = metaRecords[i];
            const s = rec.s || (rec.parsed && rec.parsed.Subject) || '';
            const intent = rec.i || (rec.parsed && rec.parsed.Intent) || '';
            const t = rec.t || (rec.parsed && rec.parsed.Target) || '';
            const srcSentence = rec.sourceSentence || rec.originalText || rec.original || rec.text || rec.context || '';
            const personaTags = Array.isArray(rec.personaTags) ? rec.personaTags : [];
            const domainTags = Array.isArray(rec.domainTags) ? rec.domainTags : [];
            const aliases = Array.isArray(rec.aliases) ? rec.aliases : [];
            if (s && intent && t) {
              const orthogonal: DeepParsedQuery = rec.parsed || {
                Subject: s,
                Intent: intent,
                Target: t,
                Tense: 'Present',
                Voice: 'Active',
                Adverbs: [],
                Adjectives: [],
                Prepositions: [],
                Sentiment: 'Neutral'
              };
              globalSynthesizer.learn(orthogonal, i, srcSentence);
            }
            // TASK 4: Domain Partitioning - Read isDict flag and set recordTypes
            this.recordTypes[i] = rec.isDict ? RECORD_DICT_MEMORY : RECORD_EA_MEMORY;
            this.beliefState[i] = rec.beliefState ?? (rec.isDict ? BELIEF_VERIFIED : BELIEF_AXIOM);
            this.recordTagText[i] = [...personaTags, ...domainTags, ...aliases, rec.sourceFile || '', rec.sourceType || '']
              .join(' ')
              .toLowerCase();
            this.sourceReliability[i] = typeof rec.sourceReliability === 'number'
              ? Math.max(0, Math.min(1, rec.sourceReliability))
              : (rec.isDict ? 0.55 : 0.85);
          }
          currentIndex = end;
          if (currentIndex < searchableRecords) {
            setTimeout(processChunk, 0); // Yield to React Render Cycle
          } else {
            this.currentCompiledOffset = searchableRecords;
            Logger.info(`[EA-NITI] Time-Sliced Hydration Complete: ${searchableRecords} records.`);
            resolve(); // Safely unlock the bootloader
          }
        };
        processChunk();
      });
} catch (err) {
    Logger.error('[EA-NITI] Metadata Hydration Failed:', err);
    this.recordTypes.fill(0, 0, this.currentCompiledOffset);
    this.beliefState.fill(0, 0, this.currentCompiledOffset);
    this.currentCompiledOffset = 0;
  }
  } catch(e) {
    Logger.error('No baseline corpus found', e);
  }
}

  public async loadFromDB() {
    await this.loadCompiledBinary();
    await this.purgeUnsafeEpistemicMemory();

    const guardrails = await db.privacy_guardrails.filter(g => !!g.isActive).toArray();
    const memories = await db.semantic_memory.toArray();

    this.records = [];
    // Keep recordTypes 0 for indices >= currentCompiledOffset
    for (let i = this.currentCompiledOffset; i < this.maxRecords; i++) {
        this.recordTypes[i] = RECORD_EMPTY;
        this.beliefState[i] = 0;
    }
    this.guardrailPayloads.clear();
    this.guardrailIndices = [];

    // Inject guardrails (still require parsing — no pre-computed vectors for guardrails)
    for (const g of guardrails) {
      const parsed = parser.parse(g.ruleText) as DeepParsedQuery;
      parsed.Sentiment = 'Critical';
      const vec = vectoriser.vectorise(parsed);
      const index = this.currentCompiledOffset;
      const offset = index * 64;
      for (let i = 0; i < 64; i++) {
        this.arena[offset + i] = vec[i];
      }
      this.recordTypes[index] = RECORD_GUARDRAIL;
      this.guardrailPayloads.set(index, g.ruleText || g.title);
      this.guardrailIndices.push(index);
      this.records[index] = { id: g.id!, type: 'guardrail', payload: g };
      this.currentCompiledOffset++;
    }

    // Zero-Compute Hydration: Use pre-computed vectors from IndexedDB
    let hydratedCount = 0;
    let revectorizedCount = 0;
    for (const mem of memories) {
      if (mem.vector && mem.vector instanceof Uint32Array && mem.vector.length === 64) {
        // Pre-computed vector exists — zero-compute blit
        this._injectToRAM(
          mem.vector,
          mem.id!,
          mem.subject || 'System',
          mem.predicate || 'defines',
          mem.object || '',
          mem.context || '',
          mem.beliefState ?? 2,
          mem.orthogonal_components
        );
        hydratedCount++;
      } else {
        // Legacy record without vector — must re-vectorize (one-time cost)
        const subject = mem.subject || 'System';
        const predicate = mem.predicate || 'defines';
        const object = mem.object || '';
        const parsed = parser.parse(`${subject} ${predicate} ${object}`);
        const vec = vectoriser.vectorise(parsed);
        this._injectToRAM(vec, mem.id!, subject, predicate, object, mem.context || '', mem.beliefState ?? 2);
        revectorizedCount++;
      }
    }

    // Derive active count from the final offset position
    // (activeRecords field removed; currentCompiledOffset is authoritative)

    Logger.info(`[SemanticArena] Hydrated ${hydratedCount} facts (zero-compute) + ${revectorizedCount} revectorized legacy records.`);
  }

  private async purgeUnsafeEpistemicMemory(): Promise<void> {
    try {
      const memories = await db.semantic_memory.where('source').equals('epistemic_engine').toArray();
      const unsafeIds = memories
        .filter(mem => {
          const belief = mem.beliefState ?? BELIEF_UNVERIFIED;
          if (belief > BELIEF_UNVERIFIED) return false;

          const text = `${mem.subject} ${mem.predicate} ${mem.object} ${mem.context}`.toLowerCase();
          const context = (mem.context || '').trim();
          const hasErrorArtifact = [
            'structurally,',
            'unsupported_tensor_type',
            'cached gguf',
            'neuro-symbolic fallback',
            'worker not available',
            'watchdog_timeout',
            'critical guardrail intercept',
          ].some(marker => text.includes(marker));
          const hasMalformedToken = /\b(updats|areincorporat|reincorporat)\b/.test(text);
          const isGenericConcept = mem.object?.toLowerCase() === 'concept';

          return !context || hasErrorArtifact || hasMalformedToken || isGenericConcept;
        })
        .map(mem => mem.id)
        .filter((id): id is number => typeof id === 'number');

      if (unsafeIds.length > 0) {
        await db.semantic_memory.bulkDelete(unsafeIds);
        Logger.info(`[SemanticArena] Purged ${unsafeIds.length} unsafe unverified epistemic memories.`);
      }
    } catch (error) {
      Logger.warn('[SemanticArena] Unsafe epistemic memory purge skipped:', error);
    }
  }

  // For tests
  public setActiveRecords(count: number) {
      this.currentCompiledOffset = count;
  }
}

export const globalArena = new SemanticArena(600000);
