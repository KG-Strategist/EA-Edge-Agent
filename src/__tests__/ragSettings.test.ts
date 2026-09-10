import { describe, it, expect, vi } from 'vitest';

const store = new Map<string, number>();

vi.mock('../lib/db', () => ({
  db: {
    app_settings: {
      get: vi.fn(async (key: string) => (store.has(key) ? { key, value: store.get(key) } : undefined)),
      put: vi.fn(async (rec: { key: string; value: number }) => {
        store.set(rec.key, rec.value);
      }),
    },
  },
}));

import { clampRagSetting, getRagSetting, setRagSetting, RAG_SETTING_LIMITS } from '../lib/ragSettings';

describe('ragSettings — clamping', () => {
  it('clamps maxPromptChars into 512..64000', () => {
    expect(clampRagSetting('maxPromptChars', 100)).toBe(512);
    expect(clampRagSetting('maxPromptChars', 8000)).toBe(8000);
    expect(clampRagSetting('maxPromptChars', 999999)).toBe(64000);
  });

  it('clamps ragContextChars into 128..8000', () => {
    expect(clampRagSetting('ragContextChars', 0)).toBe(128);
    expect(clampRagSetting('ragContextChars', 1000)).toBe(1000);
    expect(clampRagSetting('ragContextChars', 10 ** 9)).toBe(8000);
  });

  it('falls back to defaults on non-finite input', () => {
    expect(clampRagSetting('maxPromptChars', NaN)).toBe(RAG_SETTING_LIMITS.maxPromptChars.default);
    expect(clampRagSetting('ragContextChars', Number.POSITIVE_INFINITY)).toBe(
      RAG_SETTING_LIMITS.ragContextChars.default
    );
  });
});

describe('ragSettings — get/set round-trip', () => {
  it('returns compiled defaults when keys are absent', async () => {
    store.clear();
    expect(await getRagSetting('maxPromptChars')).toBe(8000);
    expect(await getRagSetting('ragContextChars')).toBe(1000);
  });

  it('persists clamped values and reads them back', async () => {
    store.clear();
    expect(await setRagSetting('ragContextChars', 2500)).toBe(2500);
    expect(await getRagSetting('ragContextChars')).toBe(2500);
    expect(await setRagSetting('ragContextChars', 1)).toBe(128);
    expect(await getRagSetting('ragContextChars')).toBe(128);
  });

  it('never overwrites with out-of-range writes', async () => {
    store.clear();
    await setRagSetting('maxPromptChars', 10 ** 9);
    expect(await getRagSetting('maxPromptChars')).toBe(64000);
  });
});
