/**
 * OCR Pipeline — Preprocessor
 * Text heuristics, table reconstruction, pixel rotation,
 * blob validation, kind detection, and raster pixel normalization.
 */

import type { OcrBlock, OcrLimits, RasterPage, TableReconstruction } from './types';
import { OCR_DEFAULT_LIMITS, OcrValidationError } from './types';

export function isLikelyTextual(value: string): boolean {
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
 * (long runs of private-use glyphs or control characters).
 */
export function isEmbeddedPdfTextHealthy(value: string): boolean {
  if (!isLikelyTextual(value)) return false;
  const stripped = value.replace(/\s+/g, '');
  if (stripped.length === 0) return false;
  let suspicious = 0;
  for (const ch of stripped) {
    const code = ch.charCodeAt(0);
    if (code < 0x20) suspicious += 1;
    else if (code >= 0xe000 && code <= 0xf8ff) suspicious += 1;
  }
  return suspicious / stripped.length < 0.05;
}

/**
 * Phase 8.3 — table / form reconstruction from per-block bounding boxes.
 */
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
 * Phase 8.4 — auto-rotate a raster page by 90/180/270 degrees.
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

// ---------------------------------------------------------------------------
// Pixel-level raster normalization (TSD-113 §14 Future Enhancements)
// Pure pixel math — no Canvas, no DOM, safe for Web Worker context.
// ---------------------------------------------------------------------------

/**
 * ITU-R BT.601 luminance from RGBA pixel.
 */
function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Histogram-stretch contrast normalization.
 * Maps the [p1, p99] luminance range to [0, 255] and clamps.
 * Eliminates low-contrast images that confuse WASM neural OCR.
 */
export function normalizeContrast(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const n = width * height;
  const lum = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    lum[i] = Math.round(luminance(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]));
  }

  // Build histogram to find p1 and p99 percentiles.
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[lum[i]]++;

  let cumulative = 0;
  let p1 = 0;
  let p99 = 255;
  for (let v = 0; v < 256; v++) {
    cumulative += hist[v];
    if (cumulative >= n * 0.01 && p1 === 0) p1 = v;
    if (cumulative >= n * 0.99) { p99 = v; break; }
  }
  if (p99 <= p1) p99 = p1 + 1;

  const range = p99 - p1;
  const out = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < n; i++) {
    const idx = i * 4;
    const normalized = ((lum[i] - p1) / range) * 255;
    const scale = lum[i] === 0 ? 0 : normalized / lum[i];
    out[idx]     = Math.max(0, Math.min(255, Math.round(pixels[idx] * scale)));
    out[idx + 1] = Math.max(0, Math.min(255, Math.round(pixels[idx + 1] * scale)));
    out[idx + 2] = Math.max(0, Math.min(255, Math.round(pixels[idx + 2] * scale)));
    out[idx + 3] = pixels[idx + 3];
  }
  return out;
}

/**
 * Adaptive thresholding for binarization.
 * Uses local mean over a blockSize×blockSize window with offset C.
 * Returns a binary Uint8ClampedArray (0 or 255) suitable for geometric OCR.
 */
export function adaptiveThreshold(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  blockSize: number = 15,
  C: number = 10,
): Uint8ClampedArray {
  // Build integral image of luminance for O(1) mean queries.
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      rowSum += luminance(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
      integral[(y + 1) * (width + 1) + (x + 1)] =
        integral[y * (width + 1) + (x + 1)] + rowSum;
    }
  }

  const half = Math.floor(blockSize / 2);
  const out = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - half);
      const y0 = Math.max(0, y - half);
      const x1 = Math.min(width - 1, x + half);
      const y1 = Math.min(height - 1, y + half);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (width + 1) + (x1 + 1)]
        - integral[y0 * (width + 1) + (x1 + 1)]
        - integral[(y1 + 1) * (width + 1) + x0]
        + integral[y0 * (width + 1) + x0];
      const mean = sum / count;
      const idx = (y * width + x) * 4;
      const lum = luminance(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
      const binarized = lum > mean - C ? 255 : 0;
      out[idx] = binarized;
      out[idx + 1] = binarized;
      out[idx + 2] = binarized;
      out[idx + 3] = 255;
    }
  }
  return out;
}

/**
 * Full preprocessing pipeline for a single raster page.
 * Applies contrast normalization to improve WASM neural OCR accuracy.
 * Returns a new RasterPage with normalized pixels.
 */
export function preprocessRasterPage(page: RasterPage): RasterPage {
  const { width, height, pixels } = page;
  const normalized = normalizeContrast(pixels, width, height);
  return { ...page, pixels: normalized };
}
