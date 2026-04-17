# 🛡️ EA-NITI: 100% Air-Gapped Sovereign Enterprise Architecture AI

<div align="center">
  <h2>Industry-Agnostic, Zero-Backend, In-Browser Edge AI</h2>
  <p><em>Sovereign Enterprise Architecture for highly classified environments.</em></p>

  ![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
  ![React](https://img.shields.io/badge/React-19-blue.svg)
  ![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-brightgreen.svg)
  ![Zero-Backend](https://img.shields.io/badge/Zero--Backend-True-green.svg)
  ![Release Status](https://img.shields.io/badge/MVP%201.1-Production%20Release-green.svg)
</div>

---

## 🚀 Product Overview

**EA-NITI** is a 100% Air-Gapped Sovereign Enterprise Architecture AI platform. It is designed for enterprise architects and InfoSec teams who require local AI inference, deterministic policy evaluation, and absolute data sovereignty.

### Value Proposition
- Zero backend, zero external telemetry, zero cloud data egress.
- Runs entirely in the browser using local WebGPU/WebAssembly inference.
- Enables threat modeling, enterprise architecture reviews, and policy validation without exposing sensitive assets.
- Designed for classified and regulated environments where data must remain on-premises.

---

## 🧱 Core Architectural Pillars

### Zero-Dependency & Air-Gapped
EA-NITI operates entirely locally. No cloud databases, no external telemetry, no backend service dependencies. All data persists inside the browser viewport and browser storage under the customer's control.

### Edge Inference
Local AI inference is executed via WebGPU and WebAssembly using `@mlc-ai/web-llm`. Small Language Models such as Gemma/SmolLM run in-browser, enabling AI workflows without network-based model execution.

### V8 Edge Execution
EA-NITI explicitly rejects external policy binaries such as OPA/Rego. Compliance and governance logic execute as deterministic JavaScript within the browser's native V8 engine, preserving auditability and eliminating external runtime risk.

---

## ✨ MVP 1.1 Key Features

- **Dual-Engine AI**: Local WebGPU inference plus Bring Your Own Model (BYOM) support with SSRF-safe network guards.
- **Enterprise RAG**: Local retrieval-augmented generation using `voy-search` vector embeddings stored in IndexedDB.
- **Zero-Trust Security**: Local PBKDF2 authentication, AES-256-GCM encryption at rest, and cryptographic wipe support.
- **Offline Sideloading**: Sneakernet-style import of WebLLM weights via USB/local folder upload directly into browser cache.
- **STRIDE Threat Modeling**: Auto-generated Data Flow Diagrams and AI-enriched mitigation planning rendered safely via DOMPurify.
- **Data Portability**: Zero-dependency local syncing using the native File System Access API for export/import.

---

## 🔐 Security & Trust Model

EA-NITI is engineered for environments where data leakage is unacceptable.

### Security Principles
- Local PBKDF2 authentication for identity bootstrapping.
- AES-256-GCM encryption for sensitive vault items, threat models, and audit records.
- Cryptographic erase support for secure deletion.
- SSRF-safe network guard preventing connections to localhost, private IP blocks, and cloud metadata endpoints.
- No external telemetry collection, no cloud profiling, no backend analytics.

### Threat Mitigation
- In-browser policy execution prevents external binary injection.
- IndexedDB is the persistent store; no remote database is used.
- Model weights and inference artifacts stay within the browser cache.
- All UI-rendered diagrams and dynamic content are sanitized to prevent XSS.

---

## 🛠️ Developer Setup

### Prerequisites
- Node.js 18+
- Modern browser with WebGPU support (Chrome 113+, Edge 113+)

### Install
```bash
npm install
```

### Run
```bash
npm run dev
```

Open the local URL provided by Vite and complete the first-time setup.

---

## 👤 First-Time Setup & Genesis Admin

When EA-NITI is launched against an empty Dexie database, the first registered user is bootstrapped as **System Admin**. This is the secure initial role assignment flow for air-gapped deployments.

### Genesis Admin Flow
1. Launch the application in a supported browser.
2. Complete the initial registration form.
3. The first user is granted `System Admin` privileges.
4. The user can immediately manage guards, workflows, and security settings.

---

## 🧪 MVP 1.1 Audit-Ready Features

| Capability | Description |
|---|---|
| Local WebGPU Inference | In-browser AI execution with no cloud dependency. |
| BYOM Support | Bring Your Own Model with network-sanitized endpoint validation. |
| Local RAG | Enterprise retrieval via `voy-search` and IndexedDB embeddings. |
| Offline Sideloading | Secure model weight import via local folder/USB. |
| STRIDE Threat Modeling | Auto-generated threat plans with secure DFD rendering. |
| File System Portability | Native local file export/import without external services. |
| Audit Logging | Encrypted, local audit trail storage. |
| V8 Policy Execution | Deterministic JS policy evaluation instead of external binaries. |

---

## 📌 Deployment Guidance

EA-NITI is intended for controlled enterprise environments. Recommended deployment practices:
- Use dedicated browser profiles or isolated kiosk machines.
- Disable unnecessary browser extensions.
- Limit external network access and maintain air-gap discipline.
- Treat the browser cache and IndexedDB as the protected security boundary.

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

## 📄 Related Documentation
- [`architecture.md`](./architecture.md)
- [`MVP1-RELEASEACTIONPLAN.md`](./MVP1-RELEASEACTIONPLAN.md)
- [`MVP1_RELEASE_AUDIT.md`](./MVP1_RELEASE_AUDIT.md)
- [`RELEASE_NOTES.md`](./RELEASE_NOTES.md)
- [`PROJECT_STATUS.md`](./PROJECT_STATUS.md)

---

## 📜 License
MIT License
