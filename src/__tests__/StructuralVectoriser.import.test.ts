import { describe, it, expect } from 'vitest';
import type { DeepParsedQuery } from '../lib/StructuralVectoriser';

describe('Import Test', () => {
  it('should import types', () => {
    const q: DeepParsedQuery = {
      Subject: 'test',
      Intent: 'analyze',
      Target: null,
      Tense: 'Present',
      Voice: 'Active',
      Adverbs: [],
      Adjectives: [],
      Prepositions: [],
      Sentiment: 'Neutral'
    };
    expect(q).toBeDefined();
  });
});
