# 🛡️ EA-NITI: 100% Air-Gapped Enterprise Architecture AI

<div align="center">
  <h2>Zero-Backend, In-Browser Edge AI for Enterprise Architecture</h2>
  <p><em>Reduce EA Review Cycles from Weeks to Hours with Absolute Data Privacy.</em></p>

  ![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
  ![React](https://img.shields.io/badge/React-19-blue.svg)
  ![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-green.svg)
  ![Local AI](https://img.shields.io/badge/AI-Local_MoE-orange.svg)
  ![Release Status](https://img.shields.io/badge/MVP%201.1-Production_Release-green.svg)
</div>

---

## 🚀 What is EA-NITI?

**EA-NITI** (**N**etwork-isolated, **I**n-browser, **T**riage & **I**nference) is a Progressive Web App (PWA) designed as an assistive tool for lean Enterprise Architecture teams. It is built for organizations that must keep architecture reviews, threat models, and policy evaluations entirely local.

Traditionally, EA reviews take weeks of manual analysis and documentation. EA-NITI reduces that cycle to hours by leveraging browser-native WebGPU/WebAssembly inference, local retrieval pipelines, and secure governance guardrails.

> Project Scope & InfoSec Reality: This tool runs 100% locally in your browser with zero backend, bypasses complex external access management, and guarantees zero data leakage.

---

## 🧱 Core Architectural Pillars

### Zero-Dependency & Air-Gapped
EA-NITI operates entirely locally. No cloud databases, no external telemetry, no backend service dependencies. All AI inference, embeddings, and database operations run in isolated Web Workers and browser storage.

### Edge Inference
Local AI inference is executed via WebGPU and WebAssembly using `@mlc-ai/web-llm`. Small Language Models such as Gemma/SmolLM run in-browser, enabling AI workflows without network-based model execution.

### V8 Edge Execution
EA-NITI rejects external policy binaries like OPA/Rego. Compliance and governance logic execute as deterministic JavaScript within the browser's native V8 engine, preserving auditability and eliminating external runtime risk.

---

## ✨ Current Active Capabilities (MVP 1.1)

| Feature | Description |
|---------|-------------|
| **Dual-Engine Support (Local API + Browser Cache)** | WebGPU LLM inference plus MoE model routing with local API and browser cache support. |
| **Enterprise RAG Pipeline** | Local semantic search over enterprise knowledge, historical decisions, and ingested content. |
| **Zero-PII Authentication** | PBKDF2-hashed local authentication with pseudonymous identities and secure credential handling. |
| **Bring Your Own Model (BYOM)** | Connect custom local or intranet endpoints (for example, Ollama-style hosts) with SSRF-safe validation. |
| **USB Sideloading (Sneakernet)** | Offline sideloading of WebLLM models via folder upload directly into browser cache. |
| **Dynamic Content Metamodel** | TOGAF-aligned, fully customizable EA frameworks and domain models. |
| **STRIDE Threat Modeling** | Interactive DFD builder with rule-based threat analysis and AI-enriched mitigation planning. |
| **Governance Workflows** | Configurable multi-stage review pipelines and admin-managed approval flows. |
| **Customizable DPDP/GDPR Guardrails** | Privacy rules dynamically injected into the AI prompt before every inference call. |
| **Immutable Audit Logging with Offline CSV Export** | Every mutation logged with search, filtering, and air-gapped CSV download via the Blob API. |
| **Failsafe JSON Knowledge Base Import/Export** | Portable knowledge base import/export with strict schema validation and event logging. |

---

## 🔐 Security Architecture: Zero Data Leakage

The biggest hurdle to using AI in Enterprise Architecture is data privacy. Public cloud LLMs cannot safely receive proprietary network diagrams, policy assets, or architecture models. EA-NITI solves that by running the AI on your hardware.

1. **100% Air-Gapped Design:** All operations execute locally in the browser. There is no cloud database.
2. **Zero-Backend:** The application is delivered as static files and runs entirely within the browser.
3. **Local Storage:** All content is persisted in browser storage and IndexedDB.

---

## 🛠️ Tech Stack

* **Frontend:** React 19, Tailwind CSS v4, Lucide React
* **AI & Machine Learning (Browser-Native):** `@mlc-ai/web-llm` (Gemma 4 / SmolLM), `voy-search` (Embeddings)
* **Storage:** IndexedDB, WASM PostgreSQL
* **Build:** Vite 6.x, TypeScript 5.8

---

## 🚀 Developer Setup

### Prerequisites
- Node.js 18+
- Modern browser with WebGPU support enabled (Chrome 113+, Edge 113+)

### Installation
```bash
# Clone the repository
git clone https://github.com/KG-Strategist/EA-Edge-Agent.git
cd EA-Edge-Agent

# Install dependencies
npm install
```

### Run Locally
```bash
npm run dev
```

Open the local URL provided by Vite in a supported browser.

---

## 🔒 Preparing the Offline Edge AI (Cache Initialization)

Due to strict air-gapped security, the internal AI engine cannot automatically download inference weights from the internet. You have two options:

**Option A: Offline Sideloading (Sneakernet)**
1. Obtain model weights on a USB drive or local folder.
2. Go to **Control Panel** > **Model Sandbox**.
3. Use **Offline Sideload (Folder Upload)** to write weights directly into browser cache.

**Option B: One-Time Network Consent**
1. Go to **Control Panel** > **Network & Privacy**.
2. Enable **External Network Features** temporarily.
3. Trigger an AI feature. A consent modal appears.
4. Choose **Consent & Download**.
5. Wait for the browser to download and shard weights into IndexedDB.
6. Return to **Network & Privacy** and disable external network access once complete.

---

## 👤 First-Time Setup & Genesis Admin

When EA-NITI launches against an empty Dexie database, the first registered user is bootstrapped as **System Admin**. This secure initial role assignment flow is the trusted root for air-gapped deployments.

### Genesis Admin Flow
1. Launch the application in a supported browser.
2. Complete the initial registration form.
3. The first user receives `System Admin` privileges.
4. The user can manage guards, workflows, and security settings immediately.

---

## 📌 Deployment Guidance

EA-NITI is intended for controlled enterprise environments. Recommended deployment practices:
- Use dedicated browser profiles or isolated kiosk machines.
- Disable unnecessary browser extensions.
- Limit external network access and maintain air-gap discipline.
- Treat browser cache and IndexedDB as the protected security boundary.

---

## 🔮 Roadmap

### MVP 1.2
- Zero-Trust Biometrics with FIDO2/WebAuthn PRF extension for local decryption.
- Selective Syncing for granular trust domain sharing.

### MVP 2.0 (Hybrid Horizons)
- Policy Mitra: 3-tier multi-agent swarm for NLP-to-Code validation.
- WebRTC peer-to-peer sync for trusted enterprise mesh.
- Optional Rust-based OTEL collector for local observability.

---

## 🤝 Contributing

We welcome contributions from the open-source community and enterprise architecture practitioners.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License. See the LICENSE file for details.

<p align="center">
  <strong>Transforming Enterprise Architecture, entirely at the edge.</strong>
</p>
