# EA-NITI Release Notes

## v1.1.4-beta — Strike 4.0 (Air-Gap Locked)
*June 2026*

The Day-Zero Air-Gap Release: a fresh clone is now air-gapped after a single
command. The bespoke OCR runtime + a permissive-license EA-NITI-Core LLM
are forged and validated in one shot. No HuggingFace download is required
at runtime.

### 🛰️ One-Command Bootstrap
- **`npm run setup:local`** — single command that performs `git lfs install`
  + `git lfs pull` (corpus + OCR + LLM) → `npm ci` →
  `scripts/forge_bespoke_model.mjs` → `scripts/ocrArtifacts.mjs unlock` →
  `verify:corpus` → `verify:ocr`. The script is idempotent and re-runnable.
- **Bespoke LLM Forge** — `scripts/forge_bespoke_model.mjs` downloads the
  permissive `TinyLlama-1.1B-Chat-v1.0-GGUF` (Apache 2.0), validates the
  `GGUF` magic, and renames it to
  `public/models/ea-niti-core-1.1b-q4.gguf` with a sidecar
  `ea-niti-core-1.1b-q4.meta.json` provenance file. Override the base
  model with `EA_NITI_BASE_MODEL_URL=…`.
- **Lockfile Unlock** — `node scripts/ocrArtifacts.mjs unlock` autofills
  the real `byteLength` + `sha256` for every entry in
  `public/ocr/ocr.lock.json` once the LFS pointers are hydrated.

### 🔒 Strict OCR Lockfile
- **`public/ocr/ocr.lock.json`** now declares the full asset table
  (detector, recognizer, vocab, grammar, runtime, bespoke LLM) with
  `path / role / required / byteLength / sha256 / license / source /
  format`. **`public/ocr/ocr_manifest.json`** carries per-tensor shape,
  scale, zero_point, and runtime metadata.
- **`EA_NITI_OCR_STRICT=1`** turns the verifier into a release-grade
  gate: any `REPLACE_WITH_REAL_SHA256_*` placeholder fails the build.
  CI sets the env var unconditionally; the dev mode stays lenient so
  contributors can iterate against pointer files.

### 🧬 OCR Hydration ABI
- **`OcrEngine.loadModelBundle(role, bytes)`** — new WASM export that
  zero-copy blits the detector/recognizer bytes into the Rust linear
  memory and tags them by role. The TypeScript runtime fetches the
  LFS-managed bundles from `/ocr/...` and `/models/...` and calls
  this ABI on engine init.
- **`OcrWasmRuntime.isLoaded()`** now requires
  `engine.isLoaded() && hydratedAssets.size >= 2` — a real engine
  without its model bundles is no longer "ready".

### 🗄️ Dynamic DB Migration
- **`EADatabase.nextVersionAfter(MAX)`** — a private helper that
  introspects the schema source for the highest declared
  `this.version(N)` literal and returns `N+1`. The
  `page_visual_metadata` table (VLM/OCR output persistence) is added
  via `this.version(this.nextVersionAfter(40))` so future strikes
  cannot drift the version literal.

### 🤖 Default Local LLM
- **`seedData.ts`** now seeds `sovereignModelUrl` to
  `/models/ea-niti-core-1.1b-q4.gguf` for fresh installs. Existing
  users keep their custom configuration.
- **`db.ts` v22 `model_registry` PRIMARY** entry now points to
  the same local path and is flagged `isLocalhost: true,
  engineType: 'Bespoke Forge — Air-Gapped Local'`.

### 📜 Compliance Provenance
- **`NOTICE.txt`** (root), **`public/ocr/NOTICE.txt`**, and
  **`public/models/NOTICE.txt`** record Apache 2.0 / MIT lineage for
  every bundled artefact plus the **ECCN 5D992.c** open-source
  export-control exemption.

### 🛠️ Tooling & CI
- **`.github/workflows/ci.yml`** rewritten to run the full v1.1.4-beta
  pipeline: `lfs install` + `lfs pull` → lint → a11y → verify:corpus →
  verify:ocr (strict) → typecheck → unit tests → build → sovereign
  smoke. A second `strict` job sanity-checks the `setup:local` file
  set.
- **`package.json`** version bumped to `1.1.4-beta`.
- **`index.html`** `<title>` and `<meta description>` updated to
  advertise the Strike 4.0 air-gap story.

