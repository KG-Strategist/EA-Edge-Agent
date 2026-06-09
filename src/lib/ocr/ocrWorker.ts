/**
 * OCR worker — runs the EA-NITI OCR pipeline in a dedicated thread so the main
 * thread never blocks on image rasterization, PDF parsing, or geometric OCR.
 *
 * Message protocol (matches the legacy `runOCR(blob)` surface):
 *   { imageBlob: Blob, options?: { enableReranker?: boolean, ... } }
 *     → { success: true, text: string, detailed: OcrResult }
 *     → { success: false, error: string }
 */

import { runOcrDetailed } from './pipeline';

type WorkerRequest = {
  imageBlob: Blob;
  options?: { enableReranker?: boolean; [key: string]: unknown };
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { imageBlob, options } = event.data || ({} as WorkerRequest);
  if (!imageBlob) {
    self.postMessage({ success: false, error: 'OCR worker received no blob payload.' });
    return;
  }
  try {
    const detailed = await runOcrDetailed({
      blob: imageBlob,
      options: options || {},
    });
    self.postMessage({ success: true, text: detailed.text, detailed });
  } catch (error: any) {
    self.postMessage({
      success: false,
      error: error?.message || String(error || 'Unknown OCR worker error.'),
    });
  }
};

export {};
