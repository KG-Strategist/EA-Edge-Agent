# EA-NITI — Master Technical Specification Document (TSD)

> **Document ID:** TSD-EANITI-MASTER-001
> **Version:** 1.0
> **Date:** 2026-08-21
> **Status:** Active
> **Owner:** KG-Strategist
> **Classification:** Internal

---

## 1. Overview

This document serves as the master index for all 112 Technical Specification Documents (TSDs) governing the EA-NITI platform. Each TSD defines the architecture, contracts, and constraints for a specific subsystem.

### Architecture Identity

EA-NITI is a **5-layer downward-only dependency architecture**:

```
┌─────────────────────────────────────────────────┐
│ Layer 1: UI View Components                     │
│   src/views/, src/components/ui/                │
│   React 18, Tailwind CSS v4, Lucide Icons       │
├─────────────────────────────────────────────────┤
│ Layer 2: State & Context                        │
│   src/context/                                  │
│   Pure React contexts, hooks, event listeners   │
├─────────────────────────────────────────────────┤
│ Layer 3: Services & Schedulers                  │
│   src/services/                                 │
│   Routers, SideloadService, Task queues         │
├─────────────────────────────────────────────────┤
│ Layer 4: Engine Layer                           │
│   src/lib/*.ts                                  │
│   100% Pure TypeScript. Zero React imports.      │
│   Communicates via CustomEvent on window.       │
├─────────────────────────────────────────────────┤
│ Layer 5: Compute Substrate & Data Store         │
│   src/workers/, src-rust/, src/lib/db.ts        │
│   Web Workers, WebAssembly SIMD, Dexie tables   │
└─────────────────────────────────────────────────┘
```

**Law:** Dependencies flow downward only. Layer 4 must never import from Layer 1.

---

## 2. TSD Index by Category

### 2.1 Infrastructure (TSD-001 → TSD-004)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 001 | Database Layer | `tsd/01_INFRASTRUCTURE/TSD-001_Database_Layer.md` | 🟢 |
| 002 | Crypto Vault | `tsd/01_INFRASTRUCTURE/TSD-002_Crypto_Vault.md` | 🟢 |
| 003 | Network Guard | `tsd/01_INFRASTRUCTURE/TSD-003_Network_Guard.md` | 🟢 |
| 004 | PWA Offline | `tsd/01_INFRASTRUCTURE/TSD-004_PWA_Offline.md` | 🟢 |

**Key contracts:**
- `db.ts` — Dexie schema v39, audit hooks, version migration via `this.version(this.nextVersionAfter(N))`
- `cryptoVault.ts` — AES-256-GCM encryption, PBKDF2 auth, DEKs in RAM only
- `networkGuard.ts` — SSRF protection, IPv4/IPv6 private range blocking, `checkNetworkConsent()` async gate
- PWA — Service Worker v7, 500MB cache limit, excludes `.gguf`/`.bin.gz` from precache

---

### 2.2 Semantic Pipeline (TSD-005 → TSD-009)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 005 | Zoned Orthogonal Hashing | `tsd/02_SEMANTIC_PIPELINE/TSD-005_Zoned_Orthogonal_Hashing.md` | 🟢 |
| 006 | Semantic Arena | `tsd/02_SEMANTIC_PIPELINE/TSD-006_Semantic_Arena.md` | 🟢 |
| 007 | Structural Synthesizer | `tsd/02_SEMANTIC_PIPELINE/TSD-007_Structural_Synthesizer.md` | 🟢 |
| 008 | Lexical Parser | `tsd/02_SEMANTIC_PIPELINE/TSD-008_Lexical_Parser.md` | 🟢 |
| 009 | Epistemic Shadow | `tsd/02_SEMANTIC_PIPELINE/TSD-009_Epistemic_Shadow.md` | 🟢 |

**Key contracts:**
- `SemanticArena.ts` — 1024-bit binary fingerprints, Popcount32 Tanimoto scoring, flat `Uint32Array` memory, `POPCNT_TABLE` lookup, guardrail index O(G) vs O(600K)
- `StructuralVectoriser` — `vectoriseInto(query, outBuffer)` zero-allocation hot path
- `EpistemicShadow.ts` — Background distillation queue, `distillDelta()`, AbortController preemption

---

