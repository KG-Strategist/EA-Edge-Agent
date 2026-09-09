import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('OCR pipeline — no Tesseract regressions', () => {
  it('does not depend on tesseract.js in package.json', () => {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    expect(deps['tesseract.js']).toBeUndefined();
  });

  it('does not import tesseract.js from any TS/TSX source', () => {
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf8');
          if (/from ['"]tesseract\.js['"]/.test(text) || /require\(['"]tesseract\.js['"]\)/.test(text)) {
            offenders.push(full);
          }
        }
      }
    }
    walk(path.join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });

  it('does not reference legacy /assets/ocr/lang-data paths in any TS/TSX source', () => {
    const offenders: string[] = [];
    function walk(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          if (full === path.join(process.cwd(), 'src/__tests__/ocr-pipeline.test.ts')) continue;
          const text = fs.readFileSync(full, 'utf8');
          if (/assets\/ocr\/lang-data|tesseract-core\.wasm\.js|traineddata/.test(text)) {
            offenders.push(full);
          }
        }
      }
    }
    walk(path.join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});

describe('OCR pipeline — validation', () => {
  it('rejects oversize image blobs before compute', async () => {
    const { validateBlobForOcr, OcrValidationError } = await import('../lib/ocr/pipeline');
    const blob = new Blob([new Uint8Array(2 * 1024 * 1024)], { type: 'image/png' });
    Object.defineProperty(blob, 'size', { value: 30 * 1024 * 1024 });
    expect(() => validateBlobForOcr(blob, 'image', { maxImageBytes: 1024 * 1024 })).toThrow(OcrValidationError);
  });

  it('rejects unknown MIME types', async () => {
    const { validateBlobForOcr, OcrValidationError } = await import('../lib/ocr/pipeline');
    const blob = new Blob(['x'], { type: 'application/octet-stream' });
    expect(() => validateBlobForOcr(blob, 'unknown')).toThrow(OcrValidationError);
  });

  it('accepts image, pdf, and svg within limits', async () => {
    const { validateBlobForOcr } = await import('../lib/ocr/pipeline');
    for (const [type, kind] of [
      ['image/png', 'image'],
      ['application/pdf', 'pdf'],
      ['image/svg+xml', 'svg'],
    ] as const) {
      const blob = new Blob([new Uint8Array(64)], { type });
      expect(() => validateBlobForOcr(blob, kind)).not.toThrow();
    }
  });
});

describe('OCR pipeline — geometric OCR', () => {
  it('extracts region count from a synthetic dark-on-light raster', async () => {
    const { geometricOcr } = await import('../lib/ocr/pipeline');
    const width = 60;
    const height = 30;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255; pixels[i + 3] = 255;
    }
    // Three small "characters" with hollow centers, like the letter 'O'
    const chars: Array<[number, number]> = [
      [4, 6],
      [18, 6],
      [32, 6],
    ];
    for (const [x0, y0] of chars) {
      // Draw a 6-wide, 10-tall hollow rectangle
      for (let y = y0; y < y0 + 10; y++) {
        for (let x = x0; x < x0 + 6; x++) {
          if (x === x0 || x === x0 + 5 || y === y0 || y === y0 + 9) {
            const p = (y * width + x) * 4;
            pixels[p] = 0; pixels[p + 1] = 0; pixels[p + 2] = 0;
          }
        }
      }
    }
    const result = geometricOcr({ pageIndex: 0, width, height, pixels });
    expect(result.blocks.length).toBe(3);
    expect(result.text).toMatch(/detected 3 text region/);
  });

  it('returns empty for a blank raster', async () => {
    const { geometricOcr } = await import('../lib/ocr/pipeline');
    const width = 8;
    const height = 8;
    const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
    const result = geometricOcr({ pageIndex: 0, width, height, pixels });
    expect(result.blocks).toHaveLength(0);
    expect(result.text).toBe('');
  });
});