### ✅ Quality Gates
- `219` unit tests across `23` files pass (+3 from this strike: 1
  hydration-gate invariant, 2 dynamic-DB-migration invariants).
- ESLint passes with `--max-warnings 0`.
- TypeScript passes with `tsc --noEmit`.
- Vite PWA precache 13,529 KiB / 135 entries.

---

## v1.1.3 Hardening (Performance Audit & Security Hardening)
*May 2026*

### Track 1: Performance Hot-Path Optimization
- **Precomputed RoPE Frequency Table:** 786K+ trig calls eliminated per forward pass — pure multiply-add from precomputed cos/sin tables at model init.
- **SIMD Element-Wise Multiply:** 4-wide `f32x4_mul` for SwiGLU gate fusion — 4× throughput over scalar loop.
- **Guardrail Index:** O(G) instead of O(600K) for guardrail checks — iterates only active guardrail indices.
- **Popcnt Lookup Table:** 256-entry table replaces 5-op software popcnt — 4 lookups vs 5 bitwise ops per call.
- **Zero-RegExp exactWordMatch:** Pure string ops replace `new RegExp()` allocation — zero allocations in search hot path.
- **Pre-allocated Vector Buffer:** `vectoriseInto(query, outBuffer)` eliminates `new Uint32Array(64)` per call.
- **Bitwise Division:** `>>> 5`/`& 31` replace `Math.floor/32` and `% 32` in setBit hot path.
- **Array+Join Token Streaming:** O(T) `tokenChunks.push()` + `.join('')` replaces O(T²) string concatenation.
- **Precomputed DDQ Map:** Module-level `QUESTION_MAP` eliminates Map rebuild per `parseDDQResponse()` call.
- **Deprecated substr → slice:** Modern string API across threat engine.

### Track 2: Zero-Trust Security Hardening
- **Plaintext apiKey Schema Removal:** `AIModelRecord.apiKey` and `NetworkIntegration.apiKey` purged from Dexie schema. All paths use `encryptedApiKey`. Legacy migration clears remaining plaintext keys.
- **IPv6 Private Range Blocking:** `isPrivateIPv6()` blocks `fc00::/7`, `fe80::/10`, IPv4-mapped private ranges, and multicast addresses.
- **Redirect-Following Protection:** `redirect: 'error'` on all external fetch calls to prevent open-redirect SSRF.

### Track 3: Internal SDK Extension
- **Plugin Lifecycle Hook System:** `PluginHookRegistry` for extensible plugin architecture with before/after/around hooks.
- **Bitfield Projection Utilities SDK:** `bitfieldSDK.ts` exposes ZOH bitfield operations for plugin consumption.

### Track 4: Infrastructure & Worker Optimization
- **queueMicrotask Yield Chain:** Microtask chain with periodic `setTimeout` every 10 tokens — lower latency, prevents UI starvation.
- **Streaming Token API:** `prefill_prompt()`, `generate_next_token()`, `decode_single_token()` replace monolithic `generate_tokens()` loop.

---

## v1.1.3 Release Candidate Lock
*May 2026*

### 🧠 MITRA Logical Swarm
- **Multi-Persona Agents:** Configure domain-specific personas (Legal, HR, SecOps, EA) on a single model instance. Each persona carries its own system prompt, RAG tag filters, and identity — no VRAM duplication.
- **KV Cache Isolation:** Automatic cache flush on persona switch ensures clean context separation across all inference engines.
- **Context-Aware Greetings:** Greeting resolution by persona identity (Stage > Workflow > Global) — not domain heuristics.

### 🔄 NSI State Machine & RAG Integration
- **5-Stage Vendor Pipeline:** Complete orchestration from Concept → DDQ → Vendors → HITL Review → Complete with persistent session state.
- **BDAT Weighted Scorecard:** Vendor scoring across Business/Data/Application/Technology axes with configurable weights and pass/fail indicators.
- **Dynamic Prompt Engine:** Zero hardcoded prompts — all templates fetched from IndexedDB at runtime with live admin editing.
- **Full RAG Loop:** Embeddings stored on review completion, similar review retrieval for cross-session contextual memory.

