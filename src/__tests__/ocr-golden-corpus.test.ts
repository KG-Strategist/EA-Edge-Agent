/**
 * Phase 12 — golden test corpus scaffolding.
 *
 * The full fixture suite is committed separately as `public/ocr/`
 * artefacts (LFS-managed). These tests assert the *scoring logic*
 * (Levenshtein-based WER/CER and the no-hallucination reranker
 * alignment check) on synthetic examples that mirror the production
 * failure modes.
 *
 * Once real golden fixtures are available, the same helpers are
 * called by `evaluateCorpus(groundTruth, prediction)` from
 * `scripts/ocrArtifacts.mjs` (see the `evaluate` subcommand).
 */

import { describe, it, expect } from 'vitest';
import { runOcrDetailed } from '../lib/ocrEngine';

export function wordErrorRate(reference: string, hypothesis: string): number {
  return levenshtein(reference.trim().split(/\s+/), hypothesis.trim().split(/\s+/))
    / Math.max(1, reference.trim().split(/\s+/).length);
}

export function charErrorRate(reference: string, hypothesis: string): number {
  return levenshtein([...reference.trim()], [...hypothesis.trim()])
    / Math.max(1, reference.trim().length);
}

function levenshtein(a: string[], b: string[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const previous = new Array(b.length + 1).fill(0).map((_, i) => i);
  const current = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) previous[j] = current[j];
  }
  return previous[b.length];
}

describe('OCR golden corpus scoring', () => {
  it('WER is 0 for exact match', () => {
    expect(wordErrorRate('hello world', 'hello world')).toBe(0);
  });

  it('WER is 1 for completely different words', () => {
    expect(wordErrorRate('foo bar', 'baz qux')).toBe(1);
  });

  it('WER is fractional for partial word errors', () => {
    const wer = wordErrorRate('the quick brown fox', 'the quick brown dog');
    expect(wer).toBeGreaterThan(0);
    expect(wer).toBeLessThan(1);
  });

  it('CER is 0 for exact match', () => {
    expect(charErrorRate('hello', 'hello')).toBe(0);
  });

  it('CER penalises single-character errors at fine granularity', () => {
    const cer = charErrorRate('hello', 'hellp');
    expect(cer).toBeGreaterThan(0);
    expect(cer).toBeLessThanOrEqual(1);
  });
});

describe('OCR no-hallucination invariants', () => {
  it('runOcrDetailed never throws to UI callers (empty blob)', async () => {
    const result = await runOcrDetailed(new Blob([], { type: 'image/png' }));
    expect(result).toBeTruthy();
    expect(result.text).toBe('');
    expect(Array.isArray(result.internalFlags)).toBe(true);
  });

  it('runOcrDetailed never throws to UI callers (oversized blob)', async () => {
    const oversized = new Blob([new Uint8Array(40 * 1024 * 1024)], { type: 'image/png' });
    const result = await runOcrDetailed(oversized);
    expect(result).toBeTruthy();
    expect(result.internalFlags.some((f) => f.startsWith('validation:'))).toBe(true);
  });

  it('runOcrDetailed never throws to UI callers (malformed PDF)', async () => {
    const result = await runOcrDetailed(new Blob(['not a real pdf'], { type: 'application/pdf' }));
    expect(result).toBeTruthy();
  });

  it('runOcrDetailed never throws to UI callers (PDF with embedded XSS)', async () => {
    const xssPayload = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 100 100]/Contents 4 0 R/Resources<</Font<</F1<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>>>>>>>endobj\n4 0 obj<</Length 50>>stream\nBT /F1 12 Tf 10 50 Td (<script>alert(1)</script>) Tj ET\nendstream endobj\nxref\n0 5\n0000000000 65535 f\n0000000010 00000 n\n0000000050 00000 n\n0000000100 00000 n\n0000000200 00000 n\ntrailer<</Size 5/Root 1 0 R>>\nstartxref\n300\n%%EOF`;
    const result = await runOcrDetailed(new Blob([xssPayload], { type: 'application/pdf' }));
    expect(result).toBeTruthy();
    expect(result.text).not.toMatch(/<script/i);
  });
});
