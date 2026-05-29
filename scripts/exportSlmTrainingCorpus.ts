import fs from 'fs';
import path from 'path';
import { once } from 'events';
import {
  buildDictionaryMorphologyFacts,
  getPersonaFromPath,
  hashText,
  normalizeDictionaryRows,
  normalizeWhitespace,
  shouldSkipAsset,
  sourcePriorityForExtension,
  uniqueList,
} from './corpusBuildUtils';

interface FactLike {
  subject?: string;
  s?: string;
  entity?: string;
  term?: string;
  name?: string;
  intent?: string;
  i?: string;
  predicate?: string;
  relation?: string;
  target?: string;
  t?: string;
  object?: string;
  definition?: string;
  description?: string;
  answer?: string;
  canonicalAnswer?: string;
  sourceSentence?: string;
  sourceFile?: string;
  sourceType?: string;
  aliases?: string[] | string;
  personaTags?: string[] | string;
  domainTags?: string[] | string;
  tags?: string[] | string;
  personaId?: string;
  personaName?: string;
  domainId?: string;
  domainName?: string;
  provenanceHash?: string;
  orthogonal?: any;
}

interface TrainingRecord {
  id: string;
  kind: 'pretrain' | 'instruction' | 'dialogue' | 'eval';
  text?: string;
  messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  personaId?: string;
  personaName?: string;
  domainTags: string[];
  sourceFile: string;
  sourceType: string;
  qualityTier: 'structured-fact' | 'dictionary' | 'curated-text' | 'lexical';
  licenseHint: string;
  provenanceHash: string;
}

const outputRoot = path.join(process.cwd(), 'public', 'dataAssets', 'brain', 'training');
const dataAssetsRoot = path.join(process.cwd(), 'public', 'dataAssets');

function relativeAssetLabel(filePath: string): string {
  return path.relative(dataAssetsRoot, filePath).split(path.sep).join('/');
}

function createWriter(fileName: string) {
  fs.mkdirSync(outputRoot, { recursive: true });
  const stream = fs.createWriteStream(path.join(outputRoot, fileName), { encoding: 'utf8' });
  return {
    async write(record: TrainingRecord) {
      if (!stream.write(`${JSON.stringify(record)}\n`)) await once(stream, 'drain');
    },
    async end() {
      stream.end();
      await once(stream, 'finish');
    },
  };
}

function splitIsHoldout(provenanceHash: string): boolean {
  return Number.parseInt(provenanceHash.slice(0, 2), 16) % 20 === 0;
}

function normalizeFact(entry: FactLike, fallbackSourceFile: string): Required<Pick<FactLike, 'subject' | 'intent' | 'target'>> & {
  sourceSentence: string;
  canonicalAnswer: string;
  personaId?: string;
  personaName?: string;
  domainTags: string[];
  sourceFile: string;
  sourceType: string;
  provenanceHash: string;
} | null {
  const orthogonal = entry.orthogonal || {};
  const subject = normalizeWhitespace(String(entry.subject || entry.s || entry.entity || entry.term || entry.name || orthogonal.subjectEntity || ''));
  const intent = normalizeWhitespace(String(entry.intent || entry.i || entry.predicate || entry.relation || orthogonal.activeVerb || 'defines'));
  const target = normalizeWhitespace(String(entry.target || entry.t || entry.object || entry.definition || entry.description || entry.canonicalAnswer || entry.answer || orthogonal.targetEntity || ''));
  if (!subject || !intent || !target) return null;

  const sourceSentence = normalizeWhitespace(entry.sourceSentence || entry.canonicalAnswer || entry.answer || entry.description || `${subject} ${intent} ${target}.`);
  const sourceFile = entry.sourceFile || fallbackSourceFile;
  const provenanceHash = entry.provenanceHash || hashText(`${sourceFile}|${sourceSentence}`);
  return {
    subject,
    intent,
    target,
    sourceSentence,
    canonicalAnswer: normalizeWhitespace(entry.canonicalAnswer || entry.answer || sourceSentence),
    personaId: entry.personaId || getPersonaFromPath(sourceFile),
    personaName: entry.personaName || entry.personaId || getPersonaFromPath(sourceFile),
    domainTags: uniqueList(entry.domainTags, entry.tags, entry.domainId, entry.domainName),
    sourceFile,
    sourceType: entry.sourceType || 'structured-fact',
    provenanceHash,
  };
}

