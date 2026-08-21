# EA-NITI — Business Requirements Document (BRD)

> **Document ID:** BRD-EANITI-001
> **Version:** 1.0
> **Date:** 2026-08-21
> **Status:** Active
> **Owner:** KG-Strategist
> **Classification:** Internal

---

## 1. Executive Summary

EA-NITI (**Enterprise Agentic Network Isolated Triage & Inference**) is a sovereign, air-gapped Enterprise Architecture operating system that runs entirely client-side in the browser. It eliminates reliance on external AI services, cloud backends, and third-party ML runtimes by leveraging WebAssembly SIMD, WebGPU, and browser-native V8 execution.

The platform serves enterprise architects, security analysts, and compliance officers who require:
- **Zero-trust data sovereignty** — no architectural artifacts, threat models, or compliance data leave the local machine
- **Air-gapped operation** — full functionality with zero internet connectivity
- **AI-assisted triage** — on-device LLM inference for architecture reviews, threat modeling, and vendor selection
- **Regulatory compliance** — immutable audit trails for DORA, NIST, and internal governance frameworks

---

## 2. Business Objectives

| ID | Objective | Success Metric | Priority |
|----|-----------|----------------|----------|
| BO-001 | Eliminate cloud AI dependency for architecture reviews | Zero outbound network calls in production mode | P0 |
| BO-002 | Achieve air-gapped deployment for classified environments | Full feature parity with zero internet | P0 |
| BO-003 | Reduce architecture review cycle time by 70% | < 5 min per review vs 30+ min manual | P0 |
| BO-004 | Maintain immutable audit trail for regulatory compliance | 100% of actions logged to tamper-proof Dexie store | P0 |
| BO-005 | Support heterogeneous hardware (8GB laptops to M3 Max) | Configurable resource limits, graceful degradation | P1 |
| BO-006 | Enable multi-persona AI agents (Legal, HR, SecOps, EA) | MITRA swarm with domain-specific prompt routing | P1 |
| BO-007 | Achieve SOC 2 Type II readiness posture | Encrypted vault, RBAC, audit logging, network guards | P2 |
| BO-008 | Ship cross-platform native daemon for production inference | Rust daemon binary on macOS, Linux, Windows | P2 |

---

## 3. Stakeholder Requirements

### 3.1 Enterprise Architects
- **REQ-EA-001:** STRIDE threat modeling with auto-generated Mermaid DFDs
- **REQ-EA-002:** BDAT weighted scorecard for vendor DDQ evaluation
- **REQ-EA-003:** 5-stage NSI pipeline (Concept → DDQ → Vendors → HITL → Complete)
- **REQ-EA-004:** RAG-fueled historical context for cross-review intelligence
- **REQ-EA-005:** Configurable enterprise metamodels (TOGAF, BIAN alignment)

### 3.2 Security Officers
- **REQ-SEC-001:** AES-256-GCM encryption for all secrets at rest (cryptoVault)
- **REQ-SEC-002:** Zero-trust network guard with SSRF protection and IPv6 blocking
- **REQ-SEC-003:** DOMPurify sanitization for all rendered markdown/HTML
- **REQ-SEC-004:** Immutable audit hooks — no write operation bypasses logging
- **REQ-SEC-005:** FIDO2/WebAuthn biometric authentication (v1.2+)

### 3.3 Compliance Officers
- **REQ-COMP-001:** Tamper-proof audit trail exportable as JSON
- **REQ-COMP-002:** DORA/NIST compliance checklists integrated into review workflow
- **REQ-COMP-003:** Selective entity export/import (not full DB snapshots)
- **REQ-COMP-004:** Encrypted payload export for cross-machine knowledge transfer

### 3.4 Operations
- **REQ-OPS-001:** PWA with Service Worker precaching for offline-first operation
- **REQ-OPS-002:** OPFS-based model storage with atomic streaming
- **REQ-OPS-003:** One-command bootstrap: `npm run setup:local`
- **REQ-OPS-004:** CI/CD with 8 required quality gates (lint → build → e2e)

