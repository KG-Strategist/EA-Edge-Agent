/**
 * EA-NITI OCR Pipeline — input normalization, validation, geometric OCR, and
 * PDF/SVG text extraction. Designed to work fully offline, never throw to
 * callers, and always return best-effort text. Real Rust/WASM model OCR is
 * loaded from `src/lib/wasm/ocr/pkg/`; the geometric OCR is now a fallback
 * used when the WASM engine is absent, the page is empty, or the neural
 * pipeline returns no candidates.
 */

import DOMPurify from 'dompurify';
import { getOcrWasmRuntime, RuntimeProcessOutcome } from './wasmRuntime';
import { Logger } from '../logger';

// Lazy-load pdfjs to avoid circular dependency at module load time.
// pdfjs is only imported when PDF processing functions are actually called.
let pdfjs: any = null;
let pdfjsInitialized = false;

async function initPdfJs() {
  if (pdfjsInitialized) return;
  try {
    const pdfModule = await import('pdfjs-dist');
    const workerModule = await import('pdfjs-dist/build/pdf.worker.mjs?url');
    pdfjs = pdfModule;
    pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
    pdfjsInitialized = true;
  } catch (error) {
    Logger.warn('[OCR] pdfjs initialization failed', error);
    pdfjsInitialized = true; // Mark as attempted to prevent retry loops
  }
}

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

function isLikelyTextual(value: string): boolean {
  if (!value) return false;
  const stripped = value.replace(/\s+/g, '');
  if (stripped.length < 16) return false;
  let letters = 0;
  for (const ch of stripped) {
    if (/[A-Za-z0-9]/.test(ch)) letters++;
  }
  return letters / stripped.length > 0.4;
}

/**
 * Phase 8.1 — embedded-PDF quality heuristic. Rejects the fast path
 * when the extracted text contains suspicious ToUnicode noise
 * (long runs of private-use glyphs or control characters), which is
 * a sign the PDF is actually a scanned image that happens to carry
 * an empty text layer.
 */
export function isEmbeddedPdfTextHealthy(value: string): boolean {
  if (!isLikelyTextual(value)) return false;
  const stripped = value.replace(/\s+/g, '');
  if (stripped.length === 0) return false;
  let suspicious = 0;
  for (const ch of stripped) {
    const code = ch.charCodeAt(0);
    if (code < 0x20) suspicious += 1;
    else if (code >= 0xe000 && code <= 0xf8ff) suspicious += 1; // Private Use Area
  }
  return suspicious / stripped.length < 0.05;
}

/**
 * Phase 8.3 — table / form reconstruction from per-block bounding
 * boxes. Groups blocks into rows by y-coordinate, then aligns columns
 * by x-coordinate, and emits a markdown table when the column
 * pattern is stable. The output is appended to `OcrBlock.text` and
 * also surfaced in `OcrResult.text` so callers can render it directly.
 */
export interface TableReconstruction {
  tableMarkdown: string;
  rowCount: number;
  columnCount: number;
}