### 2.3 Inference Engines (TSD-010 → TSD-014)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 010 | Sovereign Engine (WASM) | `tsd/03_INFERENCE_ENGINES/TSD-010_Sovereign_Engine_WASM.md` | 🟢 |
| 011 | Rust Tensor Core | `tsd/03_INFERENCE_ENGINES/TSD-011_Rust_Tensor_Core.md` | 🟢 |
| 012 | inferenceWorker | `tsd/03_INFERENCE_ENGINES/TSD-012_inferenceWorker.md` | 🟢 |
| 013 | aiEngine | `tsd/03_INFERENCE_ENGINES/TSD-013_aiEngine.md` | 🟢 |
| 014 | BYOE Gateway | `tsd/03_INFERENCE_ENGINES/TSD-014_BYOE_Gateway.md` | 🟢 |

**Key contracts:**
- `SovereignEngine.ts` — OPFS GGUF storage, SharedArrayBuffer allocation, zero-copy blitting, VRAM governor
- `inferenceWorker.ts` — Array+join token streaming, `queueMicrotask` yield with periodic `setTimeout` every 10 tokens
- `aiEngine.ts` — `chatWithAgent()` and `generateReview()` with SSRF validation, single `generateReview()` entry point

---

### 2.4 NSI Workflow (TSD-015 → TSD-019)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 015 | NSI State Machine | `tsd/04_NSI_WORKFLOW/TSD-015_NSI_State_Machine.md` | 🟢 |
| 016 | DDQ Engine | `tsd/04_NSI_WORKFLOW/TSD-016_DDQ_Engine.md` | 🟢 |
| 017 | Scorecard Engine | `tsd/04_NSI_WORKFLOW/TSD-017_Scorecard_Engine.md` | 🟢 |
| 018 | Prompt Builder | `tsd/04_NSI_WORKFLOW/TSD-018_Prompt_Builder.md` | 🟢 |
| 019 | RAG Orchestrator | `tsd/04_NSI_WORKFLOW/TSD-019_RAG_Orchestrator.md` | 🟢 |

**Key contracts:**
- 5-stage pipeline: Concept → DDQ → Vendors → HITL → Complete
- `buildPrompt(promptKey, ctx)` — Dynamic Prompt Engine, DB-backed templates
- `computeWeightedScorecard()` — BDAT weighted scoring across Business/Data/Application/Technology axes
- `storeReviewEmbeddings()` — called on both auto-completion and HITL approval paths
- HITL gate: BOTH `CRITICAL OBSERVATION` detection AND `BDAT < 40%` threshold

---

### 2.5 Security & Threats (TSD-020 → TSD-022)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 020 | Threat Engine | `tsd/05_SECURITY_THREATS/TSD-020_Threat_Engine.md` | 🟢 |
| 021 | Auth Engine | `tsd/05_SECURITY_THREATS/TSD-021_Auth_Engine.md` | 🟢 |
| 022 | Security Audit | `tsd/05_SECURITY_THREATS/TSD-022_Security_Audit.md` | 🟢 |

**Key contracts:**
- `threatEngine.ts` — STRIDE threat modeling, Mermaid DFD generation, component ID generation
- `authEngine.ts` — PBKDF2 constant-time authentication
- All fetch calls use `redirect: 'error'` to block redirect-based SSRF bypass

---

### 2.6 UI Components (TSD-023 → TSD-030)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 023 | Dashboard | `tsd/06_UI_COMPONENTS/TSD-023_Dashboard.md` | 🟢 |
| 024 | AuthGate | `tsd/06_UI_COMPONENTS/TSD-024_AuthGate.md` | 🟢 |
| 025 | AgentChat | `tsd/06_UI_COMPONENTS/TSD-025_AgentChat.md` | 🟢 |
| 026 | IntakeWizard | `tsd/06_UI_COMPONENTS/TSD-026_IntakeWizard.md` | 🟢 |
| 027 | ThreatEditor | `tsd/06_UI_COMPONENTS/TSD-027_ThreatEditor.md` | 🟢 |
| 028 | AdminPanel | `tsd/06_UI_COMPONENTS/TSD-028_AdminPanel.md` | 🟢 |
| 029 | SafeMermaid | `tsd/06_UI_COMPONENTS/TSD-029_SafeMermaid.md` | 🟢 |
| 030 | DataTable | `tsd/06_UI_COMPONENTS/TSD-030_DataTable.md` | 🟢 |

