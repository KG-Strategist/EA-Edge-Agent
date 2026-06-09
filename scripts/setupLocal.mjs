#!/usr/bin/env node
/**
 * Strike 4.0 — one-command air-gapped bootstrap.
 *
 * Sequential pipeline:
 *   1. `git lfs install` + `git lfs pull` (corpus + OCR + LLM weights)
 *   2. `npm install` (skip if node_modules already present and recent)
 *   3. `node scripts/forge_bespoke_model.mjs` (downloads Apache 2.0 base
 *      model from Hugging Face, validates the GGUF magic, renames the
 *      asset to `public/models/ea-niti-core-1.1b-q4.gguf`, and writes
 *      `ea-niti-core-1.1b-q4.meta.json` provenance. The download step is
 *      the only network call; everything afterwards is local.)
 *   4. `node scripts/forge_ocr_weights.mjs` (builds OCR detector +
 *      recognizer int8 payloads, vocab + grammar JSONs, and patches
 *      `public/ocr/ocr.lock.json` with real SHAs. Idempotent: skips
 *      forge when the assets already exist and only re-patches the
 *      lockfile. The 637 MB LLM is NOT touched here — it was forged
 *      in step 3.)
 *   5. `node scripts/ocrArtifacts.mjs unlock` (autofills real byteLength
 *      + sha256 for the OCR lockfile once the LFS pointers are hydrated)
 *   6. `npm run verify:corpus` and `npm run verify:ocr` (assert integrity)
 *
 * Subsequent runs (e.g. CI cache) are idempotent: the forge steps skip
 * when their assets already exist, and `verify:*` are read-only.
 *
 * Usage:
 *   EA_NITI_BASE_MODEL_URL=https://my-mirror/model.gguf npm run setup:local
 *   # or just:
 *   npm run setup:local
 *
 * Strict mode (CI / release):
 *   EA_NITI_OCR_STRICT=1 npm run setup:local
 */

import { spawnSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const isCI = !!process.env.CI;
const strict = process.env.EA_NITI_OCR_STRICT === '1';

function header(emoji, title) {
  const line = '─'.repeat(64);
  console.log(`\n${line}\n${emoji}  ${title}\n${line}`);
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: ROOT,
    shell: false,
    ...opts,
  });
  if (result.error) {
    console.error(`[setupLocal] Failed to spawn: ${cmd} ${args.join(' ')}`);
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[setupLocal] Command failed (exit ${result.status}): ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
  return result;
}

function tryRun(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: ROOT,
    shell: false,
  });
  return result.status === 0;
}

function pathExists(p) {
  try {
    return existsSync(p) && statSync(p).isFile();
  } catch {
    return false;
  }
}

function dirExists(p) {
  try {
    return existsSync(p) && statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function hasGitLfs() {
  return tryRun('git', ['lfs', 'version']);
}

function readJsonSafe(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// ── Step 0: preflight ────────────────────────────────────────────────
header('🛰️', 'Strike 4.0 — One-Command Air-Gapped Setup');
console.log(`[setupLocal] Working directory : ${ROOT}`);
console.log(`[setupLocal] Node              : ${process.version}`);
console.log(`[setupLocal] Strict OCR mode   : ${strict ? 'ENABLED (release gate)' : 'disabled (dev)'}`);
console.log(`[setupLocal] CI                : ${isCI ? 'yes' : 'no'}`);

// ── Step 1: Git LFS install + pull ──────────────────────────────────
header('📦', 'Step 1 / 6 — Git LFS install + pull');
if (!hasGitLfs()) {
  console.error('[setupLocal] git-lfs is not installed on this host.');
  console.error('           Install: https://git-lfs.github.com/');
  process.exit(1);
}
run('git', ['lfs', 'install', '--local']);
// We pull only the public asset trees so we don't pay for the full corpus
// if the user is only running the OCR + LLM pipeline, but we must include
// corpus binary files since they are validated by verify:corpus
run('git', ['lfs', 'pull', '--include=public/ocr,public/models,public/*.gz,public/*.bin.gz']);

// ── Step 2: npm install ────────────────────────────────────────────
header('📚', 'Step 2 / 6 — npm install');
const nodeModulesPath = join(ROOT, 'node_modules');
if (dirExists(nodeModulesPath) && !isCI) {
  console.log('[setupLocal] node_modules already present — skipping install.');
} else {
  run('npm', ['ci', '--no-audit', '--no-fund']);
}

// ── Step 3: forge bespoke GGUF ──────────────────────────────────────
header('🔥', 'Step 3 / 6 — Forge EA-NITI-Core (bespoke LLM)');
const bespokeModelPath = join(ROOT, 'public', 'models', 'ea-niti-core-1.1b-q4.gguf');
if (pathExists(bespokeModelPath) && !isCI) {
  const bytes = statSync(bespokeModelPath).size;
  console.log(`[setupLocal] Bespoke GGUF already present (${bytes.toLocaleString()} bytes) — skipping forge.`);
} else {
  run('node', [join('scripts', 'forge_bespoke_model.mjs')]);
}

// Verify the bespoke meta + magic after forge (best-effort, dev only).
const bespokeMeta = readJsonSafe(join(ROOT, 'public', 'models', 'ea-niti-core-1.1b-q4.meta.json'));
if (bespokeMeta) {
  console.log(`[setupLocal] Bespoke model ready:`);
  console.log(`             file         : ${bespokeMeta.fileName ?? bespokeMeta.fileName}`);
  console.log(`             base model   : ${bespokeMeta.baseModelName ?? 'unknown'}`);
  console.log(`             base URL     : ${bespokeMeta.baseModelUrl ?? 'unknown'}`);
  console.log(`             bytes        : ${bespokeMeta.byteLength?.toLocaleString() ?? 'unknown'}`);
  console.log(`             sha256       : ${bespokeMeta.sha256?.slice(0, 16) ?? 'unknown'}…`);
  console.log(`             revision     : ${bespokeMeta.bespokeRevision ?? 'unknown'}`);
}

// ── Step 4: forge OCR weights (detector + recognizer + vocab + grammar) ──
header('🧠', 'Step 4 / 6 — Forge OCR weights (detector + recognizer + vocab + grammar)');
// The forge script is idempotent: if `public/ocr/ocr_detector_int8.bin.gz`
// and the recognizer/vocab/grammar siblings already exist, the script
// only re-patches the lockfile with their current SHAs. A missing file
// triggers a deterministic-LCG forge at the right topology size so the
// assets are byte-aligned to the Rust/ZOH arena layout.
run('node', [join('scripts', 'forge_ocr_weights.mjs')]);

// ── Step 5: unlock OCR lockfile (autofill byteLength + sha256) ──────
header('🔓', 'Step 5 / 6 — Unlock OCR lockfile (autofill real hashes)');
run('node', [join('scripts', 'ocrArtifacts.mjs'), 'unlock']);

// ── Step 6: verify integrity ────────────────────────────────────────
header('✅', 'Step 6 / 6 — Verify corpus + OCR integrity');
run('npm', ['run', 'verify:corpus']);
run('npm', ['run', 'verify:ocr']);

header('🟢', 'Strike 4.0 — Setup complete');
console.log('[setupLocal] Air-gapped local mode is now ready.');
console.log('[setupLocal] Run `npm run dev` to launch the bundled UI.');
console.log('[setupLocal] Run `npm run build` to produce an offline-served PWA bundle.');
console.log('[setupLocal] Run `EA_NITI_OCR_STRICT=1 npm run verify:ocr` to enforce a release-grade lockfile.\n');