export function reconstructTable(blocks: OcrBlock[]): TableReconstruction | null {
  if (blocks.length < 4) return null;
  const withBbox = blocks.filter((b) => b.bbox && (b.text || '').trim().length > 0);
  if (withBbox.length < 4) return null;

  const sortedByY = [...withBbox].sort((a, b) => (a.bbox!.y) - (b.bbox!.y));
  const medianHeight = median(sortedByY.map((b) => b.bbox!.height));
  const rowTolerance = Math.max(8, Math.floor(medianHeight * 0.6));
  const rows: OcrBlock[][] = [];
  for (const block of sortedByY) {
    const last = rows[rows.length - 1];
    if (!last || Math.abs((last[0].bbox!.y) - block.bbox!.y) > rowTolerance) {
      rows.push([block]);
    } else {
      last.push(block);
    }
  }
  if (rows.length < 2) return null;
  for (const row of rows) {
    row.sort((a, b) => a.bbox!.x - b.bbox!.x);
  }
  const columnCount = Math.max(...rows.map((r) => r.length));
  if (columnCount < 2) return null;
  const consistentColumns = rows.filter((r) => r.length === columnCount).length;
  if (consistentColumns / rows.length < 0.5) return null;

  const header = rows[0].map((b) => escapeTableCell(b.text)).join(' | ');
  const separator = Array(columnCount).fill('---').join(' | ');
  const dataRows = rows.slice(1)
    .map((row) => {
      const cells = Array(columnCount).fill('').map((_, i) => row[i] ? escapeTableCell(row[i].text) : '');
      return cells.join(' | ');
    });
  const tableMarkdown = [header, separator, ...dataRows].join('\n');
  return { tableMarkdown, rowCount: rows.length, columnCount };
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Phase 8.4 — auto-rotate a raster page by 90/180/270 degrees. The
 * rotation is intentionally cheap: nearest-neighbour pixel copy
 * with no canvas allocation, so the function can run inside the
 * worker context without coupling to the DOM canvas.
 */
export function rotateRasterPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  rotation: 0 | 90 | 180 | 270,
): { width: number; height: number; pixels: Uint8ClampedArray } {
  if (rotation === 0) return { width, height, pixels };
  if (rotation === 180) {
    const out = new Uint8ClampedArray(pixels.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const src = ((y * width) + x) * 4;
        const dst = (((height - 1 - y) * width) + (width - 1 - x)) * 4;
        out[dst] = pixels[src];
        out[dst + 1] = pixels[src + 1];
        out[dst + 2] = pixels[src + 2];
        out[dst + 3] = pixels[src + 3];
      }
    }
    return { width, height, pixels: out };
  }
  // 90 / 270 — swap width/height
  const newW = height;
  const newH = width;
  const out = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = ((y * width) + x) * 4;
      let dst: number;
      if (rotation === 90) {
        dst = ((x * newW) + (newW - 1 - y)) * 4;
      } else {
        dst = (((newH - 1 - x) * newW) + y) * 4;
      }
      out[dst] = pixels[src];
      out[dst + 1] = pixels[src + 1];
      out[dst + 2] = pixels[src + 2];
      out[dst + 3] = pixels[src + 3];
    }
  }
  return { width: newW, height: newH, pixels: out };
}

export function detectBlobKind(blob: Blob): 'pdf' | 'svg' | 'image' | 'unknown' {
  const type = (blob.type || '').toLowerCase();
  if (type === 'application/pdf' || type.includes('pdf')) return 'pdf';
  if (type === 'image/svg+xml' || type.includes('svg')) return 'svg';
  if (type.startsWith('image/')) return 'image';
  return 'unknown';
}

export function validateBlobForOcr(
  blob: Blob,
  kind: 'pdf' | 'svg' | 'image' | 'unknown',
  limits: OcrLimits = OCR_DEFAULT_LIMITS,
): void {
  const maxBytes = kind === 'pdf'
    ? (limits.maxPdfBytes ?? OCR_DEFAULT_LIMITS.maxPdfBytes)
    : (limits.maxImageBytes ?? OCR_DEFAULT_LIMITS.maxImageBytes);
  if (blob.size > maxBytes) {
    throw new OcrValidationError(
      `OCR input exceeds ${(maxBytes / 1024 / 1024).toFixed(0)}MB limit (${(blob.size / 1024 / 1024).toFixed(2)}MB).`,
    );
  }
  if (kind === 'unknown') {
    throw new OcrValidationError('OCR input has an unsupported MIME type.');
  }
}

export function extractSanitizedSvgText(input: string): string {
  const cleaned = DOMPurify.sanitize(input, { USE_PROFILES: { svg: true, svgFilters: true } });
  const texts: string[] = [];
  const container = typeof DOMParser !== 'undefined'
    ? new DOMParser().parseFromString(cleaned, 'image/svg+xml')
    : null;
  if (container) {
    const visit = (node: Element) => {
      for (const child of Array.from(node.children)) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'text' || tag === 'tspan') {
          const value = child.textContent || '';
          if (value.trim()) texts.push(value.trim());
        } else {
          visit(child);
        }
      }
    };
    visit(container.documentElement);
    if (texts.length > 0) return texts.join('\n').trim();
  }
  // Fallback: some DOM environments (incl. happy-dom) do not parse the
  // sanitised SVG as an SVG document. Fall back to a regex scan of the
  // sanitised markup so OCR still returns best-effort text.
  const textRegex = /<text\b[^>]*>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null;
  while ((match = textRegex.exec(cleaned)) !== null) {
    const inner = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (inner) texts.push(inner);
  }
  return texts.join('\n').trim();
}

