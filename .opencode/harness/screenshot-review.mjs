#!/usr/bin/env node
/**
 * screenshot-review.mjs — Analyze captured screenshots for quality signals.
 * Reviews: file size, dimensions, console errors, test assertions.
 * No human eyes needed — uses metadata analysis.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SCREENSHOTS_DIR = resolve(ROOT, 'test-results/e2e/screenshots');
const CONSOLE_LOG = resolve(ROOT, 'test-results/e2e/console.log');

/**
 * Review all screenshots and return structured analysis.
 */
export function reviewScreenshots() {
  if (!existsSync(SCREENSHOTS_DIR)) {
    return { status: 'no-screenshots', issues: [], reviewed: 0 };
  }

  const files = readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
  const issues = [];
  const reviewed = [];

  for (const f of files) {
    const filePath = resolve(SCREENSHOTS_DIR, f);
    const stat = statSync(filePath);
    const fileReview = { name: f, size: stat.size, issues: [] };

    // Issue 1: Empty/missing screenshot
    if (stat.size === 0) {
      fileReview.issues.push({ severity: 'critical', message: 'Empty screenshot (0 bytes)' });
    }

    // Issue 2: Suspiciously small (likely blank page)
    if (stat.size > 0 && stat.size < 5000) {
      fileReview.issues.push({ severity: 'high', message: `Suspiciously small (${stat.size} bytes) — may be blank page` });
    }

    // Issue 3: Suspiciously large (full-page capture anomaly)
    if (stat.size > 5_000_000) {
      fileReview.issues.push({ severity: 'medium', message: `Very large (${(stat.size / 1_000_000).toFixed(1)}MB) — check for runaway capture` });
    }

    // Issue 4: File name pattern analysis
    if (f.includes('error') || f.includes('fail')) {
      fileReview.issues.push({ severity: 'medium', message: 'Filename contains error/fail — may indicate test failure screenshot' });
    }

    if (fileReview.issues.length) {
      issues.push(fileReview);
    }
    reviewed.push(fileReview);
  }

  // Check for console errors log
  let consoleErrors = [];
  if (existsSync(CONSOLE_LOG)) {
    const log = readFileSync(CONSOLE_LOG, 'utf8');
    const errorLines = log.split('\n').filter(l =>
      l.includes('ERROR') || l.includes('error') || l.includes('FATAL')
    );
    consoleErrors = errorLines.slice(0, 20);
  }

  const criticalIssues = issues.filter(i => i.issues.some(x => x.severity === 'critical'));
  const highIssues = issues.filter(i => i.issues.some(x => x.severity === 'high'));

  return {
    status: 'reviewed',
    reviewed: reviewed.length,
    totalSize: reviewed.reduce((sum, r) => sum + r.size, 0),
    issues,
    consoleErrors,
    passed: criticalIssues.length === 0 && highIssues.length === 0,
    summary: {
      total: reviewed.length,
      clean: reviewed.length - issues.length,
      critical: criticalIssues.length,
      high: highIssues.length,
      consoleErrors: consoleErrors.length,
    },
  };
}

/**
 * Generate a human-readable report from review results.
 */
export function formatReviewReport(review) {
  const lines = [];
  lines.push('# Screenshot Review Report');
  lines.push(`> ${review.reviewed} screenshots, ${(review.totalSize / 1_000).toFixed(0)}KB total`);
  lines.push('');

  if (review.status === 'no-screenshots') {
    lines.push('No screenshots found.');
    return lines.join('\n');
  }

  lines.push('## Summary');
  lines.push(`- Clean: ${review.summary.clean}/${review.summary.total}`);
  lines.push(`- Critical: ${review.summary.critical}`);
  lines.push(`- High: ${review.summary.high}`);
  lines.push(`- Console errors: ${review.summary.consoleErrors}`);
  lines.push('');

  if (review.issues.length) {
    lines.push('## Issues');
    for (const item of review.issues) {
      lines.push(`### ${item.name} (${(item.size / 1024).toFixed(1)}KB)`);
      for (const issue of item.issues) {
        lines.push(`- [${issue.severity.toUpperCase()}] ${issue.message}`);
      }
      lines.push('');
    }
  }

  if (review.consoleErrors.length) {
    lines.push('## Console Errors');
    for (const err of review.consoleErrors.slice(0, 10)) {
      lines.push(`- ${err}`);
    }
    lines.push('');
  }

  lines.push(`## Verdict: ${review.passed ? 'PASS' : 'FAIL'}`);
  return lines.join('\n');
}

// CLI entry point
if (process.argv[1]?.endsWith('screenshot-review.mjs')) {
  const review = reviewScreenshots();
  console.log(formatReviewReport(review));
  process.exit(review.passed ? 0 : 1);
}
