/**
 * Secure Data Access Object (DAO) Layer
 *
 * Bridges Dexie database tables with cryptoVault for explicit async
 * encryption/decryption at rest. NEVER use Dexie hooks for crypto —
 * window.crypto.subtle is async, Dexie hooks are synchronous.
 *
 * All write paths encrypt before db.put(). All read paths decrypt after db.get().
 * Migration is idempotent: skips rows where encrypted fields already exist.
 */

import { db, ChatMessage, ThreatModelRecord, NetworkIntegration, GlobalSetting } from './db';
import { encryptString, decryptString, VaultLockedError } from './cryptoVault';
import { hashSecret } from './authEngine';
import { Logger } from './logger';

function rethrowIfVaultLocked(error: unknown): void {
  if (error instanceof VaultLockedError || (error instanceof Error && error.name === 'VaultLockedError')) {
    throw error;
  }
}

// ── Chat Messages ─────────────────────────────────────────────────────────────

export async function secureAddChatMessage(
  threadId: number,
  role: 'user' | 'assistant' | 'system',
  content: string,
  engine: 'sovereign' | 'neuro-symbolic' | 'pending' = 'pending'
): Promise<number> {
  const encryptedContent = await encryptString(content);
  const msg: Partial<ChatMessage> = {
    threadId,
    role,
    encryptedContent,
    inferenceEngine: engine,
    timestamp: Date.now(),
  };
  return (await db.chat_messages.add(msg as ChatMessage)) as number;
}

export async function secureGetChatMessages(threadId: number): Promise<ChatMessage[]> {
  const rows = await db.chat_messages.where('threadId').equals(threadId).sortBy('timestamp');
  const decrypted: ChatMessage[] = [];
  for (const row of rows) {
    let content = row.content || '';
    // TODO: Refactor any to explicit type (DEBT-1.1.3-LOGS)
    if ((row as any).encryptedContent && !(row as any).content) {
      try {
        content = await decryptString((row as any).encryptedContent);
      } catch (e) {
        rethrowIfVaultLocked(e);
        Logger.warn('[secureDb] Failed to decrypt chat message, using placeholder:', e);
        content = '[Message encrypted with previous session key]';
      }
    }
    decrypted.push({ ...row, content } as ChatMessage);
  }
  return decrypted;
}

export async function secureGetChatMessage(id: number): Promise<ChatMessage | null> {
  const row = await db.chat_messages.get(id);
  if (!row) return null;
  let content = row.content || '';
  if ((row as any).encryptedContent && !(row as any).content) { // TODO: Refactor any to explicit type (DEBT-1.1.3-LOGS)
    try {
      content = await decryptString((row as any).encryptedContent); // TODO: Refactor any to explicit type (DEBT-1.1.3-LOGS)
    } catch (e) {
      rethrowIfVaultLocked(e);
      Logger.warn('[secureDb] Failed to decrypt chat message:', e);
      content = '[Message encrypted with previous session key]';
    }
  }
  return { ...row, content } as ChatMessage;
}

// ── Threat Models ─────────────────────────────────────────────────────────────

export async function securePutThreatModel(
  data: Omit<ThreatModelRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: number; dataClassification?: string; networkPosture?: string; hostingModel?: string }
): Promise<number> {
  const encryptedPayload = await encryptString(
    JSON.stringify({
      components: data.components,
      threats: data.threats,
      mermaidDFD: data.mermaidDFD,
      dataClassification: (data as any).dataClassification, // TODO: Refactor any to explicit type (DEBT-1.1.3-LOGS)
      networkPosture: (data as any).networkPosture, // TODO: Refactor any to explicit type (DEBT-1.1.3-LOGS)
      hostingModel: (data as any).hostingModel, // TODO: Refactor any to explicit type (DEBT-1.1.3-LOGS)
    })
  );
  const record: Partial<ThreatModelRecord> & { dataClassification?: string; networkPosture?: string; hostingModel?: string } = {
    ...data,
    encryptedData: encryptedPayload,
    components: undefined,
    threats: undefined,
    mermaidDFD: undefined,
    updatedAt: new Date(),
  };
  if (data.id) {
    await db.threat_models.update(data.id, record);
    return data.id;
  }
  return (await db.threat_models.add(record as ThreatModelRecord)) as number;
}

