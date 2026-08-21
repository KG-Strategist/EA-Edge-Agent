# EA-NITI Product Roadmap — v1.0 through v10.0

> **EA-NITI** (**E**nterprise **A**gentic **N**etwork **I**solated **T**riage & **I**nference) — a sovereign, air-gapped Enterprise Architecture OS running entirely client-side via WebAssembly SIMD, WebGPU, and browser-native V8 execution.

> Cadence: **3-month release cycles**. Each stage builds on the prior, evolving from an air-gapped PWA into the Autonomous EA OS.

> Source of truth: `.artefacts/docs-internal/04-features/EANITI_FEATURES.md`

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| 🟢 | Deployed — production-ready, shipped |
| 🟠 | In Progress — active development, next release |
| 🟡 | Planned — scheduled for future milestone |
| 🔵 | Visionary — research/concept phase |
| ⚫ | Deferred — reprioritized or superseded |

---

## Stage 1: MVP 1.1 — Core Foundations (RC Locked)

**Current Release:** v1.1.4-beta | **Status:** 🟢 Deployed

| Feature | Description | Status |
|---------|-------------|--------|
| 100% Air-Gapped Browser Execution | Zero-backend edge platform — PWA cache, local-only AI, offline governance | 🟢 |
| Zero-Trust Crypto Vault | AES-256-GCM secrets at rest, PBKDF2 constant-time auth | 🟢 |
| Immutable Audits & Zero-Dependency Sync | Tamper-proof Dexie audit hooks, local JSON portability | 🟢 |
| SSRF Network Guard & DOMPurify XSS Defense | Local endpoint validation, sanitized diagram/markdown rendering | 🟢 |
| Sovereign WASM SIMD Inference Engine & Dual-Engine BYOM | Browser-local GGUF inference (WASM SIMD CPU lane) + secondary BYOM routing; WebGPU adapter/VRAM scaffold present, Bind Groups/Command Encoders deferred | 🟢 |
| STRIDE Threat Modeling & Offline Sideloading | Threat analysis with Mermaid DFDs, sneakernet model ingestion | 🟢 |

**Deployed sub-releases:**
- v1.1.0 — Initial production release
- v1.1.1 — Hotfix stabilization
- v1.1.2 — Security hardening
- v1.1.3 — Strike 4.2 VRAM Handoff (57 TSDs created, NSI State Machine, RAG Integration, MITRA Logical Swarm, Epistemic Shadow)
- v1.1.4-beta — Current HEAD

---

## Stage 1.2: MVP 1.2 — Context & Personas

**Target:** v1.2.0 | **Status:** 🟠 In Progress

| Feature | Description | Status |
|---------|-------------|--------|
| NSI 5-Stage State Machine | Concept → DDQ → Vendors → HITL → Complete pipeline | 🟢 (v1.1.3) |
| BDAT Weighted Scorecard | Vendor DDQ scoring across Business/Data/Application/Technology axes | 🟢 (v1.1.3) |
| Dynamic Prompt Engine (DB-Backed) | Zero hardcoded prompts — `buildPrompt(promptKey, ctx)` from IndexedDB | 🟢 (v1.1.3) |
| Full RAG Loop Closed | Store + retrieve review embeddings for cross-review contextual memory | 🟢 (v1.1.3) |
| MITRA Logical Swarm | Multi-persona agents (Legal, HR, SecOps, EA) on single model | 🟢 (v1.1.3) |
| KV Cache Isolation Gatekeeper | Persona flush on switch across all callers | 🟢 (v1.1.3) |
| Zero-Trust Biometrics | FIDO2/WebAuthn PRF decryption for device-bound data keys | 🟠 |
| Selective Syncing | Entity-scoped export/import rather than full DB snapshots | 🟠 |
| Encrypted Payloads | AES-256 encrypted exported JSON knowledge bases | 🟠 |
| NITI-Pedia (Autonomous Edge Wiki) | OPFS-backed markdown knowledge base with Chat & Ask RAG overlay | 🟠 |