### ⚡ Epistemic Shadow & Preemption
- **Background Distillation:** Automatic knowledge extraction from every AI interaction during idle processing. User prompts always take priority — background work is preempted instantly.
- **WebGPU Preemption:** Full generation lifecycle control — abort mid-stream, clear KV cache, reset sessions without disconnecting.
- **Zoned Orthogonal Hashing:** 1024-bit bitwise projection engine with <1ms search across 600k+ records using hardware-level POPCNT math.

### 🌐 Universal Edge-AI OS
- **Universal Persona Pivot:** Dynamic domain agent configuration for any enterprise workflow — not limited to architecture reviews.
- **Autonomous Semantic Router:** Telemetry-based routing between WebGPU and external model providers for optimal inference path selection.
- **Durable Local Telemetry:** Routing, metric, and trace telemetry is persisted to `local_telemetry_vault` with prompt, content, vector, and PII fields stripped.
- **Agent Socket Protocol:** High-performance WebSocket communication between browser agent and native OS daemon — sub-millisecond token streaming with abort signals.
- **Message Array Engine:** All inference engines now accept standard `[{role, content}]` message arrays for tokenizer safety and chat template compatibility.

### 🛡️ Security & Performance
- AES-256-GCM encryption for all vendor blobs and DDQ files at rest.
- DOMPurify sanitization on all markdown and diagram render paths.
- Pre-compiled binary corpus: 90% boot time reduction via direct binary blitting.
- Dexie v40 schema migration with legacy data compatibility and bounded encrypted chat-message pagination.

### Strike 1 RC Closure
- **Sovereign E2E split:** `test:e2e:sovereign-smoke` always validates mock GGUF OPFS sideloading; `test:e2e:sovereign-gguf` is the env-gated real-model release-signoff path.
- **OPFS Model Library UX:** Sideloading now describes a single local `.gguf` file copied into OPFS, with stale folder/cache wording removed from the primary flow.
- **Chat memory pagination:** Encrypted chat retrieval now uses Dexie v40 compound indexes and bounded 80-message windows, with system prompts loaded separately for inference context.
- **Accessibility audit:** `npm run test:a11y` enforces programmatic labels for visible form controls across TSX files.

---

## v1.1.1 (Production Release)
*March 2024*

### 🚀 Sovereign Engine Upgrade
- **Zoned Orthogonal Hashing (ZOH):** Replaced legacy semantic search with a bespoke 1024-bit bitwise projection engine.
- **Deterministic 7-Zone Grammar:** Queries are now mapped into discrete zones (Core, Tense, Voice, Intent, Entity, Relation, Sentiment).
- **Core-First Short-Circuiting:** Optimized search throughput to <1ms for 600k+ records using 128-bit core intersection checks.

### 🛡️ Pre-Flight Security
- **Deterministic Guardrails:** Implemented a bitwise policy interceptor that executes before retrieval, eliminating LLM-level policy bypasses.
- **Parallel TypedArrays:** Isolated guardrail logic into contiguous memory to prevent V8 Garbage Collection pauses.

### 🏗️ Build-Time Intelligence
- **Sovereign Compiler:** Introduced `compileCorpus.ts` to pre-calculate semantic vectors for 460k+ dictionary words and 120k+ architectural patterns.
- **Binary Reflex Hydration:** The engine now loads optimized `.bin` files via direct binary blitting, reducing boot time by 90%.

### 🐛 Bug Fixes & Hardening
- **Fixed Genesis Freeze:** Resolved an issue where first-time installation would freeze the browser due to massive main-thread JSON parsing.
- **Vocabulary Expansion:** Upgraded the structural synthesizer from `Uint16` to `Uint32`, expanding capacity from 65k to 4B+ tokens.
- **Memory Safety:** Added dynamic arena resizing to handle arbitrary corpus sizes without `RangeError`.
- **Compiler Reliability:** Fixed stack-overflow issues in the Node.js compiler using buffered concatenation.


## Current Code Alignment - 2026-05-29

