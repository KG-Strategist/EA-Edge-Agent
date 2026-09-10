# Autonomous Engineer Harness

Bespoke autonomous execution harness for EA-NITI, inspired by Karpathy's
autoregressive execution methodology: the engineer operates as a closed loop
with persistent state, so any session resumes where the last one stopped.

## The loop

```
SPEC (TSD + ROADMAP + MINDMAP)
  → PLAN (.opencode/harness/plans/<goal>.md)
  → BRANCH (feat/<slug>)
  → IMPLEMENT (harness-first TDD: failing test, then fix)
  → SELF-REVIEW (.opencode/harness/reviews/<goal>.md)
  → GATE (8/8 CI gates, sequential, Node 22)
  → MERGE (--no-ff to main, push, delete branch)
  → NEXT (until backlog is 100% delivered)
```

## No-stop-gate policy

There are no human-approval gates. The guardrails are structural instead:

- 8/8 gates must pass before any merge (`done` refuses otherwise).
- `rules/security-invariants.json` is never violated (no force-push, no LFS
  edits, no network without consent, no React in engines, logger only).
- One feature branch per goal; shared history is never rewritten.

## Operator commands

```
node .opencode/harness/autonomous-engineer.mjs status
node .opencode/harness/autonomous-engineer.mjs next
node .opencode/harness/autonomous-engineer.mjs begin <goal-id>
node .opencode/harness/autonomous-engineer.mjs gate [--release]
node .opencode/harness/autonomous-engineer.mjs review <goal-id>
node .opencode/harness/autonomous-engineer.mjs done <goal-id>
node .opencode/harness/autonomous-engineer.mjs loop [--max-cycles N]
```

`npm run harness:engineer -- <command>` is a shorthand (passes args through).

## State and resume

- `engineer-state.json` (tracked) is the durable todo list: goal statuses,
  current goal, last gate result. `status`/`loop` read it; every command
  rewrites it with a fresh timestamp.
- Feature plans live in `plans/<goal-id>.md`. Self-reviews land in
  `reviews/<goal-id>.md` (gitignored — working notes, not artifacts).
- The operating agent mirrors progress in its session todos every cycle.

## Running unattended (7-day mode)

The harness mechanics are deterministic and idempotent. To keep the loop
turning without a human present, run the driver on an interval:

```bash
# every 30 minutes (macOS launchd example interval: 1800)
cd /path/to/ea-niti-edge-agent
export PATH="/opt/homebrew/Cellar/node@22/22.23.2/bin:$PATH"
node .opencode/harness/autonomous-engineer.mjs loop --max-cycles=1
```

```bash
# or plain nohup (single sweep per invocation; re-run via cron)
nohup bash -c 'while true; do
  node .opencode/harness/autonomous-engineer.mjs loop --max-cycles=1 >> /tmp/ea-niti-harness.log 2>&1
  sleep 1800
done' >/dev/null 2>&1 &
```

Rules for unattended operation: bounded `--max-cycles`, never merge on red
gates (the `done` command enforces this), push only fast-forward merges.

## Goal backlog

The backlog mirrors ROADMAP.md actionable stages. `native-daemon` is
blocked (src-rust/ is gitignored — a separate engine repo, so no Rust edits
can ship from here). `tauri-packaging` is deferred (native toolchain).
Everything else loops until `status` reports 100% delivered.
