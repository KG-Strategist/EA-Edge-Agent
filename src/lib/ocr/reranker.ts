/**
 * OCR confidence reranker — non-blocking LLM refinement of OCR candidate
 * text. The OCR model is the source of truth; the LLM may only choose or
 * correct from the supplied candidates, never invent new content.
 *
 * Rerank order (mirrors the public inference stack):
 *   1. Local daemon via `localDaemon.generateText` if connected.
 *   2. User-selected primary model if configured + cached in OPFS.
 *   3. User-selected tiny/triage model if configured + cached in OPFS.
 *   4. Auto-route using `globalMoETarget`.
 *   5. Silent skip when no model/daemon is available — never throws.
 */

import { Logger } from '../logger';
import { OcrResult } from './pipeline';
import { localDaemon } from '../providers/LocalDaemonProvider';
import { sovereignEngine } from '../wasm/SovereignEngine';
import { OPFSManager } from '../storage/opfsManager';
import { db } from '../db';

const RERANK_SYSTEM_PROMPT = [
  'You are the EA-NITI OCR candidate reranker.',
  'You may only choose or lightly correct the supplied OCR candidates.',
  'You must never invent words that are not present in the candidates.',
  'If the candidates are unclear, return the highest-confidence candidate unchanged.',
  'Return only the corrected plain text, with no markdown, no commentary.',
].join(' ');

const RERANK_USER_PROMPT = (payload: string) => `OCR candidates (structured; one per line, with block id, page, confidence, and text):
${payload}

You may only choose or lightly correct the supplied candidates. You must not invent new words. If the candidates are unclear, return the highest-confidence candidate unchanged. Return only the corrected plain text, with no markdown, no commentary, no field labels.`;

export interface RerankOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface RerankAttempt {
  text: string;
  source: 'daemon' | 'sovereign-primary' | 'sovereign-triage' | 'auto-route';
}

async function callWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  if (ms <= 0) return null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    return result as T | null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function tryRerankWithEngine(
  modelId: string,
  payload: string,
  timeoutMs: number,
  source: RerankAttempt['source'],
  signal?: AbortSignal,
): Promise<RerankAttempt | null> {
  try {
    const has = await OPFSManager.hasModel(modelId);
    if (!has) return null;
    await sovereignEngine.ensureInitialized(modelId);
    const response = await callWithTimeout(
      sovereignEngine.generateText(
        [
          { role: 'system', content: RERANK_SYSTEM_PROMPT },
          { role: 'user', content: RERANK_USER_PROMPT(payload) },
        ],
        undefined,
        96,
      ),
      timeoutMs,
    );
    if (signal?.aborted) return null;
    if (!response) {
      try { sovereignEngine.abortGeneration?.(); } catch { /* ignore */ }
      return null;
    }
    const cleaned = String(response).trim();
    if (!cleaned) return null;
    return { text: cleaned, source };
  } catch (error) {
    Logger.warn(`[OCR rerank] ${source} failed:`, error);
    return null;
  }
}

async function tryRerankWithDaemon(
  payload: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<RerankAttempt | null> {
  if (!localDaemon.isConnected) return null;
  try {
    const response = await callWithTimeout(
      localDaemon.generateText(
        [
          { role: 'system', content: RERANK_SYSTEM_PROMPT },
          { role: 'user', content: RERANK_USER_PROMPT(payload) },
        ],
      ),
      timeoutMs,
    );
    if (signal?.aborted) {
      try { localDaemon.abortGeneration?.(); } catch { /* ignore */ }
      return null;
    }
    if (!response) {
      try { localDaemon.abortGeneration?.(); } catch { /* ignore */ }
      return null;
    }
    const cleaned = String(response).trim();
    if (!cleaned) return null;
    return { text: cleaned, source: 'daemon' };
  } catch (error) {
    Logger.warn('[OCR rerank] daemon failed:', error);
    return null;
  }
}

async function resolveModelId(key: 'core-primary' | 'core-triage'): Promise<string | null> {
  try {
    const config = await db.app_settings.get(key);
    const id = config?.value?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function rerankOcrCandidates(
  result: OcrResult,
  _blob: Blob,
  options: RerankOptions = {},
): Promise<OcrResult> {
  const candidateBlocks = result.blocks
    .map((b, i) => ({
      id: `b${i + 1}`,
      page: b.pageIndex ?? 0,
      confidence: Number.isFinite(b.confidence) ? b.confidence : 0,
      bbox: b.bbox ?? null,
      text: (b.text || '').trim(),
    }))
    .filter((b) => b.text.length > 0);
  if (candidateBlocks.length === 0) {
    return { ...result, internalFlags: [...result.internalFlags, 'rerank:skipped-no-candidates'] };
  }
  const timeoutMs = options.timeoutMs ?? 1500;
  const signal = options.signal;
  if (signal?.aborted) {
    return { ...result, internalFlags: [...result.internalFlags, 'rerank:aborted'] };
  }

  const payload = candidateBlocks
    .map((b) => `[${b.id} p${b.page} c=${b.confidence.toFixed(2)}] ${b.text}`)
    .join('\n');
  const candidates = candidateBlocks.map((b) => b.text);

  const flag: string[] = [];
  let chosen: RerankAttempt | null = null;

  chosen = await tryRerankWithDaemon(payload, timeoutMs, signal);
  if (chosen) {
    flag.push(`rerank:daemon -> ${chosen.source}`);
  } else {
    const primaryId = await resolveModelId('core-primary');
    if (primaryId) {
      chosen = await tryRerankWithEngine(primaryId, payload, timeoutMs, 'sovereign-primary', signal);
      if (chosen) flag.push('rerank:sovereign-primary');
    }
    if (!chosen) {
      const triageId = await resolveModelId('core-triage');
      if (triageId) {
        chosen = await tryRerankWithEngine(triageId, payload, timeoutMs, 'sovereign-triage', signal);
        if (chosen) flag.push('rerank:sovereign-triage');
      }
    }
  }

  if (signal?.aborted) {
    flag.push('rerank:aborted');
    return { ...result, internalFlags: [...result.internalFlags, ...flag] };
  }

  if (!chosen) {
    flag.push('rerank:skipped-no-model');
    return { ...result, internalFlags: [...result.internalFlags, ...flag] };
  }

  if (!isCandidateAligned(chosen.text, candidates)) {
    flag.push('rerank:rejected-out-of-scope');
    return { ...result, internalFlags: [...result.internalFlags, ...flag] };
  }

  return {
    ...result,
    text: chosen.text,
    mode: 'llm-reranked',
    confidence: Math.min(1, result.confidence + 0.1),
    internalFlags: [...result.internalFlags, ...flag],
  };
}

function isCandidateAligned(text: string, candidates: string[]): boolean {
  if (!text) return false;
  const normalized = tokenize(text.toLowerCase());
  if (normalized.length === 0) return false;
  return candidates.some((candidate) => {
    const base = tokenize(candidate.toLowerCase());
    if (base.length === 0) return false;
    const maxEditFraction = 0.15;
    const allowed = Math.max(2, Math.floor(base.length * maxEditFraction));
    return jaccardAligned(normalized, base) >= 0.65
      || levenshteinAligned(normalized, base) <= allowed;
  });
}

function tokenize(value: string): string[] {
  return value
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((tok) => tok.length > 0);
}

function jaccardAligned(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const tok of setA) if (setB.has(tok)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function levenshteinAligned(a: string[], b: string[]): number {
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
