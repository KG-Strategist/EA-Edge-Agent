import { describe, it, expect } from 'vitest';
import { MoatVectoriser, DeepParsedQuery } from '../lib/StructuralVectoriser';

describe('MoatVectoriser', () => {
  it('should create a 2048-bit vector (64 * 32-bit integers)', () => {
    const vectoriser = new MoatVectoriser();
    const query: DeepParsedQuery = {
      Subject: 'system', Intent: 'analyze', Target: null, Tense: 'Present', Voice: 'Active',
      Adverbs: [], Adjectives: [], Prepositions: [], Sentiment: 'Neutral'
    };
    const vector = vectoriser.vectorise(query);
    expect(vector).toBeInstanceOf(Uint32Array);
    expect(vector.length).toBe(64);
  });

  it('should set bits in the core space for Subject + Intent + Target', () => {
    const vectoriser = new MoatVectoriser();
    const query: DeepParsedQuery = {
      Subject: 'system', Intent: 'analyze', Target: 'database', Tense: 'Present', Voice: 'Active',
      Adverbs: [], Adjectives: [], Prepositions: [], Sentiment: 'Neutral'
    };
    const vector = vectoriser.vectorise(query);
    let coreHasBits = false;
    for (let i = 0; i < 4; i++) {
      if (vector[i] !== 0) { coreHasBits = true; break; }
    }
    expect(coreHasBits).toBe(true);
  });

  it('should produce deterministic vectors for the same input', () => {
    const vectoriser = new MoatVectoriser();
    const query: DeepParsedQuery = {
      Subject: 'compliance', Intent: 'audit', Target: null, Tense: 'Present', Voice: 'Active',
      Adverbs: [], Adjectives: [], Prepositions: [], Sentiment: 'Neutral'
    };
    const vector1 = vectoriser.vectorise(query);
    const vector2 = vectoriser.vectorise(query);
    expect(vector1).toEqual(vector2);
  });

  it('should produce different vectors for different inputs', () => {
    const vectoriser = new MoatVectoriser();
    const q1: DeepParsedQuery = {
      Subject: 'system', Intent: 'analyze', Target: null, Tense: 'Present', Voice: 'Active',
      Adverbs: [], Adjectives: [], Prepositions: [], Sentiment: 'Neutral'
    };
    const q2: DeepParsedQuery = {
      Subject: 'database', Intent: 'analyze', Target: null, Tense: 'Present', Voice: 'Active',
      Adverbs: [], Adjectives: [], Prepositions: [], Sentiment: 'Neutral'
    };
    expect(vectoriser.vectorise(q1)).not.toEqual(vectoriser.vectorise(q2));
  });

  it('should handle queries with all fields populated', () => {
    const vectoriser = new MoatVectoriser();
    const query: DeepParsedQuery = {
      Intent: 'threat_model', Subject: 'api_gateway', Target: 'security',
      Tense: 'Present', Voice: 'Active', Adverbs: ['strictly'],
      Adjectives: ['critical'], Prepositions: ['with'], Sentiment: 'Critical'
    };
    const vector = vectoriser.vectorise(query);
    expect(vector).toBeInstanceOf(Uint32Array);
    expect(vector.length).toBe(64);
  });

  it('should handle empty strings gracefully', () => {
    const vectoriser = new MoatVectoriser();
    const query: DeepParsedQuery = {
      Subject: '', Intent: 'analyze', Target: null, Tense: 'Present', Voice: 'Active',
      Adverbs: [], Adjectives: [], Prepositions: [], Sentiment: 'Neutral'
    };
    const vector = vectoriser.vectorise(query);
    expect(vector).toBeInstanceOf(Uint32Array);
  });

  it('should distribute bits across the 2048-bit space', () => {
    const vectoriser = new MoatVectoriser();
    const query: DeepParsedQuery = {
      Subject: 'multi_component_system', Intent: 'comprehensive_analysis', Target: 'enterprise_scale',
      Tense: 'Present', Voice: 'Active', Adverbs: [], Adjectives: [], Prepositions: [], Sentiment: 'Neutral'
    };
    const vector = vectoriser.vectorise(query);
    let setBitCount = 0;
    for (let i = 0; i < vector.length; i++) {
      let n = vector[i];
      while (n) { setBitCount += n & 1; n >>>= 1; }
    }
    expect(setBitCount).toBeGreaterThan(0);
    expect(setBitCount).toBeLessThan(2048);
  });
});
