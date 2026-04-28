import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { LexicalStateMachine } from '../src/lib/LexicalParser';
import { StructuralVectoriser } from '../src/lib/StructuralVectoriser';
import seedData from '../src/data/ea_seed_data.json';

async function compile() {
  console.log('--- Sovereign Compiler Starting (Strike 29 — Gzip Compression) ---');
  const basePath = process.cwd();
  const wordsPath = path.join(basePath, 'public', 'words.txt');
  const eePath = path.join(basePath, 'public', 'ee.csv');
  const readmePath = path.join(basePath, 'README.md');
  const outBinPath = path.join(basePath, 'public', 'baseline_corpus.bin.gz');
  const outBinUncompressed = path.join(basePath, 'public', 'baseline_corpus.bin');
  const outMetaPath = path.join(basePath, 'public', 'baseline_meta.json');

  const parser = new LexicalStateMachine();
  await parser.loadLexicon(true, basePath);
  const vectoriser = new StructuralVectoriser();

  const massiveArray = new Uint32Array(700000 * 64); // Slightly larger buffer for full ecosystem
  let validCount = 0;
  const metaTriplets: any[] = [];
  const dedupeMap = new Map<string, boolean>();

  const processSentence = (sentence: string) => {
    if (!sentence || sentence.length < 5) return;
    
    const parsed = parser.parse(sentence);
    if (!parsed.Subject || !parsed.Intent || !parsed.Target) return;

    const key = `${parsed.Subject.toLowerCase()}|${parsed.Intent.toLowerCase()}|${parsed.Target.toLowerCase()}`;
    if (dedupeMap.has(key)) return;

    const vector = vectoriser.vectorise(parsed);
    massiveArray.set(vector, validCount * 64);
    metaTriplets.push({ s: parsed.Subject, i: parsed.Intent, t: parsed.Target });
    dedupeMap.set(key, true);
    validCount++;

    if (validCount % 10000 === 0) {
      process.stdout.write(`Processed ${validCount} unique structural facts\r`);
    }
  };

  // Source A: External CSV (Lexicon)
  console.log('Processing Source A (ee.csv)...');
  if (fs.existsSync(eePath)) {
    const lines = fs.readFileSync(eePath, 'utf-8').split('\n').filter(Boolean);
    lines.forEach(line => {
      const firstComma = line.indexOf(',');
      if (firstComma > 0) {
        const term = line.substring(0, firstComma).trim();
        const def = line.substring(firstComma + 1).trim();
        processSentence(`${term} is defined as ${def}`);
      }
    });
  }

  // Source B: External Words (Foundation)
  console.log('\nProcessing Source B (words.txt)...');
  if (fs.existsSync(wordsPath)) {
    const words = fs.readFileSync(wordsPath, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
    words.forEach(word => {
      processSentence(`${word} represents a fundamental concept`);
    });
  }

  // Source C: Internal Ecosystem (Seed Data)
  console.log('\nProcessing Source C (ea_seed_data.json)...');
  const { togaf_phases, service_domains, ea_principles, semantic_memory, review_workflows, report_templates } = seedData as any;

  if (togaf_phases) {
    togaf_phases.forEach((item: any) => processSentence(`TOGAF Phase ${item.name} governs ${item.description}`));
  }
  if (service_domains) {
    service_domains.forEach((item: any) => processSentence(`The ${item.name} domain manages service area ${item.businessArea}`));
  }
  if (ea_principles) {
    ea_principles.forEach((item: any) => processSentence(`The ${item.name} principle states that ${item.statement}`));
  }
  if (semantic_memory) {
    semantic_memory.forEach((item: any) => processSentence(`${item.Entity} ${item.Intent} ${item.Payload}`));
  }
  if (review_workflows) {
    review_workflows.forEach((item: any) => processSentence(`The ${item.name} workflow triggers on ${item.triggerReviewType}`));
  }
  if (report_templates) {
    report_templates.forEach((item: any) => processSentence(`The ${item.name} template provides structure for ${item.category} reports`));
  }

  // Source D: Context (README)
  console.log('\nProcessing Source D (README.md)...');
  if (fs.existsSync(readmePath)) {
    const paragraphs = fs.readFileSync(readmePath, 'utf-8').split('\n\n').map(p => p.trim()).filter(p => p.length > 10);
    paragraphs.forEach(p => processSentence(p));
  }

  // Source E: Enterprise Architecture Learnings
  console.log('\nProcessing Source E (EnterpriseArchitectureLearnings.txt)...');
  const sourceEPath = path.join(basePath, 'public', 'EnterpriseArchitectureLearnings.txt');
  if (fs.existsSync(sourceEPath)) {
    const learnings = fs.readFileSync(sourceEPath, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
    learnings.forEach(learning => {
      const parsed = parser.parse(learning);
      if (!parsed.Subject || !parsed.Intent || !parsed.Target) return;
      processSentence(learning);
    });
  }

  console.log(`\n\nFinal count: ${validCount} unique structural facts.`);

const finalBinary = massiveArray.slice(0, validCount * 64);

console.log(`Compressing binary corpus...`);
const uncompressedBuffer = Buffer.from(finalBinary.buffer, finalBinary.byteOffset, finalBinary.byteLength);
const compressedBuffer = zlib.gzipSync(uncompressedBuffer);

console.log(`Writing gzip corpus to ${outBinPath}...`);
fs.writeFileSync(outBinPath, compressedBuffer);

// Cleanup old uncompressed binary
if (fs.existsSync(outBinUncompressed)) {
  fs.unlinkSync(outBinUncompressed);
  console.log('Cleaned up uncompressed baseline_corpus.bin');
}

  console.log(`Writing metadata map to ${outMetaPath}...`);
  fs.writeFileSync(outMetaPath, JSON.stringify(metaTriplets));

  console.log('--- Sovereign Compiler Finished (Gzip Enabled) ---');
}

compile().catch(err => {
  console.error('Compiler failed:', err);
  process.exit(1);
});