# EA-NITI Testing Guide

## Quick Start

```bash
git lfs install
git lfs pull
npm install
npm run verify:corpus
npm run dev
```

## Prerequisites

- **Node.js 18+** — Runtime for Vite dev server and build tooling
- **Git LFS 3.x+** — Required before clone/pull so compressed corpus assets are real files rather than LFS pointer text.
- **Modern browser with WebGPU** — Chrome 113+, Edge 113+
- **Corpus artifacts** — Required compressed runtime files are verified by `npm run verify:corpus`. Clone with Git LFS and run `git lfs pull`; release/offline bundles remain a fallback for non-Git users.
- **Compiled WASM runtime** — Included under `src/lib/wasm/pkg/`. Rust source is maintained in a separate engine repository and is not part of normal public setup.

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

# Run the Sovereign Engine production gate with a real local GGUF
EA_NITI_E2E_GGUF_PATH=/path/to/Qwen2.5-1.5B-Instruct-Q4_0.gguf \
EA_NITI_E2E_MODEL_ID=qwen2.5-1.5b-instruct-q4_0 \
npm run test:e2e:sovereign

# Run the same gate in visible headed Chromium
EA_NITI_E2E_GGUF_PATH=/path/to/Qwen2.5-1.5B-Instruct-Q4_0.gguf \
EA_NITI_E2E_MODEL_ID=qwen2.5-1.5b-instruct-q4_0 \
npm run test:e2e:sovereign:headed

# Run the same gate in installed Google Chrome
EA_NITI_E2E_GGUF_PATH=/path/to/Qwen2.5-1.5B-Instruct-Q4_0.gguf \
EA_NITI_E2E_MODEL_ID=qwen2.5-1.5b-instruct-q4_0 \
npm run test:e2e:sovereign:chrome

# Optional remote model-download diagnostics
EA_NITI_E2E_ALLOW_REMOTE_DOWNLOAD=1 npx playwright test src/__tests__/e2e/sovereign-engine.spec.ts

# Run with UI
npx playwright test --ui
```

E2E tests validate full user flows: authentication, persona switching, NSI workflow, RAG queries, PWA offline mode.

The Sovereign Engine production gate does not download from Hugging Face by default. It preflights a developer- or CI-provided local `.gguf`, sideloads that file through the app UI into OPFS, switches the Primary EA Agent to the sideloaded model, disables network, and verifies offline Sovereign Wasm inference.

## WASM Runtime

The public app uses the compiled WASM package in `src/lib/wasm/pkg/`. Do not rebuild Rust as part of normal public validation. Rebuilds happen in the separate Rust engine repository, then the compiled package is copied back into this app repo.

## CI Pipeline

Run the full verification sequence before committing:

```bash
npm run lint          # ESLint (eslint.config.js)
npm run verify:corpus # Runtime corpus files and SHA-256 hashes
npx tsc --noEmit      # TypeScript type check
npm run test          # Vitest unit tests
npm run build         # Vite production build
```

All four steps must pass with zero errors.

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
- **No GGUF model file for E2E inference tests** — The TinyLlama 1.1B Q4_0 model (~600MB) is not committed to the repository. E2E inference tests require manual model sideloading.
- **Sovereign Engine E2E model source** — `npm run test:e2e:sovereign` requires `EA_NITI_E2E_GGUF_PATH` and validates the local GGUF header before launching Playwright. This keeps the production gate deterministic and avoids live model downloads unless explicitly opted in.
- **WASM engine source is separate** — This repo validates the compiled package. It does not compile Rust source in public CI.
- **GitHub source ZIP caveat** — Source archives do not include LFS objects by default. Use `git clone` with Git LFS, enable LFS archive inclusion in repository settings, or test against a release/offline bundle.
- **Epistemic Shadow timing** — Background distillation is idle-dependent; test results may vary based on system load.

## OCR Assets (Air-Gap Requirement)

Tesseract.js is configured for **local-only** operation. The engine will NOT reach the unpkg CDN.

**Required:** Place the following files in `public/assets/ocr/`:

| File | Source |
|------|--------|
| `worker.min.js` | `node_modules/tesseract.js/dist/worker.min.js` |
| `tesseract-core.wasm.js` | `node_modules/tesseract.js-core/tesseract-core.wasm.js` |
| `lang-data/eng.traineddata` | Download from [Tesseract tessdata](https://github.com/tesseract-ocr/tessdata) |

Vite serves the `public/` directory at the root `/`, so the engine loads from `/assets/ocr/...`.


## Current Code Alignment - 2026-05-25

- Validation snapshot: `npm run verify:corpus` passes for corpus `1.1.3-moat-2026-05-25` with `844854` records.
- TypeScript snapshot: `npx tsc --noEmit` passes.
- Lint snapshot: `npm run lint` passes.
- Test snapshot: `npm run test` passes with `175` tests across `16` files.
- CI expectation remains lint, corpus verification, TypeScript, tests, and build; all local checks in this pass are green.
- Corpus verification is now an explicit prerequisite for dev/build through `predev` and `prebuild`, so failures in missing/invalid Git LFS corpus artifacts are expected to stop local startup early.
- Public validation should not run `npm run build:wasm` as a normal requirement; Rust source is separate and the app repo validates the compiled package in `src/lib/wasm/pkg/`.
- E2E/model-download tests should distinguish OPFS model cache behavior from corpus artifact restoration; corpus files are build/runtime knowledge artifacts, while GGUF model files are user-consented model-cache assets.


<!-- RC-DOC-ALIGNMENT-2026-05-27 -->
## RC Documentation Alignment - 2026-05-27

- EA-NITI/EANITI canonical expansion: Enterprise Agentic Network Isolated Triage & Inference.
- v1.1.3 RC lock: Strike 4.2 VRAM handoff is stable; WebGPU Bind Groups and Command Encoders are deferred to v1.2.0; v1.1.3 inference relies on the optimized Wasm SIMD CPU lane with WebGPU adapter and VRAM sharding scaffold only.
- Runtime dependency alignment: @xenova/transformers and @mlc-ai/web-llm are removed from the app runtime; tesseract.js CDN usage is removed/localized through /assets/ocr/ assets while the local package remains for OCR worker integration.