---

## Stage 1.3: MVP 1.3 — Config-Driven Intelligence

**Target:** v1.3.0 | **Status:** 🟡 Planned

> Hardcoded limits are anti-patterns for an Enterprise OS. Every system constraint must be user-configurable to match the hardware spectrum — from M3 Max MacBooks to 8GB RAM laptops.

| Feature | Description | Status |
|---------|-------------|--------|
| UI-Configurable maxPromptChars | Agent Config UI backed by `db.app_settings` — hardware-agnostic throttling | 🟡 |
| UI-Configurable RAG chunkSize & chunkOverlap | Knowledge Management settings — tune for document type | 🟡 |
| AgentChat Refactor | Split 463-line component into MessageList, ChatInput sub-components (300-line rule) | 🟡 |
| Native Rust Daemon (Epic 9) | Standalone WebSocket daemon from `src-rust/` inference engine — native binary target with CLI args, cross-platform builds | 🟡 |

---

## Stage 2: MVP 2.0 — Swarm & Sync

**Target:** v2.0 | **Status:** 🟡 Planned

| Feature | Description | Status |
|---------|-------------|--------|
| Policy Mitra Agent Swarm | 3-tier subagent architecture (Compiler, Evaluator, Fixer) for policy/code review | 🟡 |
| WebRTC Peer-to-Peer Sync | Serverless trust mesh for air-gapped LAN synchronization | 🟡 |
| Native Desktop Packaging (Tauri) | Desktop delivery for expanded runtime, memory, model execution beyond browser limits | 🟡 |
| Zero-Trust Biometrics (if deferred from 1.2) | FIDO2/WebAuthn PRF decryption | 🟡 |

---

## Stage 3: MVP 3.0 — Federated Ecosystem

**Target:** v3.0 | **Status:** 🔵 Visionary

| Feature | Description | Status |
|---------|-------------|--------|
| Sovereign Federated Learning | Client-side LoRA generation with encrypted weight sync | 🔵 |
| Rust Enterprise Marketplace | Opt-in secure publish/pull for compliance frameworks, models, agent blueprints | 🔵 |
| TinyML Edge Catalog | Curated lightweight edge models for constrained enterprise devices | 🔵 |
| The EA-NITI Forge (Universal Model Converter) | Rust-based AOT Tensor Compiler — any HuggingFace/PyTorch/ONNX → proprietary `.niti` format | 🔵 |

---

## Stage 4: MVP 4.0 — Graph & Time Dynamics

**Target:** v4.0 | **Status:** 🔵 Visionary

| Feature | Description | Status |
|---------|-------------|--------|
| Local GraphRAG (Blast Radius) | WASM graph database for instant impact analysis across topology/CVE exposure | 🔵 |
| 4D Temporal State Simulator | Scrubbable timeline predicting compliance breaches through migration scenarios | 🔵 |
| WASI Auto-Remediation | Dry-run generated Terraform/Helm via WASI before human approval | 🔵 |

---

## Stage 5: MVP 5.0 — The Cryptographic Trust Layer

**Target:** v5.0 | **Status:** 🔵 Visionary

| Feature | Description | Status |
|---------|-------------|--------|
| Zero-Knowledge Proof Audits | Proving DORA/NIST compliance without exposing raw architectural artifacts | 🔵 |
| Continuous Compliance Daemon | Local background agent intercepting IDE commits, enforcing EA metamodel at keystroke speed | 🔵 |

---

## Stage 6: MVP 6.0 — Ambient & Multi-Modal Inference

**Target:** v6.0 | **Status:** 🔵 Visionary

| Feature | Description | Status |
|---------|-------------|--------|
| Visual Edge Intake | WebGPU vision models converting whiteboard photos to structured BIAN JSON locally | 🔵 |
| Voice-to-Architecture | On-device Whisper transcription for conversational threat modeling | 🔵 |