export async function secureGetThreatModel(id: number): Promise<ThreatModelRecord | null> {
  const row = await db.threat_models.get(id);
  if (!row) return null;
  if (row.encryptedData) {
    try {
      const decrypted = JSON.parse(await decryptString(row.encryptedData));
      return {
        ...row,
        components: decrypted.components || row.components,
        threats: decrypted.threats || row.threats,
        mermaidDFD: decrypted.mermaidDFD || row.mermaidDFD,
        dataClassification: decrypted.dataClassification,
        networkPosture: decrypted.networkPosture,
        hostingModel: decrypted.hostingModel,
      } as ThreatModelRecord;
    } catch (e) {
      rethrowIfVaultLocked(e);
      Logger.warn('[secureDb] Failed to decrypt threat model:', e);
    }
  }
  return row;
}

export async function secureListThreatModels(): Promise<ThreatModelRecord[]> {
  const rows = await db.threat_models.orderBy('createdAt').reverse().toArray();
  const decrypted: ThreatModelRecord[] = [];
  for (const row of rows) {
    if (row.encryptedData) {
      try {
        const parsed = JSON.parse(await decryptString(row.encryptedData));
        decrypted.push({
          ...row,
          components: parsed.components || row.components,
          threats: parsed.threats || row.threats,
          mermaidDFD: parsed.mermaidDFD || row.mermaidDFD,
        });
      } catch (e) {
        rethrowIfVaultLocked(e);
        Logger.warn('[secureDb] Failed to decrypt threat model list item:', e);
        decrypted.push(row);
      }
    } else {
      decrypted.push(row);
    }
  }
  return decrypted;
}

// ── Network Integrations (SSO/LDAP Config Encryption) ─────────────────────────

export async function securePutNetworkIntegration(
  data: Omit<NetworkIntegration, 'id' | 'createdAt'> & { id?: number }
): Promise<number> {
  const record: Partial<NetworkIntegration> = { ...data };
  if (data.encryptedApiKey) {
    record.encryptedApiKey = data.encryptedApiKey;
  }
  if (data.id) {
    await db.network_integrations.update(data.id, record);
    return data.id;
  }
  return (await db.network_integrations.add(record as NetworkIntegration)) as number;
}

export async function secureGetNetworkIntegration(id: number): Promise<NetworkIntegration | undefined> {
  return await db.network_integrations.get(id);
}

export async function secureListNetworkIntegrations(): Promise<NetworkIntegration[]> {
  return await db.network_integrations.toArray();
}

// ── Global Settings (SSO/LDAP Config Encryption) ──────────────────────────────

export async function securePutGlobalSetting(data: GlobalSetting): Promise<void> {
  const record: Partial<GlobalSetting> = { ...data };

  // Encrypt SSO config if present
  if (record.local_enterprise_sso) {
    record.encryptedSsoConfig = await encryptString(JSON.stringify(record.local_enterprise_sso));
    delete record.local_enterprise_sso;
  }

  // Encrypt LDAP config if present
  if (record.local_ldap) {
    record.encryptedLdapConfig = await encryptString(JSON.stringify(record.local_ldap));
    delete record.local_ldap;
  }

  await db.global_settings.put(record as GlobalSetting);
}

export async function secureGetGlobalSetting(id: string): Promise<GlobalSetting | undefined> {
  const row = await db.global_settings.get(id);
  if (!row) return undefined;

  const result = { ...row };

  // Decrypt SSO config if encrypted version exists
  if (result.encryptedSsoConfig && !result.local_enterprise_sso) {
    try {
      result.local_enterprise_sso = JSON.parse(await decryptString(result.encryptedSsoConfig));
    } catch (e) {
      rethrowIfVaultLocked(e);
      Logger.warn('[secureDb] Failed to decrypt SSO config:', e);
    }
  }

  // Decrypt LDAP config if encrypted version exists
  if (result.encryptedLdapConfig && !result.local_ldap) {
    try {
      result.local_ldap = JSON.parse(await decryptString(result.encryptedLdapConfig));
    } catch (e) {
      rethrowIfVaultLocked(e);
      Logger.warn('[secureDb] Failed to decrypt LDAP config:', e);
    }
  }

  return result;
}

