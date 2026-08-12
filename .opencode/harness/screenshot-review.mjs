#!/usr/bin/env node
/**
 * screenshot-review.mjs — Analyze captured screenshots for quality signals.
 * Reviews: file size, console errors. No human eyes needed.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SCREENSHOTS_DIR = resolve(ROOT, 'test-results/e2e/screenshots');
const CONSOLE_LOG = resolve(ROOT, 'test-results/e2e/console.log');

export function reviewScreenshots() {
  if (!existsSync(SCREENSHOTS_DIR)) return { status: 'no-screenshots', issues: [], reviewed: 0, passed: true, totalSize: 0, summary: { total: 0, clean: 0, critical: 0, high: 0, consoleErrors: 0 } };

  const files = readdirSync(SCREENSHOTS_DIR).filter(f => f.endsWith('.png'));
  const issues = [];
  const reviewed = [];

  for (const f of files) {
    const filePath = resolve(SCREENSHOTS_DIR, f);
    const stat = statSync(filePath);
    const fileReview = { name: f, size: stat.size, issues: [] };

    if (stat.size === 0) fileReview.issues.push({ severity: 'critical', message: 'Empty screenshot (0 bytes)' });
    if (stat.size > 0 && stat.size < 5000) fileReview.issues.push({ severity: 'high', message: `Suspiciously small (${stat.size} bytes) — may be blank page` });
    if (stat.size > 5_000_000) fileReview.issues.push({ severity: 'medium', message: `Very large (${(stat.size / 1_000_000).toFixed(1)}MB)` });

    if (fileReview.issues.length) issues.push(fileReview);
    reviewed.push(fileReview);
  }

  let consoleErrors = [];
  if (existsSync(CONSOLE_LOG)) {
    const log = readFileSync(CONSOLE_LOG, 'utf8');
    consoleErrors = log.split('\n').filter(l => l.includes('ERROR') || l.includes('error') || l.includes('FATAL')).slice(0, 20);
  }

  const criticalIssues = issues.filter(i => i.issues.some(x => x.severity === 'critical'));
  const highIssues = issues.filter(i => i.issues.some(x => x.severity === 'high'));

  return {
    status: 'reviewed', reviewed: reviewed.length,
    totalSize: reviewed.reduce((sum, r) => sum + r.size, 0),
    issues, consoleErrors,
    passed: criticalIssues.length === 0 && highIssues.length === 0,
    summary: { total: reviewed.length, clean: reviewed.length - issues.length, critical: criticalIssues.length, high: highIssues.length, consoleErrors: consoleErrors.length },
  };
}

export function formatReviewReport(review) {
  const lines = ['# Screenshot Review Report', `> ${review.reviewed} screenshots, ${(review.totalSize / 1024).toFixed(0)}KB total`, ''];
  if (review.status === 'no-screenshots') { lines.push('No screenshots found.'); return lines.join('\n'); }
  lines.push('## Summary', `- Clean: ${review.summary.clean}/${review.summary.total}`, `- Critical: ${review.summary.critical}`, `- High: ${review.summary.high}`, `- Console errors: ${review.summary.consoleErrors}`, '');
  if (review.issues.length) {
    lines.push('## Issues');
    for (const item of review.issues) { lines.push(`### ${item.name} (${(item.size / 1024).toFixed(1)}KB)`); for (const issue of item.issues) lines.push(`- [${issue.severity.toUpperCase()}] ${issue.message}`); lines.push(''); }
  }
  if (review.consoleErrors.length) { lines.push('## Console Errors'); for (const err of review.consoleErrors.slice(0, 10)) lines.push(`- ${err}`); lines.push(''); }
  lines.push(`## Verdict: ${review.passed ? 'PASS' : 'FAIL'}`);
  return lines.join('\n');
}

if (process.argv[1]?.endsWith('screenshot-review.mjs')) {
  const review = reviewScreenshots();
  console.log(formatReviewReport(review));
  process.exit(review.passed ? 0 : 1);
}
