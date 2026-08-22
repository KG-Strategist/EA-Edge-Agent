/**
 * EA-NITI OCR Pipeline — input normalization, validation, geometric OCR, and
 * PDF/SVG text extraction. Designed to work fully offline, never throw to
 * callers, and always return best-effort text. Real Rust/WASM model OCR is
 * loaded from `src/lib/wasm/ocr/pkg/`; the geometric OCR is now a fallback
 * used when the WASM engine is absent, the page is empty, or the neural
 * pipeline returns no candidates.
 */

import { getOcrWasmRuntime, RuntimeProcessOutcome } from './wasmRuntime';

// Re-export all sub-modules for backward compatibility.
export { OCR_DEFAULT_LIMITS } from './types';
export type { OcrMode, OcrBlock, OcrLimits, OcrOptions, OcrResult, TableReconstruction, RasterPage, RunOcrDetailedInput } from './types';
export { OcrValidationError } from './types';
export { isLikelyTextual, isEmbeddedPdfTextHealthy, reconstructTable, rotateRasterPixels, detectBlobKind, validateBlobForOcr } from './preprocessor';
export { extractSanitizedSvgText, extractEmbeddedPdfText, rasterizePdfPages, decodeImageBlob } from './extractor';
export { geometricOcr } from './geometric';

// Internal imports for the orchestration functions below.
import type { OcrMode, OcrResult, OcrBlock, OcrLimits, RasterPage } from './types';
import { OCR_DEFAULT_LIMITS, OcrValidationError } from './types';
import { isEmbeddedPdfTextHealthy, reconstructTable, detectBlobKind, validateBlobForOcr } from './preprocessor';
import { extractSanitizedSvgText, extractEmbeddedPdfText, rasterizePdfPages, decodeImageBlob } from './extractor';
import { geometricOcr } from './geometric';
import type { RunOcrDetailedInput } from './types';

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

  // Phase 8.3 — table / form reconstruction.
  if (pages.length === 1 && blocks.length >= 4) {
    const reconstructed = reconstructTable(blocks);
    if (reconstructed) {
      text = text ? `${text}\n\n${reconstructed.tableMarkdown}` : reconstructed.tableMarkdown;
      flags.push(`table:reconstructed rows=${reconstructed.rowCount} cols=${reconstructed.columnCount}`);
    }
  }

  // Phase 8.4 — auto-rotation note.
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
