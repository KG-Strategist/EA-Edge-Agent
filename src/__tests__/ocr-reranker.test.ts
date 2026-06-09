import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hasModelMock = vi.fn();
const ensureInitializedMock = vi.fn();
const generateTextMock = vi.fn();
const daemonGenerateMock = vi.fn();
const daemonIsConnectedGetter = vi.fn(() => false);

vi.mock('../lib/providers/LocalDaemonProvider', () => ({
  localDaemon: {
    get isConnected() {
      return daemonIsConnectedGetter();
    },
    generateText: daemonGenerateMock,
    abortGeneration: vi.fn(),
    resetSession: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  },
}));

vi.mock('../lib/wasm/SovereignEngine', () => ({
  sovereignEngine: {
    ensureInitialized: ensureInitializedMock,
    generateText: generateTextMock,
  },
}));

vi.mock('../lib/storage/opfsManager', () => ({
  OPFSManager: {
    hasModel: hasModelMock,
    getModelSize: vi.fn(async () => 0),
  },
}));

const appSettingsStore: Record<string, any> = {};

vi.mock('../lib/db', () => ({
  db: {
    app_settings: {
      get: vi.fn(async (key: string) => appSettingsStore[key]),
    },
  },
}));

const { rerankOcrCandidates } = await import('../lib/ocr/reranker');
import type { OcrResult } from '../lib/ocr/pipeline';

function makeResult(blocks: { text: string; confidence: number }[]): OcrResult {
  return {
    text: blocks.map((b) => b.text).join(' '),
    confidence: 0.6,
    mode: 'wasm-geometry',
    pagesProcessed: 1,
    pagesTotal: 1,
    blocks: blocks.map((b) => ({ text: b.text, confidence: b.confidence })),
    internalFlags: [],
  };
}

describe('OCR reranker — no model configured', () => {
  beforeEach(() => {
    hasModelMock.mockReset();
    ensureInitializedMock.mockReset();
    generateTextMock.mockReset();
    daemonGenerateMock.mockReset();
    daemonIsConnectedGetter.mockReset();
    daemonIsConnectedGetter.mockReturnValue(false);
    for (const key of Object.keys(appSettingsStore)) delete appSettingsStore[key];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns original result when no daemon or model is available', async () => {
    const result = makeResult([{ text: 'Banking domain v2', confidence: 0.7 }]);
    const reranked = await rerankOcrCandidates(result, new Blob(), { timeoutMs: 100 });
    expect(reranked.text).toBe('Banking domain v2');
    expect(reranked.mode).toBe('wasm-geometry');
    expect(reranked.internalFlags.some((f) => f.startsWith('rerank:'))).toBe(true);
  });

  it('skips reranking when there are no candidate blocks', async () => {
    const result = makeResult([]);
    const reranked = await rerankOcrCandidates(result, new Blob(), { timeoutMs: 100 });
    expect(reranked.internalFlags).toContain('rerank:skipped-no-candidates');
  });
});

describe('OCR reranker — daemon available', () => {
  beforeEach(() => {
    hasModelMock.mockReset();
    ensureInitializedMock.mockReset();
    generateTextMock.mockReset();
    daemonGenerateMock.mockReset();
    daemonIsConnectedGetter.mockReset();
    daemonIsConnectedGetter.mockReturnValue(true);
    for (const key of Object.keys(appSettingsStore)) delete appSettingsStore[key];
  });

  it('uses local daemon and marks llm-reranked when within scope', async () => {
    daemonGenerateMock.mockResolvedValue('Banking domain v2');
    const result = makeResult([{ text: 'Banking domain v2', confidence: 0.7 }]);
    const reranked = await rerankOcrCandidates(result, new Blob(), { timeoutMs: 500 });
    expect(reranked.text).toBe('Banking domain v2');
    expect(reranked.mode).toBe('llm-reranked');
    expect(reranked.internalFlags.some((f) => f.includes('daemon'))).toBe(true);
  });

  it('rejects out-of-scope corrections and keeps the original text', async () => {
    daemonGenerateMock.mockResolvedValue('totally different content unrelated to the candidate');
    const result = makeResult([{ text: 'Banking domain v2', confidence: 0.7 }]);
    const reranked = await rerankOcrCandidates(result, new Blob(), { timeoutMs: 500 });
    expect(reranked.text).toBe('Banking domain v2');
    expect(reranked.internalFlags.some((f) => f.includes('rejected-out-of-scope'))).toBe(true);
  });
});
