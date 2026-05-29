import fs from 'fs';
import path from 'path';
import { once } from 'events';

interface RuntimeMetaRecord {
  s?: string;
  i?: string;
  t?: string;
  personaTags?: string[];
  domainTags?: string[];
  aliases?: string[];
  sourceFile?: string;
  sourceType?: string;
}

const basePath = process.cwd();
const metaPath = path.join(basePath, 'public', 'baseline_meta.json');
const outBinPath = path.join(basePath, 'public', 'dataAssets', 'brain', 'brain_kb.bin');
const outManifestPath = path.join(basePath, 'public', 'dataAssets', 'brain', 'brain_kb_manifest.json');

function asText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function writeChunk(stream: fs.WriteStream, chunk: Buffer) {
  if (!stream.write(chunk)) await once(stream, 'drain');
}

async function main() {
  if (!fs.existsSync(metaPath)) {
    throw new Error('public/baseline_meta.json does not exist. Run npm run build:corpus first.');
  }

  const records = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as RuntimeMetaRecord[];
  if (!Array.isArray(records)) throw new Error('baseline_meta.json is not an array.');
  const sourceTypeCounts: Record<string, number> = {};
  for (const record of records) {
    const sourceType = record.sourceType || 'unknown';
    sourceTypeCounts[sourceType] = (sourceTypeCounts[sourceType] || 0) + 1;
  }

  fs.mkdirSync(path.dirname(outBinPath), { recursive: true });
  const header = Buffer.alloc(16);
  header.write('EAKB', 0, 'ascii');
  header.writeUInt32LE(1, 4);
  header.writeUInt32LE(records.length, 8);
  header.writeUInt32LE(32, 12);

  const recordTable = Buffer.alloc(records.length * 32);
  const stringBuffers: Buffer[] = [];
  let stringOffset = 0;

  const addString = (value: string): { offset: number; length: number } => {
    const buffer = Buffer.from(value, 'utf8');
    const current = { offset: stringOffset, length: buffer.byteLength };
    stringBuffers.push(buffer);
    stringOffset += buffer.byteLength;
    return current;
  };

  records.forEach((record, index) => {
    const tags = [
      ...(Array.isArray(record.personaTags) ? record.personaTags : []),
      ...(Array.isArray(record.domainTags) ? record.domainTags : []),
      ...(Array.isArray(record.aliases) ? record.aliases : []),
      record.sourceFile || '',
      record.sourceType || '',
    ].join(' ').toLowerCase();

    const fields = [
      addString(asText(record.s)),
      addString(asText(record.i)),
      addString(asText(record.t)),
      addString(asText(tags)),
    ];

    const base = index * 32;
    fields.forEach((field, fieldIndex) => {
      recordTable.writeUInt32LE(field.offset, base + fieldIndex * 8);
      recordTable.writeUInt32LE(field.length, base + fieldIndex * 8 + 4);
    });
  });

  const stream = fs.createWriteStream(outBinPath);
  await writeChunk(stream, header);
  await writeChunk(stream, recordTable);
  for (const buffer of stringBuffers) {
    await writeChunk(stream, buffer);
  }
  stream.end();
  await once(stream, 'finish');

  const stats = fs.statSync(outBinPath);
  fs.writeFileSync(outManifestPath, JSON.stringify({
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    file: 'public/dataAssets/brain/brain_kb.bin',
    byteLength: stats.size,
    recordCount: records.length,
    headerBytes: 16,
    recordWidthBytes: 32,
    stringTableOffset: 16 + records.length * 32,
    fields: ['subject', 'intent', 'target', 'tags'],
    sourceTypeCounts,
    compatibility: 'binary-layout-v1',
    status: 'experimental-not-runtime-loaded',
  }, null, 2));

  console.log(`Brain KB exported: ${records.length} records, ${stats.size} bytes.`);
}

main().catch(err => {
  console.error('Brain KB export failed:', err);
  process.exit(1);
});
