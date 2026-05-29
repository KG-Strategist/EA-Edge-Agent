import { describe, it, expect, beforeEach } from 'vitest';
import { StructuralSynthesizer } from '../lib/StructuralSynthesizer';
import { VocabularyDictionary } from '../lib/VocabularyDictionary';

describe('StructuralSynthesizer', () => {
  let vocab: VocabularyDictionary;
  let synthesizer: StructuralSynthesizer;

  beforeEach(() => {
    vocab = new VocabularyDictionary();
    synthesizer = new StructuralSynthesizer(1000, vocab);
  });

  it('should initialize with correct capacity', () => {
    const syn = new StructuralSynthesizer(5000, vocab);
    expect(syn).toBeDefined();
  });

  it('should learn triplet facts and retrieve them by index', () => {
    const orthogonal = {
      Subject: 'API',
      Intent: 'requires',
      Target: 'authentication',
      Tense: 'Present' as const,
      Voice: 'Active' as const,
      Adverbs: [],
      Adjectives: [],
      Prepositions: [],
      Sentiment: 'Neutral' as const
    };
    synthesizer.learn(orthogonal, 0);
    const response = synthesizer.ask(0);
    
    expect(response).toBeDefined();
    expect(response).toContain('api');
    expect(response).toContain('requires');
    expect(response).toContain('authentication');
  });

  it('should return fallback for out-of-bounds index -1', () => {
    const response = synthesizer.ask(-1);
    expect(response).toContain('Neuro-Symbolic Fallback');
  });
});

describe('VocabularyDictionary', () => {
  let vocab: VocabularyDictionary;

  beforeEach(() => {
    vocab = new VocabularyDictionary();
  });

  it('should assign unique IDs to words', () => {
    const id1 = vocab.getId('architecture');
    const id2 = vocab.getId('system');

    expect(id1).not.toBe(id2);
  });

  it('should return same ID for same word (case-insensitive and trimmed)', () => {
    const id1 = vocab.getId('Database');
    const id2 = vocab.getId(' database ');
    const id3 = vocab.getId('DATABASE');

    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
  });

  it('should retrieve word by ID', () => {
    const id = vocab.getId('microservice');
    const word = vocab.getWord(id);

    expect(word).toBe('microservice');
  });

  it('should return null for unknown ID', () => {
    const word = vocab.getWord(99999);
    expect(word).toBeNull();
  });

  it('should handle many unique words', () => {
    const words = ['api', 'gateway', 'service', 'mesh', 'sidecar', 'cluster', 'node', 'pod'];
    const ids: number[] = [];

    for (const w of words) {
      ids.push(vocab.getId(w));
    }

    expect(new Set(ids).size).toBe(words.length);
  });
});
