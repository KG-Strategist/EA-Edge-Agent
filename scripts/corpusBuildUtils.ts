import crypto from 'crypto';
import path from 'path';
import nlp from 'compromise';

export type LexiconRole = 'Entity' | 'Intent' | 'EntityDescriber' | 'IntentAccel';

export interface DictionaryEntry {
  term: string;
  definition: string;
  pos?: string;
  sourceFormat: 'opted' | 'ee' | 'generic';
}

export interface MorphologyFact {
  subject: string;
  intent: string;
  target: string;
  sourceSentence: string;
  domainTags: string[];
  sourceType?: string;
  sourceReliability?: number;
}

export interface QualityDecision {
  accepted: boolean;
  reason?: string;
}

export interface DictionaryMorphologyOptions {
  knownTerms?: Set<string> | string[];
  onReject?: (rejection: { term: string; intent: string; candidate: string; reason: string }) => void;
}

const SKIPPED_BASENAMES = new Set([
  '.ds_store',
  '.gitkeep',
  'readme.md',
  'brain_manifest.json',
  'miner_sources.json',
  'mining_failures.jsonl',
  'mined_domains.log',
  'local_persona_inputs_manifest.json',
  'brain_kb_manifest.json',
]);

const WEAK_UNSTRUCTURED_SUBJECTS = new Set([
  '',
  'a',
  'an',
  'the',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'there',
  'may',
  'can',
  'could',
  'should',
  'would',
  'we',
  'you',
]);

export function hashText(value: string, length = 24): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, length);
}

export function normalizeWhitespace(value: string): string {
  return value.replaceAll(String.fromCharCode(0), ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeSentenceKey(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ');
}

export function cleanTextCell(value: string): string {
  let cleaned = normalizeWhitespace(value)
    .replace(/\\"/g, '"')
    .replace(/""/g, '"');

  for (let i = 0; i < 4; i++) {
    if (cleaned.length >= 2 && cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1).trim();
    }
  }

  return normalizeWhitespace(cleaned);
}

export function trimDefinition(value: string, maxLength = 420): string {
  const cleaned = cleanTextCell(value);
  if (cleaned.length <= maxLength) return cleaned;

  const slice = cleaned.slice(0, maxLength);
  const boundary = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf(';'), slice.lastIndexOf(','));
  if (boundary > 80) return slice.slice(0, boundary).trim();
  return slice.trim();
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index++;
      row.push(cell);
      if (row.some(value => value.trim().length > 0)) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some(value => value.trim().length > 0)) rows.push(row);
  return rows;
}

export function normalizeDictionaryRows(label: string, text: string): DictionaryEntry[] {
  const rows = parseCsvRows(text);
  const lowerLabel = label.toLowerCase();
  const isOpted = lowerLabel.includes('opted-dictionary');
  const isEe = lowerLabel.endsWith('/ee.csv') || lowerLabel.endsWith('\\ee.csv') || lowerLabel === 'ee.csv' || lowerLabel.includes('dict/ee.csv');
  const entries: DictionaryEntry[] = [];

  for (const row of rows) {
    if (row.length < 2) continue;
    const head = cleanTextCell(row[0]).toLowerCase();
    if (head === 'word' || head === 'term') continue;

    if (isOpted) {
      const term = cleanTextCell(row[0]);
      const pos = cleanTextCell(row[2] || '');
      const definition = cleanTextCell(row.slice(3).join(' '));
      if (term && definition) entries.push({ term, definition, pos, sourceFormat: 'opted' });
      continue;
    }

    if (isEe || row.length === 2) {
      const term = cleanTextCell(row[0]);
      const definition = cleanTextCell(row.slice(1).join(' '));
      if (term && definition) entries.push({ term, definition, sourceFormat: isEe ? 'ee' : 'generic' });
      continue;
    }

    const term = cleanTextCell(row[0]);
    const definition = cleanTextCell(row.slice(1).join(' '));
    if (term && definition) entries.push({ term, definition, sourceFormat: 'generic' });
  }

  return entries;
}

