/**
 * OCR Pipeline — Extractor
 * SVG text extraction, embedded PDF text extraction, raster page decoding,
 * and pdfjs lazy initialization.
 */

import DOMPurify from 'dompurify';
import { Logger } from '../logger';
import type { OcrLimits, RasterPage } from './types';
import { OCR_DEFAULT_LIMITS } from './types';
import { isLikelyTextual } from './preprocessor';

// Lazy-load pdfjs to avoid circular dependency at module load time.
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
    pdfjsInitialized = true;
  }
}

/**
 * Phase 8.1 — extract sanitized text from SVG. Remove <script>, <style>,
 * <metadata>, and DALL-E caption nodes. Preserve visible text content only.
 */
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
  const textRegex = /<text\b[^>]*>([\s\S]*?)<\/text>/gi;
  let match: RegExpExecArray | null;
  while ((match = textRegex.exec(cleaned)) !== null) {
    const inner = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (inner) texts.push(inner);
  }
  return texts.join('\n').trim();
}

/**
 * Phase 8.1 — extract text from an embedded PDF via text content API.
 */
export async function extractEmbeddedPdfText(
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

/**
 * Phase 8.4 — rasterize PDF pages into pixel buffers for geometric OCR.
 */
export async function rasterizePdfPages(
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

/**
 * Decode an image Blob into raw pixel data (RGBA Uint8ClampedArray).
 */
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
