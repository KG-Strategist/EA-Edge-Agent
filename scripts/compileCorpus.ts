import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { once } from 'events';
import { pipeline } from 'stream/promises';
import { LexicalStateMachine } from '../src/lib/LexicalParser';
import { StructuralVectoriser } from '../src/lib/StructuralVectoriser';
import seedData from '../src/data/ea_seed_data.json';
import {
  assessUnstructuredQuality,
  buildDictionaryMorphologyFacts,
  dictionaryPosCategory,
  hashText,
  normalizeDictionaryRows,
  normalizeSentenceKey,
  normalizeWhitespace,
  parseCsvRows,
  shouldSkipAsset,
  sourcePriorityForExtension,
  trimDefinition,
  uniqueList,
} from './corpusBuildUtils';

type CorpusDomain = 'EA' | 'DICT';
type AppendResult = 'accepted' | 'duplicateSentence' | 'duplicateTriplet' | 'lowQuality' | 'invalid';
type SourceStatKey = 'processed' | 'accepted' | 'skippedDuplicateSentence' | 'skippedDuplicateTriplet' | 'skippedLowQuality' | 'skippedMalformed';

interface SourceStats {
  processed: number;
  accepted: number;
  skippedDuplicateSentence: number;
  skippedDuplicateTriplet: number;
  skippedLowQuality: number;
  skippedMalformed: number;
}

interface CorpusOptions {
  isDict?: boolean;
  domain?: CorpusDomain;
  sourceFile?: string;
  sourceType?: string;
  sourceSentence?: string;
  canonicalAnswer?: string;
  aliases?: string[];
  personaTags?: string[];
  domainTags?: string[];
  beliefState?: number;
  sourceReliability?: number;
  provenanceHash?: string;
  parsed?: any;
  personaId?: string;
  personaName?: string;
  domainId?: string;
  domainName?: string;
  minerVersion?: string;
  orthogonal?: any;
}

interface BrainFactInput {
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
  alias?: string;
  personaTags?: string[] | string;
  personas?: string[] | string;
  domainTags?: string[] | string;
  tags?: string[] | string;
  beliefState?: number;
  confidence?: number;
  sourceReliability?: number;
  provenanceHash?: string;
  personaId?: string;
  personaName?: string;
  domainId?: string;
  domainName?: string;
  minerVersion?: string;
  orthogonal?: any;
}

const emptyStats = (): SourceStats => ({
  processed: 0,
  accepted: 0,
  skippedDuplicateSentence: 0,
  skippedDuplicateTriplet: 0,
  skippedLowQuality: 0,
  skippedMalformed: 0,
});

