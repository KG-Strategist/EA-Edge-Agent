#!/usr/bin/env node
/**
 * visual-test.mjs — Visual testing orchestrator.
 * Screenshots all routes, runs Lighthouse, compares against baseline.
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runLighthouseAudit } from './lighthouse-audit.mjs';
import { diffScreenshots } from './visual-diff.mjs';
import { reviewScreenshots, formatReviewReport } from './screenshot-review.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SCREENSHOTS_DIR = resolve(ROOT, 'test-results/e2e/screenshots');
const REPORTS_DIR = resolve(ROOT, 'test-results/e2e/reports');

const ROUTES = [
  { path: '/', name: 'home' },
  { path: '/settings', name: 'settings' },
];

const PORT = parseInt(process.env.PORT || '3000', 10);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

async function captureScreenshots() {
  if (!existsSync(SCREENSHOTS_DIR)) mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const results = [];

    for (const route of ROUTES) {
      const page = await context.newPage();
      const url = `${BASE_URL}${route.path}`;
      console.log(`  Screenshot: ${route.name} (${url})`);
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const status = response?.status() || 0;
        await page.waitForTimeout(1000);
        await page.screenshot({ path: resolve(SCREENSHOTS_DIR, `${route.name}.png`), fullPage: false });
        results.push({ route: route.name, path: route.path, status, passed: status >= 200 && status < 400 });
        console.log(`    ${status >= 200 && status < 400 ? 'PASS' : 'FAIL'} (HTTP ${status})`);
      } catch (err) {
        results.push({ route: route.name, path: route.path, status: 0, passed: false, error: err.message });
        console.log(`    FAIL: ${err.message}`);
      }
      await page.close();
    }
    return results;
  } finally {
    if (browser) await browser.close();
  }
}

export async function runVisualTest() {
  console.log('=== Visual Test Suite ===\n');

  console.log('[1/4] Capturing screenshots...');
  const captureResults = await captureScreenshots();
  const allCaptured = captureResults.every(r => r.passed);
  console.log(`  Screenshots: ${allCaptured ? 'ALL PASS' : 'FAILURES'}\n`);

  console.log('[2/4] Lighthouse audit...');
  const lighthouseUrls = ROUTES.map(r => `${BASE_URL}${r.path}`);
  const lighthouseResults = runLighthouseAudit(lighthouseUrls);
  const allLighthouse = lighthouseResults.every(r => r.passed);
  console.log(`  Lighthouse: ${allLighthouse ? 'ALL PASS' : 'FAILURES'}\n`);

  console.log('[3/4] Visual diff...');
  const diffResult = diffScreenshots();
  console.log(`  Diff status: ${diffResult.status}\n`);

  console.log('[4/4] Screenshot review...');
  const review = reviewScreenshots();
  console.log(formatReviewReport(review));
  console.log('');

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = resolve(REPORTS_DIR, `visual-test-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(), captures: captureResults, lighthouse: lighthouseResults,
    diff: diffResult, review,
    passed: allCaptured && allLighthouse && review.passed,
  }, null, 2));

  const overallPassed = allCaptured && allLighthouse && review.passed;
  console.log(`=== RESULT: ${overallPassed ? 'PASS' : 'FAIL'} ===`);
  console.log(`Report: ${reportPath}`);
  return { passed: overallPassed, captures: captureResults, lighthouse: lighthouseResults, diff: diffResult, review };
}

if (process.argv[1]?.endsWith('visual-test.mjs')) {
  runVisualTest().then(r => process.exit(r.passed ? 0 : 1)).catch(err => { console.error(err); process.exit(1); });
}
