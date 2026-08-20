# EA-NITI Testing Guide

## Quick Start

```bash
git lfs install
git lfs pull
npm install
npm run verify:corpus
npm run dev
```

### 🛰️ One-Command Local Setup (v1.1.4-beta)

The recommended path is `npm run setup:local`, which performs
LFS pull → npm ci → bespoke LLM forge → OCR lockfile unlock →
integrity verify in a single command:

```bash
git lfs install
git clone <repo>
cd ea-niti-edge-agent
npm run setup:local   # ← one-command air-gapped bootstrap
npm run dev
```

The script is idempotent: it skips `npm ci` when `node_modules/` is
present, skips the forge step when the bespoke GGUF is already on
disk, and treats the lockfile `unlock` as a no-op when the SHAs are
already real. See the **🛰️ One-Command Local Setup** section in
`README.md` for the full pipeline and override flags.

## Prerequisites

- **Node.js 20+** (`.nvmrc` pins 22; Vite dev server deadlocks on Node 26 — use Node 22)
- **Git LFS 3.x+** — Required before clone/pull so compressed corpus assets are real files rather than LFS pointer text.
- **Modern browser with WebGPU** — Chrome 113+, Edge 113+
- **Corpus artifacts** — Required compressed runtime files are verified by `npm run verify:corpus`. Clone with Git LFS and run `git lfs pull`; release/offline bundles remain a fallback for non-Git users.
- **Compiled WASM runtime** — Included under `src/lib/wasm/pkg/`. Rust source is in `src-rust/` (not required for normal setup).

## Unit Tests

```bash
# Run all tests (Vitest, scans src/__tests__/)
npm run test

# Watch mode — re-runs on file changes
npm run test:watch

# Coverage report
npm run test:coverage
```

**Test file location:** `src/__tests__/`

**Coverage includes:**
- SemanticArena (ZOH, guardrails, POPCNT math)
- StructuralVectoriser (bitfield projection, vectoriseInto)
- LexicalParser (state machine transitions)
- StructuralSynthesizer (template synthesis)
- RAG Orchestrator (query routing, retrieval)
- NetworkGuard (SSRF validation, IPv4/IPv6 private ranges)
- CryptoVault (AES-GCM, PBKDF2, HMAC)
- AuthEngine (session management, zero-PII)
- PromptBuilder (BDAT tag replacement)
- ScorecardEngine / DDQEngine (vendor scoring)

## E2E Tests

```bash
# Run Playwright E2E suite
npx playwright test

# Run the always-on Sovereign Engine smoke gate with the committed mock GGUF fixture
npm run test:e2e:sovereign-smoke

# Backward-compatible alias for the smoke gate
npm run test:e2e:sovereign

# Run the Sovereign Engine release-signoff gate with a real local GGUF
EA_NITI_E2E_GGUF_PATH=/path/to/Qwen2.5-1.5B-Instruct-Q4_0.gguf \
EA_NITI_E2E_MODEL_ID=qwen2.5-1.5b-instruct-q4_0 \
npm run test:e2e:sovereign-gguf

# Run the same gate in visible headed Chromium
EA_NITI_E2E_GGUF_PATH=/path/to/Qwen2.5-1.5B-Instruct-Q4_0.gguf \
EA_NITI_E2E_MODEL_ID=qwen2.5-1.5b-instruct-q4_0 \
npm run test:e2e:sovereign-gguf:headed

# Run the same gate in installed Google Chrome
EA_NITI_E2E_GGUF_PATH=/path/to/Qwen2.5-1.5B-Instruct-Q4_0.gguf \
EA_NITI_E2E_MODEL_ID=qwen2.5-1.5b-instruct-q4_0 \
npm run test:e2e:sovereign-gguf:chrome

# Optional remote model-download diagnostics
EA_NITI_E2E_ALLOW_REMOTE_DOWNLOAD=1 npx playwright test src/__tests__/e2e/sovereign-engine.spec.ts

# Run with UI
npx playwright test --ui
```

E2E tests validate full user flows: authentication, persona switching, NSI workflow, RAG queries, PWA offline mode.

The default Sovereign E2E command is the smoke gate: it uses the committed mock GGUF fixture to validate local OPFS sideload registration without large model files. The real-model release-signoff gate is `npm run test:e2e:sovereign-gguf`; it preflights a developer- or CI-provided local `.gguf`, sideloads that file into OPFS, switches the Primary EA Agent to the sideloaded model, disables network, and verifies offline Sovereign Wasm inference.

## WASM Runtime

The public app uses the compiled WASM package in `src/lib/wasm/pkg/`. Do not rebuild Rust as part of normal public validation. Rust source lives in `src-rust/` and rebuilds use `npm run build:wasm`.

## CI Pipeline

Run the full verification sequence before committing:

```bash
npm run lint          # ESLint (eslint.config.js)
npm run test:a11y     # Form-control accessible-name audit
npm run verify:corpus # Runtime corpus files and SHA-256 hashes
npm run verify:ocr    # OCR lockfile + LFS asset integrity (v1.1.4-beta)
npx tsc --noEmit      # TypeScript type check
npm run test          # Vitest unit tests
npm run build         # Vite production build
npm run test:e2e:sovereign-smoke # Mock GGUF OPFS sideload smoke gate
```

All eight steps must pass with zero errors. The CI workflow
(`.github/workflows/ci.yml`) runs the same sequence with
`EA_NITI_OCR_STRICT=1` so any placeholder SHA in the OCR lockfile
trips the build. A second job (`strict`) sanity-checks that every
`setup:local` file is present.

## Manual Testing Checklist

### Authentication & Security
- [ ] First-time setup flow (zero-PII identity creation)
- [ ] Login with PBKDF2-hashed credentials
- [ ] AES-256-GCM encryption/decryption of secrets
- [ ] Airplane Mode toggle blocks all network calls
- [ ] SSRF protection rejects localhost/private IPs (IPv4 + IPv6)

### MITRA Swarm & Personas
- [ ] Create new persona (Legal, HR, SecOps, EA, custom)
- [ ] Switch persona — verify KV cache flush
- [ ] Persona-specific greeting resolution
- [ ] RAG tag filtering per persona

### NSI Workflow
- [ ] Concept stage creation
- [ ] DDQ upload and parsing (SheetJS)
- [ ] Vendor table generation
- [ ] BDAT scorecard with configurable weights
- [ ] HITL review and approval
- [ ] RAG-fueled historical context retrieval

### Sovereign Engine (WASM)
- [ ] Model sideloading via OPFS (GGUF file)
- [ ] Token streaming in inference worker
- [ ] Abort generation mid-stream
- [ ] Clear KV cache on persona switch
- [ ] Precomputed RoPE frequency table loads at init

### Epistemic Shadow
- [ ] Background distillation triggers on idle
- [ ] User prompt preempts background work
- [ ] Knowledge triplets stored in SemanticArena

### PWA & Offline
- [ ] Install as PWA
- [ ] Disconnect network — app functions fully
- [ ] Service worker caches all assets
- [ ] IndexedDB persists across sessions

## Known Test Limitations

- **No WebGPU tests in CI** — WebGPU requires actual GPU hardware; CI runners are headless. Manual testing required on WebGPU-enabled browsers.
- **No real GGUF model file in Git** — Large model files are not committed. `npm run test:e2e:sovereign-smoke` is CI-safe with mock GGUF fixtures; `npm run test:e2e:sovereign-gguf` is the real local-model release-signoff gate.
- **Sovereign Engine E2E model source** — `npm run test:e2e:sovereign-gguf` requires `EA_NITI_E2E_GGUF_PATH` and validates the local GGUF header before launching Playwright. This keeps the production gate deterministic and avoids live model downloads unless explicitly opted in.
- **WASM engine source is in `src-rust/`** — This repo validates the compiled package. Rust rebuilds are optional (`npm run build:wasm`).
- **GitHub source ZIP caveat** — Source archives do not include LFS objects by default. Use `git clone` with Git LFS, enable LFS archive inclusion in repository settings, or test against a release/offline bundle.
- **Epistemic Shadow timing** — Background distillation is idle-dependent; test results may vary based on system load.

## OCR Status

OCR is now served by the bespoke Rust/WASM runtime in `src/lib/wasm/ocr/pkg/`. Tesseract is fully removed: no `tesseract.js` dependency, no `/assets/ocr/lang-data` assets, no traineddata. The pipeline always returns best-effort text and never blocks the caller.

**v1.1.4-beta lockfile model:** `public/ocr/ocr.lock.json` declares the
detector, recognizer, vocab, grammar, runtime, and bespoke LLM assets
with explicit `path / role / required / byteLength / sha256 / license /
source / format` entries. `npm run verify:ocr` validates the
on-disk bytes against that manifest. In dev mode (`EA_NITI_OCR_STRICT`
unset) placeholder SHAs are accepted so the runtime can hydrate
against LFS pointers; the build still passes. In strict mode
(`EA_NITI_OCR_STRICT=1` — the CI default) any
`REPLACE_WITH_REAL_SHA256_*` placeholder fails the build:

```bash
EA_NITI_OCR_STRICT=1 npm run verify:ocr
# → OCR artifacts are missing or invalid:
#   - public/ocr/ocr_detector_int8.bin.gz: placeholder SHA in lock; …
#   - public/models/ea-niti-core-1.1b-q4.gguf: placeholder SHA in lock; …
#   (exit 1)
```

To re-forge the bespoke LLM entry (after a real asset is published):

```bash
node scripts/ocrArtifacts.mjs unlock  # autofills byteLength + sha256
git add public/ocr/ocr.lock.json
git commit -m "ocr(lockfile): autofill real SHAs for v1.1.4-beta"
```

