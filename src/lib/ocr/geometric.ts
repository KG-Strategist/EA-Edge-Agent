/**
 * OCR Pipeline — Geometric OCR Engine
 * Connected-components labeling, bounding-box extraction, and confidence scoring
 * from rasterized pixel buffers. Pure canvas operations, no external OCR runtime.
 */

import type { OcrBlock, RasterPage } from './types';

/**
 * Geometric OCR — finds dark text-like connected components in the raster and
 * returns their bounding-box count as a text string. Best-effort fallback so
 * the OCR pipeline always returns *something* and the reranker can refine it.
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
