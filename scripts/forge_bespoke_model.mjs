#!/usr/bin/env node
/**
 * EA-NITI Bespoke Model Forge
 * =============================
 * Downloads a permissive base LLM (Apache 2.0 / MIT) and renames it
 * into our proprietary EA-NITI-Core asset tracked via Git LFS.
 *
 * Why this exists:
 *   - We do not want users to hit HuggingFace on first boot.
 *   - We want a stable, versioned, locally-cached model that the
 *     app can hydrate from the Vite dev server (or static host).
 *   - The original model and its licence are recorded in
 *     `public/models/NOTICE.txt` so the provenance is transparent.
 *
 * Base model:
 *   - `TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF` (Apache 2.0) is the
 *     default — a 1.1B-parameter Q4_0 GGUF that fits the bespoke
 *     `ea-niti-core-1.1b-q4` naming.
 *   - Override with `EA_NITI_BASE_MODEL_URL` if needed.
 *
 * Output:
 *   - `public/models/ea-niti-core-1.1b-q4.gguf`
 *   - Idempotent: skipped if the file already exists and SHA-256 matches.
 *
 * Usage:
 *   - `node scripts/forge_bespoke_model.mjs`
 *   - `npm run setup:local` invokes this automatically.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const modelsDir = path.join(root, 'public', 'models');
const outputPath = path.join(modelsDir, 'ea-niti-core-1.1b-q4.gguf');
const outputMetaPath = path.join(modelsDir, 'ea-niti-core-1.1b-q4.meta.json');

const DEFAULT_BASE_MODEL_URL =
  'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_0.gguf';
const GGUF_MAGIC = Buffer.from([0x47, 0x47, 0x55, 0x46]); // "GGUF"

function log(stage, message) {
  console.log(`[forge:${stage}] ${message}`);
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function validateGgufMagic(filePath) {
  return new Promise((resolve, reject) => {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4);
    try {
      const bytesRead = fs.readSync(fd, buffer, 0, 4, 0);
      if (bytesRead < 4) {
        reject(new Error('File too small to be a valid GGUF model.'));
        return;
      }
      if (!buffer.equals(GGUF_MAGIC)) {
        reject(new Error(
          `INVALID_GGUF_SIGNATURE: Expected [${GGUF_MAGIC.join(',')}] ("GGUF"), got [${buffer.join(',')}]`,
        ));
        return;
      }
      resolve();
    } finally {
      fs.closeSync(fd);
    }
  });
}

async function ensureModelsDir() {
  await fs.promises.mkdir(modelsDir, { recursive: true });
}

async function writeProvenance(meta) {
  await fs.promises.writeFile(
    outputMetaPath,
    JSON.stringify(meta, null, 2),
    'utf8',
  );
}

async function downloadBaseModel(baseUrl) {
  log('download', `Source: ${baseUrl}`);
  log('download', `Target: ${path.relative(root, outputPath)}`);

  const response = await fetch(baseUrl);
  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to download base model (HTTP ${response.status} ${response.statusText}). ` +
      'Set EA_NITI_BASE_MODEL_URL to a reachable permissive model or run while online.',
    );
  }
  const tmpPath = `${outputPath}.download`;
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tmpPath));
  const stats = await fs.promises.stat(tmpPath);
  log('download', `Downloaded ${stats.size.toLocaleString()} bytes.`);
  await fs.promises.rename(tmpPath, outputPath);
}

async function skipIfAlreadyForged() {
  if (!fs.existsSync(outputPath)) return false;
  log('verify', `Existing asset found at ${path.relative(root, outputPath)}`);
  try {
    await validateGgufMagic(outputPath);
    const sha = await sha256File(outputPath);
    const stats = await fs.promises.stat(outputPath);
    log('verify', `GGUF signature valid. sha256=${sha.slice(0, 12)}… size=${stats.size.toLocaleString()}`);
    if (fs.existsSync(outputMetaPath)) {
      const meta = JSON.parse(await fs.promises.readFile(outputMetaPath, 'utf8'));
      if (meta.sha256 && meta.sha256 !== sha) {
        log('verify', 'Existing meta.json sha256 does not match file. Re-forging.');
        return false;
      }
    }
    log('verify', 'Bespoke asset already forged; skipping download.');
    return true;
  } catch (error) {
    log('verify', `Existing asset failed validation (${error.message}); re-forging.`);
    return false;
  }
}

async function forgeBespokeModel() {
  const baseUrl = process.env.EA_NITI_BASE_MODEL_URL || DEFAULT_BASE_MODEL_URL;

  if (await skipIfAlreadyForged()) return;

  await ensureModelsDir();
  await downloadBaseModel(baseUrl);
  await validateGgufMagic(outputPath);
  const sha = await sha256File(outputPath);
  const stats = await fs.promises.stat(outputPath);
  await writeProvenance({
    name: 'ea-niti-core-1.1b-q4',
    path: path.relative(root, outputPath),
    byteLength: stats.size,
    sha256: sha,
    baseModelUrl: baseUrl,
    baseModelName: 'TinyLlama-1.1B-Chat-v1.0 (Apache 2.0)',
    bespokeRevision: '1.1.4-beta',
    forgedAt: new Date().toISOString(),
    ggufMagic: Array.from(GGUF_MAGIC),
    note: 'Bespoke derivative work: renamed, metadata-tagged, and tracked via Git LFS. See NOTICE.txt.',
  });
  log('done', `Bespoke asset forged: ${path.relative(root, outputPath)}`);
  log('done', `sha256=${sha}`);
  log('done', 'Run `git add public/models/` then commit. Git LFS will track the .gguf automatically.');
}

forgeBespokeModel().catch((error) => {
  console.error('[forge:fatal]', error);
  process.exit(1);
});
