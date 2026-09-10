#!/usr/bin/env node
/**
 * autonomous-engineer.mjs — Bespoke autonomous execution harness for EA-NITI.
 *
 * Inspired by Karpathy's autoregressive execution methodology: the engineer
 * operates as a closed loop — SPEC → PLAN → IMPLEMENT → SELF-REVIEW → GATE →
 * MERGE → NEXT — with persistent state so any session resumes where the last
 * one stopped. No human approval gates; the guardrails are structural:
 *   - All 8 CI gates must pass before any merge.
 *   - Security invariants (rules/security-invariants.json) are never violated.
 *   - No force-push, no LFS binary edits, no network without consent.
 *   - One feature branch per goal (feat/<slug>), merged with --no-ff.
 *
 * The script automates the mechanics (branches, gates, reviews, merges).
 * Implementation intelligence is provided by the operating agent, which
 * records every decision in the state file and the review log.
 *
 * Usage:
 *   node .opencode/harness/autonomous-engineer.mjs status
 *   node .opencode/harness/autonomous-engineer.mjs next
 *   node .opencode/harness/autonomous-engineer.mjs begin <goal-id>
 *   node .opencode/harness/autonomous-engineer.mjs gate [--release]
 *   node .opencode/harness/autonomous-engineer.mjs review <goal-id>
 *   node .opencode/harness/autonomous-engineer.mjs done <goal-id>
 *   node .opencode/harness/autonomous-engineer.mjs loop [--max-cycles N]
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const STATE_PATH = resolve(__dirname, 'engineer-state.json');
const PLANS_DIR = resolve(__dirname, 'plans');
const REVIEWS_DIR = resolve(__dirname, 'reviews');

const MAIN_BRANCH = 'main';
const BRANCH_PREFIX = 'feat/';

// ---------------------------------------------------------------------------
// Goal backlog — mirrors ROADMAP.md actionable stages. Statuses:
// pending | in_progress | gated (gates green, awaiting merge) | done |
// blocked (with reason) | deferred (with reason)
// ---------------------------------------------------------------------------
const INITIAL_GOALS = [
  {
    id: 'autonomous-harness',
    title: 'Bespoke autonomous engineer harness',
    branch: 'feat/autonomous-harness',
    roadmap: 'Harness (enabler)',
    status: 'pending',
    cycles: 0,
    notes: '',
  },
  {
    id: 'graph-hydration',
    title: 'GraphStore production hydration (wire scaffold to real data)',
    branch: 'feat/graph-hydration',
    roadmap: 'Stage 4 GraphRAG (early slice)',
    status: 'pending',
    cycles: 0,
    notes: '',
  },
  {
    id: 'syncmesh-ui',
    title: 'SyncMesh UI wiring (connect orphaned engine to SystemTab)',
    branch: 'feat/syncmesh-ui',
    roadmap: 'Stage 2 WebRTC P2P Sync (early slice)',
    status: 'pending',
    cycles: 0,
    notes: '',
  },
  {
    id: 'config-driven-rag',
    title: 'Config-driven RAG intelligence (chunkSize/chunkOverlap + admin UI)',
    branch: 'feat/config-driven-rag',
    roadmap: 'Stage 1.3 Config-Driven Intelligence',
    status: 'pending',
    cycles: 0,
    notes: 'maxPromptChars already DB-backed; gap is RAG chunk settings',
  },
  {
    id: 'agentchat-refactor',
    title: 'AgentChat component split (300-line rule)',
    branch: 'feat/agentchat-refactor',
    roadmap: 'Stage 1.3 Config-Driven Intelligence',
    status: 'pending',
    cycles: 0,
    notes: 'Presentational split only; DOM and data-testids must be identical',
  },
  {
    id: 'native-daemon',
    title: 'Native Rust daemon binary target',
    branch: 'feat/native-daemon',
    roadmap: 'Stage 1.3 Native Rust Daemon (Epic 9)',
    status: 'blocked',
    cycles: 0,
    notes: 'BLOCKED: src-rust/ is gitignored (separate engine repo) — no Rust edits can be committed from this repo',
  },
  {
    id: 'tauri-packaging',
    title: 'Native desktop packaging (Tauri)',
    branch: 'feat/tauri-packaging',
    roadmap: 'Stage 2 Native Desktop Packaging',
    status: 'deferred',
    cycles: 0,
    notes: 'DEFERRED: heavyweight native toolchain; revisit after Stage 1.3',
  },
];

function loadState() {
  if (!existsSync(STATE_PATH)) {
    const fresh = {
      version: 1,
      updated: new Date().toISOString(),
      currentGoal: null,
      lastGate: null,
      goals: INITIAL_GOALS,
    };
    writeFileSync(STATE_PATH, JSON.stringify(fresh, null, 2) + '\n', 'utf8');
    return fresh;
  }
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state) {
  state.updated = new Date().toISOString();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: opts.timeout ?? 600_000,
    }).trim();
  } catch (err) {
    if (opts.throwOnError) throw err;
    return null;
  }
}

function log(msg) {
  console.log(`[autonomous-engineer] ${msg}`);
}

function findGoal(state, id) {
  return state.goals.find((g) => g.id === id);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdStatus() {
  const state = loadState();
  console.log('\n  GOAL BACKLOG');
  console.log('  ' + '─'.repeat(72));
  for (const g of state.goals) {
    console.log(`  ${g.status.padEnd(12)} ${g.id.padEnd(22)} ${g.title}`);
    if (g.notes) console.log(`  ${''.padEnd(12)} ↳ ${g.notes}`);
  }
  console.log('  ' + '─'.repeat(72));
  console.log(`  current: ${state.currentGoal ?? '(none)'}`);
  console.log(`  lastGate: ${state.lastGate ? `${state.lastGate.passed ? 'PASS' : 'FAIL'} @ ${state.lastGate.at}` : '(never)'}`);
  console.log(`  updated: ${state.updated}\n`);
}

function cmdNext() {
  const state = loadState();
  const next =
    state.goals.find((g) => g.status === 'in_progress') ??
    state.goals.find((g) => g.status === 'pending');
  if (!next) {
    console.log('No actionable goals remain. Backlog is 100% delivered (or blocked/deferred).');
    return;
  }
  console.log(`${next.id} :: ${next.title} [${next.status}] → ${next.branch}`);
}

function cmdBegin(id) {
  const state = loadState();
  const goal = findGoal(state, id);
  if (!goal) throw new Error(`Unknown goal: ${id}`);
  if (goal.status === 'blocked' || goal.status === 'deferred') {
    throw new Error(`Goal ${id} is ${goal.status}: ${goal.notes}`);
  }
  const dirty = run('git status --porcelain');
  if (dirty && dirty.trim()) throw new Error('Working tree is dirty — commit or stash first.');
  const current = run('git branch --show-current');
  if (current !== goal.branch) {
    const exists = run(`git branch --list ${goal.branch}`);
    run(exists ? `git checkout ${goal.branch}` : `git checkout -b ${goal.branch}`, { throwOnError: true });
  }
  goal.status = 'in_progress';
  goal.cycles += 1;
  state.currentGoal = goal.id;
  saveState(state);
  log(`began ${goal.id} on ${goal.branch} (cycle ${goal.cycles})`);
}

async function cmdGate(release = false) {
  const { runAllGates } = await import('./gate-runner.mjs');
  const result = runAllGates({ grade: release ? 'release' : 'dev', verbose: true });
  const state = loadState();
  state.lastGate = { passed: result.passed, at: new Date().toISOString(), summary: result.summary };
  if (result.passed && state.currentGoal) {
    const goal = findGoal(state, state.currentGoal);
    if (goal && goal.status === 'in_progress') goal.status = 'gated';
  }
  saveState(state);
  process.exit(result.passed ? 0 : 1);
}

function cmdReview(id) {
  const state = loadState();
  const goal = findGoal(state, id);
  if (!goal) throw new Error(`Unknown goal: ${id}`);
  mkdirSync(REVIEWS_DIR, { recursive: true });
  const diffStat = run(`git diff --stat ${MAIN_BRANCH}...HEAD`) ?? '(no diff)';
  const invariants = JSON.parse(
    readFileSync(resolve(__dirname, 'rules/security-invariants.json'), 'utf8')
  );
  const review = [
    `# Self-Review: ${goal.id} — ${goal.title}`,
    `> Generated: ${new Date().toISOString()} | Branch: ${goal.branch}`,
    '',
    '## Verdict',
    '- [ ] SHIP (all gates green, no violations) / FIX (items below)',
    '',
    '## Security invariants',
    ...invariants.never.map((r) => `- [ ] NEVER violated: ${r}`),
    ...invariants.always.map((r) => `- [ ] ALWAYS upheld: ${r}`),
    '',
    '## Architecture',
    '- [ ] 5-layer downward-only law upheld (no React in src/lib, no upward imports)',
    '- [ ] No orphaned stubs — every function has an upstream caller or UI',
    '- [ ] No console.log — logger.ts used',
    '- [ ] Memory-sympathetic (flat buffers, bounded loops, ceiling guards)',
    '',
    '## Correctness',
    '- [ ] Harness-first regression tests added and passing',
    '- [ ] 8/8 CI gates green (see engineer-state.json lastGate)',
    '- [ ] No Backend / network calls without checkNetworkConsent()',
    '',
    '## Diff under review',
    '```',
    diffStat,
    '```',
    '',
    '## Reviewer notes',
    '(operating agent records observations, risks, and follow-ups here)',
  ].join('\n');
  const outPath = resolve(REVIEWS_DIR, `${goal.id}.md`);
  writeFileSync(outPath, review + '\n', 'utf8');
  log(`review scaffold written to ${outPath}`);
}

function cmdDone(id) {
  const state = loadState();
  const goal = findGoal(state, id);
  if (!goal) throw new Error(`Unknown goal: ${id}`);
  if (state.lastGate?.passed !== true) {
    throw new Error('Refusing to merge: last gate run did not pass. Run `gate` first.');
  }
  const dirty = run('git status --porcelain');
  const current = run('git branch --show-current');
  if (current !== goal.branch) throw new Error(`Checkout ${goal.branch} first (on ${current}).`);
  // Merge to main with --no-ff (never force-push, never rebase shared history)
  run(`git checkout ${MAIN_BRANCH}`, { throwOnError: true });
  run(`git merge --no-ff -m "feat(${goal.id}): ${goal.title}" ${goal.branch}`, { throwOnError: true });
  const push = run(`git push origin ${MAIN_BRANCH} 2>&1`);
  if (push === null) throw new Error('Push failed — leaving merge locally, will retry next cycle.');
  run(`git branch -d ${goal.branch}`);
  goal.status = 'done';
  if (state.currentGoal === goal.id) state.currentGoal = null;
  saveState(state);
  // State file itself changed (goal → done): commit it on main
  run('git add .opencode/harness/engineer-state.json');
  if (run('git status --porcelain')?.trim()) {
    run('git commit -m "chore(harness): mark goal done [${goal.id}]"'.replace('${goal.id}', goal.id));
    run(`git push origin ${MAIN_BRANCH} 2>&1`);
  }
  log(`shipped ${goal.id} → ${MAIN_BRANCH} and pushed`);
}

async function cmdLoop(maxCycles = 3) {
  for (let i = 1; i <= maxCycles; i++) {
    const state = loadState();
    const actionable = state.goals.filter(
      (g) => g.status === 'pending' || g.status === 'in_progress' || g.status === 'gated'
    );
    if (actionable.length === 0) {
      log('backlog 100% delivered (remainder blocked/deferred). Loop complete.');
      return;
    }
    const goal = actionable[0];
    log(`cycle ${i}/${maxCycles}: ${goal.id} [${goal.status}]`);
    if (goal.status === 'pending') {
      log(`next mechanical step: begin ${goal.id} (implementation needs the operating agent)`);
      return; // implementation requires intelligence — yield to operator
    }
    if (goal.status === 'in_progress') {
      log(`yield: implement ${goal.id} per .opencode/harness/plans/${goal.id}.md, then run gate`);
      return;
    }
    if (goal.status === 'gated') {
      cmdReview(goal.id);
      log(`yield: fill the self-review, then run done ${goal.id}`);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
const [cmd, arg] = process.argv.slice(2);
try {
  switch (cmd) {
    case 'status':
      cmdStatus();
      break;
    case 'next':
      cmdNext();
      break;
    case 'begin':
      if (!arg) throw new Error('Usage: begin <goal-id>');
      cmdBegin(arg);
      break;
    case 'gate':
      await cmdGate(process.argv.includes('--release'));
      break;
    case 'review':
      if (!arg) throw new Error('Usage: review <goal-id>');
      cmdReview(arg);
      break;
    case 'done':
      if (!arg) throw new Error('Usage: done <goal-id>');
      cmdDone(arg);
      break;
    case 'loop': {
      const maxFlag = process.argv.find((a) => a.startsWith('--max-cycles'));
      const max = maxFlag ? parseInt(maxFlag.split('=')[1], 10) : 3;
      await cmdLoop(max);
      break;
    }
    default:
      console.log('Usage: autonomous-engineer.mjs <status|next|begin|gate|review|done|loop> [goal-id]');
      process.exit(1);
  }
} catch (err) {
  console.error(`[autonomous-engineer] FATAL: ${err.message}`);
  process.exit(1);
}