async function extractEmbeddedPdfText(
  arrayBuffer: ArrayBuffer,
  limits: OcrLimits = OCR_DEFAULT_LIMITS,
): Promise<{ text: string; pageCount: number; usedEmbedded: boolean }> {
  await initPdfJs();
  const maxPages = limits.maxPdfPages ?? OCR_DEFAULT_LIMITS.maxPdfPages;
  let pdf: any;
  try {
    pdf = await pdfjs.getDocument({
      data: arrayBuffer,
      ...(typeof window === 'undefined' ? { disableWorker: true, isEvalSupported: false, useSystemFonts: false } : {}),
    } as any).promise;
  } catch (error) {
    Logger.warn('[OCR] pdfjs failed to parse document; treating as no embedded text.', error);
    return { text: '', pageCount: 0, usedEmbedded: false };
  }
  const pageCount = Math.min(pdf.numPages, maxPages);
  let combined = '';
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    try {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => (typeof item.str === 'string' ? item.str : ''))
        .filter(Boolean)
        .join(' ');
      if (pageText.trim()) combined += pageText + '\n\n';
    } catch (error) {
      Logger.warn(`[OCR] pdfjs failed on page ${pageNumber}; continuing.`, error);
    }
  }
  return { text: combined.trim(), pageCount, usedEmbedded: isLikelyTextual(combined) };
}

interface RasterPage {
  pageIndex: number;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
}

async function rasterizePdfPages(
  arrayBuffer: ArrayBuffer,
  limits: OcrLimits = OCR_DEFAULT_LIMITS,
  signal?: AbortSignal,
  onPageProcessed?: (pageIndex: number, totalPages: number) => void,
): Promise<RasterPage[]> {
  await initPdfJs();
  const maxPages = limits.maxPdfPages ?? OCR_DEFAULT_LIMITS.maxPdfPages;
  const batchSize = limits.pdfBatchSize ?? OCR_DEFAULT_LIMITS.pdfBatchSize;
  const maxPixelsPerPage = limits.maxPixelsPerPage ?? OCR_DEFAULT_LIMITS.maxPixelsPerPage;
  const maxPixelsPerBatch = limits.maxPixelsPerBatch ?? OCR_DEFAULT_LIMITS.maxPixelsPerBatch;

  let pdf: any;
  try {
    pdf = await pdfjs.getDocument({
      data: arrayBuffer,
      ...(typeof window === 'undefined' ? { disableWorker: true, isEvalSupported: false, useSystemFonts: false } : {}),
    } as any).promise;
  } catch (error) {
    Logger.warn('[OCR] pdfjs failed to rasterize; returning empty pages.', error);
    return [];
  }
  const pageCount = Math.min(pdf.numPages, maxPages);
  const totalPages = pdf.numPages;
  const pages: RasterPage[] = [];

  for (let start = 1; start <= pageCount; start += batchSize) {
    if (signal?.aborted) break;
    const end = Math.min(start + batchSize - 1, pageCount);
    let batchPixels = 0;
    for (let pageNumber = start; pageNumber <= end; pageNumber++) {
      try {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const targetPixels = baseViewport.width * baseViewport.height;
        const scale = Math.min(
          2,
          Math.sqrt(Math.min(maxPixelsPerPage, targetPixels) / targetPixels) || 1,
        );
        const viewport = page.getViewport({ scale: scale > 0 ? scale : 1 });
        const canvas = typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(viewport.width, viewport.height)
          : Object.assign(document.createElement('canvas'), { width: viewport.width, height: viewport.height });
        const ctx = (canvas as any).getContext('2d');
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport, canvas: canvas as any }).promise;
        const imageData = ctx.getImageData(0, 0, viewport.width, viewport.height);
        batchPixels += viewport.width * viewport.height;
        if (batchPixels > maxPixelsPerBatch) {
          return pages;
        }
        pages.push({
          pageIndex: pageNumber - 1,
          width: viewport.width,
          height: viewport.height,
          pixels: imageData.data,
        });
        onPageProcessed?.(pageNumber, totalPages);
      } catch (error) {
        Logger.warn(`[OCR] pdfjs failed to rasterize page ${pageNumber}; skipping.`, error);
      }
    }
  }
  return pages;
}

export async function decodeImageBlob(blob: Blob): Promise<RasterPage> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    throw new Error('createImageBitmap is unavailable in this environment.');
  }
  const bitmap = await createImageBitmap(blob);
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(bitmap.width, bitmap.height)
    : Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height });
  const ctx = (canvas as any).getContext('2d');
  if (!ctx) throw new Error('OCR could not acquire a 2D canvas context.');
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close?.();
  return {
    pageIndex: 0,
    width: bitmap.width,
    height: bitmap.height,
    pixels: imageData.data,
  };
}

/**
 * Geometric OCR — finds dark text-like connected components in the raster and
 * returns their bounding-box count as a text string. This is intentionally a
 * best-effort fallback so the OCR pipeline always returns *something* and the
 * reranker can refine it. Real text transcription happens in the Rust/WASM
 * engine that will replace the placeholder.
 */
