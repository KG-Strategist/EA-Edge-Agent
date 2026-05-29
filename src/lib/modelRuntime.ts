export type ChatTemplateFamily = 'chatml' | 'llama3' | 'mistral' | 'gemma' | 'phi3';

export interface RuntimeModelProfile {
  modelId: string;
  architecture: string;
  tokenizerHint: 'bpe' | 'sentencepiece' | 'unigram' | 'unknown';
  templateFamily: ChatTemplateFamily;
  contextLimit: number;
  defaultMaxNewTokens: number;
  hardMaxNewTokens: number;
  stopSequences: string[];
  notes: string;
}

export type ChatMessageLike = {
  role: string;
  content: string;
};

const COMMON_CONTROL_STOPS = [
  '<|im_end|>',
  '<|endoftext|>',
  '<|eot_id|>',
  '<|end|>',
  '</s>',
  '<end_of_turn>',
];

export const MODEL_RUNTIME_PROFILES: Record<string, RuntimeModelProfile> = {
  'gemma-4-e2b-it-q4_0': {
    modelId: 'gemma-4-e2b-it-q4_0',
    architecture: 'gemma',
    tokenizerHint: 'sentencepiece',
    templateFamily: 'gemma',
    contextLimit: 4096,
    defaultMaxNewTokens: 48,
    hardMaxNewTokens: 96,
    stopSequences: ['<end_of_turn>', '</s>', ...COMMON_CONTROL_STOPS],
    notes: 'Primary catalog model. Browser WASM should use a short response budget until PCTR/WebGPU paths land.',
  },
  'phi-3-mini-4k-instruct-q4_0': {
    modelId: 'phi-3-mini-4k-instruct-q4_0',
    architecture: 'phi3',
    tokenizerHint: 'bpe',
    templateFamily: 'phi3',
    contextLimit: 4096,
    defaultMaxNewTokens: 48,
    hardMaxNewTokens: 96,
    stopSequences: ['<|end|>', '<|endoftext|>', ...COMMON_CONTROL_STOPS],
    notes: 'Phi-3 instruct family uses explicit role/end control markers.',
  },
  'qwen2.5-1.5b-instruct-q4_0': {
    modelId: 'qwen2.5-1.5b-instruct-q4_0',
    architecture: 'qwen2',
    tokenizerHint: 'bpe',
    templateFamily: 'chatml',
    contextLimit: 4096,
    defaultMaxNewTokens: 64,
    hardMaxNewTokens: 128,
    stopSequences: ['<|im_end|>', '<|endoftext|>', ...COMMON_CONTROL_STOPS],
    notes: 'Qwen Instruct expects ChatML-style turns; the previous placeholder role format prevents reliable EOS behavior.',
  },
  'llama-3-8b-instruct-q4_0': {
    modelId: 'llama-3-8b-instruct-q4_0',
    architecture: 'llama',
    tokenizerHint: 'bpe',
    templateFamily: 'llama3',
    contextLimit: 8192,
    defaultMaxNewTokens: 24,
    hardMaxNewTokens: 64,
    stopSequences: ['<|eot_id|>', '<|end_of_text|>', ...COMMON_CONTROL_STOPS],
    notes: 'Large browser-WASM catalog entry. Kept intentionally short unless daemon/PCTR is available.',
  },
  'mistral-7b-instruct-v0.3-q4_0': {
    modelId: 'mistral-7b-instruct-v0.3-q4_0',
    architecture: 'llama',
    tokenizerHint: 'sentencepiece',
    templateFamily: 'mistral',
    contextLimit: 4096,
    defaultMaxNewTokens: 32,
    hardMaxNewTokens: 80,
    stopSequences: ['</s>', ...COMMON_CONTROL_STOPS],
    notes: 'Mistral instruct family expects [INST] turns.',
  },
  'smollm2-1.7b-instruct-q4_0': {
    modelId: 'smollm2-1.7b-instruct-q4_0',
    architecture: 'llama',
    tokenizerHint: 'bpe',
    templateFamily: 'chatml',
    contextLimit: 2048,
    defaultMaxNewTokens: 64,
    hardMaxNewTokens: 128,
    stopSequences: ['<|im_end|>', '<|endoftext|>', ...COMMON_CONTROL_STOPS],
    notes: 'Small instruct catalog model; ChatML fallback matches common SmolLM2 GGUF exports.',
  },
  'tinyllama-1.1b-chat-v1.0-q4_0': {
    modelId: 'tinyllama-1.1b-chat-v1.0-q4_0',
    architecture: 'llama',
    tokenizerHint: 'sentencepiece',
    templateFamily: 'chatml',
    contextLimit: 2048,
    defaultMaxNewTokens: 80,
    hardMaxNewTokens: 160,
    stopSequences: ['<|im_end|>', '</s>', ...COMMON_CONTROL_STOPS],
    notes: 'Tiny triage catalog model; still browser-budgeted to avoid runaway decode loops.',
  },
};

const CUSTOM_PROFILE: RuntimeModelProfile = {
  modelId: 'custom',
  architecture: 'unknown',
  tokenizerHint: 'unknown',
  templateFamily: 'chatml',
  contextLimit: 4096,
  defaultMaxNewTokens: 48,
  hardMaxNewTokens: 96,
  stopSequences: COMMON_CONTROL_STOPS,
  notes: 'Custom GGUF uses conservative ChatML fallback and compatibility diagnostics.',
};

export function getRuntimeModelProfile(modelId?: string | null): RuntimeModelProfile {
  if (!modelId) return CUSTOM_PROFILE;
  return MODEL_RUNTIME_PROFILES[modelId] || { ...CUSTOM_PROFILE, modelId };
}

