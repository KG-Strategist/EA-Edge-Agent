import { open, stat } from 'node:fs/promises';
import path from 'node:path';

const modelPath = process.env.EA_NITI_E2E_GGUF_PATH;

function fail(message) {
  console.error(`[sovereign-e2e] ${message}`);
  process.exit(1);
}

if (!modelPath) {
  fail('EA_NITI_E2E_GGUF_PATH is required. Point it to a local .gguf model file.');
}

const resolvedPath = path.resolve(modelPath);
let fileStat;
try {
  fileStat = await stat(resolvedPath);
} catch {
  fail(`Model file not found: ${resolvedPath}`);
}

if (!fileStat.isFile()) {
  fail(`Model path is not a file: ${resolvedPath}`);
}

if (path.extname(resolvedPath).toLowerCase() !== '.gguf') {
  fail(`Model file must have a .gguf extension: ${resolvedPath}`);
}

const handle = await open(resolvedPath, 'r');
try {
  const header = Buffer.alloc(4);
  await handle.read(header, 0, 4, 0);
  if (header.toString('utf8') !== 'GGUF') {
    fail(`Model file does not start with GGUF magic bytes: ${resolvedPath}`);
  }
} finally {
  await handle.close();
}

const modelId = process.env.EA_NITI_E2E_MODEL_ID || path.basename(resolvedPath, '.gguf');
const sizeMb = (fileStat.size / 1024 / 1024).toFixed(1);
console.log(`[sovereign-e2e] GGUF preflight OK: ${modelId} (${sizeMb} MB)`);
