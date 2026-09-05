import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeVault, clearVault } from '../lib/cryptoVault';
import {
  buildEncryptedEnvelope,
  parseBrainPayload,
  applyTableSelection,
  isPortableTable,
  PORTABILITY_GROUPS,
  BRAIN_ENCRYPTED_FORMAT,
  BRAIN_ENVELOPE_VERSION,
} from '../lib/brainPayload';

const PIN = 'harness-pin-999';
const SALT = 'harness-salt-999';

const SAMPLE_DUMP = {
  architecture_principles: [{ id: 'p1', title: 'Sovereignty first' }],
  architecture_layers: [{ id: 'l1', name: 'Business' }],
};

describe('brainPayload envelope (v1.2 M1)', () => {
  beforeEach(async () => {
    clearVault();
    await initializeVault(PIN, SALT);
  });

  afterEach(() => {
    clearVault();
  });

  it('round-trips dump through encrypt envelope', async () => {
    const tables = Object.keys(SAMPLE_DUMP);
    const envelope = await buildEncryptedEnvelope(JSON.stringify(SAMPLE_DUMP), tables);
    expect(envelope.format).toBe(BRAIN_ENCRYPTED_FORMAT);
    expect(envelope.version).toBe(BRAIN_ENVELOPE_VERSION);
    expect(envelope.tables).toEqual(tables);
    expect(typeof envelope.payload).toBe('string');

    const parsed = await parseBrainPayload(JSON.stringify(envelope));
    expect(parsed.encrypted).toBe(true);
    expect(parsed.dump).toEqual(SAMPLE_DUMP);
  });

  it('passes legacy plaintext dumps through untouched', async () => {
    const parsed = await parseBrainPayload(JSON.stringify(SAMPLE_DUMP));
    expect(parsed.encrypted).toBe(false);
    expect(parsed.dump).toEqual(SAMPLE_DUMP);
  });

  it('rejects tampered ciphertext', async () => {
    const envelope = await buildEncryptedEnvelope(JSON.stringify(SAMPLE_DUMP), Object.keys(SAMPLE_DUMP));
    const tampered = {
      ...envelope,
      payload: envelope.payload.slice(0, -1) + (envelope.payload.endsWith('0') ? '1' : '0'),
    };
    await expect(parseBrainPayload(JSON.stringify(tampered))).rejects.toThrow(/decrypt/i);
  });

  it('rejects envelopes from a different vault key', async () => {
    const envelope = await buildEncryptedEnvelope(JSON.stringify(SAMPLE_DUMP), Object.keys(SAMPLE_DUMP));
    clearVault();
    await initializeVault('other-pin', SALT);
    await expect(parseBrainPayload(JSON.stringify(envelope))).rejects.toThrow(/decrypt/i);
  });

  it('requires unlocked vault for encryption', async () => {
    clearVault();
    await expect(buildEncryptedEnvelope('{}', [])).rejects.toThrow(/locked/i);
  });

  it('requires unlocked vault to parse encrypted envelopes', async () => {
    const envelope = await buildEncryptedEnvelope(JSON.stringify(SAMPLE_DUMP), Object.keys(SAMPLE_DUMP));
    clearVault();
    await expect(parseBrainPayload(JSON.stringify(envelope))).rejects.toThrow(/locked/i);
  });

  it('rejects non-JSON files', async () => {
    await expect(parseBrainPayload('not-json{{{')).rejects.toThrow(/valid JSON/i);
  });

  it('rejects JSON without core entities', async () => {
    await expect(parseBrainPayload(JSON.stringify({ random: [1, 2] }))).rejects.toThrow(/core architectural/i);
  });

  it('rejects unsupported envelope versions', async () => {
    const envelope = await buildEncryptedEnvelope(JSON.stringify(SAMPLE_DUMP), Object.keys(SAMPLE_DUMP));
    const future = { ...envelope, version: 999 };
    await expect(parseBrainPayload(JSON.stringify(future))).rejects.toThrow(/version/i);
  });
});

describe('selective sync helpers (v1.2 M2)', () => {
  beforeEach(async () => {
    clearVault();
    await initializeVault(PIN, SALT);
  });

  afterEach(() => {
    clearVault();
  });

  const available = [
    'architecture_categories', 'master_categories', 'bespoke_tags',
    'content_metamodel', 'architecture_layers', 'architecture_principles', 'service_domains',
    'prompt_templates', 'report_templates', 'review_workflows',
    'app_settings', 'threat_models', 'custom_table',
  ];

  it('covers every known portable table in a group', () => {
    const grouped = new Set(PORTABILITY_GROUPS.flatMap((g) => g.tables));
    for (const table of available) {
      if (table === 'custom_table') continue;
      expect(grouped.has(table)).toBe(true);
    }
  });

  it('returns group-ordered intersection of available and selected', () => {
    const selected = ['threat_models', 'architecture_principles', 'custom_table', 'nope_missing'];
    expect(applyTableSelection(available, selected)).toEqual([
      'architecture_principles',
      'threat_models',
      'custom_table',
    ]);
  });

  it('returns empty array when nothing is selected', () => {
    expect(applyTableSelection(available, [])).toEqual([]);
  });

  it('blacklists vector/session/cache/audit/log tables', () => {
    expect(isPortableTable('review_embeddings_vector')).toBe(false);
    expect(isPortableTable('review_sessions')).toBe(false);
    expect(isPortableTable('model_cache')).toBe(false);
    expect(isPortableTable('audit_logs')).toBe(false);
    expect(isPortableTable('architecture_principles')).toBe(true);
  });

  it('scoped envelopes round-trip with only selected tables', async () => {
    const scoped = applyTableSelection(available, ['architecture_principles', 'app_settings']);
    const dump: Record<string, unknown[]> = {
      architecture_principles: [{ id: 'p1' }],
      app_settings: [{ key: 'k' }],
    };
    const envelope = await buildEncryptedEnvelope(JSON.stringify(dump), scoped);
    expect(envelope.tables).toEqual(scoped);
    const parsed = await parseBrainPayload(JSON.stringify(envelope));
    expect(parsed.encrypted).toBe(true);
    expect(Object.keys(parsed.dump).sort()).toEqual(['app_settings', 'architecture_principles']);
  });
});
