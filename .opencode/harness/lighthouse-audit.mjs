#!/usr/bin/env node
/**
 * lighthouse-audit.mjs — Run Lighthouse against a page URL.
 * Extracts accessibility, performance, best-practices scores.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const RESULTS_DIR = resolve(ROOT, 'test-results/e2e/lighthouse');

const DEFAULT_THRESHOLDS = {
  accessibility: 85,
  performance: 50,
  'best-practices': 80,
};

export function runLighthouse(url, { port = 3000, thresholds = DEFAULT_THRESHOLDS } = {}) {
  const fullUrl = url.startsWith('http') ? url : `http://localhost:${port}${url}`;
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const slug = fullUrl.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60);
  const jsonPath = resolve(RESULTS_DIR, `${slug}.json`);

  try {
    execSync(
      `npx lighthouse "${fullUrl}" --output=json --output-path="${jsonPath}" --chrome-flags="--headless --no-sandbox --disable-gpu" --only-categories=accessibility,performance,best-practices 2>&1`,
      { cwd: ROOT, timeout: 90_000, encoding: 'utf8' }
    );

    if (!existsSync(jsonPath)) {
      return { url: fullUrl, error: 'Lighthouse did not produce output', passed: false, scores: {}, failures: ['no output'] };
    }

    const report = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const scores = {};
    for (const [key, cat] of Object.entries(report.categories || {})) {
      scores[key] = Math.round((cat.score || 0) * 100);
    }

    const results = { url: fullUrl, scores, thresholds, passed: true, failures: [] };
    for (const [metric, threshold] of Object.entries(thresholds)) {
      const score = scores[metric] || 0;
      if (score < threshold) {
        results.passed = false;
        results.failures.push(`${metric}: ${score} < ${threshold}`);
      }
    }
    return results;
  } catch (err) {
    return { url: fullUrl, error: (err.stderr || err.message || '').slice(0, 500), passed: false, scores: {}, failures: ['lighthouse execution failed'] };
  }
}

export function runLighthouseAudit(urls, options = {}) {
  const results = [];
  for (const url of urls) {
    console.log(`  Lighthouse: ${url}`);
    const result = runLighthouse(url, options);
    results.push(result);
    const status = result.passed ? 'PASS' : 'FAIL';
    const scoreStr = Object.entries(result.scores || {}).map(([k, v]) => `${k}:${v}`).join(' ');
    console.log(`    ${status} ${scoreStr}`);
    if (result.failures?.length) for (const f of result.failures) console.log(`    FAIL: ${f}`);
  }
  return results;
}

if (process.argv[1]?.endsWith('lighthouse-audit.mjs')) {
  const urls = process.argv.slice(2);
  if (!urls.length) { console.log('Usage: node lighthouse-audit.mjs <url1> [url2] ...'); process.exit(1); }
  const results = runLighthouseAudit(urls);
  process.exit(results.every(r => r.passed) ? 0 : 1);
}
