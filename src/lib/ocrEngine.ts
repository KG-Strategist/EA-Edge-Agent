/**
 * EA-NITI OCR engine — public TypeScript surface.
 *
 * The runtime is split into two halves:
 *  - `runOCR(blob)` keeps the legacy `Promise<string>` contract for existing
 *    callers (AgentChat, ReviewExecution). When called with
 *    `{ enableReranker: true }`, the main thread applies the LLM reranker
 *    AFTER the worker has returned its base OCR result. The worker itself
 *    never imports `localDaemon`, `sovereignEngine`, or Dexie.
 *  - `runOcrDetailed(blob, options)` returns the full OcrResult so the
 *    reranker and admin telemetry can use confidence, mode, and block data.
 *
 * Tesseract is removed; the actual Rust/WASM model is loaded from
 * `src/lib/wasm/ocr/pkg/ocr_engine.js`. Until the compiled package is
 * published, the engine returns best-effort geometric OCR text and never
 * throws to callers.
 */

import { runOcrDetailed as runOcrPipelineDetailed, OcrResult, OcrOptions } from './ocr/pipeline';
import { Logger } from './logger';

export type { OcrResult, OcrOptions } from './ocr/pipeline';

const OCR_RERANK_TIMEOUT_MS = 1500;

export interface OcrDetailedOptions extends OcrOptions {
  enableReranker?: boolean;
}

// Lazy-load reranker to avoid deeply nested import chains that cause
// stack overflow during Rollup's bundling finalization.
let rerankModule: any = null;

async function loadReranker() {
  if (!rerankModule) {
    rerankModule = await import('./ocr/reranker');
  }
  return rerankModule;
}

export async function runOcrDetailed(
  blob: Blob,
  options: OcrDetailedOptions = {},
): Promise<OcrResult> {
  const base = await runOcrPipelineDetailed({ blob, options });
  if (!options.enableReranker) {
    return base;
  }
  const { rerankOcrCandidates } = await loadReranker();
  const rerankBudgetMs = Math.max(250, options.maxBatchWallMs ?? OCR_RERANK_TIMEOUT_MS);
  return rerankOcrCandidates(base, blob, { timeoutMs: rerankBudgetMs, signal: options.signal });
}

export async function runOCR(blob: Blob, options: OcrDetailedOptions = {}): Promise<string> {
  // Direct async implementation (no worker to avoid Vite bundling stack overflow)
  // OCR pipeline is already async, so we don't block the main thread
  try {
    const detailed = await runOcrDetailed(blob, options);
    if (!options.enableReranker) {
      return detailed.text;
    }
    const rerankBudgetMs = Math.max(250, options.maxBatchWallMs ?? OCR_RERANK_TIMEOUT_MS);
    try {
      const { rerankOcrCandidates } = await loadReranker();
      const reranked = await rerankOcrCandidates(detailed, blob, { timeoutMs: rerankBudgetMs, signal: options.signal });
      return reranked.text;
    } catch (error) {
      Logger.warn('[OCR] main-thread reranker failed; returning base text.', error);
      return detailed.text;
    }
  } catch (error) {
    Logger.warn('[OCR] OCR pipeline failed:', error instanceof Error ? error.message : String(error));
    return '';
  }
}
