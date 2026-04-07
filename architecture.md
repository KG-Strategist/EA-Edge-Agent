# 🏛️ EA-NITI Edge Agent — System Architecture

> **Version:** 1.0.0 · **Last Updated:** 2026-04-07  
> **Author:** KG-Strategist · **License:** MIT

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Philosophy & Architectural Pillars](#2-design-philosophy--architectural-pillars)
3. [Technology Stack](#3-technology-stack)
4. [High-Level System Architecture](#4-high-level-system-architecture)
5. [Repository Structure](#5-repository-structure)
6. [Application Lifecycle](#6-application-lifecycle)
7. [Layered Architecture](#7-layered-architecture)
8. [Data Architecture](#8-data-architecture)
9. [AI & Inference Pipeline](#9-ai--inference-pipeline)
10. [Security Architecture](#10-security-architecture)
11. [Component Tree & View Hierarchy](#11-component-tree--view-hierarchy)
12. [Engine Catalog](#12-engine-catalog)
13. [PWA & Offline Strategy](#13-pwa--offline-strategy)
14. [Build & Deployment](#14-build--deployment)
15. [Key Design Patterns](#15-key-design-patterns)
16. [Threat Surface & Mitigations](#16-threat-surface--mitigations)
17. [Future Roadmap](#17-future-roadmap)

---

## 1. Executive Summary

**EA-NITI** (**N**etwork-isolated, **I**n-browser, **T**riage & **I**nference) is an offline-first, air-gapped Progressive Web App (PWA) that accelerates Enterprise Architecture review cycles from weeks to hours. It runs **100% locally in the browser** with zero mandatory cloud dependencies — AI inference, OCR, vector search, document generation, and threat modeling all execute on the user's hardware via WebGPU and Web Workers.

The system is purpose-built for lean EA teams in regulated industries (BFSI, government, defense) where proprietary architecture diagrams **cannot** be uploaded to cloud LLMs. NITI solves this by bringing the LLM to the data, not the data to the LLM.

### Key Capabilities

| Capability | Description |
|---|---|
| **Dynamic Content Metamodel** | TOGAF-aligned, fully customizable EA frameworks (layers, principles, artifacts) |
| **Intelligent DDQ Generator** | Auto-generates Excel Due Diligence Questionnaires with dropdown scoring |
| **BDAT Scorecard Engine** | Weighted vendor comparison across Business, Data, Application, Technology axes |
| **Air-Gapped OCR** | Local Tesseract.js extracts text from architecture diagrams |
| **Dual-Engine WebGPU LLM** | MoE model routing (Core + SME) via `@mlc-ai/web-llm` |
| **Enterprise RAG Pipeline** | Semantic search over historical decisions + ingested enterprise knowledge |
| **STRIDE Threat Modeling** | Rule-based + AI-enriched threat analysis with DFD generation |
| **Governance Workflows** | Configurable multi-stage review pipelines (AI + Human approval gates) |
| **Zero-PII Authentication** | PBKDF2-hashed local auth with pseudonymous identities |
| **Full Audit Trail** | Automatic Dexie hooks log every CREATE/UPDATE/DELETE across all tables |

---

## 2. Design Philosophy & Architectural Pillars

```
┌───────────────────────────────────────────────────────────┐
│                    DESIGN MANDATES                        │
├──────────────────┬────────────────────────────────────────┤
│  AIR-GAP FIRST   │ No mandatory network calls. All AI,   │
│                  │ OCR, and storage run locally.          │
├──────────────────┼────────────────────────────────────────┤
│  ZERO-PII        │ No emails, names, or identifiable     │
│                  │ data stored. Pseudonymous identities.  │
├──────────────────┼────────────────────────────────────────┤
│  MINIMAL COMPUTE │ Web Workers for heavy tasks. Lazy      │
│                  │ loading. VRAM-aware model swapping.    │
├──────────────────┼────────────────────────────────────────┤
│  ZERO DEPENDENCY │ Native APIs preferred. No lodash,     │
│  BIAS            │ no heavyweight UI suites.              │
├──────────────────┼────────────────────────────────────────┤
│  DOUBLE OPT-IN   │ Network features require admin toggle │
│  CONSENT         │ AND per-request user consent.          │
└──────────────────┴────────────────────────────────────────┘
```

---

## 3. Technology Stack

### Runtime Dependencies

| Layer | Technology | Purpose |
|---|---|---|
| **UI Framework** | React 19 | Component rendering |
| **Styling** | Tailwind CSS v4 | Utility-first design system |
| **Icons** | Lucide React | Lightweight SVG icon library |
| **Animations** | Motion (Framer) | Micro-animations and transitions |
| **State (Global)** | React Context (`StateContext`) | Theme, identity, system health |
| **State (Reactive DB)** | Dexie React Hooks (`useLiveQuery`) | Real-time IndexedDB subscriptions |
| **Storage** | Dexie.js v4 (IndexedDB) | All persistent data — 23 versioned schema |
| **AI Inference** | `@mlc-ai/web-llm` | WebGPU LLM (Gemma 4 / SmolLM-360M) |
| **Embeddings** | `@xenova/transformers` | `all-MiniLM-L6-v2` embeddings via Web Worker |
| **OCR** | Tesseract.js v7 | Architecture diagram text extraction |
| **PDF Parsing** | pdfjs-dist | Enterprise knowledge ingestion |
| **Spreadsheets** | SheetJS (xlsx) | DDQ Excel generation/parsing |
| **Diagrams** | Mermaid.js v11 | Data flow diagrams, architecture visuals |
| **Markdown** | react-markdown | AI report rendering |
| **Dropdowns** | react-select | Multi-select and creatable inputs |
| **PDF Export** | html2pdf.js | ADR/report export to PDF |

### Build & Dev Dependencies

| Tool | Version | Purpose |
|---|---|---|
| **Vite** | 6.x | Build tool and dev server |
| **TypeScript** | 5.8 | Type safety (ES2022 target) |
| **@vitejs/plugin-react** | 5.x | React Fast Refresh |
| **@tailwindcss/vite** | 4.x | Tailwind v4 integration |
| **vite-plugin-pwa** | 1.x | Workbox-powered PWA generation |
| **tsx** | 4.x | TypeScript execution for scripts |

---

## 4. High-Level System Architecture

```mermaid
graph TB
    subgraph Browser["🌐 Browser Runtime (100% Local)"]
        direction TB

        subgraph UI["Presentation Layer"]
            AuthGate["AuthGate<br/>(SSO / Air-Gapped Login)"]
            Navbar["Navbar<br/>(Sidebar Navigation)"]
            Views["Views<br/>(Dashboard, Reviews,<br/>Admin, Threat, Execution)"]
            Widgets["Widget Library<br/>(Configurable Dashboard)"]
        end

        subgraph State["State Layer"]
            Context["StateContext<br/>(Theme, Identity, Health)"]
            Hooks["Custom Hooks<br/>(useMasterData, useArchive,<br/>useDataPortability)"]
            LiveQuery["useLiveQuery<br/>(Reactive DB Subscriptions)"]
        end

        subgraph Engines["Engine Layer (Business Logic)"]
            AIEngine["AI Engine<br/>(WebLLM + Model Registry)"]
            RAGEngine["RAG Engine<br/>(Semantic Memory)"]
            ThreatEngine["Threat Engine<br/>(STRIDE Analysis)"]
            DDQEngine["DDQ Engine<br/>(Excel Gen/Parse)"]
            ScorecardEngine["Scorecard Engine<br/>(BDAT Weighted)"]
            PromptBuilder["Prompt Builder<br/>(Context-Aware)"]
            ExportEngine["Export Engine<br/>(MD/PDF/ADR)"]
            AuthEngine["Auth Engine<br/>(PBKDF2 + OAuth PKCE)"]
            OCREngine["OCR Engine<br/>(Tesseract.js)"]
            KnowledgeEngine["Knowledge Ingestion<br/>(PDF → Embeddings)"]
            BYOEGateway["BYOE Gateway<br/>(External Providers)"]
        end

        subgraph Workers["Web Worker Layer (Off Main Thread)"]
            AIWorker["AI Worker<br/>(WebLLM Engine)"]
            EmbedWorker["Embedding Worker<br/>(Xenova Transformers)"]
            OCRWorker["OCR Worker<br/>(Tesseract.js)"]
        end

        subgraph Data["Data Layer"]
            Dexie["Dexie.js / IndexedDB<br/>(EADatabase v23)"]
            AuditHooks["Global Audit Hooks<br/>(Auto-log all mutations)"]
            SeedData["Seed Data<br/>(TOGAF baseline)"]
        end

        subgraph PWA["PWA Layer"]
            SW["Service Worker<br/>(Workbox Auto-Update)"]
            OPFS["OPFS / CacheStorage<br/>(WebLLM Model Weights)"]
        end
    end

    subgraph External["☁️ External (Optional, Double Opt-In)"]
        HuggingFace["HuggingFace<br/>(Model Weight Downloads)"]
        OAuth["Google / Microsoft<br/>(OAuth 2.0 PKCE)"]
        BYOEProviders["BYOE Endpoints<br/>(Search / Cloud LLM /<br/>Enterprise API)"]
    end

    UI --> State
    State --> Engines
    Engines --> Workers
    Engines --> Data
    Workers --> Data
    PWA --> Data

    AIEngine -.->|"Consent Required"| HuggingFace
    AuthEngine -.->|"Hybrid Mode"| OAuth
    BYOEGateway -.->|"Double Opt-In"| BYOEProviders
```

---

## 5. Repository Structure

```
EA-Edge-Agent/
├── index.html                    # Vite SPA entry point
├── package.json                  # ea-edge-agent v1.0.0
├── vite.config.ts                # Vite + React + TW v4 + PWA plugin
├── tsconfig.json                 # ES2022, bundler moduleResolution
├── .env.example                  # OAuth Client IDs, Gemini API Key
├── .gitignore / .npmignore / .editorconfig
│
├── public/
│   ├── logo.png                  # EA-NITI branding asset
│   ├── service-worker.js         # Legacy SW (superseded by Workbox)
│   └── models/                   # Placeholder for local model weights
│
├── scripts/
│   └── tiny-model-builder/       # Python scripts for model fine-tuning
│       ├── 1_compile_dataset.py
│       └── 2_finetune_model.py
│
└── src/
    ├── main.tsx                   # React 19 root render (StrictMode)
    ├── App.tsx                    # Router + DB seeder + Auth gate
    ├── index.css                  # Tailwind v4 import + dark variant
    ├── global-types.d.ts          # Vite env types + module declarations
    │
    ├── context/
    │   └── StateContext.tsx        # Global: theme, identity, health, BIAN, tags
    │
    ├── hooks/
    │   ├── useMasterData.ts       # Query active MasterCategory by type
    │   ├── useArchive.ts          # Generic archive/restore/delete logic
    │   ├── useBianDomains.ts      # BIAN domain queries with cascading
    │   └── useDataPortability.ts  # JSON export/import for any table
    │
    ├── views/                     # Page-level components
    │   ├── AuthGate.tsx           # SSO login + air-gapped registration
    │   ├── Dashboard.tsx          # KPI cards, session list, system health
    │   ├── ArchitectureReviews.tsx # Review session list + intake launch
    │   ├── IntakeWizard.tsx       # 3-step intake: Context → DDQ → Artifacts
    │   ├── ReviewExecution.tsx    # AI pipeline: OCR → Init → Generate ADR
    │   ├── ThreatModeling.tsx     # STRIDE threat model list
    │   ├── ThreatEditor.tsx       # Interactive DFD builder + AI enrichment
    │   └── AdminPanel.tsx         # Control panel router (15 sub-tabs)
    │
    ├── components/
    │   ├── Navbar.tsx             # Responsive sidebar + mobile menu
    │   ├── SystemHealth.tsx       # WebGPU / DB / AI status indicators
    │   │
    │   ├── ui/                    # Reusable UI primitives
    │   │   ├── ConfirmModal.tsx   # Destructive action confirmation
    │   │   ├── SafeMermaid.tsx    # Error-safe Mermaid.js renderer
    │   │   ├── StatusToggle.tsx   # Unified 4-state status control
    │   │   ├── StatusSelect.tsx   # Status dropdown wrapper
    │   │   ├── PageInfoTile.tsx   # Collapsible info tile
    │   │   ├── Logo.tsx           # Animated NITI logo + mascot
    │   │   ├── ModelConsentModal.tsx # AI download consent gate
    │   │   ├── AgentChat.tsx      # Floating AI chat assistant
    │   │   ├── AIRewriteButton.tsx # Inline AI text rewrite
    │   │   ├── BDATRadar.tsx      # BDAT radar chart (pure CSS/SVG)
    │   │   ├── CreatableDropdown.tsx # Creatable multi-select
    │   │   └── DataPortabilityButtons.tsx # Export/Import triggers
    │   │
    │   ├── admin/                 # Control Panel tab components (16)
    │   │   ├── LayersTab.tsx          # Architecture layers CRUD
    │   │   ├── PrinciplesTab.tsx      # TOGAF principles CRUD + BYOE trends
    │   │   ├── BianTab.tsx            # BIAN domains CRUD
    │   │   ├── MetamodelTab.tsx       # Content metamodel CRUD
    │   │   ├── CategoriesTab.tsx      # Master categories CRUD + AI gen
    │   │   ├── TagsTab.tsx            # Bespoke tags with color picker
    │   │   ├── PromptsTab.tsx         # AI prompt template CRUD
    │   │   ├── WorkflowTab.tsx        # Governance workflow builder
    │   │   ├── TemplatesTab.tsx       # Report template CRUD
    │   │   ├── NetworkIntegrationTab.tsx # BYOE + privacy settings
    │   │   ├── SystemTab.tsx          # Portability, DB management
    │   │   ├── ModelSandboxTab.tsx     # BYOM model registry
    │   │   ├── UserAccessTab.tsx       # User management
    │   │   ├── AuditWorkspaceTab.tsx   # Audit log viewer
    │   │   ├── DpdpTab.tsx            # DPDP/Privacy compliance
    │   │   └── TrainingEventsTable.tsx # Knowledge ingestion jobs
    │   │
    │   └── widgets/
    │       └── WidgetLibrary.tsx   # Dashboard widget catalog
    │
    └── lib/                       # Pure logic modules (no React)
        ├── db.ts                  # Dexie schema (23 versions, 22 tables)
        ├── db-init.ts             # Legacy DB init
        ├── seedData.ts            # TOGAF baseline + duplicate cleanup
        ├── constants.ts           # MASTER_CATEGORY_TYPES enum
        ├── aiEngine.ts            # WebLLM: init, generate, chat, model routing
        ├── aiWorker.ts            # AI Web Worker entry point
        ├── authEngine.ts          # PBKDF2 auth + OAuth PKCE flows
        ├── oauthConfig.ts         # OAuth 2.0 provider configs + PKCE utils
        ├── ragEngine.ts           # RAG: store/query review + enterprise embeddings
        ├── embeddingWorker.ts     # Xenova MiniLM embedding Web Worker
        ├── promptBuilder.ts       # EA review prompt construction
        ├── threatEngine.ts        # STRIDE analysis + Mermaid DFD generation
        ├── scorecardEngine.ts     # BDAT weighted scorecard computation
        ├── ddqEngine.ts           # DDQ Excel generation/parsing
        ├── ddqRules.ts            # DDQ question bank + filtering rules
        ├── ocrEngine.ts           # Tesseract.js OCR wrapper
        ├── ocrWorker.ts           # OCR Web Worker entry point
        ├── exportEngine.ts        # Markdown/PDF/ADR export
        ├── knowledgeIngestionEngine.ts # PDF/text → embeddings pipeline
        ├── byoeGateway.ts         # BYOE external provider gateway
        └── webWorker.ts           # Tavily web search utility
```

---

## 6. Application Lifecycle

```mermaid
sequenceDiagram
    participant User
    participant Browser
    participant AuthGate
    participant App
    participant Dexie
    participant AIEngine

    User->>Browser: Navigate to EA-NITI
    Browser->>AuthGate: Render login screen
    Note over AuthGate: Check sessionStorage<br/>for existing session

    alt Air-Gapped Mode
        User->>AuthGate: Enter pseudonym + password + PIN
        AuthGate->>Dexie: PBKDF2 hash → verify against users table
    else Hybrid Mode
        User->>AuthGate: Click Google/Microsoft SSO
        AuthGate->>Browser: Redirect to OAuth provider (PKCE)
        Browser->>AuthGate: Return with auth code
        AuthGate->>Dexie: Derive provider ID → lookup/register user
    end

    AuthGate->>App: Pass UserIdentity to StateProvider
    App->>Dexie: seedDatabase() — upsert TOGAF baseline
    App->>App: Render Navbar + Dashboard

    User->>App: Trigger AI feature
    App->>AIEngine: initAIEngine(target)
    AIEngine->>AIEngine: Check model cache (OPFS)

    alt Model not cached
        AIEngine->>App: Dispatch EA_AI_CONSENT_REQUIRED event
        App->>User: Show ModelConsentModal
        User->>App: Consent & Download
        AIEngine->>Browser: Download weights from HuggingFace
    end

    AIEngine->>AIEngine: Create WebWorkerMLCEngine
    AIEngine->>App: Stream tokens via SSE-like callback
```

---

## 7. Layered Architecture

The codebase follows a strict 5-layer architecture. Dependencies flow **downward only** — no layer may import from a layer above it.

```
┌─────────────────────────────────────────────────────────┐
│                   PRESENTATION LAYER                     │
│  views/  ·  components/  ·  components/ui/               │
│  React components, pages, and reusable UI primitives.     │
├─────────────────────────────────────────────────────────┤
│                     STATE LAYER                          │
│  context/StateContext  ·  hooks/*  ·  useLiveQuery        │
│  Global state, reactive DB queries, custom hooks.         │
├─────────────────────────────────────────────────────────┤
│                    ENGINE LAYER                           │
│  lib/aiEngine  ·  lib/threatEngine  ·  lib/ddqEngine      │
│  lib/scorecardEngine  ·  lib/ragEngine  ·  lib/authEngine │
│  lib/exportEngine  ·  lib/byoeGateway  ·  lib/oauthConfig │
│  Pure TypeScript modules. No React imports.               │
├─────────────────────────────────────────────────────────┤
│                   WORKER LAYER                           │
│  lib/aiWorker  ·  lib/embeddingWorker  ·  lib/ocrWorker   │
│  Off-main-thread processing. Communicate via postMessage. │
├─────────────────────────────────────────────────────────┤
│                     DATA LAYER                           │
│  lib/db  ·  lib/seedData  ·  lib/constants                │
│  Dexie.js schema, migrations, seed data, type exports.    │
│  IndexedDB, OPFS, CacheStorage, sessionStorage.          │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Data Architecture

### 8.1 Database: `EADatabase` (Dexie.js / IndexedDB)

**Current Schema Version:** 23  
**Total Tables:** 22

#### Architecture & Taxonomy Domain

| Table | Key Indices | Purpose |
|---|---|---|
| `architecture_categories` | `++id, name, type, parentId` | Hierarchical layer categories (tree structure) |
| `architecture_layers` | `++id, name, coreLayer, contextLayer, status` | Architecture layers with BDAT mapping |
| `architecture_principles` | `++id, name, layerId, status` | EA principles linked to layers |
| `content_metamodel` | `++id, name, admPhase, artifactType, status` | TOGAF content metamodel artifacts |
| `master_categories` | `++id, [type+name], type, name, status` | Typed master data (compound index) |
| `bian_domains` | `++id, name, businessArea, businessDomain, status` | BIAN banking domain catalog |
| `bespoke_tags` | `++id, name, category, status` | Custom tags with Tailwind color codes |

#### Review & Workflow Domain

| Table | Key Indices | Purpose |
|---|---|---|
| `review_sessions` | `++id, projectName, type, status, workflowId` | Review sessions with state machine |
| `review_workflows` | `++id, name, triggerReviewType, status, version` | Multi-stage governance workflows |
| `report_templates` | `++id, name, category, status, version` | Markdown report templates |
| `prompt_templates` | `++id, name, category, status, executionTarget, version` | AI prompt templates |
| `threat_models` | `++id, projectName, sessionId, createdAt` | STRIDE threat model records |

#### AI & Knowledge Domain

| Table | Key Indices | Purpose |
|---|---|---|
| `review_embeddings` | `++id, sessionId` | Vector embeddings for review RAG |
| `enterprise_knowledge` | `++id, sourceFile` | Enterprise knowledge embeddings |
| `training_jobs` | `++id, status, startedAt` | Knowledge ingestion job tracking |
| `model_registry` | `++id, name, type, isActive` | BYOM model configurations |

#### Identity & Audit Domain

| Table | Key Indices | Purpose |
|---|---|---|
| `users` | `++id, pseudokey, providerId` | Zero-PII local user accounts |
| `audit_logs` | `++id, timestamp, pseudokey, action, tableName` | Immutable mutation log |
| `global_settings` | `id` | System-wide configuration (SSO mode) |

#### Application Domain

| Table | Key Indices | Purpose |
|---|---|---|
| `app_settings` | `key` | Key-value feature flags |
| `network_integrations` | `++id, providerType, isDefault` | BYOE provider configurations |
| `dashboard_states` | `++id, name, isDefault` | Saved dashboard layouts |

### 8.2 Global Audit Hooks

Every table (except `audit_logs` and `users`) is instrumented with Dexie `creating`, `updating`, and `deleting` hooks. These fire in a separate `ignoreTransaction` context to avoid blocking the primary CRUD operation:

```typescript
// Runs on every mutation across all 20 audited tables
db.audit_logs.add({
  timestamp: new Date(),
  pseudokey: sessionStorage.getItem('ea_niti_session') || 'SYSTEM',
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  tableName: table.name,
  recordId: String(primKey),
});
```

### 8.3 Schema Migration Strategy

The database uses Dexie's built-in versioned migration system. Key migrations include:

| Version | Change |
|---|---|
| v11 | Rich BIAN domains (businessArea, businessDomain fields) — clears old flat data |
| v12 | Architecture layers gain coreLayer/contextLayer fields |
| v15 | Governance workflows, report templates, multi-vendor DDQ blobs |
| v19 | **Global unified status migration** — converts `isActive: boolean` → `status: enum` across all tables |
| v20 | Zero-PII auth (users, audit_logs, dashboard_states) |
| v22 | BYOM model registry with default Llama-3-8B seed |
| v23 | Global settings table for SSO configuration |

### 8.4 Unified Status Enum

All entity tables use a **4-state lifecycle**:

```
Draft → Active → Needs Review → Deprecated
```

Review sessions use an extended 5-state machine:

```
Draft → Pending → In Progress → Completed / Rejected
```

---

## 9. AI & Inference Pipeline

### 9.1 Dual-Engine Model Architecture

EA-NITI uses a **Mixture of Experts (MoE)** routing strategy with two model slots:

| Slot | Default Model | Role | Temperature |
|---|---|---|---|
| **PRIMARY** (Domain SME) | Gemma 4 (E2B-it-q4f16_1) | Deep domain analysis, ADR gen, pattern review | 0.7 |
| **SECONDARY** (EA Core) | SmolLM-360M-Instruct (q4f16_1) | Quick DDQ audits, STRIDE scans, scorecard validation | 0.2–0.3 |

Models are resolved dynamically from the `model_registry` table via `getDynamicAppConfig()`.

### 9.2 Auto-Route Hybrid

When `executionTarget = 'Auto-Route Hybrid'`:

```typescript
const isCoreEA = /DDQ|scorecard|architecture layer|STRIDE/i.test(prompt);
target = isCoreEA ? 'EA Core Model' : 'Domain SME Model';
```

### 9.3 VRAM Management

The engine enforces a **single-model-in-VRAM** policy. If a different model is requested, the current model is explicitly unloaded before loading the new one:

```typescript
if (engine && currentActiveModelId !== targetModelId) {
    await unloadAIEngine();  // Releases WebGPU resources
}
```

### 9.4 Model Consent Flow

```
User Triggers AI Feature
    │
    ├── Model cached in OPFS? ──Yes──→ Load & Stream
    │
    └── Model NOT cached
         │
         ├── Network toggle enabled?
         │    ├── Yes → Dispatch EA_AI_CONSENT_REQUIRED event
         │    │         → Show ModelConsentModal
         │    │         → User clicks "Consent & Download"
         │    │         → Download from HuggingFace → Cache to OPFS
         │    │
         │    └── No  → Throw CONSENT_REQUIRED_OFFLINE error
         │              → Instruct user to enable network in settings
```

### 9.5 RAG Pipeline (Retrieval-Augmented Generation)

```mermaid
flowchart LR
    subgraph Ingestion["📥 Ingestion Path"]
        Upload["File Upload<br/>(PDF, TXT, MD)"] --> Extract["Text Extraction<br/>(pdfjs-dist)"]
        Extract --> Chunk["Chunking<br/>(500 chars, 100 overlap)"]
        Chunk --> Embed["Xenova MiniLM<br/>(Web Worker)"]
        Embed --> Store["IndexedDB<br/>(enterprise_knowledge)"]
    end

    subgraph Query["🔍 Query Path"]
        Prompt["User Prompt"] --> QEmbed["Embed Query<br/>(Web Worker)"]
        QEmbed --> CosSim["Cosine Similarity<br/>(Top 3)"]
        Store -.-> CosSim
        CosSim --> Inject["Context Injection<br/>(Prepend to Prompt)"]
        Inject --> LLM["WebLLM<br/>(Streaming)"]
    end
```

Two separate knowledge stores are queried in parallel:
1. **Review Embeddings** (`review_embeddings`) — Historical architectural decisions
2. **Enterprise Knowledge** (`enterprise_knowledge`) — Ingested organizational documents

Results are prepended to the prompt as `[PROPRIETARY ENTERPRISE CONTEXT]` and `[ENTERPRISE HISTORICAL CONTEXT]` blocks.

### 9.6 Full Review Execution Pipeline

```
1. OCR Phase
   └── Tesseract.js (Web Worker) extracts text from uploaded architecture diagrams

2. RAG Phase
   ├── findSimilarReviews(prompt) — historical decision context
   └── findRelevantEnterpriseContext(prompt) — enterprise knowledge context

3. Prompt Construction Phase
   └── buildPrompt(reviewType, domain, principles, ocrText, historicalContext)

4. Inference Phase
   ├── Auto-Router selects Core vs. SME model
   ├── Inject RAG context as system-level preamble
   └── Stream tokens to UI as Markdown

5. Post-Processing Phase
   ├── Render Markdown + Mermaid diagrams
   ├── Save reportMarkdown to review_sessions
   └── Generate & store review_embeddings for future RAG
```

---

## 10. Security Architecture

### 10.1 Zero Data Leakage Model

```
┌──────────────────────────────────────────────────┐
│               BROWSER SANDBOX                     │
│                                                   │
│   ┌─────────┐  ┌──────────┐  ┌────────────┐     │
│   │ WebGPU  │  │ Web      │  │ IndexedDB  │     │
│   │ LLM     │  │ Workers  │  │ (Dexie)    │     │
│   │ Engine  │  │ (OCR/    │  │            │     │
│   │         │  │  Embed)  │  │            │     │
│   └─────────┘  └──────────┘  └────────────┘     │
│                                                   │
│       ❌ No data leaves this boundary              │
│       unless BOTH conditions are met:             │
│       1. Admin enables Network toggle             │
│       2. User consents per-request                │
└──────────────────────────────────────────────────┘
          │                            │
          │ (Double Opt-In Only)       │
          ▼                            ▼
    ┌──────────┐              ┌──────────────┐
    │ Model    │              │ BYOE Gateway │
    │ Weights  │              │ (sanitized   │
    │ Download │              │  query only) │
    └──────────┘              └──────────────┘
```

### 10.2 Authentication

| Mode | Flow |
|---|---|
| **Air-Gapped** | User creates pseudonymous identity → PBKDF2 (100k iterations, SHA-256) hashes password + PIN with random salt → Stored in `users` table → 2FA login (password + PIN) |
| **Hybrid SSO** | OAuth 2.0 Authorization Code with PKCE (no client secret) → Google/Microsoft → Extract only `sub` claim (no PII) → Derive `providerId` → Link to local pseudonym |

### 10.3 Key Security Mechanisms

| Mechanism | Implementation |
|---|---|
| **PBKDF2 Key Derivation** | `window.crypto.subtle.deriveBits()` — 100k iterations, SHA-256 |
| **PKCE Code Challenge** | S256 (`crypto.subtle.digest('SHA-256')`) |
| **CSRF Protection** | Random `state` parameter validated on OAuth callback |
| **PII Stripping** | Only JWT `sub`/`oid` claim extracted — email, name, picture discarded |
| **Query Sanitization** | BYOE gateway strips `<>"'{}\\[]` and truncates to 500 chars |
| **Cross-Origin Isolation** | Vite serves with `Cross-Origin-Embedder-Policy: require-corp` + `Cross-Origin-Opener-Policy: same-origin` |
| **Pseudonymous Identities** | Auto-generated tech-themed pseudonyms (e.g., "Quantum-Nexus-42") |
| **Audit Trail** | Every DB mutation logged with timestamp, pseudokey, action, table |

---

## 11. Component Tree & View Hierarchy

### 11.1 Routing Model

The application uses **state-based routing** via `useState` in `App.tsx` — no React Router:

```typescript
const [currentView, setCurrentView] = useState('dashboard');
//  dashboard | reviews | threat | admin | expert-config |
//  agent-config | system-config | execution
```

### 11.2 View Map

```
App.tsx
├── AuthGate (unauthenticated)
│   ├── Mode Selection (Hybrid / Air-Gapped)
│   ├── SSO Login (Google / Microsoft)
│   ├── Local Registration (pseudonym + password + PIN)
│   └── Local Login (2FA)
│
└── AppContent (authenticated)
    ├── Navbar (sidebar)
    ├── Header (breadcrumbs + logout)
    ├── ModelConsentModal (global)
    ├── AgentChat (floating)
    │
    ├── Dashboard
    │   ├── KPI Cards (sessions, pending, principles, domains)
    │   ├── SystemHealth panel
    │   └── Recent Sessions list
    │
    ├── ArchitectureReviews
    │   ├── Session list (filterable)
    │   └── IntakeWizard (3-step)
    │       ├── Step 1: Context (project name, type, domain, tags)
    │       ├── Step 2: DDQ (generate/upload Excel)
    │       └── Step 3: Artifacts (upload architecture diagrams)
    │
    ├── ReviewExecution
    │   ├── Phase 1: OCR extraction
    │   ├── Phase 2: AI initialization + consent
    │   ├── Phase 3: Report generation (streaming Markdown)
    │   ├── Phase 4: BDAT Scorecard
    │   └── Phase 5: ADR export (MD/PDF)
    │
    ├── ThreatModeling
    │   ├── ThreatModeling (list view)
    │   └── ThreatEditor
    │       ├── Component builder (DFD)
    │       ├── Auto-STRIDE analysis
    │       ├── Mermaid DFD preview
    │       └── AI enrichment
    │
    └── AdminPanel (15 sub-tabs in 4 groups)
        ├── Architecture Setup
        │   ├── LayersTab
        │   ├── PrinciplesTab
        │   └── BianTab
        ├── Taxonomy & Metadata
        │   ├── MetamodelTab
        │   ├── CategoriesTab
        │   └── TagsTab
        ├── Agent Behaviors
        │   ├── PromptsTab
        │   ├── WorkflowTab
        │   └── TemplatesTab
        └── System Preferences / Security
            ├── NetworkIntegrationTab
            ├── SystemTab (+ ModelSandboxTab)
            ├── UserAccessTab
            ├── AuditWorkspaceTab
            └── DpdpTab
```

### 11.3 Admin Tab CRUD Pattern

All 16 admin tabs follow an identical pattern:

```
1. useLiveQuery()          → Reactive data loading from Dexie
2. Sortable table          → Sticky header, alternating row colors
3. useArchive() hook       → Toggle active/deprecated view
4. Modal-based forms       → Add/Edit with duplicate validation
5. StatusToggle component  → Unified 4-state lifecycle control
6. ConfirmModal            → Guard all destructive actions
7. DataPortabilityButtons  → JSON export/import per table
```

---

## 12. Engine Catalog

| Engine | File | Pure? | Dependencies | Responsibility |
|---|---|---|---|---|
| **AI Engine** | `aiEngine.ts` | ✅ | `web-llm`, `db`, `ragEngine` | Model init, streaming generation, chat, BYOM routing |
| **Auth Engine** | `authEngine.ts` | ✅ | `db`, `oauthConfig` | PBKDF2 hashing, user CRUD, OAuth PKCE flow |
| **OAuth Config** | `oauthConfig.ts` | ✅ | `db` | PKCE utilities, provider configs, token exchange, JWT extraction |
| **RAG Engine** | `ragEngine.ts` | ✅ | `db`, `embeddingWorker` | Store/query embeddings via Web Worker bridge |
| **Prompt Builder** | `promptBuilder.ts` | ✅ | `db` (types) | Constructs context-aware EA review prompts |
| **Threat Engine** | `threatEngine.ts` | ✅ | `db` (types) | STRIDE analysis, DFD Mermaid gen, AI prompt builder |
| **Scorecard Engine** | `scorecardEngine.ts` | ✅ | `ddqRules` | BDAT weighted vendor comparison with presets |
| **DDQ Engine** | `ddqEngine.ts` | ✅ | `xlsx`, `ddqRules` | Excel DDQ gen with dropdowns, parse vendor responses |
| **DDQ Rules** | `ddqRules.ts` | ✅ | None | Question bank, metadata-based filtering, scoring schema |
| **OCR Engine** | `ocrEngine.ts` | ✅ | `ocrWorker` | Spawns Tesseract.js worker, returns extracted text |
| **Export Engine** | `exportEngine.ts` | ✅ | `html2pdf.js` | Markdown download, PDF export, ADR generation |
| **Knowledge Engine** | `knowledgeIngestionEngine.ts` | ✅ | `pdfjs-dist`, `ragEngine`, `db` | PDF/text parsing → chunking → vectorization |
| **BYOE Gateway** | `byoeGateway.ts` | ✅ | `db` | Sanitized calls to WebSearch/CloudLLM/Enterprise APIs |
| **Web Worker Utils** | `webWorker.ts` | ✅ | None | Tavily API web search utility |

> **"Pure"** = No React imports. Can be unit tested independently.

---

## 13. PWA & Offline Strategy

### 13.1 Service Worker (Workbox via vite-plugin-pwa)

```typescript
// vite.config.ts
VitePWA({
  registerType: 'autoUpdate',
  injectRegister: 'auto',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
    runtimeCaching: [{
      // CRITICAL: Exclude WebLLM model shards from PWA cache
      urlPattern: /.*huggingface\.co.*\.(?:bin|wasm|json|safetensors|txt)/i,
      handler: 'NetworkOnly'
    }],
    maximumFileSizeToCacheInBytes: 5_000_000  // 5MB (for large JS bundles)
  }
})
```

### 13.2 Offline Storage Map

| Storage | What | Managed By |
|---|---|---|
| **IndexedDB** (`EADatabase`) | All application data (22 tables) | Dexie.js |
| **OPFS / CacheStorage** | WebLLM model weights (~1.8GB) | `@mlc-ai/web-llm` |
| **CacheStorage** (Workbox) | App shell (JS, CSS, HTML, assets) | vite-plugin-pwa |
| **sessionStorage** | Current session pseudokey, OAuth state | authEngine |
| **localStorage** | Theme preference (`ea-theme`) | StateContext |

### 13.3 Cross-Origin Isolation

Required for `SharedArrayBuffer` (used by WebLLM/Tesseract):

```typescript
server: {
  headers: {
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
  }
}
```

---

## 14. Build & Deployment

### 14.1 Scripts

```json
{
  "dev":     "vite --port=3000 --host=0.0.0.0",
  "build":   "vite build",
  "preview": "vite preview",
  "clean":   "rm -rf dist",
  "lint":    "tsc --noEmit"
}
```

### 14.2 Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `GEMINI_API_KEY` | Gemini API (optional, for future cloud fallback) | No |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth public client ID | Hybrid mode only |
| `VITE_MICROSOFT_CLIENT_ID` | Microsoft OAuth public client ID | Hybrid mode only |
| `DISABLE_HMR` | Disable Vite HMR (for AI Studio) | No |

### 14.3 Deployment Modes

| Mode | Description |
|---|---|
| **Air-Gapped Edge** | Build once → copy `dist/` to isolated network → serve via any static HTTP server. All AI weights pre-cached via initial consent flow. |
| **Hybrid Cloud** | Deploy as standard SPA (Vercel, Netlify, Cloud Run). OAuth SSO enabled. Model weights fetched on first use. |
| **Local Dev** | `npm run dev` → `http://localhost:3000`. HMR enabled. |

---

## 15. Key Design Patterns

### 15.1 State-Based Routing
No React Router dependency. Navigation is a single `useState<string>('dashboard')` controlling which view renders. Admin sub-navigation is a separate `useState<string>('layers')`.

### 15.2 Reactive Database Queries
All data-driven components use `useLiveQuery()` from `dexie-react-hooks`. When any IndexedDB table is mutated, subscribed components re-render automatically — no manual refresh required.

### 15.3 Worker Isolation
Heavy processing is offloaded to dedicated Web Workers:
- **AI Worker:** WebLLM engine runs in a separate thread to avoid blocking the UI during inference.
- **Embedding Worker:** Xenova Transformers vectorization runs independently.
- **OCR Worker:** Tesseract.js image processing runs in isolation.

Communication uses the promise-based `postMessage` pattern with unique message IDs.

### 15.4 Consent-Gated Network Access
Two independent gates must both be open:
1. **Admin toggle:** `app_settings.enableNetworkIntegrations = true`
2. **Per-request consent:** `ModelConsentModal` or BYOE consent popup

### 15.5 Unified Status Lifecycle
All entities share the `'Draft' | 'Active' | 'Needs Review' | 'Deprecated'` enum. The `<StatusToggle>` component provides a consistent dropdown with mandatory `<ConfirmModal>` for state transitions.

### 15.6 Generic Archive/Restore
The `useArchive` hook provides reusable soft-delete/restore/permanent-delete logic for any Dexie table, abstracting the active/deprecated filter toggle.

### 15.7 Sticky Table Headers
Admin tables use this critical pattern (do NOT wrap in nested `overflow-x-auto`):
```html
<div class="flex-1 overflow-auto border rounded-md">
  <table class="w-full text-left border-collapse min-w-full">
    <thead class="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-[...]">
```

---

## 16. Threat Surface & Mitigations

| Threat | Mitigation |
|---|---|
| **XSS via AI output** | react-markdown sanitizes LLM output; SafeMermaid wraps diagram rendering in error boundaries |
| **IndexedDB tampering** | Audit hooks log all mutations; data classified as non-PII by design |
| **Model weight poisoning** | Weights fetched from verified HuggingFace repos; integrity checked by WebLLM |
| **OAuth CSRF** | Random `state` parameter validated on callback; PKCE prevents code interception |
| **BYOE data exfiltration** | Query sanitization (`<>"'{}\\[]` stripped, 500 char limit); no local context transmitted |
| **Brute force auth** | PBKDF2 with 100k iterations makes offline attacks computationally expensive |
| **VRAM exhaustion** | Single-model-in-VRAM policy; explicit `unloadAIEngine()` before model swap |

---

## 17. Future Roadmap

| Feature | Status | Technology |
|---|---|---|
| **Model Fine-Tuning Pipeline** | Scripts ready (`scripts/tiny-model-builder/`) | Python, HuggingFace Transformers |
| **PDF/Markdown Export** | Partially implemented | html2pdf.js |
| **Custom Dashboard Widgets** | Widget library defined | React, Dexie |
| **DPDP Compliance Module** | Placeholder tab (`DpdpTab.tsx`) | — |
| **Enterprise SSO (SAML/LDAP)** | OAuth 2.0 PKCE implemented; local enterprise SSO config schema ready | oauthConfig.ts |
| **Offline Model Serving** | `public/models/` directory prepared; `isLocalhost` flag in model registry | Vite static serving |
| **Knowledge Distillation** | `allowDistillation` flag in AIModelRecord | — |

---

*Generated by EA-NITI Architecture Review · 2026-04-07*
