import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { pipeline } from 'stream/promises';
import nlp from 'compromise';
import {
  buildDictionaryMorphologyFacts,
  normalizeDictionaryRows,
  normalizeList,
  normalizeWhitespace,
  posToLexiconRole,
  shouldSkipAsset,
  sourcePriorityForExtension,
} from './corpusBuildUtils';

type Role = 'Entity' | 'Intent' | 'EntityDescriber' | 'IntentAccel';

const CHUNK_SIZE = 80;
const lexiconMap = new Map<string, Record<string, number>>();

function addRole(value: string, role: Role, weight = 1): void {
  const normalized = value.toLowerCase().trim();
  if (!normalized) return;

  const candidates = normalized.includes(' ')
    ? normalized.split(/[^a-z0-9-]+/g)
    : [normalized];

  for (const candidate of candidates) {
    const word = candidate.trim();
    if (!word || !/^[a-z0-9-]+$/.test(word)) continue;
    if (/^\d+$/.test(word)) continue;
    if (word.length === 1 && !['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].includes(word)) continue;
    if (!lexiconMap.has(word)) lexiconMap.set(word, {});
    const counts = lexiconMap.get(word)!;
    counts[role] = (counts[role] || 0) + weight;
  }
}

function addLexicalTarget(value: string, role: Role, weight: number): void {
  for (const candidate of value.split(/[,\s]+/g).map(part => part.trim()).filter(Boolean)) {
    addRole(candidate, role, weight);
  }
}

function roleForLexicalFact(intent: string): Role | undefined {
  if (intent === 'has-adverb-form') return 'IntentAccel';
  if (intent === 'has-adjective-form' || intent === 'has-comparative-form' || intent === 'has-superlative-form') return 'EntityDescriber';
  if (intent.includes('verb') || intent.includes('tense') || intent === 'has-gerund-form' || intent === 'has-participle-form' || intent === 'has-infinitive-form') return 'Intent';
  if (intent === 'has-noun-form' || intent === 'has-plural-form' || intent === 'has-singular-form' || intent === 'has-lemma' || intent.startsWith('is-')) return 'Entity';
  return undefined;
}

function relativeAssetLabel(filePath: string): string {
  const root = path.join(process.cwd(), 'public', 'dataAssets');
  return path.relative(root, filePath).split(path.sep).join('/');
}

function processText(text: string): void {
  const lines = text.split(/\n/).filter(l => l.trim().length > 0);
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    const chunk = lines.slice(i, i + CHUNK_SIZE).join(' ');
    const doc = nlp(chunk);
    for (const sentence of doc.json() as any[]) {
      for (const term of sentence.terms) {
        const word = term.normal;
        if (!word || !/^[a-z0-9-]+$/.test(word) || /^\d+$/.test(word)) continue;
        if (word.length === 1 && !['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].includes(word)) continue;
        const tags = term.tags as string[];
        if (tags.includes('Noun')) addRole(word, 'Entity');
        else if (tags.includes('Verb')) addRole(word, 'Intent');
        else if (tags.includes('Adjective')) addRole(word, 'EntityDescriber');
        else if (tags.includes('Adverb')) addRole(word, 'IntentAccel');
      }
    }
  }
}

function processStructuredFact(entry: any): void {
  if (!entry || typeof entry !== 'object') return;
  const orthogonal = entry.orthogonal || {};
  const subject = entry.subject || entry.s || entry.entity || entry.term || entry.name || orthogonal.subjectEntity;
  const intent = entry.intent || entry.i || entry.predicate || entry.relation || orthogonal.activeVerb;
  const target = entry.target || entry.t || entry.object || entry.definition || entry.description || entry.canonicalAnswer || entry.answer || orthogonal.targetEntity;

  if (subject) addRole(String(subject), 'Entity', 900);
  if (intent) addRole(String(intent), 'Intent', 260);
  for (const alias of [...normalizeList(entry.aliases), ...normalizeList(entry.alias)]) addRole(alias, 'Entity', 500);
  for (const tag of [
    ...normalizeList(entry.personaTags),
    ...normalizeList(entry.personas),
    ...normalizeList(entry.personaId),
    ...normalizeList(entry.personaName),
    ...normalizeList(entry.domainTags),
    ...normalizeList(entry.tags),
    ...normalizeList(entry.domainId),
    ...normalizeList(entry.domainName),
  ]) addRole(tag, 'Entity', 220);
  for (const adjective of [...normalizeList(orthogonal.subjectAdjectives), ...normalizeList(orthogonal.targetAdjectives)]) {
    addRole(adjective, 'EntityDescriber', 120);
  }
  for (const adverb of normalizeList(orthogonal.intentAdverbs)) addRole(adverb, 'IntentAccel', 120);

  processText([subject, intent, target, entry.sourceSentence, entry.canonicalAnswer, entry.answer, orthogonal.prepositionalContext].filter(Boolean).join('\n'));
}

async function processFile(filePath: string): Promise<void> {
  const ext = path.extname(filePath).toLowerCase();
  const label = relativeAssetLabel(filePath);
  if (shouldSkipAsset(label)) return;

  try {
    if (ext === '.json') {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const entries = Array.isArray(parsed) ? parsed : parsed?.facts || parsed?.items || parsed?.records || [];
      if (Array.isArray(entries)) entries.forEach(entry => typeof entry === 'string' ? processText(entry) : processStructuredFact(entry));
      console.log(`  [JSON]  ${label}`);
    } else if (ext === '.jsonl' || ext === '.ndjson') {
      const lines = fs.readFileSync(filePath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        try { processStructuredFact(JSON.parse(line)); } catch { processText(line); }
      }
      console.log(`  [JSONL] ${label}: ${lines.length} entries`);
    } else if (ext === '.csv') {
      const entries = normalizeDictionaryRows(label, fs.readFileSync(filePath, 'utf8'));
      const knownTerms = new Set(
        entries
          .map(entry => entry.term.toLowerCase().trim())
          .filter(term => /^[a-z][a-z'-]*$/i.test(term))
      );
      for (const entry of entries) {
        addRole(entry.term, posToLexiconRole(entry.pos), 120);
        addRole(entry.term, 'Entity', 60);
        processText(`${entry.term} means ${entry.definition}`);
        for (const fact of buildDictionaryMorphologyFacts(entry, { knownTerms })) {
          const role = roleForLexicalFact(fact.intent);
          if (role) addLexicalTarget(fact.target, role, fact.sourceType === 'csv-dictionary-relation' ? 70 : 90);
        }
      }
      console.log(`  [CSV]   ${label}: ${entries.length} entries`);
    } else if (['.txt', '.md', '.html', '.htm'].includes(ext)) {
      const text = fs.readFileSync(filePath, 'utf8')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ');
      processText(normalizeWhitespace(text));
      console.log(`  [TEXT]  ${label}`);
    }
  } catch (err) {
    console.warn(`  [WARN]  ${label}: ${(err as Error).message}`);
  }
}

async function processDirectory(dir: string): Promise<void> {
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
    await processDirectory(path.join(dir, entry.name));
  }
  for (const entry of files) {
    await processFile(path.join(dir, entry.name));
  }
}

async function main() {
  process.env.EA_QUIET_LOGS = '1';
  const basePath = process.cwd();
  const dataAssetsRoot = path.join(basePath, 'public', 'dataAssets');
  const outPath = path.join(basePath, 'public', 'lexicon.json');
  const outRolesPath = path.join(basePath, 'public', 'lexicon_roles.json');

  const gzipFile = async (sourcePath: string, targetPath: string) => {
    await pipeline(
      fs.createReadStream(sourcePath),
      zlib.createGzip({ level: 9 }),
      fs.createWriteStream(targetPath)
    );
  };

  console.log('--- Lexicon Compiler Starting (DataAssets Moat Ingestion v6) ---');
  await processDirectory(path.join(dataAssetsRoot, 'dict'));
  await processDirectory(path.join(dataAssetsRoot, 'brain'));
  await processDirectory(path.join(dataAssetsRoot, 'personas'));

  const finalLexicon: Record<string, string> = {};
  const finalRoleEvidence: Record<string, { dominantRole: string; roles: Record<string, number> }> = {};
  for (const [word, counts] of lexiconMap.entries()) {
    let dominantRole = '';
    let maxCount = 0;
    for (const [role, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantRole = role;
      }
    }
    finalLexicon[word] = dominantRole;
    finalRoleEvidence[word] = {
      dominantRole,
      roles: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
    };
  }

  fs.writeFileSync(outPath, JSON.stringify(finalLexicon, null, 2));
  fs.writeFileSync(outRolesPath, JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    roles: finalRoleEvidence,
  }, null, 2));
  await gzipFile(outPath, `${outPath}.gz`);
  await gzipFile(outRolesPath, `${outRolesPath}.gz`);
  console.log(`Lexicon compiled successfully: ${Object.keys(finalLexicon).length} entries.`);
}

main().catch(err => {
  console.error('Lexicon compiler failed:', err);
  process.exit(1);
});