export function geometricOcr(page: RasterPage): { text: string; confidence: number; blocks: OcrBlock[] } {
  const { width, height, pixels } = page;
  if (!width || !height) return { text: '', confidence: 0, blocks: [] };

  const total = width * height;
  const dark = new Uint8Array(total);
  let darkCount = 0;
  for (let i = 0, p = 0; i < total; i++, p += 4) {
    const r = pixels[p];
    const g = pixels[p + 1];
    const b = pixels[p + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 96) {
      dark[i] = 1;
      darkCount++;
    }
  }

  if (darkCount === 0) {
    return { text: '', confidence: 0, blocks: [] };
  }

  const visited = new Uint8Array(total);
  const blocks: OcrBlock[] = [];
  const idx = (x: number, y: number) => y * width + x;
  const stack: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = idx(x, y);
      if (!dark[start] || visited[start]) continue;
      let minX = x, minY = y, maxX = x, maxY = y, count = 0;
      stack.length = 0;
      stack.push(start);
      visited[start] = 1;
      while (stack.length) {
        const cur = stack.pop()!;
        const cx = cur % width;
        const cy = (cur - cx) / width;
        count++;
        if (cx < minX) minX = cx;
        if (cy < minY) minY = cy;
        if (cx > maxX) maxX = cx;
        if (cy > maxY) maxY = cy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const nIdx = idx(nx, ny);
            if (dark[nIdx] && !visited[nIdx]) {
              visited[nIdx] = 1;
              stack.push(nIdx);
            }
          }
        }
      }
      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const aspect = h === 0 ? 0 : w / h;
      if (w < 4 || h < 4) continue;
      if (w * h > (width * height) / 2) continue;
      if (aspect > 6 || aspect < 0.08) continue;
      const bboxFill = count / (w * h);
      if (bboxFill < 0.05 || bboxFill > 0.95) continue;
      // Reject very large solid rectangles (likely background panels, not glyphs)
      if (count < 16) continue;
      blocks.push({
        text: '',
        confidence: Math.min(1, bboxFill),
        bbox: { x: minX, y: minY, width: w, height: h },
      });
    }
  }

  blocks.sort((a, b) => (a.bbox?.y ?? 0) - (b.bbox?.y ?? 0));
  const lineCount = Math.max(1, Math.round(blocks.length / 8));
  const confidence = blocks.length === 0
    ? 0
    : blocks.reduce((s, b) => s + b.confidence, 0) / blocks.length;

  return {
    text: blocks.length === 0
      ? ''
      : `[OCR] detected ${blocks.length} text region(s) across ~${lineCount} line(s).`,
    confidence,
    blocks,
  };
}

export interface RunOcrDetailedInput {
  blob: Blob;
  options?: OcrOptions;
}

export async function runOcrDetailed({
  blob,
  options = {},
}: RunOcrDetailedInput): Promise<OcrResult> {
  const flags: string[] = [];
  const limits: OcrLimits = { ...OCR_DEFAULT_LIMITS, ...options };
  const kind = detectBlobKind(blob);

  try {
    validateBlobForOcr(blob, kind, limits);
  } catch (err) {
    if (err instanceof OcrValidationError) {
      flags.push(`validation:${err.message}`);
      return {
        text: '',
        confidence: 0,
        mode: 'wasm-geometry',
        pagesProcessed: 0,
        blocks: [],
        internalFlags: flags,
      };
    }
    throw err;
  }

  if (kind === 'svg') {
    const raw = await blob.text();
    const sanitized = extractSanitizedSvgText(raw);
    flags.push('source:svg');
    return {
      text: sanitized,
      confidence: sanitized ? 0.9 : 0,
      mode: 'svg-text',
      pagesProcessed: 1,
      pagesTotal: 1,
      blocks: sanitized
        ? sanitized.split('\n').filter(Boolean).map((text) => ({ text, confidence: 0.9 }))
        : [],
      internalFlags: flags,
    };
  }

  if (kind === 'pdf') {
    const arrayBuffer = await blob.arrayBuffer();
    const embedded = await extractEmbeddedPdfText(arrayBuffer, limits);
    if (embedded.usedEmbedded && isEmbeddedPdfTextHealthy(embedded.text)) {
      flags.push(`source:pdf-embedded pages=${embedded.pageCount}`);
      return {
        text: embedded.text,
        confidence: 0.95,
        mode: 'embedded-pdf',
        pagesProcessed: embedded.pageCount,
        pagesTotal: embedded.pageCount,
        blocks: embedded.text
          .split(/\n{2,}/)
          .filter(Boolean)
          .map((text) => ({ text, confidence: 0.95 })),
        internalFlags: flags,
      };
    }
    if (embedded.usedEmbedded && !isEmbeddedPdfTextHealthy(embedded.text)) {
      flags.push('source:pdf-text-layer-suspicious;fallback-raster');
    }
    const pages = await rasterizePdfPages(
      arrayBuffer,
      limits,
      options.signal,
      options.onPageProcessed,
    );
    flags.push(`source:pdf-rasterized pages=${pages.length}`);
    return aggregateRasterResults(pages, flags);
  }

  // image/*
  let page: RasterPage;
  try {
    page = await decodeImageBlob(blob);
  } catch (error) {
    flags.push(`image-decode-failed:${error instanceof Error ? error.message : 'unknown'}`);
    return aggregateRasterResults([], flags);
  }
  flags.push(`source:image ${page.width}x${page.height}`);
  return aggregateRasterResults([page], flags);
}

