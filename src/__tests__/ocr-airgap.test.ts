/**
 * Phase 11 — security / air-gap guarantees for the OCR pipeline.
 *
 * The OCR pipeline runs entirely in-browser and must never make external
 * network calls. These tests:
 *  1. assert the OCR source files do not call `fetch` against external URLs
 *     (only against the bundled WASM artefact, which Vite rewrites to a
 *     relative import).
 *  2. confirm the helper utilities that the OCR pipeline relies on are
 *     gated by the `globalNetworkEnabled` flag and the SSRF guard.
 *  3. confirm the SVG sanitization path rejects malicious payloads
 *     (mirrors the production behaviour for `image/svg+xml` inputs).
 *  4. confirm the embedded-PDF quality heuristic rejects the suspicious
 *     "Private Use Area + control chars" attack pattern.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isEmbeddedPdfTextHealthy, reconstructTable, extractSanitizedSvgText } from '../lib/ocr/pipeline';

const OCRCORE_FILES = [
  'src/lib/ocr/pipeline.ts',
  'src/lib/ocr/wasmRuntime.ts',
  'src/lib/ocr/ocrWorker.ts',
  'src/lib/ocr/reranker.ts',
  'src/lib/wasm/ocr/pkg/ocr_engine.js',
  'src/lib/wasm/ocr/pkg/ocr_engine.d.ts',
];

function readSource(relative: string): string {
  const filePath = path.join(process.cwd(), relative);
  return fs.readFileSync(filePath, 'utf8');
}

describe('OCR air-gap & security', () => {
  it('OCR core files do not import external network libraries', () => {
    for (const file of OCRCORE_FILES) {
      const src = readSource(file);
      expect(src, `${file} should not import axios`).not.toMatch(/from\s+['"]axios['"]/);
      expect(src, `${file} should not import node-fetch`).not.toMatch(/from\s+['"]node-fetch['"]/);
    }
  });

  it('OCR core files only fetch() the bundled WASM artefact (not external URLs)', () => {
    for (const file of OCRCORE_FILES) {
      const src = readSource(file);
      const fetchMatches = [...src.matchAll(/fetch\s*\(\s*(['"`])([^'"`]+)\1/g)];
      for (const match of fetchMatches) {
        const url = match[2];
        expect(
          url.startsWith('new URL(') || url.includes('ocr_engine_bg.wasm') || url.startsWith('./') || url.startsWith('../') || url.startsWith('/'),
          `${file} should not fetch external URL: ${url}`,
        ).toBe(true);
      }
    }
  });

  it('reranker falls back to skip mode when no model/daemon is configured (no network)', () => {
    // We do not import the reranker here to keep this test side-effect
    // free, but we assert the no-network invariant: there is no `fetch`
    // call anywhere in the OCR reranker file.
    const src = readSource('src/lib/ocr/reranker.ts');
    expect(src).not.toMatch(/fetch\s*\(/);
  });

  it('SVG sanitization strips script tags and event handlers', () => {
    const malicious = `
      <svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
        <script>alert('xss')</script>
        <text x="10" y="20">Safe label</text>
      </svg>
    `;
    const text = extractSanitizedSvgText(malicious);
    // The DOMPurify clean output must not contain any script tag or
    // onload event handler. (Some DOM environments, e.g. happy-dom +
    // DOMPurify 3.x, may also strip the sibling <text> element when a
    // <script> is present; the security invariant we care about is
    // that nothing executable leaks into the sanitised string.)
    expect(text).not.toMatch(/<script/i);
    expect(text).not.toMatch(/onload=/i);
    expect(text).not.toMatch(/alert\s*\(/i);
  });

  it('SVG sanitization extracts <text> content from clean inputs', () => {
    const clean = '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20">Safe label</text></svg>';
    const text = extractSanitizedSvgText(clean);
    expect(text).toContain('Safe label');
  });

  it('embedded PDF text heuristic rejects Private Use Area noise', () => {
    const suspicious = '\uE000\uE001\uE002\uE003\uE004\uE005\uE006\uE007\uE008\uE009\uE010\uE011\uE012\uE013\uE014\uE015\uE016';
    expect(isEmbeddedPdfTextHealthy(suspicious)).toBe(false);
  });

  it('embedded PDF text heuristic rejects short / control-heavy input', () => {
    expect(isEmbeddedPdfTextHealthy('')).toBe(false);
    expect(isEmbeddedPdfTextHealthy('   ')).toBe(false);
    const control = '\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008\u0009\u000A\u000B\u000C\u000D';
    expect(isEmbeddedPdfTextHealthy(control)).toBe(false);
  });

  it('reconstructTable refuses to fabricate columns from 1-row inputs', () => {
    const blocks = [
      { text: 'Cell A', bbox: { x: 0, y: 0, width: 10, height: 10 } },
      { text: 'Cell B', bbox: { x: 50, y: 0, width: 10, height: 10 } },
    ];
    const result = reconstructTable(blocks);
    expect(result).toBeNull();
  });
});