The OCR runtime is gated by `OcrWasmRuntime.isLoaded()`, which
returns `true` only after the engine + at least two required bundles
(detector + recognizer) have been hydrated via the new
`OcrEngine.loadModelBundle(role, bytes)` ABI. `OcrHealthWidget` in
the Admin panel shows live hydration status.


## Current Code Alignment - 2026-05-25

- Validation snapshot: `npm run verify:corpus` passes for corpus `1.1.3-moat-2026-05-25` with `844854` records.
- TypeScript snapshot: `npx tsc --noEmit` passes.
- Lint snapshot: `npm run lint` passes.
- Accessibility snapshot: `npm run test:a11y` passes across 58 TSX files.
- Test snapshot: `npm run test` passes with `220` tests across `23` files.
- Build snapshot: `npm run build` passes; Vite emits existing chunk-size/dynamic-import warnings.
- E2E smoke snapshot: `npm run test:e2e:sovereign-smoke` passes with the committed mock GGUF fixture.
- CI expectation remains lint, a11y audit, corpus verification, TypeScript, tests, build, and Sovereign smoke E2E; local checks run in this pass are green.
- Corpus verification is now an explicit prerequisite for dev/build through `predev` and `prebuild`, so failures in missing/invalid Git LFS corpus artifacts are expected to stop local startup early.
- Public validation should not run `npm run build:wasm` as a normal requirement; Rust source is in `src-rust/` and the app repo validates the compiled package in `src/lib/wasm/pkg/`.
- E2E/model-download tests should distinguish OPFS model cache behavior from corpus artifact restoration; corpus files are build/runtime knowledge artifacts, while GGUF model files are user-consented model-cache assets.


## Code Alignment Snapshot - 2026-06-04 (Strike 4.0 / v1.1.4-beta)

- Validation snapshot: `npm run verify:corpus` passes for corpus `1.1.3-moat-2026-05-25` with `844854` records (unchanged; the corpus compiler is out of scope for the air-gap strike).
- OCR snapshot: `npm run verify:ocr` passes for OCR `1.1.4-beta` with `6 asset(s); 6 placeholder(s) in dev mode`. Strict mode (`EA_NITI_OCR_STRICT=1`) fails on every placeholder SHA, listing remediation paths (`git lfs pull`, `node scripts/ocrArtifacts.mjs unlock`, `… fetch`).
- TypeScript snapshot: `npx tsc --noEmit` passes.
- Lint snapshot: `npm run lint` passes with `--max-warnings 0`.
- Accessibility snapshot: `npm run test:a11y` passes.
- Test snapshot: `npm run test` passes with `219` tests across `23` files (+3 from Strike 4.0: 1 hydration-gate invariant, 2 dynamic-DB-migration invariants).
- Build snapshot: `npm run build` passes; the PWA precaches the OCR lockfile, corpus lockfile, and bespoke LLM provenance files.
- E2E smoke snapshot: `npm run test:e2e:sovereign-smoke` passes with the committed mock GGUF fixture.
- One-command bootstrap: `node scripts/setupLocal.mjs` is idempotent — it skips `npm ci` when `node_modules/` is present, skips the bespoke-LLM forge when the GGUF is on disk, and exits with a clear "Besoke asset already forged" message on re-run.
- Dexie schema in `src/lib/db.ts` now reaches `version(40)` with a dynamic `version(this.nextVersionAfter(40))` block that adds the `page_visual_metadata` table for VLM/OCR output persistence.
- Bespoke LLM default: `seedData.ts` seeds `sovereignModelUrl` to `/models/ea-niti-core-1.1b-q4.gguf` (Apache 2.0 base, MIT-forked). `db.ts` v22 seeds the `model_registry` with the same local path for `core-primary`.
- CI expectation is now lint → a11y → verify:corpus → verify:ocr (strict) → typecheck → unit tests → build → sovereign smoke, with a second `strict` job that sanity-checks the `setup:local` file set.


<!-- RC-DOC-ALIGNMENT-2026-05-27 -->
## RC Documentation Alignment - 2026-05-27

- EA-NITI/EANITI canonical expansion: Enterprise Agentic Network Isolated Triage & Inference.
- v1.1.3 RC lock: Strike 4.2 VRAM handoff is stable; WebGPU Bind Groups and Command Encoders are deferred to v1.2.0; v1.1.3 inference relies on the optimized Wasm SIMD CPU lane with WebGPU adapter and VRAM sharding scaffold only.
- Runtime dependency alignment: @xenova/transformers and @mlc-ai/web-llm are removed from the app runtime. OCR is served by the bespoke Rust/WASM runtime under `src/lib/wasm/ocr/pkg/` (geometric fallback + Agent Socket reranker); Tesseract and `tesseract.js` are removed. No Tesseract traineddata or manual OCR asset download is required for Strike 1 RC validation.
