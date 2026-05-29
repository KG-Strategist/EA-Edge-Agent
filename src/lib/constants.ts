export const MASTER_CATEGORY_TYPES = {
  'Review Type': 'Review Type',
  'Application Tier': 'Application Tier',
  'Hosting Model': 'Hosting Model',
  'Lifecycle Status': 'Lifecycle Status',
  'ADM Phase': 'ADM Phase',
  'Artifact Type': 'Artifact Type',
  'Layer Category': 'Layer Category',
  'Tag Category': 'Tag Category',
  'bian_business_area': 'BIAN Business Area',
  'bian_business_domain': 'BIAN Business Domain',
  'bian_control_record': 'BIAN Control Record',
  'bian_functional_pattern': 'BIAN Functional Pattern',
  'Owner Role': 'Owner Role',
  'Core Layer': 'Core Layer',
  'Context Layer': 'Context Layer',
  'Abstraction Level': 'Abstraction Level',
  'Prompt Category': 'Prompt Category',
  'AGENT_ENGINE_TYPES': 'AGENT_ENGINE_TYPES',
  'AGENT_CATEGORIES': 'AGENT_CATEGORIES',
  'mitra_domain': 'mitra_domain'
} as const;

/**
 * Enterprise Model Registry.
 * GGUF models for Sovereign Engine (OPFS) pipeline.
 * All URLs verified against bartowski mirrors (TheBloke gated as of May 2026).
 */
export const SUPPORTED_MLC_MODELS = [
  {
    label: "Gemma 4 E2B Instruct (Multimodal Edge Intelligence — Primary — Q4_0)",
    modelId: "gemma-4-e2b-it-q4_0",
    modelUrl: "https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_0.gguf",
    wasmUrl: "",
    contextLimit: 4096
  },
  {
    label: "Phi-3 Mini 4K Instruct (Optimal Coding & General Triage — Q4_0)",
    modelId: "phi-3-mini-4k-instruct-q4_0",
    modelUrl: "https://huggingface.co/bartowski/Phi-3-mini-4k-instruct-GGUF/resolve/main/Phi-3-mini-4k-instruct-Q4_0.gguf",
    wasmUrl: "",
    contextLimit: 4096
  },
  {
    label: "Qwen2.5 1.5B Instruct (Fast Edge Analytics — Q4_0)",
    modelId: "qwen2.5-1.5b-instruct-q4_0",
    modelUrl: "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_0.gguf",
    wasmUrl: "",
    contextLimit: 4096
  },
  {
    label: "Llama 3 8B Instruct (Advanced Reasoning & Deep Logic — Q4_0)",
    modelId: "llama-3-8b-instruct-q4_0",
    modelUrl: "https://huggingface.co/bartowski/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct-Q4_0.gguf",
    wasmUrl: "",
    contextLimit: 8192
  },
  {
    label: "Mistral 7B Instruct v0.3 (Versatile Foundation — Q4_0)",
    modelId: "mistral-7b-instruct-v0.3-q4_0",
    modelUrl: "https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_0.gguf",
    wasmUrl: "",
    contextLimit: 4096
  },
  {
    label: "SmolLM2 1.7B Instruct (Fast Edge Analytics — Q4_0)",
    modelId: "smollm2-1.7b-instruct-q4_0",
    modelUrl: "https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_0.gguf",
    wasmUrl: "",
    contextLimit: 2048
  },
  {
    label: "TinyLlama 1.1B Chat v1.0 (Lightweight Triage — Q4_0)",
    modelId: "tinyllama-1.1b-chat-v1.0-q4_0",
    modelUrl: "https://huggingface.co/bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/TinyLlama-1.1B-Chat-v1.0-Q4_0.gguf",
    wasmUrl: "",
    contextLimit: 2048
  },
  {
    label: "Custom Model / Unlisted",
    modelId: "custom",
    modelUrl: "",
    wasmUrl: "",
    contextLimit: 4096
  }
];
