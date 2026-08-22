/**
 * OCR Pipeline — Preprocessor
 * Text heuristics, table reconstruction, pixel rotation,
 * blob validation, and kind detection.
 */

import type { OcrBlock, OcrLimits, TableReconstruction } from './types';
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
