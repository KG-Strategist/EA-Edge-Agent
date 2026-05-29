import { describe, expect, it } from 'vitest';
import {
  assessUnstructuredQuality,
  buildDictionaryMorphologyFacts,
  normalizeDictionaryRows,
  normalizeSentenceKey,
  parseCsvRows,
  posToLexiconRole,
} from '../../scripts/corpusBuildUtils';

describe('corpus build utilities', () => {
  it('parses quoted CSV rows with embedded commas and doubled quotes', () => {
    const rows = parseCsvRows('word,definition\n"a b c","the first three letters, used for ""alphabet"" examples"\n');

    expect(rows).toEqual([
      ['word', 'definition'],
      ['a b c', 'the first three letters, used for "alphabet" examples'],
    ]);
  });

  it('normalizes OPTED dictionary rows without leaking count or POS columns', () => {
    const entries = normalizeDictionaryRows(
      'dict/OPTED-Dictionary.csv',
      'Word,Count,POS,Definition\nArchitecture,12,"""n.""","""The art, science, or practice of designing coherent structures."""\n'
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      term: 'Architecture',
      pos: 'n.',
      sourceFormat: 'opted',
    });
    expect(entries[0].definition).toBe('The art, science, or practice of designing coherent structures.');
    expect(entries[0].definition).not.toContain('12');
    expect(entries[0].definition).not.toContain('n.');
  });

  it('normalizes ee.csv rows with quoted comma definitions', () => {
    const entries = normalizeDictionaryRows(
      'dict/ee.csv',
      'word,definition\ncapability,"a power, ability, or capacity used in business architecture"\n'
    );

    expect(entries).toEqual([{
      term: 'capability',
      definition: 'a power, ability, or capacity used in business architecture',
      sourceFormat: 'ee',
    }]);
  });

  it('maps dictionary POS tags into lexicon roles', () => {
    expect(posToLexiconRole('n.')).toBe('Entity');
    expect(posToLexiconRole('v.')).toBe('Intent');
    expect(posToLexiconRole('v. t.')).toBe('Intent');
    expect(posToLexiconRole('a.')).toBe('EntityDescriber');
    expect(posToLexiconRole('superl.')).toBe('EntityDescriber');
    expect(posToLexiconRole('adv.')).toBe('IntentAccel');
  });

  it('filters weak unstructured PDF/HTML fragments but keeps structured text', () => {
    expect(assessUnstructuredQuality({ Subject: 'may', Intent: 'be', Target: 'used freely by any organization' }, 'It may be used freely by any organization.', 'html')).toEqual({
      accepted: false,
      reason: 'weak-subject',
    });
    expect(assessUnstructuredQuality({ Subject: 'Architecture governance board', Intent: 'validates', Target: 'target architecture compliance evidence' }, 'Architecture governance board validates target architecture compliance evidence.', 'txt')).toEqual({
      accepted: true,
    });
  });

  it('creates stable normalized sentence keys for exact duplicate detection', () => {
    expect(normalizeSentenceKey('  Resilient Architecture   validates evidence. ')).toBe('resilient architecture validates evidence.');
  });

  it('creates useful morphology facts for nouns and verbs', () => {
    const nounFacts = buildDictionaryMorphologyFacts({
      term: 'song',
      definition: 'a short poem or other set of words set to music',
      pos: 'n.',
      sourceFormat: 'opted',
    });
    expect(nounFacts).toContainEqual(expect.objectContaining({
      subject: 'song',
      intent: 'has-part-of-speech',
      target: 'noun',
    }));
    expect(nounFacts).toContainEqual(expect.objectContaining({
      subject: 'song',
      intent: 'has-plural-form',
      target: 'songs',
    }));

    const verbFacts = buildDictionaryMorphologyFacts({
      term: 'sing',
      definition: 'to utter musical sounds with the voice',
      pos: 'v.',
      sourceFormat: 'opted',
    });
    expect(verbFacts).toContainEqual(expect.objectContaining({
      subject: 'sing',
      intent: 'has-past-tense-form',
      target: 'sang',
    }));
    expect(verbFacts).toContainEqual(expect.objectContaining({
      subject: 'sing',
      intent: 'has-participle-form',
      target: 'sung',
    }));
  });

  it('creates quality-gated adjective, adverb, and noun morphology facts', () => {
    const goodFacts = buildDictionaryMorphologyFacts({
      term: 'good',
      definition: 'possessing desirable qualities',
      pos: 'a.',
      sourceFormat: 'opted',
    });
    expect(goodFacts).toContainEqual(expect.objectContaining({
      subject: 'good',
      intent: 'has-comparative-form',
      target: 'better',
    }));
    expect(goodFacts).toContainEqual(expect.objectContaining({
      subject: 'good',
      intent: 'has-superlative-form',
      target: 'best',
    }));
    expect(goodFacts).toContainEqual(expect.objectContaining({
      subject: 'good',
      intent: 'has-adverb-form',
      target: 'well',
    }));

    const happyFacts = buildDictionaryMorphologyFacts({
      term: 'happy',
      definition: 'favored by fortune',
      pos: 'a.',
      sourceFormat: 'opted',
    });
    expect(happyFacts).toContainEqual(expect.objectContaining({
      intent: 'has-noun-form',
      target: 'happiness',
    }));

    const adverbFacts = buildDictionaryMorphologyFacts({
      term: 'quickly',
      definition: 'speedily; with haste',
      pos: 'adv.',
      sourceFormat: 'opted',
    });
    expect(adverbFacts).toContainEqual(expect.objectContaining({
      subject: 'quickly',
      intent: 'has-adjective-form',
      target: 'quick',
    }));

    const nounFacts = buildDictionaryMorphologyFacts({
      term: 'analysis',
      definition: 'a resolving into elements',
      pos: 'n.',
      sourceFormat: 'opted',
    });
    expect(nounFacts).toContainEqual(expect.objectContaining({
      subject: 'analysis',
      intent: 'has-plural-form',
      target: 'analyses',
    }));
  });

  it('rejects dubious generated adjective degree forms', () => {
    const rejected: Array<{ candidate: string; reason: string }> = [];
    const facts = buildDictionaryMorphologyFacts({
      term: 'architectural',
      definition: 'pertaining to architecture',
      pos: 'a.',
      sourceFormat: 'opted',
    }, {
      onReject: rejection => rejected.push(rejection),
    });

    expect(facts).not.toContainEqual(expect.objectContaining({ target: 'architecturaler' }));
    expect(facts).not.toContainEqual(expect.objectContaining({ target: 'architecturalest' }));
    expect(rejected.some(rejection => rejection.candidate === 'architecturaler')).toBe(true);
  });

  it('mines high-precision source-derived dictionary relations', () => {
    const facts = buildDictionaryMorphologyFacts({
      term: 'whisky',
      definition: 'Alt. of Whiskey',
      pos: 'n.',
      sourceFormat: 'opted',
    }, {
      knownTerms: new Set(['whiskey']),
    });

    expect(facts).toContainEqual(expect.objectContaining({
      subject: 'whisky',
      intent: 'is-alternate-form-of',
      target: 'whiskey',
      sourceType: 'csv-dictionary-relation',
    }));

    const inflectionFacts = buildDictionaryMorphologyFacts({
      term: 'wolves',
      definition: 'pl. of Wolf.',
      pos: 'n.',
      sourceFormat: 'opted',
    }, {
      knownTerms: new Set(['wolf']),
    });

    expect(inflectionFacts).toContainEqual(expect.objectContaining({
      subject: 'wolves',
      intent: 'is-inflected-form-of',
      target: 'wolf',
    }));
    expect(inflectionFacts).toContainEqual(expect.objectContaining({
      subject: 'wolves',
      intent: 'has-lemma',
      target: 'wolf',
    }));
  });
});
