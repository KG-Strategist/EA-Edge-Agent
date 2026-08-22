/**
 * OCR Pipeline — Type Definitions
 * All shared types, interfaces, constants, and error classes for the OCR subsystem.
 */

export const OCR_DEFAULT_LIMITS = Object.freeze({
  maxImageBytes: 25 * 1024 * 1024,
  maxPdfBytes: 100 * 1024 * 1024,
  maxPdfPages: 25,
  pdfBatchSize: 5,
  maxPixelsPerPage: 16 * 1024 * 1024,
  maxPixelsPerBatch: 50 * 1024 * 1024,
  maxBatchWallMs: 30_000,
});

export type OcrMode =
  | 'embedded-pdf'
  | 'svg-text'
  | 'wasm-geometry'
  | 'dbnet-vit'
  | 'llm-reranked';

export interface OcrBlock {
  text: string;
  confidence: number;
  bbox?: { x: number; y: number; width: number; height: number };
  pageIndex?: number;
}

export interface OcrLimits {
  maxImageBytes?: number;
  maxPdfBytes?: number;
  maxPdfPages?: number;
  pdfBatchSize?: number;
  maxPixelsPerPage?: number;
  maxPixelsPerBatch?: number;
  maxBatchWallMs?: number;
}

export interface OcrOptions extends OcrLimits {
  enableReranker?: boolean;
  signal?: AbortSignal;
  onPageProcessed?: (pageIndex: number, totalPages: number) => void;
}

export interface OcrResult {
  text: string;
  confidence: number;
  mode: OcrMode;
  pagesProcessed: number;
  pagesTotal?: number;
  blocks: OcrBlock[];
  internalFlags: string[];
}

export class OcrValidationError extends Error {
  readonly code: 'OCR_VALIDATION';
  constructor(message: string) {
    super(message);
    this.code = 'OCR_VALIDATION';
  }
}

export interface TableReconstruction {
  tableMarkdown: string;
  rowCount: number;
  columnCount: number;
}

export interface RasterPage {
  pageIndex: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

export interface RunOcrDetailedInput {
  blob: Blob;
  options?: OcrOptions;
}