async function aggregateRasterResults(
  pages: RasterPage[],
  flags: string[],
): Promise<OcrResult> {
  if (pages.length === 0) {
    return {
      text: '',
      confidence: 0,
      mode: 'wasm-geometry',
      pagesProcessed: 0,
      blocks: [],
      internalFlags: [...flags, 'no-pages'],
    };
  }
  const runtime = getOcrWasmRuntime();
  const blocks: OcrBlock[] = [];
  let confidenceTotal = 0;
  let wasmLoaded = false;
  let wasmSucceeded = false;
  let modelMissing = false;
  let wasmErrored = false;
  let wasmPages = 0;
  let geometryPages = 0;

  for (const page of pages) {
    const outcome: RuntimeProcessOutcome = await runtime.processPage(page);
    if (outcome.engineLoaded) {
      wasmLoaded = true;
      if (outcome.status === 0 && (outcome.rawText || outcome.blocks.length > 0)) {
        wasmSucceeded = true;
        wasmPages += 1;
        confidenceTotal += outcome.confidence;
        for (const block of outcome.blocks) {
          blocks.push({ ...block, pageIndex: page.pageIndex });
        }
        for (const flag of outcome.engineFlags) {
          if (!flags.includes(flag)) flags.push(`wasm:${flag}`);
        }
        if (outcome.errorReason) flags.push(`wasm:${outcome.errorReason}`);
        continue;
      }
      if (outcome.errorReason === 'model-missing') modelMissing = true;
      wasmErrored = true;
      if (outcome.errorReason) flags.push(`wasm:${outcome.errorReason}`);
    } else {
      modelMissing = true;
      flags.push('wasm:fallback-not-loaded');
    }

    const { blocks: pageBlocks, confidence } = geometricOcr(page);
    geometryPages += 1;
    pageBlocks.forEach((b) => blocks.push({ ...b, pageIndex: page.pageIndex }));
    confidenceTotal += confidence;
  }

  const divisor = wasmSucceeded ? wasmPages : geometryPages;
  const avgConfidence = divisor > 0 ? confidenceTotal / divisor : 0;
  let text = blocks.length === 0
    ? ''
    : blocks.map((b) => b.text).filter(Boolean).join('\n').trim()
      || `[OCR] detected ${blocks.length} text region(s) across ${pages.length} page(s).`;

  // Phase 8.3 — table / form reconstruction. If a single page has
  // enough aligned blocks, append a markdown table to the text and
  // also surface it in internal flags for the admin panel.
  if (pages.length === 1 && blocks.length >= 4) {
    const reconstructed = reconstructTable(blocks);
    if (reconstructed) {
      text = text ? `${text}\n\n${reconstructed.tableMarkdown}` : reconstructed.tableMarkdown;
      flags.push(`table:reconstructed rows=${reconstructed.rowCount} cols=${reconstructed.columnCount}`);
    }
  }

  // Phase 8.4 — auto-rotation note (the actual rotation happens
  // inside the engine; we record what we applied so admin telemetry
  // can show it).
  for (const page of pages) {
    if ((page as any).orientation && (page as any).orientation !== 0) {
      flags.push(`orientation:auto-rotated-${(page as any).orientation}`);
      break;
    }
  }

  const mode: OcrMode = wasmSucceeded ? 'dbnet-vit' : 'wasm-geometry';
  if (wasmLoaded) flags.push('wasm:loaded');
  if (wasmSucceeded && geometryPages > 0) flags.push('wasm:partial-fallback');
  if (modelMissing) flags.push('model:missing');
  if (wasmErrored && !wasmSucceeded) flags.push('wasm:error');

  return {
    text,
    confidence: avgConfidence,
    mode,
    pagesProcessed: pages.length,
    pagesTotal: pages.length,
    blocks,
    internalFlags: flags,
  };
}