function normalizeRole(role: string): 'system' | 'user' | 'assistant' {
  if (role === 'system' || role === 'assistant') return role;
  return 'user';
}

function splitMessages(messages: ChatMessageLike[]) {
  const system = messages
    .filter(m => normalizeRole(m.role) === 'system')
    .map(m => m.content.trim())
    .filter(Boolean)
    .join('\n\n');
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const message of messages) {
    const role = normalizeRole(message.role);
    const content = message.content.trim();
    if (role !== 'system' && content.length > 0) {
      turns.push({ role, content });
    }
  }
  return { system, turns };
}

export function renderChatPrompt(
  messages: ChatMessageLike[],
  modelId?: string | null,
  metadataChatTemplate?: string | null
): string {
  const profile = getRuntimeModelProfile(modelId);
  const family = inferFamilyFromTemplate(metadataChatTemplate) || profile.templateFamily;
  const { system, turns } = splitMessages(messages);

  switch (family) {
    case 'llama3':
      return renderLlama3(system, turns);
    case 'mistral':
      return renderMistral(system, turns);
    case 'gemma':
      return renderGemma(system, turns);
    case 'phi3':
      return renderPhi3(system, turns);
    case 'chatml':
    default:
      return renderChatML(system, turns);
  }
}

export function clampGenerationBudget(modelId: string | null | undefined, requested?: number): number {
  const profile = getRuntimeModelProfile(modelId);
  const desired = requested ?? profile.defaultMaxNewTokens;
  return Math.max(1, Math.min(desired, profile.hardMaxNewTokens));
}

export function stripStopSequences(text: string, modelId?: string | null): string {
  const profile = getRuntimeModelProfile(modelId);
  let earliest = -1;
  for (const stop of profile.stopSequences) {
    const idx = text.indexOf(stop);
    if (idx >= 0 && (earliest === -1 || idx < earliest)) {
      earliest = idx;
    }
  }
  const trimmed = earliest >= 0 ? text.slice(0, earliest) : text;
  return trimmed
    .replace(/<\|im_start\|>assistant\s*$/g, '')
    .replace(/<\|start_header_id\|>assistant<\|end_header_id\|>\s*$/g, '')
    .trim();
}

function inferFamilyFromTemplate(template?: string | null): ChatTemplateFamily | null {
  if (!template) return null;
  if (template.includes('<|start_header_id|>')) return 'llama3';
  if (template.includes('[INST]')) return 'mistral';
  if (template.includes('<start_of_turn>')) return 'gemma';
  if (template.includes('<|system|>') && template.includes('<|end|>')) return 'phi3';
  if (template.includes('<|im_start|>')) return 'chatml';
  return null;
}

function renderChatML(system: string, turns: { role: 'user' | 'assistant'; content: string }[]): string {
  const parts: string[] = [];
  if (system) parts.push(`<|im_start|>system\n${system}<|im_end|>`);
  for (const turn of turns) {
    parts.push(`<|im_start|>${turn.role}\n${turn.content}<|im_end|>`);
  }
  parts.push('<|im_start|>assistant\n');
  return parts.join('\n');
}

function renderLlama3(system: string, turns: { role: 'user' | 'assistant'; content: string }[]): string {
  const parts = ['<|begin_of_text|>'];
  if (system) {
    parts.push(`<|start_header_id|>system<|end_header_id|>\n\n${system}<|eot_id|>`);
  }
  for (const turn of turns) {
    parts.push(`<|start_header_id|>${turn.role}<|end_header_id|>\n\n${turn.content}<|eot_id|>`);
  }
  parts.push('<|start_header_id|>assistant<|end_header_id|>\n\n');
  return parts.join('');
}

function renderMistral(system: string, turns: { role: 'user' | 'assistant'; content: string }[]): string {
  const parts: string[] = [];
  let pendingUser = '';
  for (const turn of turns) {
    if (turn.role === 'user') {
      pendingUser = pendingUser ? `${pendingUser}\n\n${turn.content}` : turn.content;
    } else if (pendingUser) {
      const userBlock = parts.length === 0 && system ? `${system}\n\n${pendingUser}` : pendingUser;
      parts.push(`<s>[INST] ${userBlock} [/INST] ${turn.content}</s>`);
      pendingUser = '';
    }
  }
  if (pendingUser || parts.length === 0) {
    const userBlock = parts.length === 0 && system ? `${system}\n\n${pendingUser}` : pendingUser;
    parts.push(`<s>[INST] ${userBlock} [/INST]`);
  }
  return parts.join('');
}

function renderGemma(system: string, turns: { role: 'user' | 'assistant'; content: string }[]): string {
  const parts: string[] = [];
  let firstUser = true;
  for (const turn of turns) {
    const role = turn.role === 'assistant' ? 'model' : 'user';
    const content = firstUser && role === 'user' && system ? `${system}\n\n${turn.content}` : turn.content;
    firstUser = firstUser && role !== 'user';
    parts.push(`<start_of_turn>${role}\n${content}<end_of_turn>`);
  }
  parts.push('<start_of_turn>model\n');
  return parts.join('\n');
}

function renderPhi3(system: string, turns: { role: 'user' | 'assistant'; content: string }[]): string {
  const parts: string[] = [];
  if (system) parts.push(`<|system|>\n${system}<|end|>`);
  for (const turn of turns) {
    parts.push(`<|${turn.role}|>\n${turn.content}<|end|>`);
  }
  parts.push('<|assistant|>\n');
  return parts.join('\n');
}
