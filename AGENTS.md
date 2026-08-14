# EA-NITI Edge Agent — Instructions

## Setup
- **One-command bootstrap:** `npm run setup:local` (LFS pull + `npm ci` + LLM forge + OCR unlock + verify). Idempotent.
- **Node:** `>=20.0.0 <23.0.0`. CI pins Node 20 exactly — a Node 22 local env can pass tests that CI will fail.
- **Git LFS required before clone/pull.** Without it, corpus/OCR/model assets are pointer files, not real bytes.
- **Corpus gate:** `npm run verify:corpus` runs automatically in `predev`/`prebuild`.
- **OCR lockfile gate:** `npm run verify:ocr` validates `public/ocr/ocr.lock.json`. `EA_NITI_OCR_STRICT=1` rejects placeholder SHAs — mandatory for release.
- **Bespoke LLM:** Default at `public/models/ea-niti-core-1.1b-q4.gguf`. Override base with `EA_NITI_BASE_MODEL_URL=... npm run setup:local`.
- **WASM / Rust:** Rust source lives in `src-rust/`. Build with `npm run build:wasm` (engine) or `npm run build:wasm:ocr` (OCR). Pre-compiled output in `src/lib/wasm/pkg/` and `src/lib/wasm/ocr/pkg/`.
- **Read TSD specs before touching Rust or architecture.** `.artefacts/docs-internal/tsd/` has type definitions for every major subsystem. Read the relevant TSD before modifying `src-rust/src/`, WASM bindings, or core engine files. The deep dive is at `.artefacts/docs-internal/tsd/09_RUST_ENGINE_DEEP_DIVE/`.
- **Project Memory (graph).** `.memory/` contains the ODF-like node-edge graph — 40+ nodes mapping every component, file, decision, issue, spec, and model. Load context for any file: `npm run memory:context -- src/lib/aiEngine.ts`. Dump full graph: `npm run memory:graph`. Always load context before modifying unfamiliar code.

## Architecture
- **5-Layer flow (downward only):** Presentation → State → Engine → Worker → Data.
- **Engines are pure TS — NO React imports.**
- **Inference tracks:** WebGPU (browser) and Local Daemon (WebSocket) — both must be supported.
- **Database:** Dexie.js (IndexedDB). Use `useLiveQuery` for UI binding. New tables use `this.version(this.nextVersionAfter(N))` — never hardcode a version number at the extension block.
- **Semantic pipeline:** ZOH 1024-bit bitfield search with POPCNT. Check `CoreTriplet` zone (first 32 ints) first to short-circuit.

## Security (always)
- All network calls gated by `await checkNetworkConsent()` (boolean) AND `networkGuard.validateEndpointUrl()` (SSRF — throws). Both are async; `checkNetworkConsent` reads the `enableNetworkIntegrations` setting from `db.app_settings`.
- Zero-PII: pseudonymous identities only.
- XSS: `DOMPurify.sanitize()` (the `dompurify` dependency).
- DEKs exist only in RAM. Wrapping keys sealed in IndexedDB. Never persist DEKs.
- Default `sovereignModelUrl` is same-origin (`/models/ea-niti-core-1.1b-q4.gguf`). External models gated by `checkNetworkConsent()`.
- Any user prompt MUST call `epistemicShadow.interrupt()`.

## Anti-Patterns
| Never | Use Instead |
|-------|-------------|
| `console.log` | `logger.ts` |
| Direct WASM memory access | `inferenceWorker` message protocol |
| Tesseract / `tesseract.js` | `runOCR` from `src/lib/ocrEngine.ts` |
| Network call without guard | `await checkNetworkConsent()` + `validateEndpointUrl()` |
| Hardcoded `db.version(N+1)` | `this.version(this.nextVersionAfter(N))` |
| Edit `.bin.gz` SHAs by hand | `node scripts/ocrArtifacts.mjs unlock` then commit |
| `new URL(\`...${var}...\`)` + `import.meta.url` (eslint `no-restricted-syntax`) | `fetch()` with absolute paths — the rule fires only on template-literal first arg with expressions |

## Testing & CI
Full CI pipeline (run in order, all must pass with zero errors):
```
npm run lint              # eslint . --report-unused-disable-directives --max-warnings 0
npm run test:a11y         # form-control accessible-name audit
npm run verify:corpus     # corpus integrity
npm run verify:ocr        # OCR lockfile (strict in CI: EA_NITI_OCR_STRICT=1)
npx tsc --noEmit          # type check
npm run test              # vitest unit tests (src/__tests__/)
npm run build             # node scripts/buildExcludeLarge.mjs (not vite build directly)
npm run test:e2e:sovereign-smoke  # Playwright smoke gate with mock GGUF fixture
```