function recordsForFact(fact: NonNullable<ReturnType<typeof normalizeFact>>): TrainingRecord[] {
  const persona = fact.personaName || fact.personaId || 'EA-NITI specialist';
  const domain = fact.domainTags[0] || 'enterprise knowledge';
  const base = {
    personaId: fact.personaId,
    personaName: fact.personaName,
    domainTags: fact.domainTags,
    sourceFile: fact.sourceFile,
    sourceType: fact.sourceType,
    qualityTier: 'structured-fact' as const,
    licenseHint: 'local-dataAssets',
    provenanceHash: fact.provenanceHash,
  };

  return [
    {
      ...base,
      id: `${fact.provenanceHash}:pretrain`,
      kind: 'pretrain',
      text: `${fact.sourceSentence} In ${domain}, ${fact.subject} ${fact.intent} ${fact.target}. A ${persona} should use this fact to ground decisions, explain tradeoffs, and preserve traceable reasoning.`,
    },
    {
      ...base,
      id: `${fact.provenanceHash}:instruction`,
      kind: 'instruction',
      messages: [
        { role: 'system', content: `You are ${persona}. Answer with concise, evidence-aware enterprise reasoning.` },
        { role: 'user', content: `What should I understand about ${fact.subject} in ${domain}?` },
        { role: 'assistant', content: `${fact.subject} ${fact.intent} ${fact.target}. ${fact.canonicalAnswer}` },
      ],
    },
    {
      ...base,
      id: `${fact.provenanceHash}:dialogue`,
      kind: 'dialogue',
      messages: [
        { role: 'system', content: `You are ${persona}, operating as an offline autonomous EA-NITI advisor.` },
        { role: 'user', content: `Review this concern: ${fact.target}.` },
        { role: 'assistant', content: `I would check whether ${fact.subject} ${fact.intent} ${fact.target}. The decision should be tied back to ${domain} and supported by traceable evidence.` },
      ],
    },
  ];
}

function recordsForDictionary(entry: { term: string; definition: string; sourceFormat: string }, sourceFile: string): TrainingRecord[] {
  const provenanceHash = hashText(`${sourceFile}|${entry.term}|${entry.definition}`);
  return [{
    id: `${provenanceHash}:dictionary-pretrain`,
    kind: 'pretrain',
    text: `The English term "${entry.term}" means ${entry.definition}. In enterprise writing, use "${entry.term}" precisely and avoid changing its meaning across personas.`,
    domainTags: ['dictionary', 'english', entry.sourceFormat],
    sourceFile,
    sourceType: 'csv-dictionary',
    qualityTier: 'dictionary',
    licenseHint: 'local-dataAssets',
    provenanceHash,
  }];
}

function recordsForLexicalFact(fact: ReturnType<typeof buildDictionaryMorphologyFacts>[number], sourceFile: string): TrainingRecord[] {
  const provenanceHash = hashText(`${sourceFile}|${fact.subject}|${fact.intent}|${fact.target}|${fact.sourceSentence}`);
  return [{
    id: `${provenanceHash}:lexical-pretrain`,
    kind: 'pretrain',
    text: `${fact.sourceSentence} This lexical fact helps parse English morphology, word family relations, and source-grounded dictionary relations.`,
    domainTags: fact.domainTags,
    sourceFile,
    sourceType: fact.sourceType || 'csv-dictionary-morphology',
    qualityTier: 'lexical',
    licenseHint: 'local-dataAssets',
    provenanceHash,
  }];
}

function recordsForText(sentence: string, sourceFile: string): TrainingRecord[] {
  const cleaned = normalizeWhitespace(sentence);
  if (cleaned.length < 30) return [];
  const provenanceHash = hashText(`${sourceFile}|${cleaned}`);
  const personaId = getPersonaFromPath(sourceFile);
  return [{
    id: `${provenanceHash}:text-pretrain`,
    kind: 'pretrain',
    text: cleaned,
    personaId,
    personaName: personaId,
    domainTags: personaId ? [personaId] : ['enterprise-knowledge'],
    sourceFile,
    sourceType: 'curated-text',
    qualityTier: 'curated-text',
    licenseHint: 'local-dataAssets',
    provenanceHash,
  }];
}

function textSentences(text: string): string[] {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  if (lines.length > 10) return lines;
  return normalizeWhitespace(text).split(/(?<=[.!?])\s+/).filter(sentence => sentence.length > 30 && sentence.length < 700);
}

async function emitRecords(records: TrainingRecord[], writers: {
  pretrain: ReturnType<typeof createWriter>;
  instruction: ReturnType<typeof createWriter>;
  dialogue: ReturnType<typeof createWriter>;
  eval: ReturnType<typeof createWriter>;
}, counters: Record<string, number>) {
  for (const record of records) {
    if (splitIsHoldout(record.provenanceHash)) {
      await writers.eval.write({ ...record, id: record.id.replace(/:(pretrain|instruction|dialogue)/, ':eval'), kind: 'eval' });
      counters.eval++;
      continue;
    }
    if (record.kind === 'pretrain') {
      await writers.pretrain.write(record);
      counters.pretrain++;
    } else if (record.kind === 'instruction') {
      await writers.instruction.write(record);
      counters.instruction++;
    } else if (record.kind === 'dialogue' && record.personaId) {
      await writers.dialogue.write(record);
      counters.dialogue++;
    }
  }
}

