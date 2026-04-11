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
  'AGENT_CATEGORIES': 'AGENT_CATEGORIES'
} as const;

/**
 * Official MLC binary-mlc-llm-libs WASM URL lookup table.
 * Keys are lowercase substrings of the Model ID — matched in order.
 * Add new entries here; the engine and UI will pick them up automatically.
 */
export const WASM_URL_MAP: Array<{ match: string; wasmUrl: string }> = [
  {
    match: 'phi-3-mini-4k-instruct-q4f16_1',
    wasmUrl: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Phi-3-mini-4k-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
  },
  {
    match: 'phi-3-mini-128k-instruct-q4f16_1',
    wasmUrl: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Phi-3-mini-128k-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
  },
  {
    match: 'gemma-2b-it-q4f16_1',
    wasmUrl: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/gemma-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm',
  },
  {
    match: 'gemma-2b-it-q4f32_1',
    wasmUrl: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/gemma-2b-it-q4f32_1-ctx4k_cs1k-webgpu.wasm',
  },
  {
    match: 'llama-3-8b-instruct-q4f16_1',
    wasmUrl: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Llama-3-8B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
  },
  {
    match: 'llama-3-8b-instruct-q4f32_1',
    wasmUrl: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Llama-3-8B-Instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm',
  },
  {
    match: 'smollm2-1.7b-instruct-q4f16_1',
    wasmUrl: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/SmolLM2-1.7B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
  },
  {
    match: 'smollm-360m-instruct-q4f16_1',
    wasmUrl: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/SmolLM-360M-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
  },
];

/** Resolve the official WASM URL for a given model ID string (case-insensitive substring match). */
export function resolveWasmUrl(modelId: string): string {
  const lower = modelId.toLowerCase();
  const found = WASM_URL_MAP.find(entry => lower.includes(entry.match.toLowerCase()));
  return found?.wasmUrl ?? '';
}

/**
 * Enterprise Model Registry.
 * Used to completely eliminate manual WebLLM configuration guessing on the frontend.
 * Deliberately excludes Qwen per architectural directives.
 */
export const SUPPORTED_MLC_MODELS = [
  {
    label: "Phi-3 Mini 4K Instruct (Optimal Coding & General Triage)",
    modelId: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
    modelUrl: "https://huggingface.co/mlc-ai/Phi-3-mini-4k-instruct-q4f16_1-MLC/resolve/main/",
    wasmUrl: "",
    contextLimit: 4096
  },
  {
    label: "Gemma 2B IT (Fast Edge Analytics)",
    modelId: "gemma-2b-it-q4f16_1-MLC",
    modelUrl: "https://huggingface.co/mlc-ai/gemma-2b-it-q4f16_1-MLC/resolve/main/",
    wasmUrl: "",
    contextLimit: 4096
  },
  {
    label: "Llama 3 8B Instruct (Advanced Reasoning & Deep Logic)",
    modelId: "Llama-3-8B-Instruct-q4f32_1-MLC",
    modelUrl: "https://huggingface.co/mlc-ai/Llama-3-8B-Instruct-q4f32_1-MLC/resolve/main/",
    wasmUrl: "",
    contextLimit: 4096
  },
  {
    label: "Mistral 7B Instruct v0.3 (Versatile Foundation)",
    modelId: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",
    modelUrl: "https://huggingface.co/mlc-ai/Mistral-7B-Instruct-v0.3-q4f16_1-MLC/resolve/main/",
    wasmUrl: "",
    contextLimit: 4096
  },
  {
    label: "SmolLM2 1.7B Instruct (Fast Edge Analytics)",
    modelId: "SmolLM2-1.7B-Instruct-q4f16_1-MLC",
    modelUrl: "https://huggingface.co/mlc-ai/SmolLM2-1.7B-Instruct-q4f16_1-MLC/resolve/main/",
    wasmUrl: "",
    contextLimit: 2048
  },
  {
    label: "Custom Sideloaded / Unlisted Model",
    modelId: "custom",
    modelUrl: "",
    wasmUrl: "",
    contextLimit: 4096
  }
];