---

### 2.7 State & Context (TSD-031 → TSD-034)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 031 | StateContext | `tsd/07_STATE_CONTEXT/TSD-031_StateContext.md` | 🟢 |
| 032 | NotificationContext | `tsd/07_STATE_CONTEXT/TSD-032_NotificationContext.md` | 🟢 |
| 033 | useDataPortability | `tsd/07_STATE_CONTEXT/TSD-033_useDataPortability.md` | 🟢 |
| 034 | useArchive | `tsd/07_STATE_CONTEXT/TSD-034_useArchive.md` | 🟢 |

---

### 2.8 Services & Workers (TSD-035 → TSD-038)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 035 | SemanticRouter | `tsd/08_SERVICES_WORKERS/TSD-035_SemanticRouter.md` | 🟢 |
| 036 | SideloadService | `tsd/08_SERVICES_WORKERS/TSD-036_SideloadService.md` | 🟢 |
| 037 | inferenceWorker | `tsd/08_SERVICES_WORKERS/TSD-037_inferenceWorker.md` | 🟢 |
| 038 | LocalDaemonProvider | `tsd/08_SERVICES_WORKERS/TSD-038_LocalDaemonProvider.md` | 🟢 |

**Key contracts:**
- `SemanticRouter.ts` — Telemetry-based heuristic routing between Core WebGPU and BYOM
- `SideloadService.ts` — OPFS streaming with GGUF header validation
- `LocalDaemonProvider.ts` — WebSocket client to `ws://127.0.0.1:8080`, Agent Socket Protocol

---

### 2.9 Rust Engine Deep Dive (TSD-039 → TSD-043)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 039 | Sovereign Tensor Core | `tsd/09_RUST_ENGINE_DEEP_DIVE/TSD-039_Sovereign_Tensor_Core.md` | 🟢 |
| 040 | GGUF Parser | `tsd/09_RUST_ENGINE_DEEP_DIVE/TSD-040_GGUF_Parser.md` | 🟢 |
| 041 | Neural Core | `tsd/09_RUST_ENGINE_DEEP_DIVE/TSD-041_Neural_Core.md` | 🟢 |
| 042 | KV Cache | `tsd/09_RUST_ENGINE_DEEP_DIVE/TSD-042_KV_Cache.md` | 🟢 |
| 043 | Tokenizer | `tsd/09_RUST_ENGINE_DEEP_DIVE/TSD-043_Tokenizer.md` | 🟢 |

**Key contracts:**
- `src-rust/src/lib.rs` — `SovereignTensorCore` compiled to WASM SIMD, precomputed RoPE frequency tables, SIMD element-wise multiply
- `gguf.rs` — GGUF header parsing, tensor routing (11 filename variants), 12 invariant checks
- `kv_cache.rs` — KV cache management with persona-flush protocol
- `tokenizer.rs` — BPE tokenizer implementation
- Built via `npm run build:wasm` (engine) or `npm run build:wasm:ocr` (OCR)

---

### 2.10 Testing (TSD-044 → TSD-048)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 044 | Vitest Test Suite | `tsd/10_TESTING/TSD-044_Vitest_Test_Suite.md` | 🟢 |
| 045 | Crypto Vault Tests | `tsd/10_TESTING/TSD-045_Crypto_Vault_Tests.md` | 🟢 |
| 046 | Network Guard Tests | `tsd/10_TESTING/TSD-046_Network_Guard_Tests.md` | 🟢 |
| 047 | Semantic Pipeline Tests | `tsd/10_TESTING/TSD-047_Semantic_Pipeline_Tests.md` | 🟢 |
| 048 | Orchestrator GGUF Tests | `tsd/10_TESTING/TSD-048_Orchestrator_GGUF_Tests.md` | 🟢 |

**Key contracts:**
- Vitest with `happy-dom` environment (not jsdom)
- 175 tests, 171 passing
- Tests in `src/__tests__/` — uses `*.test.ts` / `*.test.tsx` naming (not `.spec.ts`)
- E2E in `src/__tests__/e2e/` — Playwright, `fullyParallel: false`, `workers: 1`

