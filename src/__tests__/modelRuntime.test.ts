import { describe, expect, it } from 'vitest';
import {
  MODEL_RUNTIME_PROFILES,
  clampGenerationBudget,
  renderChatPrompt,
  stripStopSequences,
} from '../lib/modelRuntime';
import { SUPPORTED_MLC_MODELS } from '../lib/constants';

describe('modelRuntime registry', () => {
  it('covers every predefined dropdown model except custom', () => {
    const predefined = SUPPORTED_MLC_MODELS
      .map(model => model.modelId)
      .filter(modelId => modelId !== 'custom');

    for (const modelId of predefined) {
      expect(MODEL_RUNTIME_PROFILES[modelId], `${modelId} needs a runtime profile`).toBeTruthy();
    }
  });

  it('renders Qwen with ChatML instead of placeholder role tags', () => {
    const prompt = renderChatPrompt([
      { role: 'system', content: 'Use local facts only.' },
      { role: 'user', content: 'What is BIAN?' },
    ], 'qwen2.5-1.5b-instruct-q4_0');

    expect(prompt).toContain('<|im_start|>system');
    expect(prompt).toContain('<|im_start|>user');
    expect(prompt).toContain('<|im_start|>assistant');
    expect(prompt).not.toContain('<|user|>\n');
  });

  it('renders Llama 3 with header tokens', () => {
    const prompt = renderChatPrompt([
      { role: 'system', content: 'Use local facts only.' },
      { role: 'user', content: 'Summarize BIAN.' },
    ], 'llama-3-8b-instruct-q4_0');

    expect(prompt).toContain('<|start_header_id|>system<|end_header_id|>');
    expect(prompt).toContain('<|start_header_id|>assistant<|end_header_id|>');
  });

  it('clamps browser generation budget per model profile', () => {
    expect(clampGenerationBudget('llama-3-8b-instruct-q4_0', 512)).toBe(64);
    expect(clampGenerationBudget('tinyllama-1.1b-chat-v1.0-q4_0', 512)).toBe(160);
  });

  it('strips model stop sequences from streamed text', () => {
    expect(stripStopSequences('BIAN defines banking services<|im_end|>ignored', 'qwen2.5-1.5b-instruct-q4_0'))
      .toBe('BIAN defines banking services');
  });
});
