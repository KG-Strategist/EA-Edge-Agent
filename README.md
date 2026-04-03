# 🛡️ EA Edge Agent

<div align="center">
  <h2>Reduce EA Review Cycles from Weeks to Hours with Absolute Data Privacy</h2>
  <p><em>An open-source, air-gapped Enterprise Architecture co-pilot powered by WebGPU and local AI.</em></p>

  ![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
  ![React](https://img.shields.io/badge/React-18-blue)
  ![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-green)
  ![Local AI](https://img.shields.io/badge/AI-Local_Phi--3-orange)
</div>

---

## 🚀 What is the EA Edge Agent?

The EA Edge Agent is a groundbreaking Progressive Web App (PWA) designed as an assistive tool for lean Enterprise Architecture teams. Traditionally, EA reviews (NSI, ER) take weeks of manual analysis and documentation. Our solution reduces this to hours by leveraging cutting-edge browser technologies.

💡 **Project Scope & InfoSec Reality:** This tool is designed to be a frictionless, single-user local utility. It intentionally does **not** include heavyweight enterprise identity integrations (like UAM, PAM, or SSO). Because the app runs 100% locally in your browser and stores data via IndexedDB, it bypasses the need for complex access management while guaranteeing zero data leakage.

## ✨ Core Features

| Feature | Description | Technology |
|---------|-------------|------------|
| **Dynamic Content Metamodel** | Flexible EA frameworks with customizable layers, principles, and artifacts. | Dexie.js (IndexedDB) |
| **Intelligent DDQ Generator** | Automated Excel-based Due Diligence Questionnaires based on intake context. | xlsx (SheetJS) |
| **Air-Gapped OCR** | Local optical character recognition to read architecture diagrams offline. | tesseract.js (Web Worker) |
| **WebGPU LLM Evaluation** | Browser-native AI to analyze systems against your specific EA principles. | @mlc-ai/web-llm (Phi-3-mini) |
| **Local RAG Pipeline** | Vector-based retrieval of past architectural decisions to prevent collisions. | @xenova/transformers |
| **Agnostic BYOE Gateway** | Opt-in "Bring Your Own Endpoint" to fetch market trends securely. | Custom Gateway |
| **Architecture-as-Code** | Auto-generates Mermaid.js visual diagrams for final ADR exports. | mermaid.js |

## 🛡️ Security Architecture: Zero Data Leakage

The biggest hurdle to using AI in Enterprise Architecture is data privacy. You cannot upload proprietary network diagrams to public cloud LLMs. This tool solves that by running the AI on your hardware.

1. **Air-Gapped Design:** All AI inference, embeddings, and OCR processing run in isolated Web Workers. There is no cloud database.
2. **Double Opt-In BYOE Gateway:** Network integrations are disabled by default. If an admin chooses to fetch external market trends, they must explicitly consent. **Zero local architecture data (principles, tags, project names) is ever transmitted.**
3. **Local Storage:** Everything is stored inside your browser's persistent cache via Dexie.js.

## 🛠️ Tech Stack

* **Frontend:** React 19, Tailwind CSS, Lucide React
* **AI & Machine Learning (Browser-Native):** `@mlc-ai/web-llm` (Phi-3), `@xenova/transformers` (Embeddings)
* **Document Engine:** `tesseract.js` (OCR), `xlsx` (Excel), `html2pdf.js`, `mermaid` (Diagrams)
* **Storage:** `Dexie.js` (IndexedDB wrapper)
* **Build:** Vite, TypeScript

## 🚀 Developer Setup

### Prerequisites
- Node.js 18+
- A modern browser with WebGPU support enabled (Chrome 113+, Edge 113+)

### Installation
```bash
# Clone the repository
git clone [https://github.com/yourusername/ea-edge-agent.git](https://github.com/yourusername/ea-edge-agent.git)
cd ea-edge-agent

# Install dependencies
npm install
Run Locally
Bash
# Start development server
npm run dev

# Open http://localhost:3000 in your browser
Note on First Run: Upon the first launch, the app will download the LLM weights (~1.8GB for Phi-3-mini) and embedding models into your browser cache. Subsequent loads are instantaneous and fully offline.

🤝 Contributing
We welcome contributions from the open-source community and Enterprise Architects alike!
If you want to add new compliance frameworks (like NIST or DORA) to the baseline seeder, or improve the Web Worker memory management, please open a PR.

Fork the repository

Create a feature branch (git checkout -b feature/AmazingFeature)

Commit your changes (git commit -m 'Add some AmazingFeature')

Push to the branch (git push origin feature/AmazingFeature)

Open a Pull Request

📄 License
This project is licensed under the MIT License - see the LICENSE file for details.

(You are free to use, modify, and distribute this software within your own enterprise environments).

<div align="center">
<p><strong>Transforming Enterprise Architecture, entirely at the edge.</strong></p>
</div>