---

### 2.11 Future Roadmap (TSD-049 → TSD-057)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 049 | Phase 4: Epistemic Shadow | `tsd/11_FUTURE_ROADMAP/TSD-049_Phase_4_Epistemic_Shadow.md` | 🔵 |
| 050 | Phase 5: FIDO2 | `tsd/11_FUTURE_ROADMAP/TSD-050_Phase_5_FIDO2.md` | 🔵 |
| 051 | MITRE ATT&CK Mapping | `tsd/11_FUTURE_ROADMAP/TSD-051_MITRE_ATT&CK_Mapping.md` | 🔵 |
| 052 | GraphRAG | `tsd/11_FUTURE_ROADMAP/TSD-052_GraphRAG.md` | 🔵 |
| 053 | Multi-Model Support | `tsd/11_FUTURE_ROADMAP/TSD-053_Multi_Model_Support.md` | 🔵 |
| 054 | Quantization | `tsd/11_FUTURE_ROADMAP/TSD-054_Quantization.md` | 🔵 |
| 055 | Paged Attention | `tsd/11_FUTURE_ROADMAP/TSD-055_Paged_Attention.md` | 🔵 |
| 056 | WebGPU | `tsd/11_FUTURE_ROADMAP/TSD-056_WebGPU.md` | 🔵 |
| 057 | Multi-Device Sync | `tsd/11_FUTURE_ROADMAP/TSD-057_Multi_Device_Sync.md` | 🔵 |

---

### 2.12 Library Utilities (TSD-058 → TSD-072)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 058 | Seed Data | `tsd/16_LIB_UTILITIES/TSD-058_SeedData.md` | 🟢 |
| 059 | Constants | `tsd/16_LIB_UTILITIES/TSD-059_Constants.md` | 🟢 |
| 060 | SecureDb | `tsd/16_LIB_UTILITIES/TSD-060_SecureDb.md` | 🟢 |
| 061 | OPFSManager | `tsd/16_LIB_UTILITIES/TSD-061_OPFSManager.md` | 🟢 |
| 062 | Validation | `tsd/16_LIB_UTILITIES/TSD-062_Validation.md` | 🟢 |
| 063 | KnowledgeIngestionEngine | `tsd/16_LIB_UTILITIES/TSD-063_KnowledgeIngestionEngine.md` | 🟢 |
| 064 | ChatMemory | `tsd/16_LIB_UTILITIES/TSD-064_ChatMemory.md` | 🟢 |
| 065 | DBInit | `tsd/16_LIB_UTILITIES/TSD-065_DBInit.md` | 🟢 |
| 066 | ExportEngine | `tsd/16_LIB_UTILITIES/TSD-066_ExportEngine.md` | 🟢 |
| 067 | FileSystemPermissions | `tsd/16_LIB_UTILITIES/TSD-067_FileSystemPermissions.md` | 🟢 |
| 068 | OAuthConfig | `tsd/16_LIB_UTILITIES/TSD-068_OAuthConfig.md` | 🟢 |
| 069 | VocabularyDictionary | `tsd/16_LIB_UTILITIES/TSD-069_VocabularyDictionary.md` | 🟢 |
| 070 | DDQ Rules | `tsd/16_LIB_UTILITIES/TSD-070_DDQRules.md` | 🟢 |
| 071 | Logger | `tsd/16_LIB_UTILITIES/TSD-071_Logger.md` | 🟢 |
| 072 | OCR Engine | `tsd/16_LIB_UTILITIES/TSD-072_OCREngine.md` | 🟢 |

---

### 2.13 Hooks (TSD-073 → TSD-075)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 073 | useLocalBackupState | `tsd/17_HOOKS/TSD-073_useLocalBackupState.md` | 🟢 |
| 074 | useMasterData | `tsd/17_HOOKS/TSD-074_useMasterData.md` | 🟢 |
| 075 | useServiceDomains | `tsd/17_HOOKS/TSD-075_useServiceDomains.md` | 🟢 |

---

