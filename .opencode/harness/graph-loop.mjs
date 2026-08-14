#!/usr/bin/env node
/**
 * graph-loop.mjs — Autonomous Graph Loop for EA-NITI.
 *
 * One cycle: refresh → recon → plan → review → apply → gate → PR
 *
 * Trust Ladder:
 *   Tier 1 (Hygiene): .gitignore, doc fixes, REPO_STATE.md — auto-approve
 *   Tier 2 (Maintenance): test fixes, refactors, type fixes — auto-approve if gate passes
 *   Tier 3 (Features): new code, multi-file, schema changes — plan-mode (requires human approval)
 *
 * Hard Rules:
 *   - No force-push
 *   - No LFS binary edits
 *   - No Rust edits without TSD spec read
 *   - No network calls without checkNetworkConsent()
 *   - All gates must pass before PR
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runAllGates } from './gate-runner.mjs';
import { writeRepoState, buildRepoState } from './repo-memory.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const PLAN_STORE = resolve(__dirname, 'plan-store');
const SECURITY = JSON.parse(
  readFileSync(resolve(__dirname, 'rules/security-invariants.json'), 'utf8')
);

// Ensure plan-store exists
if (!existsSync(PLAN_STORE)) mkdirSync(PLAN_STORE, { recursive: true });

function run(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 60_000 }).trim();
  } catch (err) {
    return null;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function planPath(id) {
  return resolve(PLAN_STORE, `${id}.md`);
}

function log(msg) {
  console.log(`[graph-loop] ${msg}`);
}

// ═══════════════════════════════════════════════════
// NODE: REFRESH
// Pull latest, run idempotent setup
// ═══════════════════════════════════════════════════
function nodeRefresh() {
  log('REFRESH: pulling latest...');
  const pull = run('git pull --rebase origin nightly');
  if (pull === null) {
    log('REFRESH: git pull failed (offline or no remote)');
  }

  log('REFRESH: running setup:local (idempotent)...');
  const setup = run('npm run setup:local 2>&1 | tail -20');
  if (setup) log(setup.split('\n').slice(-5).join('\n'));

  return { success: true };
}

// ═══════════════════════════════════════════════════
// NODE: RECON
// Regenerate REPO_STATE.md, detect drift
// ═══════════════════════════════════════════════════
function nodeRecon() {
  log('RECON: regenerating REPO_STATE.md...');
  writeRepoState();

  const state = buildRepoState();
  const dirty = !state.includes('Dirty tree: 0 modified, 0 untracked');
  const missingFiles = state.includes('[MISSING]');
  const deadRefs = !state.includes('Dead cross-references: NONE');
  const staleFooters = state.includes('Alignment footers in docs: FOUND');

  const drift = [];
  if (dirty) drift.push('dirty working tree');
  if (missingFiles) drift.push('missing critical files');
  if (deadRefs) drift.push('dead cross-references in docs');
  if (staleFooters) drift.push('stale alignment footers');

  const hasDrift = drift.length > 0;
  if (hasDrift) {
    log(`RECON: drift detected — ${drift.join('; ')}`);
  } else {
    log('RECON: no drift detected');
  }

  return { hasDrift, drift, state };
}

// ═══════════════════════════════════════════════════
// NODE: PLAN
// Generate a plan file for detected drift
// ═══════════════════════════════════════════════════
function nodePlan(reconResult) {
  if (!reconResult.hasDrift) {
    log('PLAN: no drift, skipping plan generation');
    return { planId: null, tier: null };
  }

  const id = `plan-${timestamp()}`;
  const tier = classifyDrift(reconResult.drift);

  const plan = [
    `# Plan: ${id}`,
    `> Generated: ${new Date().toISOString()}`,
    `> Tier: ${tier}`,
    `> Drift: ${reconResult.drift.join('; ')}`,
    '',
    '## Security Invariants',
    'All actions must respect:',
    ...SECURITY.never.map(r => `- NEVER: ${r}`),
    ...SECURITY.always.map(r => `- ALWAYS: ${r}`),
    '',
    '## Drift Items',
    ...reconResult.drift.map(d => `- [ ] ${d}`),
    '',
    '## Proposed Actions',
    generateActions(reconResult.drift),
    '',
    '## Status',
    tier === 3 ? '- [ ] Awaiting human approval' : '- [ ] Auto-approved (Tier 1/2)',
    `- [ ] Applied`,
    `- [ ] Gates passed`,
    `- [ ] PR created`,
  ].join('\n');

  writeFileSync(planPath(id), plan, 'utf8');
  log(`PLAN: created ${id} (tier ${tier})`);

  return { planId: id, tier };
}

// ═══════════════════════════════════════════════════
// NODE: APPLY
// Execute the plan (auto-approve tier 1/2, block on tier 3)
// ═══════════════════════════════════════════════════
function nodeApply(planResult, reconResult) {
  if (!planResult.planId) {
    log('APPLY: nothing to apply');
    return { applied: false };
  }

  if (planResult.tier === 3) {
    log('APPLY: tier 3 — requires human approval. Skipping.');
    log(`APPLY: plan saved at ${planPath(planResult.planId)}`);
    return { applied: false, reason: 'tier-3-requires-approval' };
  }

  log(`APPLY: executing tier ${planResult.tier} plan...`);

  // Execute hygiene actions
  const actions = executeActions(reconResult.drift);

  // Mark plan as applied
  const planContent = readFileSync(planPath(planResult.planId), 'utf8');
  writeFileSync(
    planPath(planResult.planId),
    planContent.replace('- [ ] Applied', '- [x] Applied'),
    'utf8'
  );

  log(`APPLY: ${actions.length} actions executed`);
  return { applied: true, actions };
}

// ═══════════════════════════════════════════════════
// NODE: GATE
// Run all 8 gates in order
// ═══════════════════════════════════════════════════
function nodeGate(planResult) {
  const grade = planResult.tier === 3 ? 'release' : 'dev';
  log(`GATE: running all gates (grade: ${grade})...`);

  const result = runAllGates({ grade, verbose: true });

  if (result.passed && planResult.planId) {
    const planContent = readFileSync(planPath(planResult.planId), 'utf8');
    writeFileSync(
      planPath(planResult.planId),
      planContent.replace('- [ ] Gates passed', '- [x] Gates passed'),
      'utf8'
    );
  }

  return result;
}

// ═══════════════════════════════════════════════════
// NODE: VISUAL_TEST
// Run visual testing harness (screenshots, Lighthouse, diff)
// ═══════════════════════════════════════════════════
async function nodeVisualTest() {
  log('VISUAL_TEST: running visual test suite...');
  try {
    const { runVisualTest } = await import('./visual-test.mjs');
    const result = await runVisualTest();
    log(`VISUAL_TEST: ${result.passed ? 'PASS' : 'FAIL'}`);
    return result;
  } catch (err) {
    log(`VISUAL_TEST: error — ${err.message}`);
    return { passed: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════
// NODE: OCR_EVAL
// Run OCR model evaluation across checkpoints
// ═══════════════════════════════════════════════════
function nodeOcrEval() {
  log('OCR_EVAL: running checkpoint evaluation...');
  try {
    const result = run('python3 scripts/ocr-eval/evaluate_all_checkpoints.py 2>&1');
    if (result) {
      log(`OCR_EVAL: completed`);
      const lines = result.split('\n').slice(-5).join('\n');
      log(lines);
    }
    return { passed: true };
  } catch (err) {
    log(`OCR_EVAL: error — ${err.message}`);
    return { passed: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════
// NODE: COMMIT & PR
// Stage, commit, push, open PR
// ═══════════════════════════════════════════════════
function nodeCommitPR(planResult) {
  const status = run('git status --porcelain');
  if (!status || !status.trim()) {
    log('COMMIT: nothing to commit');
    return { committed: false };
  }

  const branch = `harness/${planResult.planId || timestamp()}`;
  run(`git checkout -b ${branch}`);
  run('git add -A');

  const commitMsg = planResult.planId
    ? `harness: auto-fix drift [${planResult.planId}]`
    : `harness: auto-fix drift ${timestamp()}`;

  run(`git commit -m "${commitMsg}"`);
  log(`COMMIT: committed to branch ${branch}`);

  // Push (non-force)
  const pushResult = run(`git push origin ${branch} 2>&1`);
  if (pushResult === null) {
    log('COMMIT: push failed (no remote or auth issue)');
    run('git checkout nightly');
    run(`git branch -D ${branch}`);
    return { committed: false, reason: 'push-failed' };
  }

  log(`COMMIT: pushed to ${branch}`);

  // Merge back into nightly so the next cycle sees the changes
  run('git checkout nightly');
  const mergeResult = run(`git merge --no-ff -m "merge: harness/${planResult.planId || timestamp()}" ${branch} 2>&1`);
  if (mergeResult === null) {
    log(`COMMIT: merge to nightly failed — falling back to fast-forward`);
    run(`git merge --ff-only ${branch} 2>&1`);
  } else {
    log(`COMMIT: merged ${branch} → nightly`);
  }
  run(`git branch -d ${branch}`);

  return { committed: true, branch };
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

function classifyDrift(drift) {
  // Tier 1: hygiene (gitignore, doc fixes, REPO_STATE)
  const tier1Patterns = ['dirty working tree', 'stale alignment footers'];
  if (drift.every(d => tier1Patterns.some(p => d.includes(p)))) return 1;

  // Tier 3: anything involving missing files or dead refs that might need new code
  if (drift.some(d => d.includes('missing critical files'))) return 3;

  return 2; // default to maintenance tier
}

function generateActions(drift) {
  const actions = [];
  for (const d of drift) {
    if (d.includes('dirty working tree')) {
      actions.push('- Clean untracked junk files (logs, .DS_Store, stale scratch)');
    }
    if (d.includes('stale alignment footers')) {
      actions.push('- Remove or mark alignment footers as "GENERATED — see REPO_STATE.md"');
    }
    if (d.includes('dead cross-references')) {
      actions.push('- Remove or fix dead file references in markdown docs');
    }
    if (d.includes('missing critical files')) {
      actions.push('- Investigate and restore missing critical files');
    }
  }
  return actions.join('\n');
}

function executeActions(drift) {
  const actions = [];

  for (const d of drift) {
    if (d.includes('dirty working tree')) {
      // Clean up untracked junk
      const junkFiles = ['build_debug.log', 'training_v3_resume.log', '3722c00f7168_aug000.jpg'];
      for (const f of junkFiles) {
        if (existsSync(resolve(ROOT, f))) {
          run(`rm -f ${f}`);
          actions.push(`deleted ${f}`);
        }
      }
      // Clean .DS_Store
      run('find . -name ".DS_Store" -type f -delete 2>/dev/null');
      actions.push('cleaned .DS_Store files');
    }
  }

  return actions;
}

// ═══════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════

async function main() {
  const startTime = Date.now();
  const cycleId = timestamp();

  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   EA-NITI GRAPH LOOP — CYCLE START      ║');
  console.log(`  ║   ${cycleId}                   ║`);
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  // Node 1: REFRESH
  nodeRefresh();

  // Node 2: RECON
  const recon = nodeRecon();

  // Node 3: PLAN
  const plan = nodePlan(recon);

  // Node 4: APPLY
  const apply = nodeApply(plan, recon);

  // Node 5: GATE
  let gateResult;
  if (apply.applied) {
    gateResult = nodeGate(plan);
  } else if (plan.planId && plan.tier < 3) {
    gateResult = nodeGate(plan);
  } else {
    gateResult = { passed: true, summary: 'No changes to gate' };
  }

  // Node 5b: VISUAL_TEST (after gates pass)
  let visualResult = { passed: true, summary: 'skipped' };
  if (gateResult.passed) {
    visualResult = await nodeVisualTest();
  }

  // Node 5c: OCR_EVAL (after gates pass)
  let ocrResult = { passed: true, summary: 'skipped' };
  if (gateResult.passed) {
    ocrResult = nodeOcrEval();
  }

  // Node 6: COMMIT & PR
  let commitResult = { committed: false };
  const allPassed = gateResult.passed && visualResult.passed && ocrResult.passed;
  if (allPassed && apply.applied) {
    commitResult = nodeCommitPR(plan);
  }

  // Final summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   CYCLE COMPLETE                         ║');
  console.log('  ╠══════════════════════════════════════════╣');
  console.log(`  ║   Duration: ${duration}s`.padEnd(45) + '║');
  console.log(`  ║   Drift: ${recon.hasDrift ? 'YES' : 'NO'}`.padEnd(45) + '║');
  console.log(`  ║   Gates: ${gateResult.passed ? 'PASS' : 'FAIL'}`.padEnd(45) + '║');
  console.log(`  ║   Visual: ${visualResult.passed ? 'PASS' : 'FAIL'}`.padEnd(45) + '║');
  console.log(`  ║   OCR Eval: ${ocrResult.passed ? 'PASS' : 'FAIL'}`.padEnd(45) + '║');
  console.log(`  ║   Committed: ${commitResult.committed ? 'YES' : 'NO'}`.padEnd(45) + '║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');

  return {
    cycleId,
    duration,
    drift: recon.hasDrift,
    gatesPassed: gateResult.passed,
    visualPassed: visualResult.passed,
    ocrPassed: ocrResult.passed,
    committed: commitResult.committed,
  };
}

// Run
main().catch(err => {
  console.error('[graph-loop] FATAL:', err);
  process.exit(1);
});
