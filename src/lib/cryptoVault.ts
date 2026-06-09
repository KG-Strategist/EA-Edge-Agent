import { hashSecret } from './authEngine';
import { Logger } from './logger';

// ── Typed Errors ─────────────────────────────────────────────────────────────

export class VaultLockedError extends Error {
  constructor(message = 'VaultLockedError: Vault is locked. DEK not available.') {
    super(message);
    this.name = 'VaultLockedError';
  }
}

// ── True In-Memory Vault (No sessionStorage for DEK) ─────────────────────────
// The DEK exists only in RAM within the V8 closure. No persistence to browser storage.

let activeDEK: string | null = null;

export function isVaultUnlocked(): boolean {
  return activeDEK !== null;
}

export function getVaultKey(): string | null {
  if (!activeDEK) {
    throw new VaultLockedError();
  }
  return activeDEK;
}

export function getVaultKeySafe(): string | null {
  return activeDEK;
}

export async function initializeVault(pin: string, salt: string): Promise<void> {
  const dek = await hashSecret(pin, salt + "_dek_vault");
  activeDEK = dek;
}

export function clearVault(): void {
  activeDEK = null;
}

// Convert string to ArrayBuffer
function getMessageEncoding(message: string) {
  const enc = new TextEncoder();
  return enc.encode(message);
}

// Helper to get a CryptoKey from the hex DEK
async function getCryptoKey(dekHex: string, extractable = false): Promise<CryptoKey> {
  const hexPairs = dekHex.match(/.{1,2}/g);
  if (!hexPairs) {
    throw new Error('Invalid vault key format');
  }
  const keyBuffer = new Uint8Array(hexPairs.map(byte => parseInt(byte, 16)));
  return await window.crypto.subtle.importKey(
    "raw",
    keyBuffer,
    "AES-GCM",
    extractable,
    ["encrypt", "decrypt"]
  );
}

export async function encryptBlob(blob: Blob): Promise<Blob> {
  const dekHex = getVaultKey();
  if (!dekHex) {
    throw new Error('CRITICAL: Vault locked. No Data Encryption Key available.');
  }

  const key = await getCryptoKey(dekHex);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const arrayBuffer = await blob.arrayBuffer();
  
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    arrayBuffer
  );
  
  // Prepend IV to the encrypted blob
  const encryptedBlob = new Blob([iv, encrypted], { type: blob.type });
  return encryptedBlob;
}

export async function decryptBlob(blob: Blob): Promise<Blob> {
  const dekHex = getVaultKey();
  if (!dekHex) {
    throw new Error('Vault decryption key not available');
  }

  const arrayBuffer = await blob.arrayBuffer();
  if (arrayBuffer.byteLength <= 12) {
    throw new Error('Invalid encrypted payload');
  }

  const iv = arrayBuffer.slice(0, 12);
  const data = arrayBuffer.slice(12);
  
  try {
    const key = await getCryptoKey(dekHex);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) },
      key,
      data
    );
    return new Blob([decrypted], { type: blob.type });
  } catch (e) {
    Logger.error('Failed to decrypt blob', e);
    throw new Error('Failed to decrypt blob');
  }
}

