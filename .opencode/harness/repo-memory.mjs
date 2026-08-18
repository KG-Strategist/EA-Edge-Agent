#!/usr/bin/env node
/**
 * repo-memory.mjs — Regenerates REPO_STATE.md from runtime truth.
 * Never trusts markdown footers or alignment claims.
 * Source of truth = gate results, git status, file system facts.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 30_000 }).trim();
  } catch {
    return '(command failed)';
  }
}

function fileExists(p) {
  return existsSync(resolve(ROOT, p));
}

function fileSize(p) {
  try {
    const s = statSync(resolve(ROOT, p));
    return `${(s.size / 1024).toFixed(1)}KB`;
  } catch {
    return 'N/A';
  }
}

/**
 * Build the REPO_STATE.md content from live facts.
 */
export function buildRepoState() {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const branch = run('git branch --show-current');
  const lastCommit = run('git log --oneline -1');
  const commitCount = run('git rev-list --count HEAD');
  const gitStatus = run('git status --porcelain');
  const untrackedCount = gitStatus ? gitStatus.split('\n').filter(l => l.startsWith('??')).length : 0;
  const modifiedCount = gitStatus ? gitStatus.split('\n').filter(l => !l.startsWith('??') && l.trim()).length : 0;
  const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));

  // Check critical files
  const criticalFiles = [
    'AGENTS.md', 'README.md', 'RELEASE_NOTES.md', 'TESTING_GUIDE.md',
    'eslint.config.js', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts',
    'tsconfig.json', '.github/workflows/ci.yml',
    'public/ocr/ocr.lock.json',
  ];

  const fileStatus = criticalFiles.map(f => ({
    path: f,
    exists: fileExists(f),
    size: fileExists(f) ? fileSize(f) : 'MISSING',
  }));

  // Check LFS
  const lfsFiles = run('git lfs ls-files 2>/dev/null | wc -l').trim();
  const lfsPointerFiles = run('git lfs ls-files 2>/dev/null | grep -c pointer || echo 0').trim();

  // Check for stale alignment footers
  const featuresMd = fileExists('features.md') ? readFileSync(resolve(ROOT, 'features.md'), 'utf8') : '';
  const hasAlignmentFooter = featuresMd.includes('Alignment -');

  // Check for dead cross-references
  const memoryMd = fileExists('memory.md') ? readFileSync(resolve(ROOT, 'memory.md'), 'utf8') : '';
  const deadRefs = ['PHASE_14B_14H_MEMORY.md', '00_LIVE_BUG_TRACKER.md', 'PROJECT_STATUS.md', 'architecture.md']
    .filter(ref => !fileExists(ref));

  // Check .artefacts/docs-internal/tsd
  const tsdDir = '.artefacts/docs-internal/tsd';
  const tsdExists = fileExists(tsdDir);
  const tsdCount = tsdExists ? run(`find ${tsdDir} -name "*.md" | wc -l`).trim() : '0';

  // Package scripts
  const scripts = Object.keys(packageJson.scripts || {}).join(', ');

  // Node engine constraint
  const nodeEngine = packageJson.engines?.node || 'not specified';

  const lines = [
    '# REPO_STATE.md — Generated Source of Truth',
    `> Generated: ${now} | Branch: ${branch} | Commit: ${commitCount}`,
    `> Do not edit by hand. Regenerate with: node .opencode/harness/repo-memory.mjs`,
    '',
    '## Current State',
    `- **Version:** ${packageJson.version}`,
    `- **Branch:** ${branch}`,
    `- **Last commit:** ${lastCommit}`,
    `- **Total commits:** ${commitCount}`,
    `- **Node engine:** ${nodeEngine}`,
    `- **Dirty tree:** ${modifiedCount} modified, ${untrackedCount} untracked`,
    `- **LFS objects:** ${lfsFiles} tracked (${lfsPointerFiles} pointer files)`,
    '',
    '## Critical Files',
    ...fileStatus.map(f => `- [${f.exists ? 'OK' : 'MISSING'}] ${f.path} (${f.size})`),
    '',
    '## Health Indicators',
    `- **Alignment footers in docs:** ${hasAlignmentFooter ? 'FOUND (features.md) — may be stale' : 'CLEAN'}`,
    `- **Dead cross-references:** ${deadRefs.length > 0 ? deadRefs.join(', ') : 'NONE'}`,
    `- **TSD specs available:** ${tsdExists ? `${tsdCount} files in ${tsdDir}` : 'NOT FOUND'}`,
    '',
    '## Git Ignore Status',
    `- [${fileExists('.gitignore') ? 'OK' : 'MISSING'}] .gitignore`,
    `- AGENTS.md whitelisted: ${fileExists('.gitignore') ? (readFileSync(resolve(ROOT, '.gitignore'), 'utf8').includes('!AGENTS.md') ? 'YES' : 'NO') : 'N/A'}`,
    `- /artifacts/ rule present: ${fileExists('.gitignore') ? (readFileSync(resolve(ROOT, '.gitignore'), 'utf8').includes('/ml-outputs/') ? 'YES (renamed to /ml-outputs/)' : 'LEGACY /artifacts/') : 'N/A'}`,
    '',
    '## CI Status',
    `- **Workflow:** .github/workflows/ci.yml`,
    `- **Triggers:** push + PR on main AND nightly`,
    `- **Strict job:** setup:local (bootstrap file presence check)`,
    `- **EA_NITI_OCR_STRICT:** set in CI env`,
    '',
    '## Package Scripts',
    `- ${scripts}`,
    '',
    '## Harness',
    `- **Gate runner:** node .opencode/harness/gate-runner.mjs`,
    `- **Repo memory:** node .opencode/harness/repo-memory.mjs`,
    `- **Graph loop:** node .opencode/harness/graph-loop.mjs`,
    '',
    '---',
    '*This file is regenerated every graph-loop cycle. Trust runtime, not this file.*',
  ];

  return lines.join('\n');
}

/**
 * Write REPO_STATE.md to the harness directory.
 */
export function writeRepoState() {
  const content = buildRepoState();
  const outPath = resolve(__dirname, 'REPO_STATE.md');
  writeFileSync(outPath, content, 'utf8');
  return outPath;
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('repo-memory.mjs')) {
  const outPath = writeRepoState();
  console.log(`REPO_STATE.md written to ${outPath}`);
}