---

## 4. Functional Requirements

### 4.1 Inference Engine
| ID | Requirement | Status | Target |
|----|-------------|--------|--------|
| FR-001 | Browser-local GGUF inference via WASM SIMD | 🟢 Deployed | v1.1.0 |
| FR-002 | WebGPU adapter and VRAM sharding scaffold | 🟢 Scaffold | v1.1.3 |
| FR-003 | WebGPU Bind Groups and Command Encoders | 🟡 Planned | v1.2.0 |
| FR-004 | Native Rust daemon (WebSocket, Agent Socket Protocol) | 🟡 Planned | v1.3.0 |
| FR-005 | Post-quantum Kyber/Dilithium key management | 🔵 Visionary | v7.0 |

### 4.2 Knowledge Management
| ID | Requirement | Status | Target |
|----|-------------|--------|--------|
| FR-010 | SemanticArena — 1024-bit binary fingerprints, Popcount32 scoring | 🟢 Deployed | v1.1.0 |
| FR-011 | Epistemic Shadow background distillation queue | 🟢 Deployed | v1.1.3 |
| FR-012 | Enterprise Knowledge RAG (knowledgeIngestionEngine) | 🟢 Deployed | v1.1.3 |
| FR-013 | Review Session RAG (storeReviewEmbeddings + findSimilarReviews) | 🟢 Deployed | v1.1.3 |
| FR-014 | NITI-Pedia — OPFS-backed markdown wiki with RAG overlay | 🟠 In Progress | v1.2.0 |
| FR-015 | Local GraphRAG for blast radius analysis | 🔵 Visionary | v4.0 |

### 4.3 Multi-Persona & Workflow
| ID | Requirement | Status | Target |
|----|-------------|--------|--------|
| FR-020 | MITRA logical swarm (Legal, HR, SecOps, EA personas) | 🟢 Deployed | v1.1.3 |
| FR-021 | KV Cache isolation gatekeeper on persona switch | 🟢 Deployed | v1.1.3 |
| FR-022 | Dynamic Prompt Engine (DB-backed, zero hardcoded prompts) | 🟢 Deployed | v1.1.3 |
| FR-023 | Context-aware greeting resolution per persona | 🟢 Deployed | v1.1.3 |
| FR-024 | 3-tier Policy Mitra Agent Swarm (Compiler, Evaluator, Fixer) | 🟡 Planned | v2.0 |

### 4.4 Security & Compliance
| ID | Requirement | Status | Target |
|----|-------------|--------|--------|
| FR-030 | Zero-Trust Crypto Vault (AES-256-GCM + PBKDF2) | 🟢 Deployed | v1.1.0 |
| FR-031 | SSRF Network Guard with IPv6 blocking | 🟢 Deployed | v1.1.3 |
| FR-032 | Redirect-following protection on all fetch calls | 🟢 Deployed | v1.1.3 |
| FR-033 | Encrypted payload export (AES-256-GCM + PBKDF2 passphrase) | 🟠 In Progress | v1.2.0 |
| FR-034 | Zero-Knowledge Proof audits | 🔵 Visionary | v5.0 |