---

## Stage 7: MVP 7.0 — Post-Quantum Architecture

**Target:** v7.0 | **Status:** 🔵 Visionary

| Feature | Description | Status |
|---------|-------------|--------|
| Post-Quantum Vaulting | WASM-compiled Kyber/Dilithium replacing AES/PBKDF2 for enterprise IP protection | 🔵 |
| Spatial Architecture (WebXR) | Immersive 3D visualization of service domains, threat vectors, topology | 🔵 |

---

## Stage 8: MVP 8.0 — Neuro-Symbolic Verification

**Target:** v8.0 | **Status:** 🔵 Visionary

| Feature | Description | Status |
|---------|-------------|--------|
| Neuro-Symbolic Engine | Hybrid LLM + Z3/WASM solver for mathematically verifiable compliance proofs | 🔵 |
| Trustless B2B Mesh | Cross-enterprise ZKP verification for API compliance without sharing IP | 🔵 |

---

## Stage 9–10: MVP 9.0 & 10.0 — The Autonomous EA OS

**Target:** v9.0 & v10.0 | **Status:** 🔵 Visionary

| Feature | Description | Status |
|---------|-------------|--------|
| Dynamic Model Pruning | Bespoke micro-models from composed LoRA adapters at runtime | 🔵 |
| The Unikernel Evolution | Bare-metal hypervisor deployment for classified security environments | 🔵 |
| Strike 5.0: Bespoke Vision-Language Core | Deprecating Tesseract; native Rust/WASM architectural diagram parsing | 🔵 |

---

## Supporting Infrastructure Roadmap

### Testing & Quality Gates

| Gate | Command | Status |
|------|---------|--------|
| Lint | `npm run lint` | 🟢 |
| Accessibility | `npm run test:a11y` | 🟢 |
| Corpus Integrity | `npm run verify:corpus` | 🟢 |
| OCR Lockfile | `npm run verify:ocr` | 🟢 |
| Type Check | `npx tsc --noEmit` | 🟢 |
| Unit Tests | `npm run test` | 🟢 (175 tests, 171 pass) |
| Production Build | `npm run build` | 🟢 |
| E2E Smoke | `npm run test:e2e:sovereign-smoke` | 🟢 |
| Visual Regression | `npm run test:visual` | 🟢 |
| Lighthouse Audit | `node .opencode/harness/lighthouse-audit.mjs <url>` | 🟢 |

### CI Pipeline

- **Platform:** GitHub Actions (`ci.yml`)
- **Node:** Pinned 22 via `.nvmrc` and `actions/setup-node@v4`
- **Windows:** `npm run setup:local` support added
- **LFS:** Auto-installed in CI before `npm ci`
- **Artifact:** `dist/` uploaded as `ea-niti-dist` on smoke pass
- **Security:** Dependency review, CodeQL, dfx hardlink guard
- **PR Gate:** 8 required checks (lint → build → e2e:smoke)

---

## 5-Layer Architecture Constraint

All features must respect the downward-only dependency law:

| Layer | Name | Location | Constraint |
|-------|------|----------|------------|
| 1 | UI View Components | `src/views/`, `src/components/ui/` | React 18, Tailwind CSS v4 |
| 2 | State & Context | `src/context/` | Pure React, no business logic |
| 3 | Services & Schedulers | `src/services/` | No React imports |
| 4 | Engine Layer | `src/lib/*.ts` | **Zero React imports** — CustomEvent or Dexie observables |
| 5 | Compute Substrate | `src/workers/`, `src-rust/`, `src/lib/db.ts` | Web Workers, WASM SIMD, Dexie tables |

---

*Last Updated: 2026-08-21 | Source: `.artefacts/docs-internal/04-features/EANITI_FEATURES.md` + `.artefacts/docs-internal/06-roadmap/V1.2_REFACTORING_ROADMAP.md`*