### 2.14 Admin Components (TSD-076 → TSD-093)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 076 | SystemTab | `tsd/18_ADMIN_COMPONENTS/TSD-076_SystemTab.md` | 🟢 |
| 077 | ModelSandboxTab | `tsd/18_ADMIN_COMPONENTS/TSD-077_ModelSandboxTab.md` | 🟢 |
| 078 | UserAccessTab | `tsd/18_ADMIN_COMPONENTS/TSD-078_UserAccessTab.md` | 🟢 |
| 079 | PrinciplesTab | `tsd/18_ADMIN_COMPONENTS/TSD-079_PrinciplesTab.md` | 🟢 |
| 080 | TemplatesTab | `tsd/18_ADMIN_COMPONENTS/TSD-080_TemplatesTab.md` | 🟢 |
| 081 | WorkflowTab | `tsd/18_ADMIN_COMPONENTS/TSD-081_WorkflowTab.md` | 🟢 |
| 082 | ComplianceGuardrailsTab | `tsd/18_ADMIN_COMPONENTS/TSD-082_ComplianceGuardrailsTab.md` | 🟢 |
| 083 | AuditWorkspaceTab | `tsd/18_ADMIN_COMPONENTS/TSD-083_AuditWorkspaceTab.md` | 🟢 |
| 084 | WebProvidersTab | `tsd/18_ADMIN_COMPONENTS/TSD-084_WebProvidersTab.md` | 🟢 |
| 085 | NetworkIntegrationTab | `tsd/18_ADMIN_COMPONENTS/TSD-085_NetworkIntegrationTab.md` | 🟢 |
| 086 | GlobalGuardrailsTab | `tsd/18_ADMIN_COMPONENTS/TSD-086_GlobalGuardrailsTab.md` | 🟢 |
| 087 | PromptsTab | `tsd/18_ADMIN_COMPONENTS/TSD-087_PromptsTab.md` | 🟢 |
| 088 | ServiceDomainsTab | `tsd/18_ADMIN_COMPONENTS/TSD-088_ServiceDomainsTab.md` | 🟢 |
| 089 | LayersTab | `tsd/18_ADMIN_COMPONENTS/TSD-089_LayersTab.md` | 🟢 |
| 090 | MetamodelTab | `tsd/18_ADMIN_COMPONENTS/TSD-090_MetamodelTab.md` | 🟢 |
| 091 | CategoriesTab | `tsd/18_ADMIN_COMPONENTS/TSD-091_CategoriesTab.md` | 🟢 |
| 092 | TagsTab | `tsd/18_ADMIN_COMPONENTS/TSD-092_TagsTab.md` | 🟢 |
| 093 | TrainingEventsTable | `tsd/18_ADMIN_COMPONENTS/TSD-093_TrainingEventsTable.md` | 🟢 |

---

### 2.15 Widgets (TSD-094 → TSD-097)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 094 | SystemHealth | `tsd/19_WIDGETS/TSD-094_SystemHealth.md` | 🟢 |
| 095 | DistillationTerminal | `tsd/19_WIDGETS/TSD-095_DistillationTerminal.md` | 🟢 |
| 096 | MoESelector | `tsd/19_WIDGETS/TSD-096_MoESelector.md` | 🟢 |
| 097 | WidgetLibrary | `tsd/19_WIDGETS/TSD-097_WidgetLibrary.md` | 🟢 |

---

### 2.16 E2E Tests (TSD-098 → TSD-099)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 098 | cache-journey.spec | `tsd/20_E2E_TESTS/TSD-098_cache-journey.spec.md` | 🟢 |
| 099 | sovereign-engine.spec | `tsd/20_E2E_TESTS/TSD-099_sovereign-engine.spec.md` | 🟢 |

---

