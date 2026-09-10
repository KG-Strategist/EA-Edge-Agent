# Plan: autonomous-harness — Bespoke autonomous engineer harness

> Goal: durable Karpathy-style execution loop with zero human stop gates | Branch: `feat/autonomous-harness`

## Spec & contract ingestion
- `.opencode/harness/graph-loop.mjs` (trust ladder, 8-gate flow — superseded:
  Tier-3 human approval removed, `nightly` branch references fixed to `main`)
- `.opencode/harness/gate-runner.mjs` (8-gate order — reused as-is)
- `ROADMAP.md` actionable stages (goal backlog source)

## Blast-radius analysis
- Harness-only files (`.opencode/harness/`), plus `package.json` script line,
  plus `.gitignore` review-dir rule. Zero app code touched. No DB change.
- `engineer-state.json` is tracked (durable todos); `reviews/` ignored.
- `graph-loop.mjs` nightly→main fixes are comment/branch-name only.

## Harness-first TDD
- Manual smoke: `status` / `next` / `loop` commands executed on the branch
  (output captured in cycle log). `gate`/`done` exercised by shipping
  this very goal through them.

## Atomic implementation
- `autonomous-engineer.mjs`: state machine + branch manager + gate runner
  + self-review scaffolder + merge/push flow (fast-forward only).
- `README.md`: loop, policy, unattended runbook. `plans/*.md`: F2–F5.
- `engineer-state.json`: 7-goal backlog with blocked/deferred reasons.

## Regression proof
- Full 8-gate run on the branch, then `review` + `done` (merge --no-ff).