describe('OCR pipeline — SVG sanitization', () => {
  it('extracts <text> contents after DOMPurify sanitization', async () => {
    const { extractSanitizedSvgText } = await import('../lib/ocr/pipeline');
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <text x="0" y="20">Hello, EA NITI</text>
        <text x="0" y="40">Second line</text>
        <script>alert('xss')</script>
      </svg>
    `;
    const text = extractSanitizedSvgText(svg);
    expect(text).toContain('Hello, EA NITI');
    expect(text).toContain('Second line');
    expect(text).not.toContain('alert');
  });
});

describe('OCR pipeline — runtime wiring', () => {
  it('ocrWorker.ts only depends on the pipeline (no reranker, db, or daemon)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const workerPath = path.join(process.cwd(), 'src/lib/ocr/ocrWorker.ts');
    const text = fs.readFileSync(workerPath, 'utf8');
    expect(text).toContain("from './pipeline'");
    const banned = [
      /from\s+['"]\.\/reranker['"]/,
      /from\s+['"]\.\.\/reranker['"]/,
      /from\s+['"]\.\.\/\.\.\/lib\/db['"]/,
      /from\s+['"]\.\.\/\.\.\/lib\/providers\/LocalDaemonProvider['"]/,
      /from\s+['"]\.\.\/\.\.\/lib\/wasm\/SovereignEngine['"]/,
    ];
    for (const pattern of banned) {
      expect(text).not.toMatch(pattern);
    }
  });

  it('runtime returns engineLoaded=false when no engine is present', async () => {
    const { OcrWasmRuntime } = await import('../lib/ocr/wasmRuntime');
    const runtime = OcrWasmRuntime.shared();
    runtime.release();
    (runtime as any).loadAttempted = true;
    (runtime as any).engine = null;
    const pixels = new Uint8ClampedArray(8 * 8 * 4).fill(255);
    const outcome = await runtime.processPage({ pageIndex: 0, width: 8, height: 8, pixels });
    expect(outcome.engineLoaded).toBe(false);
    expect(outcome.status).toBe(0);
    expect(outcome.blocks).toEqual([]);
    expect(outcome.rawText).toBe('');
  });

  it('runtime routes a synthetic engine result into the OcrBlock shape', async () => {
    const { OcrWasmRuntime } = await import('../lib/ocr/wasmRuntime');
    const runtime = OcrWasmRuntime.shared();
    runtime.release();
    const json = JSON.stringify({
      text: 'Banking domain v2',
      confidence: 0.82,
      blocks: [
        {
          text: 'Banking domain v2',
          confidence: 0.82,
          bbox: { x: 10, y: 20, width: 100, height: 30 },
          page: 0,
        },
      ],
      pageIndex: 0,
      orientation: 0,
      engineFlags: ['detector:dbnet-lite', 'recognizer:vit-lite'],
    });
    const encoded = new TextEncoder().encode(json);
    const imagePtr = 64;
    const resultPtr = 2048;
    const buffer = new ArrayBuffer(4096);
    const memView = new Uint8Array(buffer);
    memView.set(encoded, resultPtr);
    (runtime as any).engine = {
      isLoaded: () => true,
      getMemory: () => ({ buffer }),
      allocateImageBuffer: () => imagePtr,
      freeImageBuffer: () => undefined,
      processImage: () => 0,
      getResultPointer: () => resultPtr,
      getResultLength: () => encoded.length,
      freeResult: () => undefined,
      free: () => undefined,
    };
    (runtime as any).loadAttempted = true;
    (runtime as any).hydratedAssets = new Set(['detector', 'recognizer']);

    const pixels = new Uint8ClampedArray(8 * 8 * 4).fill(255);
    const outcome = await runtime.processPage({ pageIndex: 0, width: 8, height: 8, pixels });
    expect(outcome.engineLoaded).toBe(true);
    expect(outcome.status).toBe(0);
    expect(outcome.rawText).toBe('Banking domain v2');
    expect(outcome.confidence).toBeCloseTo(0.82);
    expect(outcome.blocks).toHaveLength(1);
    expect(outcome.blocks[0].text).toBe('Banking domain v2');
    expect(outcome.blocks[0].bbox).toEqual({ x: 10, y: 20, width: 100, height: 30 });
    expect(outcome.engineFlags).toEqual(['detector:dbnet-lite', 'recognizer:vit-lite']);
  });

  it('runtime falls back gracefully when the engine allocation fails', async () => {
    const { OcrWasmRuntime } = await import('../lib/ocr/wasmRuntime');
    const runtime = OcrWasmRuntime.shared();
    runtime.release();
    (runtime as any).engine = {
      isLoaded: () => true,
      getMemory: () => ({ buffer: new ArrayBuffer(64) }),
      allocateImageBuffer: () => 0,
      freeImageBuffer: () => undefined,
      processImage: () => 0,
      getResultPointer: () => 0,
      getResultLength: () => 0,
      freeResult: () => undefined,
      free: () => undefined,
    };
    (runtime as any).loadAttempted = true;
    (runtime as any).hydratedAssets = new Set(['detector', 'recognizer']);
    (runtime as any).engine = {
      isLoaded: () => true,
      getMemory: () => ({ buffer: new ArrayBuffer(64) }),
      allocateImageBuffer: () => 0,
      freeImageBuffer: () => undefined,
      processImage: () => 0,
      getResultPointer: () => 0,
      getResultLength: () => 0,
      freeResult: () => undefined,
      free: () => undefined,
    };
    const pixels = new Uint8ClampedArray(8 * 8 * 4).fill(255);
    const outcome = await runtime.processPage({ pageIndex: 0, width: 8, height: 8, pixels });
    expect(outcome.engineLoaded).toBe(true);
    expect(outcome.errorReason).toBe('image-buffer-allocation-failed');
    expect(outcome.blocks).toEqual([]);
  });

  it('isLoaded() requires both detector and recognizer hydration', async () => {
    const { OcrWasmRuntime } = await import('../lib/ocr/wasmRuntime');
    const runtime = OcrWasmRuntime.shared();
    runtime.release();
    (runtime as any).engine = {
      isLoaded: () => true,
      getMemory: () => ({ buffer: new ArrayBuffer(64) }),
      allocateImageBuffer: () => 0,
      freeImageBuffer: () => undefined,
      processImage: () => 0,
      getResultPointer: () => 0,
      getResultLength: () => 0,
      freeResult: () => undefined,
      free: () => undefined,
    };
    // No bundles hydrated yet.
    expect(runtime.isLoaded()).toBe(false);
    (runtime as any).hydratedAssets = new Set(['detector']);
    expect(runtime.isLoaded()).toBe(false);
    (runtime as any).hydratedAssets = new Set(['detector', 'recognizer']);
    expect(runtime.isLoaded()).toBe(true);
  });

  it('describe() reports hydration progress to admin telemetry', async () => {
    const { OcrWasmRuntime } = await import('../lib/ocr/wasmRuntime');
    const runtime = OcrWasmRuntime.shared();
    runtime.release();
    (runtime as any).engine = null;
    let snap = runtime.describe();
    expect(snap.engineLoaded).toBe(false);
    expect(snap.hydratedAssetCount).toBe(0);
    expect(snap.requiredAssetCount).toBe(2);

    (runtime as any).engine = {
      isLoaded: () => true,
      getMemory: () => ({ buffer: new ArrayBuffer(64) }),
      allocateImageBuffer: () => 0,
      freeImageBuffer: () => undefined,
      processImage: () => 0,
      getResultPointer: () => 0,
      getResultLength: () => 0,
      freeResult: () => undefined,
      free: () => undefined,
    };
    (runtime as any).hydratedAssets = new Set(['detector']);
    snap = runtime.describe();
    expect(snap.engineLoaded).toBe(true);
    expect(snap.hydratedAssetCount).toBe(1);
    expect(snap.requiredAssetCount).toBe(2);
    expect(snap.hydratedAssetPaths).toEqual(['detector']);

    (runtime as any).hydratedAssets = new Set(['detector', 'recognizer']);
    snap = runtime.describe();
    expect(snap.hydratedAssetCount).toBe(2);
    expect(snap.hydratedAssetPaths.sort()).toEqual(['detector', 'recognizer']);
  });
});

describe('OCR preprocessing — pixel normalization', () => {
  it('normalizeContrast returns same-size RGBA output', async () => {
    const { normalizeContrast } = await import('../lib/ocr/preprocessor');
    const width = 4;
    const height = 4;
    // Create a low-contrast image (all pixels near RGB 100,100,100).
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      pixels[i * 4] = 100;
      pixels[i * 4 + 1] = 100;
      pixels[i * 4 + 2] = 100;
      pixels[i * 4 + 3] = 255;
    }
    const out = normalizeContrast(pixels, width, height);
    expect(out.length).toBe(pixels.length);
    expect(out).not.toBe(pixels); // new allocation
  });

  it('normalizeContrast stretches contrast for a gradient image', async () => {
    const { normalizeContrast } = await import('../lib/ocr/preprocessor');
    const width = 10;
    const height = 1;
    const pixels = new Uint8ClampedArray(width * height * 4);
    // Create a gradient from 0 to 255.
    for (let x = 0; x < width; x++) {
      const v = Math.round((x / (width - 1)) * 255);
      pixels[x * 4] = v;
      pixels[x * 4 + 1] = v;
      pixels[x * 4 + 2] = v;
      pixels[x * 4 + 3] = 255;
    }
    const out = normalizeContrast(pixels, width, height);
    // After normalization, the darkest pixel should be near 0 and brightest near 255.
    expect(out[0]).toBeLessThan(50);  // dark end stretched down
    expect(out[(width - 1) * 4]).toBeGreaterThan(200); // bright end stretched up
  });

  it('adaptiveThreshold produces binary output (0 or 255)', async () => {
    const { adaptiveThreshold } = await import('../lib/ocr/preprocessor');
    const width = 8;
    const height = 8;
    const pixels = new Uint8ClampedArray(width * height * 4);
    // Fill with mid-gray.
    for (let i = 0; i < width * height; i++) {
      pixels[i * 4] = 128;
      pixels[i * 4 + 1] = 128;
      pixels[i * 4 + 2] = 128;
      pixels[i * 4 + 3] = 255;
    }
    // Draw a dark horizontal bar in the middle (y=3..4).
    for (let y = 3; y <= 4; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        pixels[idx] = 30;
        pixels[idx + 1] = 30;
        pixels[idx + 2] = 30;
      }
    }
    const out = adaptiveThreshold(pixels, width, height, 5, 10);
    expect(out.length).toBe(pixels.length);
    // Every pixel should be either 0 or 255.
    for (let i = 0; i < width * height; i++) {
      expect(out[i * 4] === 0 || out[i * 4] === 255).toBe(true);
    }
  });

  it('preprocessRasterPage returns new page with same dimensions', async () => {
    const { preprocessRasterPage } = await import('../lib/ocr/preprocessor');
    const width = 6;
    const height = 6;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      pixels[i * 4] = 80;
      pixels[i * 4 + 1] = 80;
      pixels[i * 4 + 2] = 80;
      pixels[i * 4 + 3] = 255;
    }
    const page = { pageIndex: 0, width, height, pixels };
    const out = preprocessRasterPage(page);
    expect(out.width).toBe(width);
    expect(out.height).toBe(height);
    expect(out.pageIndex).toBe(0);
    expect(out.pixels).not.toBe(pixels); // new allocation
    expect(out.pixels.length).toBe(pixels.length);
  });
});