export async function secureListGlobalSettings(): Promise<GlobalSetting[]> {
  const rows = await db.global_settings.toArray();
  const decrypted: GlobalSetting[] = [];

  for (const row of rows) {
    const result = { ...row };

    if (result.encryptedSsoConfig && !result.local_enterprise_sso) {
      try {
        result.local_enterprise_sso = JSON.parse(await decryptString(result.encryptedSsoConfig));
      } catch (e) {
        rethrowIfVaultLocked(e);
        Logger.warn('[secureDb] Failed to decrypt SSO config in list:', e);
      }
    }

    if (result.encryptedLdapConfig && !result.local_ldap) {
      try {
        result.local_ldap = JSON.parse(await decryptString(result.encryptedLdapConfig));
      } catch (e) {
        rethrowIfVaultLocked(e);
        Logger.warn('[secureDb] Failed to decrypt LDAP config in list:', e);
      }
    }

    decrypted.push(result);
  }

  return decrypted;
}

// ── Vault Recovery: Re-encrypt messages from old PIN to current vault key ─────

async function getCryptoKeyFromHex(dekHex: string): Promise<CryptoKey> {
  const hexPairs = dekHex.match(/.{1,2}/g);
  if (!hexPairs) {
    throw new Error('Invalid vault key format');
  }
  const keyBuffer = new Uint8Array(hexPairs.map(byte => parseInt(byte, 16)));
  return await window.crypto.subtle.importKey(
    "raw",
    keyBuffer,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"]
  );
}

async function decryptStringWithKey(ciphertext: string, dekHex: string): Promise<string> {
  if (!ciphertext.includes(':')) {
    throw new Error('Invalid ciphertext format');
  }
  const [ivHex, encryptedHex] = ciphertext.split(':');
  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const encryptedData = new Uint8Array(encryptedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const key = await getCryptoKeyFromHex(dekHex);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encryptedData
  );
  const dec = new TextDecoder();
  return dec.decode(decrypted);
}

export interface VaultRecoveryResult {
  success: boolean;
  recoveredCount: number;
  failedCount: number;
  message: string;
}

export async function recoverEncryptedMessages(oldPin: string): Promise<VaultRecoveryResult> {
  try {
    const users = await db.users.toArray();
    if (users.length === 0) {
      return { success: false, recoveredCount: 0, failedCount: 0, message: 'No user account found.' };
    }
    const currentUser = users[0];
    const oldDekHex = await hashSecret(oldPin, currentUser.salt);

    const messages = await db.chat_messages.toArray();
    let recoveredCount = 0;
    let failedCount = 0;

    for (const msg of messages) {
      const encryptedContent = (msg as any).encryptedContent;
      if (!encryptedContent || msg.content) continue;

      try {
        const plaintext = await decryptStringWithKey(encryptedContent, oldDekHex);
        const newEncrypted = await encryptString(plaintext);
        await db.chat_messages.update(msg.id!, { encryptedContent: newEncrypted });
        recoveredCount++;
      } catch {
        failedCount++;
      }
    }

    if (recoveredCount === 0 && failedCount === 0) {
      return { success: true, recoveredCount: 0, failedCount: 0, message: 'No encrypted messages found to recover.' };
    }

    return {
      success: true,
      recoveredCount,
      failedCount,
      message: `Recovered ${recoveredCount} message(s). ${failedCount > 0 ? `${failedCount} message(s) could not be decrypted (wrong PIN or corrupted).` : 'All messages successfully re-encrypted.'}`
    };
  } catch (e) {
    Logger.error('[secureDb] Vault recovery failed:', e);
    return { success: false, recoveredCount: 0, failedCount: 0, message: 'Recovery failed. Please verify your old PIN and try again.' };
  }
}
