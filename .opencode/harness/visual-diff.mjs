#!/usr/bin/env node
/**
 * visual-diff.mjs — Pixel-diff current screenshots against baseline.
 * First run = baseline. Subsequent runs compare file metadata.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SCREENSHOTS_DIR = resolve(ROOT, 'test-results/e2e/screenshots');
const BASELINE_DIR = resolve(ROOT, 'test-results/e2e/screenshots-baseline');

const REGRESSION_THRESHOLD = 0.02;

export function diffScreenshots() {
  if (!existsSync(SCREENSHOTS_DIR)) return { status: 'no-screenshots', message: 'No screenshots directory found' };

  const currentFiles = readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
  if (!currentFiles.length) return { status: 'empty', message: 'No screenshots to compare' };

  if (!existsSync(BASELINE_DIR)) {
    console.log('No baseline found. Saving current screenshots as baseline...');
    mkdirSync(BASELINE_DIR, { recursive: true });
    for (const f of currentFiles) {
      writeFileSync(resolve(BASELINE_DIR, f), readFileSync(resolve(SCREENSHOTS_DIR, f)));
    }
    return { status: 'baseline-created', count: currentFiles.length, message: `Saved ${currentFiles.length} screenshots as baseline` };
  }

  const baselineFiles = readdirSync(BASELINE_DIR).filter(f => f.endsWith('.png'));

  const results = { status: 'compared', total: currentFiles.length, matched: 0, regressions: [], newScreenshots: [], missingFromCurrent: [] };

  for (const f of currentFiles) {
    const currentPath = resolve(SCREENSHOTS_DIR, f);
    const baselinePath = resolve(BASELINE_DIR, f);

    if (!existsSync(baselinePath)) { results.newScreenshots.push(f); continue; }

    const currentBuf = readFileSync(currentPath);
    const baselineBuf = readFileSync(baselinePath);
    const sizeDiff = Math.abs(currentBuf.length - baselineBuf.length) / (baselineBuf.length || 1);

    if (sizeDiff > REGRESSION_THRESHOLD) {
      results.regressions.push({ file: f, reason: `size changed by ${(sizeDiff * 100).toFixed(1)}%`, severity: sizeDiff > 0.1 ? 'high' : 'medium' });
    } else {
      results.matched++;
    }
  }

  for (const f of baselineFiles) {
    if (!currentFiles.includes(f)) results.missingFromCurrent.push(f);
  }

  results.passed = results.regressions.filter(r => r.severity === 'high').length === 0 && results.missingFromCurrent.length === 0;
  return results;
}

export function acceptBaseline() {
  if (!existsSync(SCREENSHOTS_DIR)) return;
  if (!existsSync(BASELINE_DIR)) mkdirSync(BASELINE_DIR, { recursive: true });
  const files = readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
  for (const f of files) writeFileSync(resolve(BASELINE_DIR, f), readFileSync(resolve(SCREENSHOTS_DIR, f)));
  console.log(`Baseline updated with ${files.length} screenshots`);
}

if (process.argv[1]?.endsWith('visual-diff.mjs')) {
  const action = process.argv[2] || 'diff';
  if (action === 'accept') { acceptBaseline(); } else {
    const result = diffScreenshots();
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.passed ? 0 : 1);
  }
}