async function compile() {
  process.env.EA_QUIET_LOGS = '1';
  console.log('--- Sovereign Compiler Starting (DataAssets Moat Ingestion v6) ---');

  const basePath = process.cwd();
  const outBinPath = path.join(basePath, 'public', 'baseline_corpus.bin.gz');
  const outBinUncompressed = path.join(basePath, 'public', 'baseline_corpus.bin');
  const outMetaPath = path.join(basePath, 'public', 'baseline_meta.json');
  const outMetaGzipPath = path.join(basePath, 'public', 'baseline_meta.json.gz');
  const outManifestPath = path.join(basePath, 'public', 'baseline_corpus_manifest.json');
  const dataAssetsRoot = path.join(basePath, 'public', 'dataAssets');
  const legacyRootLearnings = path.join(basePath, 'public', 'EnterpriseArchitectureLearnings.txt');

  if (!fs.existsSync(dataAssetsRoot) && !fs.existsSync(legacyRootLearnings)) {
    console.log('NOTICE: No corpus source files found. Keeping packaged OOB Brain.');
    process.exit(0);
  }

  const parser = new LexicalStateMachine();
  const lexiconPath = path.join(basePath, 'public', 'lexicon.json');
  let lexiconData = {};
  if (fs.existsSync(lexiconPath)) {
    lexiconData = JSON.parse(fs.readFileSync(lexiconPath, 'utf-8'));
  }
  await parser.loadLexicon(lexiconData);
  const vectoriser = new StructuralVectoriser();

  const maxRecords = 1000000;
  const dictionaryRuntimeDefinitionLimit = 900;
  const massiveArray = new Uint32Array(maxRecords * 64);
  const metaTriplets: any[] = [];
  const tripletDedupe = new Set<string>();
  const sentenceDedupe = new Set<string>();
  const sourceStats = new Map<string, SourceStats>();
  const morphologyDedupe = new Set<string>();
  const lexicalCounters = {
    dictionaryDefinitionsTrimmed: 0,
    generatedMorphologyFacts: 0,
    sourceDerivedRelationFacts: 0,
    rejectedGeneratedForms: 0,
    ambiguityFacts: 0,
  };
  const samples = {
    accepted: [] as any[],
    skipped: [] as any[],
  };
  let validCount = 0;

  const writeJsonArray = async (filePath: string, entries: unknown[]) => {
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    stream.write('[');
    for (let index = 0; index < entries.length; index++) {
      const chunk = `${index === 0 ? '' : ','}${JSON.stringify(entries[index])}`;
      if (!stream.write(chunk)) await once(stream, 'drain');
    }
    stream.end(']');
    await once(stream, 'finish');
  };

  const gzipFile = async (sourcePath: string, targetPath: string) => {
    await pipeline(
      fs.createReadStream(sourcePath),
      zlib.createGzip({ level: 9 }),
      fs.createWriteStream(targetPath)
    );
  };

  const relativeAssetLabel = (filePath: string): string => {
    if (!filePath.startsWith(dataAssetsRoot)) return path.relative(basePath, filePath).split(path.sep).join('/');
    return path.relative(dataAssetsRoot, filePath).split(path.sep).join('/');
  };

  const getStats = (sourceFile: string): SourceStats => {
    const current = sourceStats.get(sourceFile);
    if (current) return current;
    const created = emptyStats();
    sourceStats.set(sourceFile, created);
    return created;
  };

  const bumpSource = (sourceFile: string, key: SourceStatKey, amount = 1) => {
    const current = getStats(sourceFile);
    current[key] += amount;
  };

  const sampleAccepted = (entry: any) => {
    if (samples.accepted.length >= 24) return;
    samples.accepted.push({
      sourceFile: entry.sourceFile,
      sourceType: entry.sourceType,
      s: entry.s,
      i: entry.i,
      t: entry.t,
      personaId: entry.personaId,
    });
  };

  const sampleSkipped = (sourceFile: string, reason: AppendResult | 'malformed', sentence: string) => {
    if (samples.skipped.length >= 24) return;
    samples.skipped.push({
      sourceFile,
      reason,
      sentence: normalizeWhitespace(sentence).slice(0, 180),
    });
  };

  const appendVector = (parsed: any, options: CorpusOptions = {}): AppendResult => {
    const sourceFile = options.sourceFile || 'unknown';
    if (validCount >= maxRecords) return 'invalid';
    if (!parsed.Subject || !parsed.Intent || !parsed.Target) return 'invalid';

    const sourceSentence = normalizeWhitespace(options.sourceSentence || options.canonicalAnswer || `${parsed.Subject} ${parsed.Intent} ${parsed.Target}`);
    const quality = assessUnstructuredQuality(parsed, sourceSentence, options.sourceType || 'compiled');
    if (!quality.accepted) {
      bumpSource(sourceFile, 'skippedLowQuality');
      sampleSkipped(sourceFile, 'lowQuality', sourceSentence);
      return 'lowQuality';
    }

    const sentenceKey = normalizeSentenceKey(sourceSentence);
    if (sentenceDedupe.has(sentenceKey)) {
      bumpSource(sourceFile, 'skippedDuplicateSentence');
      sampleSkipped(sourceFile, 'duplicateSentence', sourceSentence);
      return 'duplicateSentence';
    }

    const dedupeScope = options.personaId ? `${options.personaId.toLowerCase()}|` : '';
    const tripletKey = `${dedupeScope}${String(parsed.Subject).toLowerCase()}|${String(parsed.Intent).toLowerCase()}|${String(parsed.Target).toLowerCase()}`;
    if (tripletDedupe.has(tripletKey)) {
      bumpSource(sourceFile, 'skippedDuplicateTriplet');
      sampleSkipped(sourceFile, 'duplicateTriplet', sourceSentence);
      return 'duplicateTriplet';
    }

    const vector = vectoriser.vectorise(parsed);
    massiveArray.set(vector, validCount * 64);

    const entry = {
      s: parsed.Subject,
      i: parsed.Intent,
      t: parsed.Target,
      sourceSentence,
      aliases: options.aliases || [],
      personaTags: options.personaTags || [],
      domainTags: options.domainTags || [],
      beliefState: options.beliefState ?? (options.isDict ? 2 : 3),
      sourceReliability: options.sourceReliability ?? (options.isDict ? 0.55 : 0.84),
      provenanceHash: options.provenanceHash || hashText(`${sourceFile}:${sourceSentence}`),
      sourceFile,
      sourceType: options.sourceType || 'compiled',
      isDict: options.isDict ?? false,
      domain: options.domain ?? 'EA',
      personaId: options.personaId,
      personaName: options.personaName,
      domainId: options.domainId,
      domainName: options.domainName,
      minerVersion: options.minerVersion,
    };

    metaTriplets.push(entry);
    tripletDedupe.add(tripletKey);
    sentenceDedupe.add(sentenceKey);
    bumpSource(sourceFile, 'accepted');
    sampleAccepted(entry);
    validCount++;

    if (validCount % 25000 === 0) process.stdout.write(`Processed ${validCount} unique structural facts\r`);
    return 'accepted';
  };

  const processSentence = (sentence: string, options: CorpusOptions = {}): AppendResult => {
    const sourceFile = options.sourceFile || 'inline';
    const cleaned = normalizeWhitespace(sentence);
    if (!cleaned || cleaned.length < 5) return 'invalid';
    bumpSource(sourceFile, 'processed');
    const parsed = options.parsed || parser.parse(cleaned, { enableAutoCorrect: false });
    return appendVector(parsed, {
      ...options,
      sourceSentence: options.sourceSentence || cleaned,
      canonicalAnswer: options.canonicalAnswer || cleaned,
    });
  };

  const processBrainFact = (fact: BrainFactInput, label: string, domain: CorpusDomain): AppendResult => {
    const orthogonal = fact.orthogonal || {};
    const subject = fact.subject || fact.s || fact.entity || fact.term || fact.name || orthogonal.subjectEntity || '';
    const intent = fact.intent || fact.i || fact.predicate || fact.relation || orthogonal.activeVerb || 'defines';
    const target = fact.target || fact.t || fact.object || fact.definition || fact.description || fact.canonicalAnswer || fact.answer || orthogonal.targetEntity || '';
    const sourceFile = fact.sourceFile || label;

    if (!subject || !intent || !target) {
      bumpSource(sourceFile, 'skippedMalformed');
      return 'invalid';
    }

    const sourceSentence = normalizeWhitespace(fact.sourceSentence || fact.canonicalAnswer || fact.answer || fact.description || `${subject} ${intent} ${target}`);
    const parsedSource = parser.parse(sourceSentence, { enableAutoCorrect: false });
    const parsed = {
      Subject: String(subject),
      Intent: String(intent),
      Target: String(target),
      Tense: parsedSource.Tense || 'Present',
      Voice: parsedSource.Voice || 'Active',
      Adverbs: uniqueList(parsedSource.Adverbs || [], orthogonal.intentAdverbs || []),
      Adjectives: uniqueList(parsedSource.Adjectives || [], orthogonal.subjectAdjectives || [], orthogonal.targetAdjectives || []),
      Prepositions: uniqueList(parsedSource.Prepositions || [], orthogonal.prepositionalContext || []),
      Sentiment: parsedSource.Sentiment || 'Neutral',
      Unknowns: parsedSource.Unknowns || [],
    };

    bumpSource(sourceFile, 'processed');
    return appendVector(parsed, {
      isDict: domain === 'DICT',
      domain,
      sourceFile,
      sourceType: fact.sourceType || 'brain-fact',
      sourceSentence,
      canonicalAnswer: fact.canonicalAnswer || fact.answer || sourceSentence,
      aliases: uniqueList(fact.aliases, fact.alias),
      personaTags: uniqueList(fact.personaTags, fact.personas, fact.personaId, fact.personaName),
      domainTags: uniqueList(fact.domainTags, fact.tags, fact.domainId, fact.domainName),
      beliefState: fact.beliefState ?? 2,
      sourceReliability: fact.sourceReliability ?? fact.confidence ?? 0.82,
      provenanceHash: fact.provenanceHash,
      personaId: fact.personaId,
      personaName: fact.personaName,
      domainId: fact.domainId,
      domainName: fact.domainName,
      minerVersion: fact.minerVersion,
      orthogonal,
    });
  };

  const processJSON = async (filePath: string, label: string, domain: CorpusDomain) => {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const entries = Array.isArray(parsed) ? parsed : parsed?.facts || parsed?.items || parsed?.records || [];
    if (!Array.isArray(entries)) return;
    let accepted = 0;
    for (const entry of entries) {
      const result = typeof entry === 'string'
        ? processSentence(entry, { sourceFile: label, sourceType: 'json', domain })
        : processBrainFact(entry, label, domain);
      if (result === 'accepted') accepted++;
    }
    console.log(`  [JSON]  ${label}: ${accepted}/${entries.length} accepted`);
  };

  const processJSONL = async (filePath: string, label: string, domain: CorpusDomain) => {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);
    let accepted = 0;
    for (const line of lines) {
      try {
        if (processBrainFact(JSON.parse(line), label, domain) === 'accepted') accepted++;
      } catch {
        if (processSentence(line, { sourceFile: label, sourceType: 'jsonl-text', domain }) === 'accepted') accepted++;
      }
    }
    console.log(`  [JSONL] ${label}: ${accepted}/${lines.length} accepted`);
  };

  const processCSV = async (filePath: string, label: string, domain: CorpusDomain) => {
    const text = fs.readFileSync(filePath, 'utf8');
    const rawRows = parseCsvRows(text);
    const entries = normalizeDictionaryRows(label, text);
    const malformed = Math.max(0, rawRows.length - entries.length - 1);
    if (malformed > 0) bumpSource(label, 'skippedMalformed', malformed);
    const knownTerms = new Set(
      entries
        .map(entry => entry.term.toLowerCase().trim())
        .filter(term => /^[a-z][a-z'-]*$/i.test(term))
    );
    const categoriesByTerm = new Map<string, Set<string>>();
    for (const entry of entries) {
      const category = dictionaryPosCategory(entry);
      if (category === 'unknown') continue;
      const key = entry.term.toLowerCase().trim();
      if (!key || key.includes(' ')) continue;
      if (!categoriesByTerm.has(key)) categoriesByTerm.set(key, new Set());
      categoriesByTerm.get(key)!.add(category);
    }

    const appendDictionaryLexicalFact = (fact: ReturnType<typeof buildDictionaryMorphologyFacts>[number]) => {
      const morphKey = `${fact.subject.toLowerCase()}|${fact.intent}|${fact.target.toLowerCase()}`;
      if (morphologyDedupe.has(morphKey)) return;
      morphologyDedupe.add(morphKey);
      bumpSource(label, 'processed');
      const morphParsed = {
        Subject: fact.subject,
        Intent: fact.intent,
        Target: fact.target,
        Tense: 'Present',
        Voice: 'Active',
        Adverbs: [],
        Adjectives: [],
        Prepositions: [],
        Sentiment: 'Neutral',
        Unknowns: [],
      };
      const sourceType = fact.sourceType || 'csv-dictionary-morphology';
      const result = appendVector(morphParsed, {
        sourceSentence: fact.sourceSentence,
        canonicalAnswer: fact.sourceSentence,
        domain,
        isDict: true,
        sourceFile: label,
        sourceType,
        domainTags: fact.domainTags,
        sourceReliability: fact.sourceReliability ?? 0.68,
      });
      if (result !== 'accepted') return;
      if (sourceType === 'csv-dictionary-relation') lexicalCounters.sourceDerivedRelationFacts++;
      else if (fact.intent === 'has-ambiguous-part-of-speech') lexicalCounters.ambiguityFacts++;
      else if (fact.domainTags.includes('generated-morphology')) lexicalCounters.generatedMorphologyFacts++;
    };

    let accepted = 0;
    if (domain === 'DICT') {
      for (const [term, categories] of categoriesByTerm.entries()) {
        if (categories.size < 2) continue;
        const target = Array.from(categories).sort().join(', ');
        appendDictionaryLexicalFact({
          subject: term,
          intent: 'has-ambiguous-part-of-speech',
          target,
          sourceSentence: `${term} has ambiguous part of speech ${target}.`,
          domainTags: ['dictionary', 'english', 'morphology', 'part-of-speech', 'ambiguity'],
          sourceType: 'csv-dictionary-morphology',
          sourceReliability: 0.74,
        });
      }
    }

    for (const entry of entries) {
      const shortDef = trimDefinition(entry.definition, dictionaryRuntimeDefinitionLimit);
      if (normalizeWhitespace(entry.definition).length > shortDef.length) lexicalCounters.dictionaryDefinitionsTrimmed++;
      bumpSource(label, 'processed');
      const parsed = {
        Subject: entry.term,
        Intent: 'means',
        Target: shortDef,
        Tense: 'Present',
        Voice: 'Active',
        Adverbs: [],
        Adjectives: [],
        Prepositions: [],
        Sentiment: 'Neutral',
        Unknowns: [],
      };
      if (appendVector(parsed, {
        sourceSentence: `${entry.term} means ${shortDef}`,
        canonicalAnswer: shortDef,
        domain,
        isDict: domain === 'DICT',
        sourceFile: label,
        sourceType: domain === 'DICT' ? 'csv-dictionary' : 'csv',
        domainTags: domain === 'DICT' ? ['dictionary', 'english', entry.sourceFormat, entry.pos].filter(Boolean) : [],
        sourceReliability: domain === 'DICT' ? 0.57 : 0.75,
      }) === 'accepted') accepted++;

      if (domain === 'DICT') {
        for (const fact of buildDictionaryMorphologyFacts(entry, {
          knownTerms,
          onReject: () => {
            lexicalCounters.rejectedGeneratedForms++;
          },
        })) appendDictionaryLexicalFact(fact);
      }
    }
    console.log(`  [CSV]   ${label}: ${accepted}/${entries.length} accepted (${malformed} malformed/skipped rows)`);
  };

  const sentenceSplit = (text: string): string[] => text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 30 && s.length < 500);

  const processTextFile = async (filePath: string, label: string, domain: CorpusDomain, sourceType: string) => {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const candidates = lines.length > 10 ? lines : sentenceSplit(text);
    let accepted = 0;
    for (const sentence of candidates) {
      const result = processSentence(sentence, { sourceFile: label, sourceType, domain, isDict: domain === 'DICT' });
      if (result === 'accepted') accepted++;
    }
    console.log(`  [TEXT]  ${label}: ${accepted}/${candidates.length} accepted`);
  };

  const processHTML = async (filePath: string, label: string, domain: CorpusDomain) => {
    const text = fs.readFileSync(filePath, 'utf8')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&amp;|&lt;|&gt;/g, ' ');
    const sentences = sentenceSplit(text).slice(0, 8000);
    let accepted = 0;
    for (const sentence of sentences) {
      if (processSentence(sentence, { sourceFile: label, sourceType: 'html', domain }) === 'accepted') accepted++;
    }
    console.log(`  [HTML]  ${label}: ${accepted}/${sentences.length} accepted`);
  };

  const processPDF = async (filePath: string, label: string, domain: CorpusDomain) => {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const result = await pdfParse(fs.readFileSync(filePath));
      const sentences = sentenceSplit(result.text || '').slice(0, 12000);
      let accepted = 0;
      for (const sentence of sentences) {
        if (processSentence(sentence, { sourceFile: label, sourceType: 'pdf', domain }) === 'accepted') accepted++;
      }
      console.log(`  [PDF]   ${label}: ${accepted}/${sentences.length} accepted`);
    } catch (err) {
      console.warn(`  [WARN]  ${label}: PDF skipped (${(err as Error).message})`);
    }
  };

  const processFile = async (filePath: string, domain: CorpusDomain) => {
    const label = relativeAssetLabel(filePath);
    if (shouldSkipAsset(label)) return;

    const ext = path.extname(filePath).toLowerCase();
    try {
      if (ext === '.json') await processJSON(filePath, label, domain);
      else if (ext === '.jsonl' || ext === '.ndjson') await processJSONL(filePath, label, domain);
      else if (ext === '.csv') await processCSV(filePath, label, domain);
      else if (ext === '.txt' || ext === '.md') await processTextFile(filePath, label, domain, ext.slice(1));
      else if (ext === '.html' || ext === '.htm') await processHTML(filePath, label, domain);
      else if (ext === '.pdf') await processPDF(filePath, label, domain);
    } catch (err) {
      bumpSource(label, 'skippedMalformed');
      sampleSkipped(label, 'malformed', (err as Error).message);
      console.warn(`  [WARN]  ${label}: ${(err as Error).message}`);
    }
  };

  const processDirectory = async (dir: string, domain: CorpusDomain) => {
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
      await processDirectory(path.join(dir, entry.name), domain);
    }
    for (const entry of files) {
      await processFile(path.join(dir, entry.name), domain);
    }
  };

  console.log('\nProcessing seed data...');
  const { togaf_phases, service_domains, ea_principles, semantic_memory, review_workflows, report_templates } = seedData as any;
  togaf_phases?.forEach((item: any) => processSentence(`TOGAF Phase ${item.name} governs ${item.description}`, { sourceFile: 'ea_seed_data.json', sourceType: 'seed:togaf_phases', domainTags: ['TOGAF'] }));
  service_domains?.forEach((item: any) => processSentence(`The ${item.name} domain manages service area ${item.businessArea}`, { sourceFile: 'ea_seed_data.json', sourceType: 'seed:service_domains', domainTags: ['BIAN', item.businessArea].filter(Boolean) }));
  ea_principles?.forEach((item: any) => processSentence(`The ${item.name} principle states that ${item.statement}`, { sourceFile: 'ea_seed_data.json', sourceType: 'seed:ea_principles', domainTags: ['principle'] }));
  semantic_memory?.forEach((item: any) => processSentence(`${item.Entity} ${item.Intent} ${item.Payload}`, { sourceFile: 'ea_seed_data.json', sourceType: 'seed:semantic_memory' }));
  review_workflows?.forEach((item: any) => processSentence(`The ${item.name} workflow triggers on ${item.triggerReviewType}`, { sourceFile: 'ea_seed_data.json', sourceType: 'seed:review_workflows', domainTags: uniqueList(item.domainTags) }));
  report_templates?.forEach((item: any) => processSentence(`The ${item.name} template provides structure for ${item.category} reports`, { sourceFile: 'ea_seed_data.json', sourceType: 'seed:report_templates', domainTags: [item.category].filter(Boolean) }));

  console.log('\nProcessing public/dataAssets/dict/...');
  await processDirectory(path.join(dataAssetsRoot, 'dict'), 'DICT');
  console.log('\nProcessing public/dataAssets/brain/...');
  await processDirectory(path.join(dataAssetsRoot, 'brain'), 'EA');
  console.log('\nProcessing public/dataAssets/personas/...');
  await processDirectory(path.join(dataAssetsRoot, 'personas'), 'EA');
  console.log('\nProcessing public/dataAssets/ea/ (legacy, if present)...');
  await processDirectory(path.join(dataAssetsRoot, 'ea'), 'EA');

  if (fs.existsSync(legacyRootLearnings)) {
    await processTextFile(legacyRootLearnings, 'EnterpriseArchitectureLearnings.txt', 'EA', 'legacy-txt');
  }

  console.log(`\n\nFinal count: ${validCount} unique structural facts.`);
  const finalBinary = massiveArray.slice(0, validCount * 64);
  const uncompressedBuffer = Buffer.from(finalBinary.buffer, finalBinary.byteOffset, finalBinary.byteLength);
  const compressedBuffer = zlib.gzipSync(uncompressedBuffer);

  console.log(`Writing gzip corpus to ${outBinPath}...`);
  fs.writeFileSync(outBinPath, compressedBuffer);
  if (fs.existsSync(outBinUncompressed)) {
    fs.unlinkSync(outBinUncompressed);
    console.log('Cleaned up uncompressed baseline_corpus.bin');
  }

  console.log(`Writing metadata map to ${outMetaPath}...`);
  await writeJsonArray(outMetaPath, metaTriplets);
  console.log(`Writing gzip metadata to ${outMetaGzipPath}...`);
  await gzipFile(outMetaPath, outMetaGzipPath);

  const sourceEntries = Object.fromEntries(sourceStats.entries());
  const sourceTypeCounts: Record<string, number> = {};
  const personaCounts: Record<string, number> = {};
  const domainCounts: Record<string, number> = {};
  for (const record of metaTriplets) {
    sourceTypeCounts[record.sourceType] = (sourceTypeCounts[record.sourceType] || 0) + 1;
    if (record.personaId) personaCounts[record.personaId] = (personaCounts[record.personaId] || 0) + 1;
    domainCounts[record.domain] = (domainCounts[record.domain] || 0) + 1;
  }

  console.log(`Writing corpus manifest to ${outManifestPath}...`);
  fs.writeFileSync(outManifestPath, JSON.stringify({
    schemaVersion: 7,
    generatedAt: new Date().toISOString(),
    vectorWidth: 64,
    recordCount: validCount,
    maxRecords,
    dictionaryRuntimeDefinitionLimit,
    dataAssetsRoot: 'public/dataAssets',
    acceptedFiles: ['csv', 'json', 'jsonl', 'ndjson', 'txt', 'md', 'html', 'pdf'],
    quality: {
      sourceTypeCounts,
      personaCounts,
      domainCounts,
      lexicalCounters,
      samples,
    },
    sources: sourceEntries,
  }, null, 2));

  console.log('--- Sovereign Compiler Finished (DataAssets Moat Ingestion v6) ---');
}

compile().catch(err => {
  console.error('Compiler failed:', err);
  process.exit(1);
});
