import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';

const basePath = process.cwd();
const publicPath = path.join(basePath, 'public');
const trainingRoot = path.join(publicPath, 'dataAssets', 'brain', 'training');

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readJsonMaybeGzip<T>(rawPath: string, gzipPath = `${rawPath}.gz`): T {
  if (fs.existsSync(gzipPath)) {
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(gzipPath)).toString('utf8')) as T;
  }
  return readJson<T>(rawPath);
}

function inflatedJsonBytes(rawPath: string, gzipPath = `${rawPath}.gz`): number {
  if (fs.existsSync(rawPath)) return fs.statSync(rawPath).size;
  return zlib.gunzipSync(fs.readFileSync(gzipPath)).byteLength;
}

function assertCondition(condition: unknown, message: string, failures: string[]) {
  if (!condition) failures.push(message);
}

async function readJsonlHashes(filePath: string): Promise<Set<string>> {
  const hashes = new Set<string>();
  if (!fs.existsSync(filePath)) return hashes;
  const reader = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  for await (const rawLine of reader) {
    const line = rawLine.trim();
    if (!line) continue;
    const record = JSON.parse(line);
    if (record.provenanceHash) hashes.add(record.provenanceHash);
  }
  return hashes;
}

async function main() {
  const failures: string[] = [];
  const warnings: string[] = [];
  const metaPath = path.join(publicPath, 'baseline_meta.json');
  const metaGzipPath = `${metaPath}.gz`;
  const corpusPath = path.join(publicPath, 'baseline_corpus.bin.gz');
  const manifestPath = path.join(publicPath, 'baseline_corpus_manifest.json');
  const lexiconPath = path.join(publicPath, 'lexicon.json');
  const lexiconGzipPath = `${lexiconPath}.gz`;

  assertCondition(fs.existsSync(metaPath) || fs.existsSync(metaGzipPath), 'baseline_meta.json(.gz) is missing', failures);
  assertCondition(fs.existsSync(corpusPath), 'baseline_corpus.bin.gz is missing', failures);
  assertCondition(fs.existsSync(manifestPath), 'baseline_corpus_manifest.json is missing', failures);
  assertCondition(fs.existsSync(lexiconPath) || fs.existsSync(lexiconGzipPath), 'lexicon.json(.gz) is missing', failures);
  if (failures.length) throw new Error(failures.join('\n'));

  const manifest = readJson<any>(manifestPath);
  const meta = readJsonMaybeGzip<any[]>(metaPath, metaGzipPath);
  const metaBytes = inflatedJsonBytes(metaPath, metaGzipPath);
  const corpusBytes = fs.statSync(corpusPath).size;
  const lexicon = readJsonMaybeGzip<Record<string, string>>(lexiconPath, lexiconGzipPath);
  const decompressed = zlib.gunzipSync(fs.readFileSync(corpusPath));
  const vectorRecords = decompressed.byteLength / 4 / 64;

  assertCondition(Array.isArray(meta), 'baseline_meta.json must be an array', failures);
  assertCondition(meta.length === manifest.recordCount, `metadata count ${meta.length} does not match manifest ${manifest.recordCount}`, failures);
  assertCondition(vectorRecords === manifest.recordCount, `vector count ${vectorRecords} does not match manifest ${manifest.recordCount}`, failures);
  assertCondition(manifest.recordCount < manifest.maxRecords, `corpus hit maxRecords cap ${manifest.maxRecords}; build may be truncated`, failures);
  assertCondition(metaBytes > 281_000_000, `baseline_meta.json is below 281 MB target (${metaBytes} bytes)`, failures);
  assertCondition(metaBytes < 500_000_000, `baseline_meta.json exceeds browser-safe target (${metaBytes} bytes)`, failures);

  const badDict = meta.find(record => record.isDict && (String(record.t || '').includes('"""') || /^\d+,/.test(String(record.t || ''))));
  assertCondition(!badDict, `dictionary record still contains CSV residue: ${JSON.stringify(badDict)?.slice(0, 300)}`, failures);

  const expectedRoles: Record<string, string> = {
    architecture: 'Entity',
    governance: 'Entity',
    validates: 'Intent',
    systematically: 'IntentAccel',
    resilient: 'EntityDescriber',
    gdpr: 'Entity',
    rag: 'Entity',
  };
  for (const [term, role] of Object.entries(expectedRoles)) {
    assertCondition(lexicon[term] === role, `lexicon role mismatch for ${term}: expected ${role}, got ${lexicon[term]}`, failures);
  }

  const hasFact = (subject: string, intent: string, target: string): boolean => meta.some(record =>
    String(record.s || '').toLowerCase() === subject.toLowerCase()
    && String(record.i || '').toLowerCase() === intent.toLowerCase()
    && String(record.t || '').toLowerCase() === target.toLowerCase()
  );
  const expectedLexicalFacts: Array<[string, string, string]> = [
    ['song', 'has-plural-form', 'songs'],
    ['sing', 'has-past-tense-form', 'sang'],
    ['sing', 'has-participle-form', 'sung'],
    ['good', 'has-comparative-form', 'better'],
    ['good', 'has-superlative-form', 'best'],
    ['quick', 'has-adverb-form', 'quickly'],
    ['happy', 'has-noun-form', 'happiness'],
    ['analysis', 'has-plural-form', 'analyses'],
  ];
  for (const [subject, intent, target] of expectedLexicalFacts) {
    assertCondition(hasFact(subject, intent, target), `missing lexical fact: ${subject} ${intent} ${target}`, failures);
  }

  const badGeneratedForms = new Set(['architecturaler', 'architecturalest', 'resilienter', 'resilientest']);
  const badGenerated = meta.find(record =>
    record.sourceType === 'csv-dictionary-morphology'
    && badGeneratedForms.has(String(record.t || '').toLowerCase())
  );
  assertCondition(!badGenerated, `bad generated morphology leaked into runtime corpus: ${JSON.stringify(badGenerated)?.slice(0, 300)}`, failures);

  const lexicalCounters = manifest.quality?.lexicalCounters || {};
  assertCondition((lexicalCounters.generatedMorphologyFacts || 0) > 100000, `generated morphology facts unexpectedly low: ${lexicalCounters.generatedMorphologyFacts || 0}`, failures);
  assertCondition((lexicalCounters.sourceDerivedRelationFacts || 0) > 1000, `source-derived relation facts unexpectedly low: ${lexicalCounters.sourceDerivedRelationFacts || 0}`, failures);
  assertCondition((lexicalCounters.rejectedGeneratedForms || 0) > 0, 'no generated morphology rejections were recorded', failures);

  const personas = ['enterprise-architect', 'security-architect', 'legal-compliance', 'risk-audit', 'data-ai-architect', 'platform-cloud-engineer', 'business-product-analyst', 'people-hr-operations'];
  const personaCounts: Record<string, number> = {};
  for (const record of meta) {
    if (record.personaId) personaCounts[record.personaId] = (personaCounts[record.personaId] || 0) + 1;
  }
  for (const persona of personas) {
    assertCondition((personaCounts[persona] || 0) > 1000, `persona ${persona} has insufficient runtime facts`, failures);
  }

  if (fs.existsSync(trainingRoot)) {
    const trainHashes = new Set<string>();
    for (const file of ['slm_pretrain.jsonl', 'slm_instruction.jsonl', 'slm_persona_dialogues.jsonl']) {
      for (const hash of await readJsonlHashes(path.join(trainingRoot, file))) trainHashes.add(hash);
    }
    const evalHashes = await readJsonlHashes(path.join(trainingRoot, 'slm_eval_holdout.jsonl'));
    const overlap = [...evalHashes].filter(hash => trainHashes.has(hash));
    assertCondition(overlap.length === 0, `training/eval provenance leakage detected: ${overlap.slice(0, 5).join(', ')}`, failures);
    if (evalHashes.size === 0) warnings.push('SLM eval holdout exists but has no records.');
  } else {
    warnings.push('SLM training export not found; run npm run build:training-corpus.');
  }

  const report = {
    ok: failures.length === 0,
    failures,
    warnings,
    artifacts: {
      metaBytes,
      corpusBytes,
      lexiconEntries: Object.keys(lexicon).length,
      manifestRecordCount: manifest.recordCount,
      metadataRecords: meta.length,
      vectorRecords,
      manifestSchema: manifest.schemaVersion,
    },
    personas: personaCounts,
  };

  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exit(1);
}

try {
  await main();
} catch (err) {
  console.error('Corpus validation failed:', err);
  process.exit(1);
}
