export interface DeepParsedQuery {
  Subject: string | null;
  Intent: string | null;
  Target: string | null;
  Tense: 'Past' | 'Present' | 'Future';
  Voice: 'Active' | 'Passive';
  Adverbs: string[];
  Adjectives: string[];
  Prepositions: string[];
  Sentiment: 'Critical' | 'Warning' | 'Neutral';
  Unknowns?: string[];
}

export type AdvancedGrammarRole =
  | 'CoreTriplet'
  | 'StateTense'
  | 'StateVoice'
  | 'IntentAccel'
  | 'EntityDescriber'
  | 'RelationalBridge'
  | 'Sentiment';

export class MoatVectoriser {
  private readonly TOTAL_INTS = 64; // 2048 bits
  private readonly K_HASHES = 3;
  private parser: any;

  private readonly ZONES: Record<AdvancedGrammarRole, { start: number, length: number }> = {
    'CoreTriplet':      { start: 0,    length: 1024 },
    'StateTense':       { start: 1024, length: 64 },
    'StateVoice':       { start: 1088, length: 64 },
    'IntentAccel':      { start: 1152, length: 256 },
    'EntityDescriber':  { start: 1408, length: 256 },
    'RelationalBridge': { start: 1664, length: 256 },
    'Sentiment':        { start: 1920, length: 128 }
  };

  private fnv1a(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  private setBit(vector: Uint32Array, bitIndex: number): void {
    vector[bitIndex >>> 5] |= (1 << (bitIndex & 31));
  }

  private project(vector: Uint32Array, role: AdvancedGrammarRole, hashStr: string) {
    const zone = this.ZONES[role];
    for (let k = 0; k < this.K_HASHES; k++) {
      const hash = this.fnv1a(hashStr + k);
      const bitPosition = zone.start + (hash % zone.length);
      this.setBit(vector, bitPosition);
    }
  }

  public vectorise(query: DeepParsedQuery): Uint32Array {
    const vector = new Uint32Array(this.TOTAL_INTS);
    this._fillVector(query, vector);
    return vector;
  }

  /**
   * Fills a pre-allocated buffer with the query vector.
   * Caller MUST zero the buffer before calling (buffer.fill(0)).
   * Avoids heap allocation in hot paths.
   */
  public vectoriseInto(query: DeepParsedQuery, outBuffer: Uint32Array): Uint32Array {
    if (outBuffer.length < this.TOTAL_INTS) {
      throw new Error(`Output buffer too small: need ${this.TOTAL_INTS}, got ${outBuffer.length}`);
    }
    this._fillVector(query, outBuffer);
    return outBuffer;
  }

  private _fillVector(query: DeepParsedQuery, vector: Uint32Array): void {
    // CoreTriplet (Hashed by constituent words for partial topological matching)
    if (query.Subject) {
        const words = query.Subject.toLowerCase().split(/\s+/);
        words.forEach(w => this.project(vector, 'CoreTriplet', `SubjectWord:${w}`));
        this.project(vector, 'CoreTriplet', `SubjectFull:${query.Subject.toLowerCase()}`);
    }
    
    if (query.Intent) {
        this.project(vector, 'CoreTriplet', `Intent:${query.Intent.toLowerCase()}`);
    }

    if (query.Target) {
        const words = query.Target.toLowerCase().split(/\s+/);
        words.forEach(w => this.project(vector, 'CoreTriplet', `TargetWord:${w}`));
        this.project(vector, 'CoreTriplet', `TargetFull:${query.Target.toLowerCase()}`);
    }

    // StateTense & StateVoice
    this.project(vector, 'StateTense', `StateTense:${query.Tense}`);
    this.project(vector, 'StateVoice', `StateVoice:${query.Voice}`);

    // Modifiers - null-safe in case external code constructs DeepParsedQuery without these arrays
    (query.Adverbs || []).forEach(adv => this.project(vector, 'IntentAccel', `IntentAccel:${adv}`));
    (query.Adjectives || []).forEach(adj => this.project(vector, 'EntityDescriber', `EntityDescriber:${adj}`));

    // Relational Bridges
    (query.Prepositions || []).forEach(prep => this.project(vector, 'RelationalBridge', `RelationalBridge:${prep}`));

    // Sentiment
    this.project(vector, 'Sentiment', `Sentiment:${query.Sentiment}`);
  }

  /**
   * Convenience wrapper: parses raw text through the internal LexicalStateMachine
   * and projects the resulting orthogonal grammar layers into a 2048-bit bitfield.
   * Single-call API for the ingestion pipeline.
   */
  public async projectToBitfield(text: string): Promise<Uint32Array> {
    if (!this.parser) {
      const { LexicalStateMachine } = await import('./LexicalParser');
      this.parser = new LexicalStateMachine();
    }
    const query = this.parser.parse(text);
    return this.vectorise(query);
  }

  /**
   * Parses multi-line text into orthogonal grammar layers and projects each
   * into a 2048-bit bitfield. Returns array of { vector, orthogonal } pairs
   * for the ingestion pipeline.
   */
  public async projectOrthogonalLayersToBitfields(text: string): Promise<{ vector: Uint32Array, orthogonal: DeepParsedQuery }[]> {
    if (!this.parser) {
      const { LexicalStateMachine } = await import('./LexicalParser');
      this.parser = new LexicalStateMachine();
    }
    const layers = this.parser.parseOrthogonalLayersFromText(text);
    return layers.map((orthogonal: DeepParsedQuery) => ({
      vector: this.vectorise(orthogonal),
      orthogonal
    }));
  }
}

// Backward compatibility aliases
export const StructuralVectoriser = MoatVectoriser;
export type SemanticSkeleton = DeepParsedQuery;
export type ParsedQuery = DeepParsedQuery;
export type GrammarRole = AdvancedGrammarRole;