- **Single test:** `npx vitest run src/__tests__/some-test.test.ts` (vitest config includes only `**/*.test.ts` / `**/*.test.tsx` — **not** `.spec.ts`).
- **Release signoff (real GGUF):** `EA_NITI_E2E_GGUF_PATH=/path/to/model.gguf EA_NITI_E2E_MODEL_ID=local-model npm run test:e2e:sovereign-gguf`. The `pretest:e2e:sovereign-gguf` hook runs `scripts/checkSovereignE2eModel.mjs` first — it hard-fails before Playwright if the GGUF path isn't set/resolved.
- **Headless CI** cannot validate real WebGPU/GGUF — manual hardware validation required for UI/release-signoff features.
- **CI vs local:** CI pins Node 20 and runs unit tests with `--no-file-parallelism` (sequential). Local `npm run test` parallelizes. If a test passes locally but fails in CI, suspect ordering/state-leak between files first.
- **E2E in `src/__tests__/e2e/` only.** Playwright config sets `fullyParallel: false` + `workers: 1` — sequential by design. Don't try to parallelize via the CLI; the config forces 1 worker. Dev server auto-starts on port 3000. `outputDir` is set to `test-results/e2e/playwright` to avoid Playwright wiping our visual test reports.

## Toolchain Quirks
- **Dev server:** port 3000 (not 5173). `Cross-Origin-Embedder-Policy: require-corp` + `Cross-Origin-Opener-Policy: same-origin` set for WASM threading.
- **Build:** `npm run build` invokes `node scripts/buildExcludeLarge.mjs` — NOT `vite build`. Excludes large corpus/GGUF assets from production bundle.
- **PWA precache excludes** (workbox): `**/models/**`, `**/dataAssets/**`, `**/*.bin.gz`, `**/*.gguf`, `baseline_meta.json*`, `lexicon.json*`, `sw.js`, `workbox-*.js`, `baseline_corpus.bin.gz`. Max cache: 500MB.
- **ESLint:** flat config (`eslint.config.js`). `no-explicit-any` and `no-unsafe-function-type` are off. Ignores `dist`, `src/lib/wasm/pkg`, `src/lib/wasm/ocr/pkg`, `src-rust/pkg`.
- **TypeScript:** `noUnusedLocals`/`noUnusedParameters` on. Tests in `src/tests` and `src/__tests__` excluded from main `tsconfig.json`.
- **Vitest env is `happy-dom`** (not jsdom). Mirrors browser globals differently from the default most tutorials assume — adjust component tests accordingly.
- **Vitest alias `@` → `/src`** (only in `vitest.config.ts`, not `tsconfig.json` paths).
- **`vite-plugin-top-level-await`** is a devDependency but removed from config — conflicts with WASM during chunk assignment.
- **`pdfjs-dist`** excluded from `optimizeDeps` and resolved via legacy alias (`pdfjs-dist/legacy` → `node_modules/pdfjs-dist/legacy/build/pdf.mjs`).
- **OCR hydration gate:** `OcrWasmRuntime.isLoaded()` true only when `engine.isLoaded() && hydratedAssets.size >= 2` (detector + recognizer). Never bypass.
- **OCR never throws** to UI callers — returns best-effort text with internal error flags.

## Visual Testing & Autonomous Loop
- **Visual test suite:** `npm run test:visual` — screenshots all routes, runs Lighthouse, compares against baseline, reviews for quality issues.
- **Lighthouse audit:** `npm run test:lighthouse <url>` — standalone Lighthouse accessibility/performance/best-practices audit.
- **Autonomous loop:** `npm run harness:autonomous` — runs graph-loop every 30 minutes for 48 hours. Each cycle: refresh → recon → plan → apply → gate → visual-test → ocr-eval → commit.
- **Graph loop:** `npm run harness:loop` — single cycle of the autonomous loop.
- **Screenshots baseline:** `test-results/e2e/screenshots/` — current screenshots. `test-results/e2e/screenshots-baseline/` — baseline for diff.
- **OCR eval:** `python3 scripts/ocr-eval/evaluate_all_checkpoints.py` — evaluates OCR checkpoints against ground truth, outputs TSV to `test-results/e2e/reports/ocr-eval.tsv`.
