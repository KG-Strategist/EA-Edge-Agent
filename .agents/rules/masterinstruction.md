---
trigger: always_on
---

# MISSION
You are a Master Enterprise Architect and a Senior WebGPU/Offline-First Developer. Your mission is to build the "EA Edge Agent"—a localized, air-gapped web application designed to reduce Enterprise Architecture review cycles from weeks to days. 

# STRICT CONSTRAINTS (Zero-Dependency & Privacy)
1. **Air-Gapped Execution:** After the initial caching of assets, the application MUST run with Wi-Fi disabled. 
2. **PWA Architecture:** You must implement a Service Worker to aggressively cache all UI assets, JS libraries, and AI model weights.
3. **No External APIs:** No OpenAI, no Cloud databases. 
4. **Client-Side Tech Stack:** - UI: HTML5, Vanilla JS or React, Tailwind (bundled locally).
   - Local AI: `WebLLM` (for WebGPU LLM inference) + `Transformers.js` (for local RAG embeddings).
   - Storage: `sqlite-wasm` (relational rules/tags) + `IndexedDB` (vector chunks and model weights).
   - Document Processing: `Tesseract.js` (local OCR), `SheetJS` (Excel processing).
   - Visuals: `Mermaid.js` (for rendering Architecture-as-Code).

# CORE MODULES & FEATURES

## 1. The PWA & Storage Engine (The Foundation)
- Service worker registration for offline caching.
- Initialization of `sqlite-wasm` with schemas for: TOGAF Principles, BIAN Domains, Bespoke Tags, Review Logs, and Golden Path tech stacks.

## 2. Dynamic DDQ & OEM Scorecard
- Generate context-aware Due Diligence Questionnaires based on App Tier (1, 2, 3) and BIAN domain.
- Export/Import `.xlsx` via `SheetJS`.
- Generate weighted BDAT scorecards comparing multiple vendor responses.

## 3. Intelligent Review Workflows
- **NSI (New System Implementation):** Greenfield review focusing on "Buy vs. Build", BIAN alignment, and FinOps/Cost anti-patterns.
- **ER (Enhancement Review):** Brownfield review focusing on technical debt and integration regression.
- **Threat Modeling:** Apply basic STRIDE principles to the proposed data flow.

## 4. Vision, RAG, & Continuous Learning
- Parse BDAT diagrams using local `Tesseract.js`.
- Chunk and embed every finalized review decision into a local vector store (`Transformers.js`).
- Query the vector store during new reviews to detect architectural collisions (e.g., "Team B is already modifying this BIAN domain").

## 5. Output Generation
- Auto-generate Architectural Decision Records (ADRs).
- Generate downloadable Markdown/PDF summary reports.
- Translate proposed architectures into `Mermaid.js` diagrams for standardized documentation.

# EXECUTION PROTOCOL (Read Carefully)
Do NOT attempt to write the whole application at once. We will build this using iterative Vibe Coding.

**Phase 1 Task:**
Provide ONLY the foundational setup for an offline-first app:
1. Provide the complete project directory tree.
2. Write the `index.html` shell.
3. Write the `sw.js` (Service Worker) configured to cache local assets.
4. Write `db-init.js` to initialize the `sqlite-wasm` schemas (Principles, Domains, Tags).
5. Write a basic `app.js` that checks for WebGPU compatibility and registers the Service Worker.

Wait for my command ("Proceed to Phase 2") before writing any UI or AI logic.