### 2.17 UI Components (TSD-100 → TSD-112)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 100 | GlobalProgressWidget | `tsd/21_UI_COMPONENTS/TSD-100_GlobalProgressWidget.md` | 🟢 |
| 101 | ModelConsentModal | `tsd/21_UI_COMPONENTS/TSD-101_ModelConsentModal.md` | 🟢 |
| 102 | BackupConsentModal | `tsd/21_UI_COMPONENTS/TSD-102_BackupConsentModal.md` | 🟢 |
| 103 | BDATRadar | `tsd/21_UI_COMPONENTS/TSD-103_BDATRadar.md` | 🟢 |
| 104 | NetworkConsentModal | `tsd/21_UI_COMPONENTS/TSD-104_NetworkConsentModal.md` | 🟢 |
| 105 | NetworkGatekeeperModal | `tsd/21_UI_COMPONENTS/TSD-105_NetworkGatekeeperModal.md` | 🟢 |
| 106 | CreatableDropdown | `tsd/21_UI_COMPONENTS/TSD-106_CreatableDropdown.md` | 🟢 |
| 107 | CacheButton | `tsd/21_UI_COMPONENTS/TSD-107_CacheButton.md` | 🟢 |
| 108 | MessageBubble | `tsd/21_UI_COMPONENTS/TSD-108_MessageBubble.md` | 🟢 |
| 109 | StatusToggle | `tsd/21_UI_COMPONENTS/TSD-109_StatusToggle.md` | 🟢 |
| 110 | FolderUploadButton | `tsd/21_UI_COMPONENTS/TSD-110_FolderUploadButton.md` | 🟢 |
| 111 | AIRewriteButton | `tsd/21_UI_COMPONENTS/TSD-111_AIRewriteButton.md` | 🟢 |
| 112 | ConfirmModal | `tsd/21_UI_COMPONENTS/TSD-112_ConfirmModal.md` | 🟢 |

---

### 2.18 Gap-Fill Specs (TSD-113 → TSD-116)

| TSD | Title | File | Status |
|-----|-------|------|--------|
| 113 | OCR Pipeline | `tsd/16_LIB_UTILITIES/TSD-113_OCR_Pipeline.md` | 🟢 |
| 114 | Telemetry | `tsd/16_LIB_UTILITIES/TSD-114_Telemetry.md` | 🟢 |
| 115 | Crypto Utils | `tsd/01_INFRASTRUCTURE/TSD-115_Crypto_Utils.md` | 🟢 |
| 116 | OCR Reranker | `tsd/16_LIB_UTILITIES/TSD-116_OCR_Reranker.md` | 🟢 |

---

## 3. Summary Statistics

| Category | TSD Range | Count | Status |
|----------|-----------|-------|--------|
| Infrastructure | 001–004, 115 | 5 | 🟢 |
| Semantic Pipeline | 005–009 | 5 | 🟢 |
| Inference Engines | 010–014 | 5 | 🟢 |
| NSI Workflow | 015–019 | 5 | 🟢 |
| Security & Threats | 020–022 | 3 | 🟢 |
| UI Components (core) | 023–030 | 8 | 🟢 |
| State & Context | 031–034 | 4 | 🟢 |
| Services & Workers | 035–038 | 4 | 🟢 |
| Rust Engine Deep Dive | 039–043 | 5 | 🟢 |
| Testing | 044–048 | 5 | 🟢 |
| Future Roadmap | 049–057 | 9 | 🔵 |
| Library Utilities | 058–072, 113–114, 116 | 18 | 🟢 |
| Hooks | 073–075 | 3 | 🟢 |
| Admin Components | 076–093 | 18 | 🟢 |
| Widgets | 094–097 | 4 | 🟢 |
| E2E Tests | 098–099 | 2 | 🟢 |
| UI Components (extended) | 100–112 | 13 | 🟢 |
| **Total** | **001–116** | **116** | **🟢 107 / 🔵 9** |

---

## 4. Critical Invariants

| Invariant | Enforcement |
|-----------|-------------|
| Zero React in Engine Layer | ESLint `no-restricted-imports` + architectural review |
| DEKs in RAM only | Never persisted to IndexedDB; only wrapping keys stored |
| `checkNetworkConsent()` before any fetch | Async boolean gate in `db.app_settings` |
| `validateEndpointUrl()` on all external URLs | SSRF protection, throws on private ranges |
| WASM context ceiling | `if (pos >= n_ctx) break;` in hot loops |
| DB version auto-increment | `this.version(this.nextVersionAfter(N))` — never hardcoded |
| OCR never throws to UI | Returns best-effort text with internal error flags |
| Service Worker excludes binaries | `**/models/**`, `**/*.gguf`, `**/*.bin.gz` from precache |
| `no-unused-vars` in test files | `/* eslint-disable */` header at top of each test file |

---

## 5. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-21 | KG-Strategist | Master TSD index — 112 TSDs across 17 categories |

---

*Source: `.artefacts/docs-internal/tsd/` (17 subdirectories, 116 TSD files)*