export function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return value.split(',').map(v => v.trim()).filter(Boolean);
  return [];
}

export function uniqueList(...items: unknown[]): string[] {
  return Array.from(new Set(items.flatMap(normalizeList)));
}

export function posToLexiconRole(pos?: string): LexiconRole {
  const normalized = (pos || '').toLowerCase().replace(/[^a-z.]/g, '');
  if (normalized.includes('adv')) return 'IntentAccel';
  if (normalized === 'v' || normalized === 'v.' || normalized.startsWith('v.') || normalized.includes('verb')) return 'Intent';
  if (normalized === 'a' || normalized === 'a.' || normalized.startsWith('a.') || normalized.includes('adj') || normalized.includes('superl')) return 'EntityDescriber';
  return 'Entity';
}

export function dictionaryPosCategory(entry: Pick<DictionaryEntry, 'term' | 'pos'>): 'noun' | 'verb' | 'adjective' | 'adverb' | 'unknown' {
  const normalized = (entry.pos || '').toLowerCase().replace(/[^a-z.]/g, '');
  if (normalized.includes('adv')) return 'adverb';
  if (normalized === 'v' || normalized === 'v.' || normalized.startsWith('v.') || normalized.includes('verb')) return 'verb';
  if (normalized === 'a' || normalized === 'a.' || normalized.startsWith('a.') || normalized.includes('adj') || normalized.includes('superl')) return 'adjective';
  if (normalized === 'n' || normalized === 'n.' || normalized.startsWith('n.') || normalized.includes('noun')) return 'noun';

  const terms = nlp(entry.term).terms().json() as any[];
  const tags = terms.flatMap((sentence: any) => sentence.terms || []).flatMap((term: any) => term.tags || []);
  if (tags.includes('Verb')) return 'verb';
  if (tags.includes('Adverb')) return 'adverb';
  if (tags.includes('Adjective')) return 'adjective';
  if (tags.includes('Noun')) return 'noun';
  return 'unknown';
}

const NON_COMPARABLE_SUFFIXES = [
  'al',
  'ant',
  'ary',
  'ed',
  'ent',
  'ful',
  'ible',
  'ic',
  'ing',
  'ive',
  'less',
  'ous',
  'ory',
];

function isExplicitDictionaryPos(pos?: string): boolean {
  return Boolean((pos || '').trim());
}

function hasSimpleSuffixComparative(term: string, form: string, suffix: 'comparative' | 'superlative'): boolean {
  const lowerTerm = term.toLowerCase();
  const lowerForm = form.toLowerCase();
  if (suffix === 'comparative') {
    return lowerForm === `${lowerTerm}er`
      || (lowerTerm.endsWith('e') && lowerForm === `${lowerTerm}r`);
  }
  return lowerForm === `${lowerTerm}est`
    || (lowerTerm.endsWith('e') && lowerForm === `${lowerTerm}st`);
}

function isCleanLexicalForm(value: string, allowPhrase = false): boolean {
  const trimmed = cleanTextCell(value);
  if (!trimmed || trimmed.length > 80) return false;
  const pattern = allowPhrase ? /^[a-z][a-z' -]*$/i : /^[a-z][a-z'-]*$/i;
  return pattern.test(trimmed);
}

function shouldAcceptAdjectiveDegree(term: string, form: string, degree: 'comparative' | 'superlative'): QualityDecision {
  const cleaned = cleanTextCell(form);
  if (!isCleanLexicalForm(cleaned, true)) return { accepted: false, reason: 'non-lexical-form' };
  if (cleaned.toLowerCase() === term.toLowerCase()) return { accepted: false, reason: 'self-form' };
  if (cleaned.toLowerCase().startsWith('more ') || cleaned.toLowerCase().startsWith('most ')) return { accepted: true };

  const lowerTerm = term.toLowerCase();
  const syntheticSuffix = hasSimpleSuffixComparative(lowerTerm, cleaned, degree);
  const nonComparable = NON_COMPARABLE_SUFFIXES.some(suffix => lowerTerm.endsWith(suffix));
  if (syntheticSuffix && (nonComparable || lowerTerm.length > 7)) {
    return { accepted: false, reason: 'dubious-generated-degree' };
  }

  return { accepted: true };
}

