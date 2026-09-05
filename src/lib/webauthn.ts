import { db } from './db';
import { Logger } from './logger';

// ── Zero-Trust Device Biometrics (v1.2 M3, TSD-050) ───────────────────────────
// FIDO2/WebAuthn PRF-bound device keys. No server, no attestation validation
// (air-gapped by design): possession of the PRF output unwraps the vault DEK.
// The PRF secret never leaves the authenticator; only the wrapped DEK (AES-GCM)
// and the public credential ID persist in app_settings (no schema migration).

export const DEVICE_KEY_SETTING = 'webauthn_device_key';
// Fixed first-input salt for PRF eval — binds the derived secret to this app.
const PRF_SALT_LABEL = 'ea-niti-device-key-v1';

export interface DeviceKeyRecord {
  credentialId: string; // base64url
  wrappedDEK: string; // base64url AES-GCM ciphertext of the hex DEK
  iv: string; // base64url
  createdAt: string;
  rpId: string;
}

// ── base64url helpers (pure) ──────────────────────────────────────────────────

export function bufToB64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBuf(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Capability detection (pure reads of navigator) ────────────────────────────

export function isWebAuthnSupported(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof (window as any).PublicKeyCredential !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof (navigator as any).credentials?.create === 'function' &&
      typeof (navigator as any).credentials?.get === 'function'
    );
  } catch {
    return false;
  }
}

// ── PRF-bound DEK wrapping (pure WebCrypto, no navigator) ─────────────────────

async function kekFromPrf(prfBytes: Uint8Array): Promise<CryptoKey> {
  const digest = await window.crypto.subtle.digest('SHA-256', prfBytes as unknown as ArrayBuffer);
  return window.crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function wrapDeviceDEK(
  prfBytes: Uint8Array,
  dekHex: string
): Promise<{ wrappedDEK: string; iv: string }> {
  if (prfBytes.length < 16) throw new Error('PRF output too short to wrap device key.');
  const kek = await kekFromPrf(prfBytes);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const cipher = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
    kek,
    new TextEncoder().encode(dekHex)
  );
  return { wrappedDEK: bufToB64url(cipher), iv: bufToB64url(iv) };
}

export async function unwrapDeviceDEK(
  prfBytes: Uint8Array,
  wrapped: { wrappedDEK: string; iv: string }
): Promise<string> {
  const kek = await kekFromPrf(prfBytes);
  try {
    const plain = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64urlToBuf(wrapped.iv) as unknown as ArrayBuffer },
      kek,
      b64urlToBuf(wrapped.wrappedDEK) as unknown as ArrayBuffer
    );
    const dekHex = new TextDecoder().decode(plain);
    if (!/^[0-9a-f]{32,}$/i.test(dekHex)) throw new Error('Unwrapped key has invalid format.');
    return dekHex;
  } catch (e) {
    Logger.error('Device key unwrap failed', e);
    throw new Error('Failed to unwrap device key: wrong authenticator or corrupted record.');
  }
}

// ── Credential ceremonies (navigator-gated) ───────────────────────────────────

function prfSaltBytes(): Uint8Array {
  return new TextEncoder().encode(PRF_SALT_LABEL);
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
}

function readPrfResult(cred: any): Uint8Array {
  const results = cred.getClientExtensionResults?.()?.prf?.results?.first;
  if (!results) {
    throw new Error('Authenticator did not return a PRF output. This device cannot bind keys.');
  }
  return new Uint8Array(results);
}

/** Register a new device credential and return its ID + PRF secret. */
export async function registerDeviceCredential(
  username: string
): Promise<{ credentialId: string; prfBytes: Uint8Array }> {
  if (!isWebAuthnSupported()) throw new Error('WebAuthn is not supported in this browser.');
  const challenge = window.crypto.getRandomValues(new Uint8Array(32));
  const userId = window.crypto.getRandomValues(new Uint8Array(16));
  const publicKey: any = {
    challenge: toArrayBuffer(challenge),
    rp: { name: 'EA-NITI Edge Agent', id: window.location.hostname },
    user: { id: toArrayBuffer(userId), name: username, displayName: username },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    timeout: 60000,
    attestation: 'none',
    authenticatorSelection: { userVerification: 'preferred', residentKey: 'preferred' },
    extensions: { prf: { eval: { first: toArrayBuffer(prfSaltBytes()) } } },
  };
  const cred: any = await (navigator as any).credentials.create({ publicKey });
  if (!cred?.rawId) throw new Error('Credential creation was cancelled or failed.');
  return { credentialId: bufToB64url(cred.rawId), prfBytes: readPrfResult(cred) };
}

/** Assert possession of a registered credential and return its PRF secret. */
export async function assertDeviceCredential(credentialId: string): Promise<Uint8Array> {
  if (!isWebAuthnSupported()) throw new Error('WebAuthn is not supported in this browser.');
  const challenge = window.crypto.getRandomValues(new Uint8Array(32));
  const publicKey: any = {
    challenge: toArrayBuffer(challenge),
    rpId: window.location.hostname,
    allowCredentials: [{ type: 'public-key', id: b64urlToBuf(credentialId) }],
    timeout: 60000,
    userVerification: 'preferred',
    extensions: { prf: { eval: { first: toArrayBuffer(prfSaltBytes()) } } },
  };
  const cred: any = await (navigator as any).credentials.get({ publicKey });
  if (!cred) throw new Error('Authentication was cancelled or failed.');
  return readPrfResult(cred);
}

// ── Device-key record store (app_settings KV, no migration) ───────────────────

export async function getStoredDeviceKey(): Promise<DeviceKeyRecord | null> {
  try {
    const row = await db.app_settings.get(DEVICE_KEY_SETTING);
    const v = row?.value as DeviceKeyRecord | undefined;
    if (!v || typeof v.credentialId !== 'string' || typeof v.wrappedDEK !== 'string') return null;
    return v;
  } catch (e) {
    Logger.error('Failed to read device key record', e);
    return null;
  }
}

export async function storeDeviceKey(record: DeviceKeyRecord): Promise<void> {
  await db.app_settings.put({ key: DEVICE_KEY_SETTING, value: record });
}

export async function removeDeviceKey(): Promise<void> {
  await db.app_settings.delete(DEVICE_KEY_SETTING);
}
