import { encryptString, decryptString, isVaultUnlocked, VaultLockedError } from './cryptoVault';
import { Logger } from './logger';

// ── Encrypted NITI Brain Payload (v1.2 M1) ────────────────────────────────────
// Envelope around the SystemTab brain dump. AES-256-GCM via the in-RAM vault
// DEK; the GCM auth tag provides integrity (no separate HMAC needed).

export const BRAIN_ENCRYPTED_FORMAT = 'niti-brain-encrypted';
export const BRAIN_ENVELOPE_VERSION = 1;
export const BRAIN_LEGACY_MIN_KEYS = [
  'architecture_categories',
  'master_categories',
  'content_metamodel',
  'architecture_layers',
  'architecture_principles',
  'service_domains',
];

export interface EncryptedBrainEnvelope {
  format: typeof BRAIN_ENCRYPTED_FORMAT;
  version: number;
  exportedAt: string;
  tables: string[];
  payload: string; // ivHex:cipherHex from encryptString()
}

export interface ParsedBrainPayload {
  dump: Record<string, any[]>;
  encrypted: boolean;
}

function isEnvelope(value: unknown): value is EncryptedBrainEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.format === BRAIN_ENCRYPTED_FORMAT && typeof v.payload === 'string';
}

function assertDumpShape(dump: unknown): Record<string, any[]> {
  if (!dump || typeof dump !== 'object' || Array.isArray(dump)) {
    throw new Error('Invalid NITI Brain Payload: Root element is not a JSON object.');
  }
  const record = dump as Record<string, unknown>;
  const hasAnyValidKey = BRAIN_LEGACY_MIN_KEYS.some((key) => Array.isArray(record[key]));
  if (!hasAnyValidKey) {
    throw new Error(
      'Invalid NITI Brain Payload: Missing core architectural entities (e.g., principles, layers).'
    );
  }
  return record as Record<string, unknown[]>;
}

/** Encrypt a brain dump JSON string into a versioned envelope. Requires unlocked vault. */
export async function buildEncryptedEnvelope(
  dumpJson: string,
  tables: string[]
): Promise<EncryptedBrainEnvelope> {
  if (!isVaultUnlocked()) {
    throw new VaultLockedError('Cannot encrypt brain payload: vault is locked.');
  }
  const payload = await encryptString(dumpJson);
  return {
    format: BRAIN_ENCRYPTED_FORMAT,
    version: BRAIN_ENVELOPE_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
    payload,
  };
}

/**
 * Parse an imported brain file. Accepts encrypted envelopes (requires unlocked
 * vault) and legacy plaintext dumps. Returns the validated dump table map.
 */
export async function parseBrainPayload(text: string): Promise<ParsedBrainPayload> {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new Error('Invalid NITI Brain Payload: File is not a valid JSON document.');
  }

  if (isEnvelope(root)) {
    if (root.version !== BRAIN_ENVELOPE_VERSION) {
      throw new Error(
        `Unsupported encrypted payload version: ${String(root.version)} (expected ${BRAIN_ENVELOPE_VERSION}).`
      );
    }
    if (!isVaultUnlocked()) {
      throw new VaultLockedError('Encrypted payload requires an unlocked vault to decrypt.');
    }
    let decrypted: string;
    try {
      decrypted = await decryptString(root.payload);
    } catch (e) {
      Logger.error('Brain payload decryption failed', e);
      throw new Error('Failed to decrypt brain payload: wrong vault key or corrupted file.');
    }
    let dump: unknown;
    try {
      dump = JSON.parse(decrypted);
    } catch {
      throw new Error('Invalid NITI Brain Payload: Decrypted content is not valid JSON.');
    }
    return { dump: assertDumpShape(dump), encrypted: true };
  }

  return { dump: assertDumpShape(root), encrypted: false };
}
