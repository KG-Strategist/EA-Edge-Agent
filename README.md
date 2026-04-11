# 🛡️ EA-NITI: 100% Air-Gapped Enterprise Architecture AI

<div align="center">
  <h2>Zero-Backend, In-Browser Edge AI for Enterprise Architecture</h2>
  <p><em>Reduce EA Review Cycles from Weeks to Hours with Absolute Data Privacy.</em></p>

  ![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
  ![React](https://img.shields.io/badge/React-19-blue)
  ![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-green)
  ![Local AI](https://img.shields.io/badge/AI-Local_MoE-orange)
</div>

---

## 🚀 What is EA-NITI?

**EA-NITI** (**N**etwork-isolated, **I**n-browser, **T**riage & **I**nference) is a groundbreaking Progressive Web App (PWA) designed as an assistive tool for lean Enterprise Architecture teams. Traditionally, EA reviews (NSI, ER) take weeks of manual analysis and documentation. Our solution reduces this to hours by leveraging cutting-edge browser technologies.

💡 **Project Scope & InfoSec Reality:** This tool is designed to be a frictionless, highly secure local utility. Because the app runs **100% locally in your browser** with **zero backend**, it bypasses the need for complex access management while guaranteeing zero data leakage.

## ✨ Current Active Capabilities (MVP v1.0)

| Feature | Description |
|---------|-------------|
| **Dual-Engine Support (Local API + Browser Cache)** | Dual-Engine Support (Local API + Browser Cache) with WebGPU LLM inference and MoE model routing. |
| **Enterprise RAG Pipeline** | Local RAG semantic search over historical decisions + ingested enterprise knowledge. |
| **Zero-PII Authentication** | PBKDF2-hashed local auth with pseudonymous identities. |
| **Bring Your Own Model (BYOM)** | Connect to custom local/intranet network endpoints (e.g., Ollama) for zero-egress telemetry processing. |
| **USB Sideloading (Sneakernet)** | Offline sideloading of WebLLM models via folder upload directly to browser cache. |
| **Dynamic Content Metamodel** | TOGAF-aligned, fully customizable EA frameworks. |
| **STRIDE Threat Modeling** | Interactive DFD builder with rule-based threat analysis. |
| **Governance Workflows** | Configurable multi-stage review pipelines. |
| **Customizable DPDP/GDPR Guardrails** | Admin-managed privacy rules dynamically injected into the AI system prompt before every inference call. |
| **Immutable Audit Logging with Offline CSV Export** | Every data mutation is logged with text search, date-range filtering, and air-gapped CSV download via Browser Blob API. |
| **Failsafe JSON Knowledge Base Import/Export** | Portability feature with strict schema validation and full event logging. |

## 🛡️ Security Architecture: Zero Data Leakage

The biggest hurdle to using AI in Enterprise Architecture is data privacy. You cannot upload proprietary network diagrams to public cloud LLMs. This tool solves that by running the AI on your hardware.

1. **100% Air-Gapped Design:** All AI inference, embeddings, and database operations run in isolated Web Workers and local storage. There is no cloud database.
2. **Zero-Backend:** The application is served as static files and executes entirely within the client's browser.
3. **Local Storage:** Everything is stored inside your browser's persistent cache.

## 🛠️ Tech Stack

* **Frontend:** React 19, Tailwind CSS v4, Lucide React
* **AI & Machine Learning (Browser-Native):** `@mlc-ai/web-llm` (Gemma 4 / SmolLM), `voy-search` (Embeddings)
* **Storage:** IndexedDB, WASM PostgreSQL
* **Build:** Vite 6.x, TypeScript 5.8

## 🚀 Developer Setup

### Prerequisites
- Node.js 18+
- A modern browser with WebGPU support enabled (Chrome 113+, Edge 113+)

### Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/project-niti.git
cd project-niti

# Install dependencies
npm install
```

### Run Locally
```bash
# Start development server
npm run dev

# Open http://localhost:3000 in your browser
```

### 🔒 Preparing the Offline Edge AI (Cache Initialization)

Due to our strict air-gapped security policy, the internal AI engine cannot automatically download inference weights from the public internet. You have two options:

**Option A: Offline Sideloading (Sneakernet)**
1. Obtain the raw model weights on a USB drive or local folder.
2. Navigate to **Control Panel** > **Model Sandbox**.
3. Use the **Offline Sideload (Folder Upload)** tool to select the folder. The weights will be written directly to the browser cache.

**Option B: One-Time Network Consent**
1. Navigate to the **Control Panel** > **Network & Privacy**.
2. **Enable "External Network Features"** (This temporarily allows your browser to fetch the WebLLM models).
3. Try triggering an AI feature. An Air-Gap Block consent modal will intercept the action. Click **"Consent & Download"**.
4. Wait for the browser to download and shard the weights into IndexedDB.
5. Once complete, return to **Network & Privacy** and **Disable** external network access.

🤝 Contributing
We welcome contributions from the open-source community and Enterprise Architects alike!
If you want to add new compliance frameworks (like NIST or DORA) to the baseline seeder, or improve the Web Worker memory management, please open a PR.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

📄 License
This project is licensed under the MIT License - see the LICENSE file for details.

(You are free to use, modify, and distribute this software within your own enterprise environments).

<p align="center">
  <strong>Transforming Enterprise Architecture, entirely at the edge.</strong>
</p>
