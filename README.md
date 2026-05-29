# 🛡️ EA-NITI: Enterprise Agentic Network Isolated Triage & Inference

<div align="center">
  <h2>Zero-Backend, Autonomous, Self-Learning Enterprise Agentic Network Isolated Triage & Inference</h2>
  <p><em>A sovereign Edge-AI Operating System that distributes free, private AI compute at the edge — utilizing latent device capacity for every enterprise, institution, and organization.</em></p>

  ![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
  ![React](https://img.shields.io/badge/React-19-blue.svg)
  ![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-green.svg)
  ![Local AI](https://img.shields.io/badge/AI-Sovereign_Engine-orange.svg)
  ![Zero-Backend](https://img.shields.io/badge/Architecture-Zero_Backend-purple.svg)
  ![MITRA Swarm](https://img.shields.io/badge/Persona-MITRA_Swarm-cyan.svg)
  ![Release Status](https://img.shields.io/badge/v1.1.3-RC_Locked-green.svg)
</div>

---

## 🚀 What is EA-NITI?

**EA-NITI** (**E**nterprise **A**gentic **N**etwork **I**solated **T**riage & **I**nference) is a Progressive Web App (PWA) that functions as a 100% air-gapped, zero-dependency **Universal Edge-AI Operating System**. It is a self-aware, autonomous, self-learning platform engineered for *any* enterprise capability — from architecture reviews and threat modeling to legal compliance, HR workflows, SecOps analysis, and beyond. Organizations dynamically configure "MITRA" personas (Multi-Persona Intelligent Triage & Response Agents) on the fly, each running on a single local model without duplicating VRAM.

EA-NITI was built on a fundamental premise: **enterprise intelligence should not require cloud dependency, external telemetry, or SaaS lock-in.** Every interaction runs entirely within the browser — inference, embeddings, governance, and audit trails. The platform leverages browser-native WebGPU/WebAssembly inference, a deterministic Neuro-Symbolic structural engine, secure local governance guardrails, and an autonomic Epistemic Shadow that continuously learns from every interaction. It is designed to operate across the full hardware spectrum — from M3 Max workstations with 8k-token contexts to 8GB RAM laptops that require intelligent throttling.

---

## 🧱 Core Architectural Pillars

### 100% Air-Gapped & Zero-Backend
EA-NITI operates entirely locally. No cloud databases, no external telemetry, no backend service dependencies. All AI inference, embeddings, vector search, and database operations run in isolated Web Workers and browser storage (IndexedDB, OPFS, CacheStorage). The platform is installable as a PWA and functions fully offline after initial load.

### Sovereign Edge Inference Engine
Local AI inference is executed via **SovereignEngine** — a bespoke WebGPU/Wasm GGUF pipeline with OPFS zero-copy binary blitting for instant model hydration. Alternatively, compute can be offloaded to a native OS process through **LocalDaemonProvider** (WebSocket), enabling full system RAM access beyond browser VRAM constraints. Small Language Models such as Qwen/Phi-3 run in-browser or on the local daemon, enabling AI workflows without network-based model execution.

### Agent Socket Protocol (Bespoke Inter-Agent Communication)
EA-NITI implements a high-performance **Agent Socket Protocol** via WebSocket between the primary browser agent and the native OS daemon. This protocol delivers sub-millisecond token streaming, request multiplexing with pending resolver maps, generation abort signals, and session reset commands — purpose-built for primary/tiny agent communication. It is designed as a future standalone SDK for cross-protocol adapter compatibility with MCP, gRPC, and other agent communication standards.

### Zoned Orthogonal Hashing (ZOH)
A proprietary 1024-bit bitwise projection engine replacing traditional vector similarity search. Queries are mapped into discrete semantic zones (Core, Tense, Voice, Intent, Entity, Relation, Sentiment) with core-first short-circuiting that delivers O(1) routing and <1ms search throughput across 600k+ records using hardware-level POPCNT intersections on contiguous TypedArrays.

### MITRA Logical Swarm
Multi-persona intelligent agents (Legal, HR, SecOps, EA, and custom domains) running on a **single model instance** through KV cache isolation. The `ensurePersonaActive()` gatekeeper in `aiEngine.ts` guarantees cache flush on persona switch across all callers. Each persona carries its own system prompt, RAG tag filters, and identity — resolved by workflow/stage context, not domain heuristics.

### Epistemic Shadow Worker
A background distillation engine that continuously extracts structured knowledge triplets from every AI interaction. Operates in idle processing mode with preemption protocol — user prompts always take priority, aborting background work via `AbortController`. Supports three modes: WebGPU Wasm, native daemon, or auto-routing based on engine availability.

### WebGPU Preemption Protocol
Full generation lifecycle control: `abortGeneration()` drops compute mid-stream, `clearContext()` flushes KV cache, and `resetSession()` clears conversation state while preserving connections. The `CLEAR_KV_CACHE` message type propagates from SovereignEngine through inferenceWorker to the WebGPU runtime.

### CryptoVault & Zero-Trust Authentication
AES-256-GCM encryption for all secrets at rest (API keys, credentials, exported payloads). PBKDF2 key derivation with constant-time comparison for local authentication. All cryptographic operations use the native `crypto.subtle` API — no external libraries.

### NetworkGuard & DOMPurify XSS Defense
Strict SSRF protection via endpoint validation blocking localhost, private IP ranges, and cloud metadata endpoints. DOMPurify sanitizes all markdown and Mermaid SVG render paths. Network calls are gated behind `globalNetworkEnabled` — the Airplane Mode toggle enforces complete air-gap compliance at the application layer.

### Dynamic Prompt Engine (DB-Backed Templating)
Zero hardcoded prompts. `buildPrompt(promptKey, ctx)` fetches templates from `db.prompt_templates` at runtime, computes BDAT tables and metadata via `replaceTags()`. All prompts are editable live from the Admin Panel. Two-tier template system: system-level and field-level auto-rewrite.

### Autonomous Semantic Router
Local telemetry-based heuristic routing between Core WebGPU and BYOM (Bring Your Own Model) providers. Monitors engine latency, token throughput, and error rates to autonomously select the optimal inference path without user intervention.

### Pre-Compiled Binary Corpus
Build-time compiler (`compileCorpus.ts`) pre-calculates semantic vectors for 600k+ dictionary words and architectural patterns into optimized `.bin.gz` files. Runtime hydration via direct binary blitting reduces boot time by 90% — zero JSON parsing on the main thread.

### BDAT Scorecard Engine
Weighted vendor comparison across Business/Data/Application/Technology axes with configurable weights. Generates ranked vendor tables with pass/fail indicators from DDQ (Due Diligence Questionnaire) responses. Fully client-side via SheetJS parsing.

### SideloadService (OPFS GGUF Ingestion)
Offline model weight ingestion via folder upload directly into browser CacheStorage. Enables "sneakernet" model distribution for air-gapped environments — no network required for model deployment.

### 3-Tier Subagent Architecture
Compiler → Evaluator → Fixer persona pipeline for policy/code review workflows. Each tier operates as an independent logical agent with its own prompt template and output validation, orchestrated through the MITRA Swarm framework.

### Deterministic V8 Execution
EA-NITI rejects external policy binaries like OPA/Rego. Compliance logic and offline chat execute as deterministic JavaScript within a high-performance binary memory arena (SemanticArena), preserving 100% auditability and eliminating hallucination risk through triplet-store fact retrieval.

---

## 🛡️ v1.1.3 Hardening Highlights

### Performance (10 Fixes)
- **Precomputed RoPE:** 786K+ trig calls eliminated per forward pass
- **SIMD Element-Wise Mul:** 4-wide `f32x4_mul` for SwiGLU gate fusion
- **Guardrail Index:** O(G) instead of O(600K) scan
- **Popcnt Lookup Table:** 256-entry table replaces 5-op software popcnt
- **Zero-RegExp exactWordMatch:** Pure string ops, zero allocations
- **Pre-allocated Vector Buffer:** `vectoriseInto()` eliminates per-call allocation
- **Bitwise Division:** `>>> 5`/`& 31` replace `Math.floor`/`%`
- **Array+Join Token Streaming:** O(T) replaces O(T²) string concat
- **Precomputed DDQ Map:** Module-level constant eliminates rebuild
- **queueMicrotask Yield:** Microtask chain prevents UI starvation

### Security (3 Fixes)
- **Plaintext apiKey Removal:** Schema purge, all paths use `encryptedApiKey`
- **IPv6 SSRF Blocking:** `fc00::/7`, `fe80::/10`, IPv4-mapped private, multicast
- **Redirect Protection:** `redirect: 'error'` on all external fetch calls

### SDK & Infrastructure
- **Plugin Hook System:** `PluginHookRegistry` for extensible lifecycle hooks
- **Bitfield Projection SDK:** `bitfieldSDK.ts` exposes ZOH operations
- **Streaming Token API:** `prefill_prompt()` + `generate_next_token()` + `decode_single_token()`

---

## ✨ Current Active Capabilities (v1.1.3)

| Feature | Description |
|---------|-------------|
| **Sovereign Engine (ZOH)** | 1024-bit Zoned Orthogonal Hashing for O(1) intent routing across 600k+ records. |
| **Epistemic Reasoning Engine** | O(1) Causal Graph traversal with JIT Transitive Curiosity and Belief State Trust Model. |
| **MITRA Logical Swarm** | Multi-persona agents (Legal, HR, SecOps, EA) on a single model. RAG tag filtering + KV cache isolation via `ensurePersonaActive()` gatekeeper. |
| **Epistemic Shadow Worker** | Background knowledge distillation with preemption protocol. Idle processing loop, auto-routing between Wasm/daemon. |
| **WebGPU Preemption Protocol** | Full generation lifecycle: `abortGeneration()`, `clearContext()`, `CLEAR_KV_CACHE` propagation. |
| **NSI 5-Stage State Machine** | Complete vendor selection pipeline: Concept → DDQ → Vendors → HITL → Complete with BDAT scorecard. |
| **Dynamic Prompt Engine** | DB-backed templating. `buildPrompt(promptKey, ctx)` — zero hardcoded prompts, live admin editing. |
| **Enterprise RAG Pipeline** | Local semantic search over enterprise knowledge, historical decisions, and ingested content. Full RAG loop closed. |
| **Agent Socket Protocol** | High-performance WebSocket inter-agent communication. Sub-ms token streaming, abort signals, session reset. Future standalone SDK. |
| **Autonomous Semantic Router** | Telemetry-based heuristic routing between WebGPU and BYOM providers. |
| **Universal Persona Pivot** | Configurable domain agents with workflow/stage persona binding and context-aware greeting resolution. |
| **Multi-Persona Workflow Handoff** | Workflow context resolution, persona adoption on mount, lifecycle cleanup on unmount. |
| **Message Array Engine Refactor** | All engines accept `[{role, content}]` message arrays for tokenizer safety and chat template compatibility. |
| **Deterministic Synthesis** | Zero-hallucination offline fallback using triplet-store fact retrieval (Uint32 compressed). |
| **Pre-flight Guardrail Interceptor** | Policy enforcement in <1ms using bitwise Tanimoto intersections on contiguous memory. |
| **Sovereign Compiler** | Build-time compilation of 600k+ records into optimized binary reflexes (`.bin.gz`). |
| **Zero-PII Authentication** | PBKDF2-hashed local authentication with AES-256-GCM credential vaulting. |
| **USB Sideloading (Sneakernet)** | Offline model weight ingestion via folder upload into browser CacheStorage. |
| **STRIDE Threat Modeling** | Interactive DFD builder with Mermaid generation and AI-enriched mitigation planning. |
| **Governance Workflows** | Configurable multi-stage review pipelines and admin-managed approval flows. |
| **Immutable Audit Logging** | Every mutation logged with search, filtering, and air-gapped CSV export. |
| **NetworkGuard & DOMPurify** | SSRF protection, XSS defense, and Airplane Mode enforcement at application layer. |
| **RoPE Precomputation** | 786K+ trig calls eliminated per forward pass via cos/sin lookup tables. |
| **SIMD SwiGLU Fusion** | 4-wide `f32x4_mul` for element-wise gate fusion — 4× throughput. |
| **Streaming Token API** | `prefill_prompt()` + `generate_next_token()` + `decode_single_token()` — no O(N²) regeneration. |
| **Plugin Hook Registry** | Extensible lifecycle hooks for plugin architecture. |
| **Bitfield Projection SDK** | ZOH bitfield operations exposed for plugin consumption. |

---

## 🧪 Testing

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for the complete testing protocol including unit tests, E2E tests, WASM build verification, CI pipeline, and manual testing checklist.

---

## 🛠️ Tech Stack

* **Frontend:** React 19, Tailwind CSS v4, IBM Plex (Sans/Mono), Lucide React
* **AI & Machine Learning:** SovereignEngine (Wasm SIMD GGUF with WebGPU adapter and VRAM handoff scaffold), LocalDaemonProvider (WebSocket Agent Socket), EpistemicShadow (background distillation), StructuralVectoriser (1024-bit ZOH POPCNT math), StructuralVectoriser local embeddings/vector pipeline
* **Storage:** Dexie.js (IndexedDB v36, 30 tables), OPFS, CacheStorage, WASM PostgreSQL (`pglite`)
* **Build:** Vite 6.x, TypeScript 5.8, custom corpus compiler (`compileCorpus.ts`)
* **Security:** `crypto.subtle` (AES-256-GCM, PBKDF2), DOMPurify, NetworkGuard (SSRF protection)
* **Data Formats:** SheetJS (DDQ parsing), Mermaid (DFD generation), remark-gfm (markdown tables)

---

## 🚀 Developer Setup

### Prerequisites
- Node.js 18+
- Git LFS 3.x+ installed before cloning. The repository stores compressed runtime brain assets with Git LFS; without it, Git will check out tiny pointer files instead of the required corpus payloads.
- Modern browser with WebGPU support enabled (Chrome 113+, Edge 113+)
- The compiled WASM runtime is included in `src/lib/wasm/pkg/`. Rust source lives in a separate private engine repository and is not required for normal app setup.

### Installation & Build
```bash
# Clone with Git LFS enabled. Do not use GitHub Download ZIP unless the
# repository archive setting includes LFS objects.
git lfs install
git clone <repo-url>
cd ea-niti-edge-agent
git lfs pull

# Install dependencies
npm install

# Verify compressed corpus artifacts pulled by Git LFS
npm run verify:corpus

# Run development server
npm run dev
```

### Compile a Custom Structural Corpus
Raw corpus sources are intentionally excluded from the public repository. The app consumes release-published corpus artifacts:
- `public/baseline_meta.json.gz`
- `public/baseline_corpus.bin.gz`
- `public/baseline_corpus_manifest.json`
- `public/lexicon.json.gz`
- `public/lexicon_roles.json.gz`

To rebuild a private/custom corpus locally, keep source files under ignored `public/dataAssets/` and run:
```bash
npm run build:corpus
```
The build also writes raw JSON files for local validation/debug, but those raw files stay ignored by Git.

### Corpus Troubleshooting
If `npm run verify:corpus` reports a Git LFS pointer file, run:
```bash
git lfs install
git lfs pull
npm run verify:corpus
```
GitHub source ZIP archives do not include LFS objects by default. Use `git clone` with Git LFS, enable LFS objects in repository archives, or publish a separate offline release bundle for non-Git users.

## 🔮 Roadmap

### v1.2.0: The Knowledge Nexus (Next Release)
- **Selective Syncing:** Granular export/import of specific entities (Threat Models, BIAN domains) rather than full database snapshots.
- **Encrypted Payloads:** AES-256 passphrase-protected exports for secure cross-machine portability via USB/email.
- **Zero-Trust Biometrics:** FIDO2/WebAuthn PRF for device-bound biometric authentication and local key decryption.
- **NITI-Pedia:** OPFS-backed autonomous markdown knowledge base with local RAG overlay.

### v2.0: Swarm Intelligence
- **MITRA Swarm v2:** Multi-instance distributed personas with WebRTC peer-to-peer sync for air-gapped LAN mesh.
- **Native Desktop Packaging:** Tauri-based desktop delivery for expanded runtime, memory, and model execution beyond browser limits.

### v3.0: Federated Ecosystem
- **Sovereign Federated Learning:** Client-side LoRA generation with encrypted weight sync — preserving only mathematical updates.
- **TinyML Edge Catalog:** Curated repository of lightweight edge models optimized for constrained enterprise devices.

Detailed internal roadmap artefacts are maintained outside the public Git history.

---

## 📄 License

This project is licensed under the MIT License.

<p align="center">
  <strong>EA-NITI: Sovereign Edge-AI OS — Intelligence at the edge, zero cloud dependency.</strong>
</p>


## Current Code Alignment - 2026-05-25

- Validation snapshot: `npm run verify:corpus` passes for corpus `1.1.3-moat-2026-05-25` with `844854` records.
- TypeScript snapshot: `npx tsc --noEmit` passes.
- Lint snapshot: `npm run lint` passes.
- Test snapshot: `npm run test` passes with `175` tests across `16` files.
- Dexie schema in `src/lib/db.ts` currently reaches `version(39)`; older references to v35, v36, or v38 are historical unless a section explicitly says otherwise.
- Raw generated corpus files are intentionally ignored from Git: `public/baseline_meta.json`, `public/lexicon.json`, and `public/lexicon_roles.json`.
- Compressed runtime corpus files are tracked through Git LFS: `public/baseline_meta.json.gz`, `public/baseline_corpus.bin.gz`, `public/lexicon.json.gz`, and `public/lexicon_roles.json.gz`.
- `public/corpus.lock.json` is the tracked integrity manifest; `npm run verify:corpus` confirms LFS-pulled assets before dev/build.
- `public/dataAssets/` is the ignored private source lane for miner inputs and dictionary/persona/brain source material.
- `src-rust/` is treated as a separate engine repository; this app repo should retain only the compiled public runtime under `src/lib/wasm/pkg/`.
- Public setup path: `git lfs install`, `git clone`, `git lfs pull`, `npm install`, `npm run verify:corpus`, then `npm run dev`.
- Rebuilding corpus remains a private/local workflow via `npm run build:corpus` after placing sources under ignored `public/dataAssets/`.
- Public validation must not require compiling Rust; Rust/WASM engine source is maintained separately and copied back as compiled package output.
- Version alignment note: package metadata currently uses React 18, Vite 5, and TypeScript 5.6 even where older prose/badges mention React 19, Vite 6, or TypeScript 5.8. Treat package files as the source of truth until the public copy is revised in-place.
- Corpus bundle sizing note: the current required corpus asset set is about 530.7 MiB uncompressed, but compressed runtime assets are Git LFS tracked at roughly 70 MiB total for clone-and-run setup.
- Documentation hygiene note: this file is one of the explicitly tracked Markdown files; ignored internal Markdown remains useful for local engineering but should not be assumed public-release current without the alignment notes added on 2026-05-25.


<!-- RC-DOC-ALIGNMENT-2026-05-27 -->
## RC Documentation Alignment - 2026-05-27

- EA-NITI/EANITI canonical expansion: Enterprise Agentic Network Isolated Triage & Inference.
- v1.1.3 RC lock: Strike 4.2 VRAM handoff is stable; WebGPU Bind Groups and Command Encoders are deferred to v1.2.0; v1.1.3 inference relies on the optimized Wasm SIMD CPU lane with WebGPU adapter and VRAM sharding scaffold only.
- Runtime dependency alignment: @xenova/transformers and @mlc-ai/web-llm are removed from the app runtime; tesseract.js CDN usage is removed/localized through /assets/ocr/ assets while the local package remains for OCR worker integration.