- Release-readiness correction: Strike 1 local code health is green for lint, accessibility audit, TypeScript, Vitest, and corpus verification.
- Validation snapshot: `npm run verify:corpus` passes for corpus `1.1.3-moat-2026-05-25` with `844854` records.
- TypeScript snapshot: `npx tsc --noEmit` passes.
- Lint snapshot: `npm run lint` passes.
- Accessibility snapshot: `npm run test:a11y` passes across 58 TSX files.
- Test snapshot: `npm run test` passes with `182` tests across `18` files.
- Build snapshot: `npm run build` passes; Vite emits existing chunk-size/dynamic-import warnings.
- E2E smoke snapshot: `npm run test:e2e:sovereign-smoke` passes with the committed mock GGUF fixture.
- Dexie schema in `src/lib/db.ts` currently reaches `version(40)`; older references to v35, v36, v38, or v39 are historical unless a section explicitly says otherwise.
- Generated corpus runtime files are intentionally ignored from Git: `public/baseline_meta.json`, `public/baseline_corpus.bin.gz`, `public/baseline_corpus_manifest.json`, `public/lexicon.json`, and `public/lexicon_roles.json`.
- `public/corpus.lock.json` is the tracked integrity manifest; release or offline bundle distribution should restore the ignored corpus files before dev/build.
- `public/dataAssets/` is the ignored private source lane for miner inputs and dictionary/persona/brain source material.
- `src-rust/` is treated as a separate engine repository; this app repo should retain only the compiled public runtime under `src/lib/wasm/pkg/`.
- Distribution correction: generated corpus artifacts should be published as release/offline-bundle assets and validated by `public/corpus.lock.json`, not carried as regular Git-tracked files.
- Engine-repo correction: Rust engine source is treated as a separate repository; app release notes should describe the compiled WASM package shipped in this repo.


<!-- RC-DOC-ALIGNMENT-2026-05-27 -->
## RC Documentation Alignment - 2026-05-27

- EA-NITI/EANITI canonical expansion: Enterprise Agentic Network Isolated Triage & Inference.
- v1.1.3 RC lock: Strike 4.2 VRAM handoff is stable; WebGPU Bind Groups and Command Encoders are deferred to v1.2.0; v1.1.3 inference relies on the optimized Wasm SIMD CPU lane with WebGPU adapter and VRAM sharding scaffold only.
- Runtime dependency alignment: @xenova/transformers, @mlc-ai/web-llm, and `tesseract.js` are removed from the app runtime. The bespoke OCR engine runs in `src/lib/wasm/ocr/pkg/`; no Tesseract traineddata, `/assets/ocr/lang-data` assets, or manual OCR downloads are part of any release.


<!-- STRIKE-4.0-ALIGNMENT-2026-06-04 -->
## Strike 4.0 Documentation Alignment - 2026-06-04

- **Version anchor:** `package.json` is at `1.1.4-beta`. Older literals
  (`1.1.3`) appear only in the version-history section of this file or
  in `DEBT-…` TODO comments and are not authoritative.
- **OCR lockfile is the source of truth:** `public/ocr/ocr.lock.json`
  is the only file an LFS-based dev needs to validate. The lockfile
  `verify:ocr` step is run automatically by `predev`, `prebuild`, and
  the CI pipeline; strict mode (`EA_NITI_OCR_STRICT=1`) is the
  release-grade gate.
- **Bespoke LLM default:** fresh installs see
  `sovereignModelUrl = /models/ea-niti-core-1.1b-q4.gguf`. The original
  `TinyLlama-1.1B-Chat-v1.0-GGUF` is the source of bytes; the file
  is renamed + tagged under EA-NITI provenance.
- **Dynamic DB migration:** the `page_visual_metadata` table is
  declared at `this.version(this.nextVersionAfter(40))`. Adding a new
  `this.version(N)` literal above the dynamic block auto-bumps the
  next version; no hardcoded drift is possible.
- **One-command bootstrap:** `npm run setup:local` is the canonical
  path. It performs LFS pull, npm ci, forge, lockfile unlock, and
  integrity verify in a single command and is idempotent.
- **Hydration ABI:** `OcrWasmRuntime.isLoaded()` now requires
  `engine.isLoaded() && hydratedAssets.size >= 2`. UI call sites that
  read `isLoaded()` for a "real engine" guarantee will see the
  regression in dev when the LFS assets are not yet published — this
  is intentional.
- **OCR pipeline:** bespoke Rust/WASM runtime in
  `src/lib/wasm/ocr/pkg/`. Geometric fallback + Agent Socket reranker.
  No Tesseract, no `tesseract.js`, no traineddata, no `/assets/ocr/`
  payload.