### 4.5 UI & Experience
| ID | Requirement | Status | Target |
|----|-------------|--------|--------|
| FR-040 | Air-gap sideload CTA with OPFS model loading | 🟢 Deployed | v1.1.4-beta |
| FR-041 | Configurable maxPromptChars / RAG chunkSize | 🟡 Planned | v1.3.0 |
| FR-042 | Visual Edge Intake (whiteboard → BIAN JSON) | 🔵 Visionary | v6.0 |
| FR-043 | Voice-to-Architecture (Whisper transcription) | 🔵 Visionary | v6.0 |
| FR-044 | Spatial Architecture (WebXR 3D visualization) | 🔵 Visionary | v7.0 |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement | Constraint |
|----|----------|-------------|------------|
| NFR-001 | Performance | UI thread idle at 60 FPS | All compute in Workers/WASM |
| NFR-002 | Performance | WASM trap prevention | Hard context ceiling: `if (pos >= n_ctx) break;` |
| NFR-003 | Memory | Zero GC overhead on hot paths | Flat contiguous Uint32Array arenas |
| NFR-004 | Security | Zero-PII | Pseudonymous identities only |
| NFR-005 | Security | DEKs exist only in RAM | Wrapping keys sealed in IndexedDB |
| NFR-006 | Availability | Offline-first | PWA with 500MB cache limit |
| NFR-007 | Portability | Browser support | Chrome 120+, Edge 120+, Safari 17+, Firefox 121+ |
| NFR-008 | Deployability | One-command setup | `npm run setup:local` idempotent |
| NFR-009 | Compliance | Immutable audit trail | Dexie hooks, tamper-proof |
| NFR-010 | Hardware | Minimum 8GB RAM | Graceful degradation via config |
| NFR-011 | Hardware | Maximum 128GB+ (M3 Max) | Full 8k-token context |

---

## 6. Constraints

| ID | Constraint | Mitigation |
|----|------------|------------|
| C-001 | Zero external network calls in air-gap mode | `checkNetworkConsent()` + `validateEndpointUrl()` gates |
| C-002 | No React in Engine Layer (`src/lib/*.ts`) | CustomEvent dispatchers or Dexie observables |
| C-003 | No external AI/ML runtimes | Bespoke Rust/WASM engines only |
| C-004 | ESBuild 0.21.5 pinned (v0.28.x breaks WASM) | package.json overrides |
| C-005 | Node 22 pinned (Node 26 deadlocks Vite) | `.nvmrc` + dev script guard |
| C-006 | 5-layer downward-only dependency law | Architectural constraint, CI-enforced |

---

## 7. Assumptions

1. Enterprise customers have air-gapped or restricted network environments requiring local-only AI
2. Browser-native WebAssembly SIMD and WebGPU are sufficient for sub-1.5s inference latency
3. OPFS and IndexedDB provide adequate persistence for enterprise workloads
4. A 3-month release cadence is sustainable for a small engineering team
5. FIDO2/WebAuthn adoption is sufficient for biometric authentication requirements

---

## 8. Dependencies

| Dependency | Type | Risk | Mitigation |
|------------|------|------|------------|
| WebAssembly SIMD | Browser API | Medium | CPU fallback path exists |
| WebGPU | Browser API | Medium | WASM SIMD CPU lane primary; WebGPU scaffold only |
| OPFS (FileSystemSyncAccessHandle) | Browser API | Low | IndexedDB as secondary store |
| Dexie.js | Library | Low | Active maintenance, stable API |
| DOMPurify | Library | Low | Security-critical, active maintenance |
| React 18 | Library | Low | Stable, no breaking changes expected |
| Tauri | Framework (v2.0) | Medium | Deferred until v2.0 native daemon proven |

---

## 9. Acceptance Criteria

| ID | Criterion | Evidence |
|----|-----------|----------|
| AC-001 | Zero outbound network calls in air-gap mode | Network monitor: 0 external requests during full workflow |
| AC-002 | Full feature parity offline | All 10 NSI workflow stages complete without connectivity |
| AC-003 | Review cycle < 5 minutes | Timed end-to-end: concept → completed review |
| AC-004 | 100% audit coverage | Dexie audit log: every DB write has corresponding audit entry |
| AC-005 | 8 quality gates pass in CI | `ci.yml` green: lint → a11y → corpus → ocr → typecheck → test → build → e2e |
| AC-006 | Cross-platform daemon builds | macOS, Linux, Windows binaries from single Rust codebase |
| AC-007 | Sub-2s inference latency | WASM SIMD inference: TPS > 15 tokens/sec on reference hardware |

---

## 10. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-21 | KG-Strategist | Initial BRD derived from EANITI_FEATURES.md |

---

*Source: `.artefacts/docs-internal/04-features/EANITI_FEATURES.md` + `.artefacts/docs-internal/06-roadmap/V1.2_REFACTORING_ROADMAP.md`*
