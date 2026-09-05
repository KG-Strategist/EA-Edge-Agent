import { describe, it, expect } from 'vitest';
import {
  bufToB64url,
  b64urlToBuf,
  isWebAuthnSupported,
  wrapDeviceDEK,
  unwrapDeviceDEK,
} from '../lib/webauthn';

const DEK_HEX = 'a1b2c3d4'.repeat(16); // 64 hex chars

function randomPrf(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(32));
}

describe('webauthn device keys (v1.2 M3)', () => {
  it('round-trips base64url encoding', () => {
    const bytes = new Uint8Array([0, 1, 250, 255, 16, 32]);
    expect(b64urlToBuf(bufToB64url(bytes))).toEqual(bytes);
    expect(bufToB64url(bytes)).not.toMatch(/[+/=]/);
  });

  it('reports unsupported when PublicKeyCredential is absent (happy-dom)', () => {
    expect(isWebAuthnSupported()).toBe(false);
  });

  it('wraps and unwraps the DEK with the same PRF secret', async () => {
    const prf = randomPrf();
    const wrapped = await wrapDeviceDEK(prf, DEK_HEX);
    expect(typeof wrapped.wrappedDEK).toBe('string');
    expect(typeof wrapped.iv).toBe('string');
    await expect(unwrapDeviceDEK(prf, wrapped)).resolves.toBe(DEK_HEX);
  });

  it('produces fresh IVs per wrap (non-deterministic ciphertext)', async () => {
    const prf = randomPrf();
    const a = await wrapDeviceDEK(prf, DEK_HEX);
    const b = await wrapDeviceDEK(prf, DEK_HEX);
    expect(a.wrappedDEK).not.toBe(b.wrappedDEK);
  });

  it('rejects unwrap with a different PRF secret', async () => {
    const wrapped = await wrapDeviceDEK(randomPrf(), DEK_HEX);
    await expect(unwrapDeviceDEK(randomPrf(), wrapped)).rejects.toThrow(/unwrap/i);
  });

  it('rejects short PRF output at wrap time', async () => {
    await expect(wrapDeviceDEK(new Uint8Array(8), DEK_HEX)).rejects.toThrow(/too short/i);
  });

  it('rejects corrupted envelopes', async () => {
    const prf = randomPrf();
    const wrapped = await wrapDeviceDEK(prf, DEK_HEX);
    await expect(
      unwrapDeviceDEK(prf, { ...wrapped, wrappedDEK: wrapped.wrappedDEK.slice(0, -2) + 'AA' })
    ).rejects.toThrow(/unwrap/i);
  });
});
