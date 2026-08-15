# REPO_STATE.md — Generated Source of Truth
> Generated: 2026-08-15 09:21:49 | Branch: nightly | Commit: 37
> Do not edit by hand. Regenerate with: node .opencode/harness/repo-memory.mjs

## Current State
- **Version:** 1.1.4-beta
- **Branch:** nightly
- **Last commit:** 0e4ef8b harness: auto-fix drift [plan-2026-08-15T08-50-16]
- **Total commits:** 37
- **Node engine:** >=20.0.0 <23.0.0
- **Dirty tree:** 0 modified, 0 untracked
- **LFS objects:** 13 tracked (0
0 pointer files)

## Critical Files
- [OK] AGENTS.md (7.7KB)
- [OK] README.md (20.3KB)
- [OK] RELEASE_NOTES.md (16.9KB)
- [OK] TESTING_GUIDE.md (12.9KB)
- [OK] eslint.config.js (1.4KB)
- [OK] vite.config.ts (3.3KB)
- [OK] vitest.config.ts (0.6KB)
- [OK] playwright.config.ts (0.9KB)
- [OK] tsconfig.json (0.7KB)
- [OK] .github/workflows/ci.yml (3.7KB)
- [OK] public/ocr/ocr.lock.json (3.2KB)

## Health Indicators
- **Alignment footers in docs:** FOUND (features.md) — may be stale
- **Dead cross-references:** PHASE_14B_14H_MEMORY.md, 00_LIVE_BUG_TRACKER.md, PROJECT_STATUS.md, architecture.md
- **TSD specs available:** 112 files in .artefacts/docs-internal/tsd

## Git Ignore Status
- [OK] .gitignore
- AGENTS.md whitelisted: YES
- /artifacts/ rule present: LEGACY /artifacts/

## CI Status
- **Workflow:** .github/workflows/ci.yml
- **Triggers:** push + PR on main AND nightly
- **Strict job:** setup:local (bootstrap file presence check)
- **EA_NITI_OCR_STRICT:** set in CI env

## Package Scripts
- build:wasm, build:wasm:ocr, build:lexicon, build:corpus, build:training-corpus, build:brain-kb, validate:corpus, verify:corpus, verify:ocr, fetch:corpus, unpack:corpus, pack:corpus, setup:local, predev, dev, prebuild, build, lint, preview, test, test:a11y, test:e2e:sovereign, test:e2e:sovereign-smoke, pretest:e2e:sovereign-gguf, test:e2e:sovereign-gguf, pretest:e2e:sovereign-gguf:headed, test:e2e:sovereign-gguf:headed, pretest:e2e:sovereign-gguf:chrome, test:e2e:sovereign-gguf:chrome, test:watch, test:coverage, cleanup:test-files, harness:gate, harness:gate:release, harness:memory, harness:loop, harness:autonomous, memory:context, memory:graph

## Harness
- **Gate runner:** node .opencode/harness/gate-runner.mjs
- **Repo memory:** node .opencode/harness/repo-memory.mjs
- **Graph loop:** node .opencode/harness/graph-loop.mjs

---
*This file is regenerated every graph-loop cycle. Trust runtime, not this file.*