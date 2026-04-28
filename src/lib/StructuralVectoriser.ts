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
    vector[Math.floor(bitIndex / 32)] |= (1 << (bitIndex % 32));
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

    // Modifiers
    query.Adverbs.forEach(adv => this.project(vector, 'IntentAccel', `IntentAccel:${adv}`));
    query.Adjectives.forEach(adj => this.project(vector, 'EntityDescriber', `EntityDescriber:${adj}`));

    // Relational Bridges
    query.Prepositions.forEach(prep => this.project(vector, 'RelationalBridge', `RelationalBridge:${prep}`));

    // Sentiment
    this.project(vector, 'Sentiment', `Sentiment:${query.Sentiment}`);

    return vector;
  }
}

// Backward compatibility aliases
export const StructuralVectoriser = MoatVectoriser;
export type SemanticSkeleton = DeepParsedQuery;
export type ParsedQuery = DeepParsedQuery;
export type GrammarRole = AdvancedGrammarRole;
