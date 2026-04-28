# 🛡️ EA-NITI: 100% Air-Gapped OS for Enterprise Architecture

<div align="center">
  <h2>Zero-Backend, In-Browser Agentic Edge AI</h2>
  <p><em>Reduce EA Review Cycles from Weeks to Hours with Sovereign Data Privacy.</em></p>

  ![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
  ![React](https://img.shields.io/badge/React-19-blue.svg)
  ![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-green.svg)
  ![Local AI](https://img.shields.io/badge/AI-Sovereign_Engine-orange.svg)
  ![Release Status](https://img.shields.io/badge/v1.1.1-Production_Ready-green.svg)
</div>

---

## 🚀 What is EA-NITI?

**EA-NITI** (**N**etwork-isolated, **I**n-browser, **T**riage & **I**nference) is a Progressive Web App (PWA) that functions as a 100% air-gapped, zero-dependency Agentic Operating System. It is built for organizations that must keep architecture reviews, threat models, and policy evaluations entirely local.

Traditionally, EA reviews take weeks of manual analysis and documentation. EA-NITI reduces that cycle to hours by leveraging browser-native WebGPU/WebAssembly inference, a deterministic Neuro-Symbolic structural engine, and secure local governance guardrails.

---

## 🧱 Core Architectural Pillars

### 100% Air-Gapped & Zero-Dependency
EA-NITI operates entirely locally. No cloud databases, no external telemetry, no backend service dependencies. All AI inference, embeddings, and database operations run in isolated Web Workers and browser storage.

### Sovereign Edge Inference
Local AI inference is executed via WebGPU and WebAssembly using `@mlc-ai/web-llm`. Small Language Models such as Gemma/SmolLM run in-browser, enabling AI workflows without network-based model execution.

### Tier-3: Deterministic V8 Execution
EA-NITI rejects external policy binaries like OPA/Rego. Compliance logic and offline chat execute as deterministic JavaScript within a high-performance binary memory arena, preserving 100% auditability and eliminating hallucination risk.

---

## ✨ Current Active Capabilities (v1.1.1)

| Feature | Description |
|---------|-------------|
| **Sovereign Engine (ZOH)** | High-performance 1024-bit Zoned Orthogonal Hashing for O(1) intent routing. |
| **Epistemic Reasoning Engine** | O(1) Causal Graph traversal with JIT Transitive Curiosity, LLM Knowledge Distillation, and Belief State Trust Model. |
| **Deterministic Synthesis** | Zero-hallucination offline fallback using triplet-store fact retrieval (Uint32 compressed). |
| **Pre-flight Guardrail Interceptor** | Policy enforcement in < 1ms using bitwise Tanimoto intersections on contiguous memory. |
| **Sovereign Compiler** | Build-time compilation of 600k+ records into optimized binary reflexes (`.bin`). |
| **Enterprise RAG Pipeline** | Local semantic search over enterprise knowledge, historical decisions, and ingested content. |
| **Zero-PII Authentication** | PBKDF2-hashed local authentication with secure credential vaulting. |
| **USB Sideloading (Sneakernet)** | Offline model weight ingestion via folder upload directly into browser CacheStorage. |
| **STRIDE Threat Modeling** | Interactive DFD builder with Mermaid generation and AI-enriched mitigation planning. |
| **Governance Workflows** | Configurable multi-stage review pipelines and admin-managed approval flows. |
| **Immutable Audit Logging** | Every mutation logged with search, filtering, and air-gapped CSV export. |

---

## 🛠️ Tech Stack

* **Frontend:** React 19, Tailwind CSS v4, IBM Plex (Sans/Mono), Lucide React
* **AI & Machine Learning:** `@mlc-ai/web-llm`, custom `StructuralVectoriser` (Bitwise POPCNT math), `@xenova/transformers` (Embeddings)
* **Storage:** Dexie.js (IndexedDB v32), WASM PostgreSQL (`pglite`)
* **Build:** Vite 6.x, TypeScript 5.8

---

## 🚀 Developer Setup

### Prerequisites
- Node.js 18+
- Modern browser with WebGPU support enabled (Chrome 113+, Edge 113+)

### Installation & Build
```bash
# Install dependencies
npm install

# Compile the baseline structural corpus
npm run build:corpus

# Run development server
npm run dev
```

### Compile a Custom Structural Corpus
*(Note: The raw proprietary data source files are intentionally not included in this open-source repository. The application uses a pre-compiled brain out-of-the-box.)* To train the engine on your own enterprise data, place your custom text data in the designated `public/` files and run:
```bash
npm run build:corpus
```

---

## 🔮 Roadmap

### MVP 1.2: The Knowledge Nexus
- **NITI-Pedia:** OPFS-backed markdown knowledge base and local wiki.
- **Universal Persona Pivot:** Domain agents for SecOps, Legal, and HR.

### MVP 2.0: Swarm Intelligence
- **Policy Mitra:** 3-tier multi-agent swarm for NLP-to-Code validation.
- **WebRTC Sync:** Serverless mesh sync for trusted air-gapped devices.

---

## 📄 License

This project is licensed under the MIT License.

<p align="center">
  <strong>Transforming Enterprise Architecture, entirely at the edge.</strong>
</p>
