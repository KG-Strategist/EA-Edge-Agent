#!/usr/bin/env node
/**
 * buildExcludeLarge.mjs — Vite build wrapper that excludes large runtime assets
 * from the public/ directory copy to prevent OOM.
 *
 * Stashes: public/models/ (~608 MB GGUF), public/baseline_meta.json (~472 MB),
 * and public/dataAssets/ (~1.6 GB, if present). These are loaded at runtime via
 * fetch/OPFS, not bundled into dist/.
 *
 * Prebuild hooks (verify:corpus, verify:ocr) run BEFORE this script via npm's
 * prebuild lifecycle, so they see the original files and pass.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, renameSync, readdirSync, rmdirSync } from 'fs';
import { join } from 'path';

const ROOT = new URL('..', import.meta.url).pathname;
const PUBLIC = join(ROOT, 'public');
const STASH = join(ROOT, '.build-stash');

// Directories to stash
const STASH_DIRS = ['models', 'dataAssets'];
// Individual files to stash
const STASH_FILES = [
  'baseline_meta.json',
  'baseline_meta.json.gz',
  'baseline_corpus.bin.gz',
  'lexicon.json',
  'lexicon.json.gz',
  'lexicon_roles.json',
  'lexicon_roles.json.gz'
];

function main() {
  const toStash = [];

  // Find dirs to stash
  for (const name of STASH_DIRS) {
    const dirPath = join(PUBLIC, name);
    if (existsSync(dirPath)) {
      toStash.push({ type: 'dir', name, src: dirPath });
    }
  }

  // Find files to stash
  for (const name of STASH_FILES) {
    const filePath = join(PUBLIC, name);
    if (existsSync(filePath)) {
      toStash.push({ type: 'file', name, src: filePath });
    }
  }

  if (toStash.length === 0) {
    const result = spawnSync('./node_modules/.bin/vite', ['build'], { 
      cwd: ROOT, 
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=16384', SKIP_PWA: '1' }
    });
    process.exit(result.status ?? 0);
  }

  // 1. Stash
  mkdirSync(STASH, { recursive: true });
  const restored = [];
  for (const item of toStash) {
    const dest = join(STASH, item.name);
    try {
      renameSync(item.src, dest);
      restored.push({ src: item.src, stash: dest, type: item.type, name: item.name });
    } catch (e) {
      // continue
    }
  }

  // 2. Run vite build
  let buildOk = false;
  let status = 1;
  try {
    const result = spawnSync('./node_modules/.bin/vite', ['build'], { 
      cwd: ROOT, 
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=16384', SKIP_PWA: '1' }
    });
    status = result.status ?? 1;
    buildOk = status === 0;
  } catch (e) {
    // Build failed
  } finally {
    // 3. Restore
    for (const r of restored) {
      try { renameSync(r.stash, r.src); } catch (_) { /* ignore */ }
    }

    // 4. Clean up
    try {
      if (existsSync(STASH)) {
        const remaining = readdirSync(STASH);
        if (remaining.length === 0) {
          rmdirSync(STASH);
        }
      }
    } catch (_) { /* ignore */ }
  }

  if (!buildOk) process.exit(status);
}

main();