export async function encryptString(text: string): Promise<string> {
  const dekHex = getVaultKey();
  if (!dekHex) {
    throw new Error('CRITICAL: Vault locked. No Data Encryption Key available.');
  }

  const key = await getCryptoKey(dekHex);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    getMessageEncoding(text)
  );
  
  const encryptedArray = Array.from(new Uint8Array(encrypted));
  const ivArray = Array.from(iv);
  const encryptedHex = encryptedArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const ivHex = ivArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${ivHex}:${encryptedHex}`;
}

export async function decryptString(ciphertext: string): Promise<string> {
  const dekHex = getVaultKey();
  if (!dekHex) {
    throw new Error('Vault decryption key not available');
  }
  if (!ciphertext.includes(':')) {
    throw new Error('Invalid ciphertext format');
  }

  try {
    const [ivHex, encryptedHex] = ciphertext.split(':');
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const encryptedData = new Uint8Array(encryptedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    
    const key = await getCryptoKey(dekHex);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encryptedData
    );
    
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (e) {
    Logger.error('Failed to decrypt string', e);
    throw new Error('Failed to decrypt string');
  }
}

// ── Track 2: HMAC-SHA256 Session Tamper-Proofing ─────────────────────────────

let activeHmacKey: CryptoKey | null = null;

async function getHmacCryptoKey(dekHex: string): Promise<CryptoKey> {
  const hexPairs = dekHex.match(/.{1,2}/g);
  if (!hexPairs) {
    throw new Error('Invalid vault key format');
  }
  const keyBuffer = new Uint8Array(hexPairs.map(byte => parseInt(byte, 16)));
  return await window.crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function initializeHmacKey(): Promise<void> {
  const dekHex = getVaultKey();
  if (!dekHex) {
    throw new Error('CRITICAL: Vault locked. No Data Encryption Key available for HMAC.');
  }
  activeHmacKey = await getHmacCryptoKey(dekHex);
}

export function clearHmacKey(): void {
  activeHmacKey = null;
}

export async function signHMAC(data: string): Promise<string> {
  if (!activeHmacKey) {
    throw new Error('HMAC key not initialized. Call initializeHmacKey() first.');
  }
  const encoder = new TextEncoder();
  const signature = await window.crypto.subtle.sign(
    "HMAC",
    activeHmacKey,
    encoder.encode(data)
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

export async function verifyHMAC(data: string, hmac: string): Promise<boolean> {
  if (!activeHmacKey) {
    throw new Error('HMAC key not initialized. Call initializeHmacKey() first.');
  }
  const encoder = new TextEncoder();
  const sigBytes = Uint8Array.from(atob(hmac), c => c.charCodeAt(0));
  return await window.crypto.subtle.verify(
    "HMAC",
    activeHmacKey,
    sigBytes,
    encoder.encode(data)
  );
}

// ── Sealed Vault Session (non-extractable wrapping key) ───────────────────────

export interface SealedVaultSession {
  wrappedDEK: string;
  iv: string;
  salt: string;
  wrappingKey: CryptoKey;
  checksum?: string;
}

export async function createSealedVaultSession(_pin: string, salt: string): Promise<SealedVaultSession> {
  const dekHex = getVaultKey();
  if (!dekHex) throw new VaultLockedError('Cannot create sealed session: vault is locked.');

  const wrappingKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"]
  );

  const dekKey = await getCryptoKey(dekHex, true);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const wrappedDEK = await window.crypto.subtle.wrapKey(
    "raw",
    dekKey,
    wrappingKey,
    { name: "AES-GCM", iv }
  );

  const wrappedDEKHex = bufToHex(new Uint8Array(wrappedDEK));

  // Generate an HMAC checksum for the wrapped DEK to ensure integrity
  const encoder = new TextEncoder();
  const checksumKey = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(salt + "checksum"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const checksumSig = await window.crypto.subtle.sign(
    "HMAC",
    checksumKey,
    encoder.encode(wrappedDEKHex)
  );
  const checksum = bufToHex(new Uint8Array(checksumSig));

  return {
    wrappedDEK: wrappedDEKHex,
    iv: bufToHex(iv),
    salt,
    wrappingKey,
    checksum,
  };
}

export async function restoreVaultKey(sealedSession: SealedVaultSession): Promise<void> {
  if (sealedSession.checksum) {
    const encoder = new TextEncoder();
    const checksumKey = await window.crypto.subtle.importKey(
      "raw",
      encoder.encode(sealedSession.salt + "checksum"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const isValid = await window.crypto.subtle.verify(
      "HMAC",
      checksumKey,
      toArrayBuffer(hexToBuf(sealedSession.checksum)),
      encoder.encode(sealedSession.wrappedDEK)
    );
    if (!isValid) {
      throw new Error("Vault session integrity check failed. The stored DEK has been tampered with.");
    }
  }

  const wrappedDEKBytes = hexToBuf(sealedSession.wrappedDEK);
  const iv = hexToBuf(sealedSession.iv);

  const unwrappedDEK = await window.crypto.subtle.unwrapKey(
    "raw",
    toArrayBuffer(wrappedDEKBytes),
    sealedSession.wrappingKey,
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );

  const exportedDEK = await window.crypto.subtle.exportKey("raw", unwrappedDEK);
  activeDEK = bufToHex(new Uint8Array(exportedDEK));
}

export async function clearVaultAndSession(): Promise<void> {
  activeDEK = null;
  activeHmacKey = null;
}

function bufToHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): Uint8Array {
  const pairs = hex.match(/.{1,2}/g);
  if (!pairs) throw new Error('Invalid hex string');
  return new Uint8Array(pairs.map(p => parseInt(p, 16)));
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}
