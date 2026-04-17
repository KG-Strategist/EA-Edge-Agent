import { hashSecret } from './authEngine';

// Store the DEK in sessionStorage
const DEK_STORAGE_KEY = 'ea_niti_dek';

export async function initializeVault(pin: string, salt: string) {
  // Derive a Master DEK from the PIN and Salt
  const dek = await hashSecret(pin, salt + "_dek_vault");
  sessionStorage.setItem(DEK_STORAGE_KEY, dek);
}

export function getVaultKey(): string | null {
  return sessionStorage.getItem(DEK_STORAGE_KEY);
}

export function clearVault() {
  sessionStorage.removeItem(DEK_STORAGE_KEY);
}

// Convert string to ArrayBuffer
function getMessageEncoding(message: string) {
  const enc = new TextEncoder();
  return enc.encode(message);
}

// Helper to get a CryptoKey from the hex DEK
async function getCryptoKey(dekHex: string): Promise<CryptoKey> {
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
    console.error("Failed to decrypt blob", e);
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
    console.error("Failed to decrypt string", e);
    throw new Error('Failed to decrypt string');
  }
}