async function processFile(filePath: string, writers: {
  pretrain: ReturnType<typeof createWriter>;
  instruction: ReturnType<typeof createWriter>;
  dialogue: ReturnType<typeof createWriter>;
  eval: ReturnType<typeof createWriter>;
}, counters: Record<string, number>) {
  const label = relativeAssetLabel(filePath);
  if (shouldSkipAsset(label)) return;
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.json') {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const entries = Array.isArray(parsed) ? parsed : parsed?.facts || parsed?.items || parsed?.records || [];
    for (const entry of entries) {
      const fact = typeof entry === 'string' ? null : normalizeFact(entry, label);
      if (fact) await emitRecords(recordsForFact(fact), writers, counters);
      else if (typeof entry === 'string') await emitRecords(recordsForText(entry, label), writers, counters);
    }
  } else if (ext === '.jsonl' || ext === '.ndjson') {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        const fact = normalizeFact(JSON.parse(line), label);
        if (fact) await emitRecords(recordsForFact(fact), writers, counters);
      } catch {
        await emitRecords(recordsForText(line, label), writers, counters);
      }
    }
  } else if (ext === '.csv') {
    const entries = normalizeDictionaryRows(label, fs.readFileSync(filePath, 'utf8'));
    const knownTerms = new Set(
      entries
        .map(entry => entry.term.toLowerCase().trim())
        .filter(term => /^[a-z][a-z'-]*$/i.test(term))
    );
    for (const entry of entries) {
      await emitRecords(recordsForDictionary(entry, label), writers, counters);
      for (const fact of buildDictionaryMorphologyFacts(entry, { knownTerms })) {
        await emitRecords(recordsForLexicalFact(fact, label), writers, counters);
      }
    }
  } else if (ext === '.txt' || ext === '.md' || ext === '.html' || ext === '.htm') {
    const text = fs.readFileSync(filePath, 'utf8')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
    for (const sentence of textSentences(text)) {
      await emitRecords(recordsForText(sentence, label), writers, counters);
    }
  }
}

async function processDirectory(dir: string, writers: {
  pretrain: ReturnType<typeof createWriter>;
  instruction: ReturnType<typeof createWriter>;
  dialogue: ReturnType<typeof createWriter>;
  eval: ReturnType<typeof createWriter>;
}, counters: Record<string, number>) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const directories = entries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  const files = entries
    .filter(entry => entry.isFile())
    .sort((a, b) => {
      const byPriority = sourcePriorityForExtension(path.extname(a.name).toLowerCase()) - sourcePriorityForExtension(path.extname(b.name).toLowerCase());
      return byPriority || a.name.localeCompare(b.name);
    });

  for (const entry of directories) {
    if (entry.name.toLowerCase() === '_audit' || entry.name.toLowerCase() === 'training') continue;
    await processDirectory(path.join(dir, entry.name), writers, counters);
  }
  for (const entry of files) {
    await processFile(path.join(dir, entry.name), writers, counters);
  }
}

async function main() {
  fs.mkdirSync(outputRoot, { recursive: true });
  const writers = {
    pretrain: createWriter('slm_pretrain.jsonl'),
    instruction: createWriter('slm_instruction.jsonl'),
    dialogue: createWriter('slm_persona_dialogues.jsonl'),
    eval: createWriter('slm_eval_holdout.jsonl'),
  };
  const counters = { pretrain: 0, instruction: 0, dialogue: 0, eval: 0 };

  await processDirectory(path.join(dataAssetsRoot, 'dict'), writers, counters);
  await processDirectory(path.join(dataAssetsRoot, 'brain'), writers, counters);
  await processDirectory(path.join(dataAssetsRoot, 'personas'), writers, counters);
  await processDirectory(path.join(dataAssetsRoot, 'ea'), writers, counters);

  await Promise.all(Object.values(writers).map(writer => writer.end()));
  fs.writeFileSync(path.join(outputRoot, 'slm_training_manifest.json'), JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    outputRoot: 'public/dataAssets/brain/training',
    split: 'sha256-prefix-mod-20 holdout',
    counters,
  }, null, 2));

  console.log(`SLM training corpus exported: ${JSON.stringify(counters)}`);
}

main().catch(err => {
  console.error('SLM training export failed:', err);
  process.exit(1);
});
