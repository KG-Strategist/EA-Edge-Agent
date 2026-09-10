/**
 * RAG tuning settings — typed, clamped readers/writers over app_settings.
 *
 * Stage 1.3 Config-Driven Intelligence: hardcoded limits are anti-patterns.
 * Every constraint here is user-configurable with compiled fallbacks, so
 * fresh installs, old databases, and offline failures all behave identically.
 *
 * Architecture: Layer 4 engine — zero React imports, async return promises.
 */

import { db } from './db';

export const RAG_SETTING_LIMITS = {
  maxPromptChars: { min: 512, max: 64000, default: 8000 },
  ragContextChars: { min: 128, max: 8000, default: 1000 },
} as const;

export type RagSettingKey = keyof typeof RAG_SETTING_LIMITS;

/**
 * Clamp a raw value into the key's [min, max] range.
 * Non-finite input yields the compiled default. Pure — no I/O.
 */
export function clampRagSetting(key: RagSettingKey, value: number): number {
  const { min, max, default: fallback } = RAG_SETTING_LIMITS[key];
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

/**
 * Read a tuning value. Falls back to the compiled default when the key is
 * absent, malformed, or persistence is unavailable. Never throws.
 */
export async function getRagSetting(key: RagSettingKey): Promise<number> {
  try {
    const rec = await db.app_settings.get(key);
    const raw = typeof rec?.value === 'number' ? rec.value : NaN;
    return clampRagSetting(key, raw);
  } catch {
    return RAG_SETTING_LIMITS[key].default;
  }
}

/**
 * Persist a tuning value (clamped). Returns the stored value.
 */
export async function setRagSetting(key: RagSettingKey, value: number): Promise<number> {
  const clamped = clampRagSetting(key, value);
  await db.app_settings.put({ key, value: clamped });
  return clamped;
}
