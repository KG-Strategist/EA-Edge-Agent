# EA-NITI Release Notes

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
- **Agent Socket Protocol:** High-performance WebSocket communication between browser agent and native OS daemon — sub-millisecond token streaming with abort signals.
- **Message Array Engine:** All inference engines now accept standard `[{role, content}]` message arrays for tokenizer safety and chat template compatibility.

### 🛡️ Security & Performance
- AES-256-GCM encryption for all vendor blobs and DDQ files at rest.
- DOMPurify sanitization on all markdown and diagram render paths.
- Pre-compiled binary corpus: 90% boot time reduction via direct binary blitting.
- Dexie v36 schema migration with legacy data compatibility.

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


## Current Code Alignment - 2026-05-25

- Release-readiness correction: the current worktree is not fully green. `verify:corpus` passes, but TypeScript, lint, and four CryptoVault tests fail as documented below.
- Validation snapshot: `npm run verify:corpus` passes for corpus `1.1.3-moat-2026-05-25` with `844854` records.
- TypeScript snapshot: `npx tsc --noEmit` currently fails in `src/lib/cryptoVault.ts` at the WebCrypto `unwrapKey` call because the wrapped key is typed as `Uint8Array<ArrayBufferLike>`, not a strict `BufferSource`.
- Lint snapshot: `npm run lint` currently fails in `scripts/corpusBuildUtils.ts` on `no-control-regex` for the null-character sanitizer expression.
- Test snapshot: `npm run test` currently runs `175` tests; `171` pass and `4` fail in `src/__tests__/cryptoVault.test.ts` because assertions expect text matching `/VaultLockedError/` while the thrown message is `Vault is locked. DEK not available.`.
- Dexie schema in `src/lib/db.ts` currently reaches `version(39)`; older references to v35, v36, or v38 are historical unless a section explicitly says otherwise.
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
- Runtime dependency alignment: @xenova/transformers and @mlc-ai/web-llm are removed from the app runtime; tesseract.js CDN usage is removed/localized through /assets/ocr/ assets while the local package remains for OCR worker integration.