function knownTermsLookup(knownTerms?: Set<string> | string[]): Set<string> | undefined {
  if (!knownTerms) return undefined;
  if (knownTerms instanceof Set) return knownTerms;
  return new Set(knownTerms.map(term => term.toLowerCase()));
}

function normalizeRelationTarget(candidate: string, knownTerms?: Set<string>): string {
  const cleaned = cleanTextCell(candidate)
    .replace(/^[\s"'`]+|[\s"'`.;:,!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!isCleanLexicalForm(cleaned, false)) return '';
  const normalized = cleaned.toLowerCase();
  if (knownTerms && !knownTerms.has(normalized)) return '';
  return normalized;
}

function buildSourceDerivedRelationFacts(entry: DictionaryEntry, category: ReturnType<typeof dictionaryPosCategory>, knownTerms?: Set<string>): MorphologyFact[] {
  const term = cleanTextCell(entry.term);
  const definition = cleanTextCell(entry.definition);
  const tags = ['dictionary', 'english', 'source-derived-relation', entry.sourceFormat, category].filter(Boolean);
  const facts: MorphologyFact[] = [];
  const relationSpecs: Array<{ intent: string; regex: RegExp; sentence: (target: string) => string; reliability: number }> = [
    {
      intent: 'is-alternate-form-of',
      regex: /(?:^|(?:[-;]\s*))alt\.?\s+of\s+([a-z][a-z'-]*)/i,
      sentence: target => `${term} is alternate form of ${target}.`,
      reliability: 0.7,
    },
    {
      intent: 'is-same-as',
      regex: /(?:^|(?:[-;]\s*))same\s+as\s+([a-z][a-z'-]*)/i,
      sentence: target => `${term} is same as ${target}.`,
      reliability: 0.7,
    },
    {
      intent: 'is-synonymous-with',
      regex: /(?:synonymous\s+with|synonym\s+of)\s+([a-z][a-z'-]*)/i,
      sentence: target => `${term} is synonymous with ${target}.`,
      reliability: 0.66,
    },
    {
      intent: 'is-antonym-of',
      regex: /(?:opposite\s+of|opposed\s+to)\s+([a-z][a-z'-]*)/i,
      sentence: target => `${term} is antonym of ${target}.`,
      reliability: 0.64,
    },
    {
      intent: 'is-inflected-form-of',
      regex: /^(?:imp\.?|imperf\.?|p\.?\s*p\.?|pl\.?|pres\.?\s*p\.?)(?:\s*&\s*(?:imp\.?|p\.?\s*p\.?))*\s+of\s+([a-z][a-z'-]*)/i,
      sentence: target => `${term} is inflected form of ${target}.`,
      reliability: 0.72,
    },
  ];

  for (const spec of relationSpecs) {
    const match = definition.match(spec.regex);
    const target = match?.[1] ? normalizeRelationTarget(match[1], knownTerms) : '';
    if (!target || target === term.toLowerCase()) continue;
    facts.push({
      subject: term,
      intent: spec.intent,
      target,
      sourceSentence: spec.sentence(target),
      domainTags: tags,
      sourceType: 'csv-dictionary-relation',
      sourceReliability: spec.reliability,
    });
    if (spec.intent === 'is-inflected-form-of') {
      facts.push({
        subject: term,
        intent: 'has-lemma',
        target,
        sourceSentence: `${term} has lemma ${target}.`,
        domainTags: [...tags, 'lemma'],
        sourceType: 'csv-dictionary-morphology',
        sourceReliability: 0.72,
      });
    }
  }

  return facts;
}

export function buildDictionaryMorphologyFacts(entry: DictionaryEntry, options: DictionaryMorphologyOptions = {}): MorphologyFact[] {
  const term = cleanTextCell(entry.term);
  if (!term || term.includes(' ')) return [];

  const category = dictionaryPosCategory(entry);
  const facts: MorphologyFact[] = [];
  const knownTerms = knownTermsLookup(options.knownTerms);
  const explicitPos = isExplicitDictionaryPos(entry.pos);
  const tags = ['dictionary', 'english', 'morphology', entry.sourceFormat, category, explicitPos ? 'explicit-pos' : 'inferred-pos'].filter(Boolean);
  const relatedForms = new Set<string>();

  const pushFact = (
    intent: string,
    target: string,
    extraTags: string[] = [],
    sourceType = 'csv-dictionary-morphology',
    sourceReliability = 0.68,
    sourceSentence?: string
  ) => {
    const cleanedTarget = cleanTextCell(target);
    if (!cleanedTarget) return;
    facts.push({
      subject: term,
      intent,
      target: cleanedTarget,
      sourceSentence: sourceSentence || `${term} ${intent.replace(/-/g, ' ')} ${cleanedTarget}.`,
      domainTags: [...tags, ...extraTags],
      sourceType,
      sourceReliability,
    });
    if (cleanedTarget.toLowerCase() !== term.toLowerCase()) relatedForms.add(cleanedTarget);
  };

  if (category !== 'unknown') {
    pushFact(
      'has-part-of-speech',
      category,
      ['part-of-speech'],
      'csv-dictionary-morphology',
      explicitPos ? 0.78 : 0.62,
      `${term} has part of speech ${category}.`
    );
  }

  if (category === 'noun') {
    const singular = cleanTextCell(nlp(term).nouns().toSingular().text());
    const plural = cleanTextCell(nlp(term).nouns().toPlural().text());
    if (singular && singular.toLowerCase() !== term.toLowerCase()) {
      pushFact('has-singular-form', singular, ['inflection', 'generated-morphology']);
      pushFact('has-lemma', singular, ['lemma', 'generated-morphology']);
    }
    if (plural && plural.toLowerCase() !== term.toLowerCase()) {
      pushFact('has-plural-form', plural, ['inflection', 'generated-morphology']);
    }
  }

  if (category === 'verb') {
    const conjugation = (nlp(term).verbs().conjugate() as Array<Record<string, string>>)[0];
    if (conjugation) {
      const mapping: Array<[string, string | undefined]> = [
        ['has-infinitive-form', conjugation.Infinitive],
        ['has-present-tense-form', conjugation.PresentTense],
        ['has-past-tense-form', conjugation.PastTense],
        ['has-gerund-form', conjugation.Gerund],
        ['has-participle-form', conjugation.Participle],
        ['has-future-tense-form', conjugation.FutureTense],
      ];
      for (const [intent, form] of mapping) {
        const cleanedForm = cleanTextCell(form || '');
        if (!cleanedForm) continue;
        pushFact(intent, cleanedForm, ['inflection', 'generated-morphology']);
      }
      const lemma = cleanTextCell(conjugation.Infinitive || term);
      if (lemma) pushFact('has-lemma', lemma, ['lemma', 'generated-morphology']);
    }
  }

  if (category === 'adjective') {
    pushFact('describes', 'entity quality', ['part-of-speech'], 'csv-dictionary-morphology', 0.68, `${term} describes an entity quality in English grammar.`);

    const conjugation = (nlp(term).adjectives().conjugate() as Array<Record<string, string>>)[0];
    if (conjugation) {
      const adjectiveForms: Array<[string, string | undefined, 'comparative' | 'superlative' | 'derived']> = [
        ['has-comparative-form', conjugation.Comparative, 'comparative'],
        ['has-superlative-form', conjugation.Superlative, 'superlative'],
        ['has-adverb-form', conjugation.Adverb, 'derived'],
        ['has-noun-form', conjugation.Noun, 'derived'],
      ];
      for (const [intent, form, kind] of adjectiveForms) {
        const cleanedForm = cleanTextCell(form || '');
        if (!cleanedForm || cleanedForm.toLowerCase() === term.toLowerCase()) continue;

        if (kind === 'comparative' || kind === 'superlative') {
          const decision = shouldAcceptAdjectiveDegree(term, cleanedForm, kind);
          if (!decision.accepted) {
            options.onReject?.({ term, intent, candidate: cleanedForm, reason: decision.reason || 'rejected-generated-form' });
            continue;
          }
        } else if (!isCleanLexicalForm(cleanedForm, false)) {
          options.onReject?.({ term, intent, candidate: cleanedForm, reason: 'non-lexical-form' });
          continue;
        }

        pushFact(intent, cleanedForm, ['derivation', 'generated-morphology']);
      }
    }
  }

  if (category === 'adverb') {
    pushFact('modifies', 'verb intent', ['part-of-speech'], 'csv-dictionary-morphology', 0.68, `${term} modifies verb intent in English grammar.`);

    const conjugation = (nlp(term).adverbs().conjugate() as Array<Record<string, string>>)[0];
    const adjective = cleanTextCell(conjugation?.Adjective || '');
    if (adjective && adjective.toLowerCase() !== term.toLowerCase() && isCleanLexicalForm(adjective, false)) {
      pushFact('has-adjective-form', adjective, ['derivation', 'generated-morphology']);
      pushFact('has-lemma', adjective, ['lemma', 'generated-morphology']);
    }
  }

  if (relatedForms.size >= 3 && relatedForms.size <= 8) {
    const family = Array.from(relatedForms).join(', ');
    facts.push({
      subject: term,
      intent: 'has-word-family',
      target: family,
      sourceSentence: `${term} has word family ${family}.`,
      domainTags: [...tags, 'word-family', 'generated-morphology'],
      sourceType: 'csv-dictionary-morphology',
      sourceReliability: 0.64,
    });
  }

  return [...facts, ...buildSourceDerivedRelationFacts(entry, category, knownTerms)];
}

export function shouldSkipAsset(label: string): boolean {
  const normalized = label.split(path.sep).join('/');
  const basename = path.basename(normalized).toLowerCase();
  const segments = normalized.split('/').map(segment => segment.toLowerCase());

  return segments.includes('_audit')
    || segments.includes('training')
    || SKIPPED_BASENAMES.has(basename)
    || basename.endsWith('.tmp')
    || basename.endsWith('.audit.txt')
    || basename === 'brain_kb.bin';
}

export function sourcePriorityForExtension(ext: string): number {
  if (ext === '.jsonl' || ext === '.ndjson' || ext === '.json') return 10;
  if (ext === '.csv') return 20;
  if (ext === '.txt' || ext === '.md') return 30;
  if (ext === '.html' || ext === '.htm') return 40;
  if (ext === '.pdf') return 50;
  return 99;
}

export function assessUnstructuredQuality(parsed: any, sentence: string, sourceType: string): QualityDecision {
  if (sourceType !== 'pdf' && sourceType !== 'html') return { accepted: true };

  const subject = normalizeSentenceKey(String(parsed?.Subject || '')).replace(/[^a-z0-9 -]/g, '').trim();
  const target = normalizeSentenceKey(String(parsed?.Target || ''));
  const text = normalizeSentenceKey(sentence);

  if (WEAK_UNSTRUCTURED_SUBJECTS.has(subject)) return { accepted: false, reason: 'weak-subject' };
  if (subject.length < 3 || target.length < 10) return { accepted: false, reason: 'short-parse' };
  if (text.includes('conditions of use') || text.includes('all rights reserved')) {
    return { accepted: false, reason: 'boilerplate' };
  }
  if (/^\d+\s/.test(subject)) return { accepted: false, reason: 'numbered-fragment' };

  return { accepted: true };
}

export function getPersonaFromPath(label: string): string | undefined {
  const match = label.split(path.sep).join('/').match(/(?:^|\/)personas\/([^/]+)/);
  return match?.[1];
}
