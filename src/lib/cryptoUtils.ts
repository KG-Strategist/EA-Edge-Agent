/**
 * Cryptographic utility functions for timing attack prevention and CSRF protection.
 * These functions implement constant-time operations to prevent side-channel attacks.
 */

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 * Compares two strings in fixed time regardless of where they differ.
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns Promise<boolean> - True if strings match, false otherwise
 */
export async function constantTimeCompare(a: string, b: string): Promise<boolean> {
  // If lengths don't match, still do the full comparison to avoid leaking length info
  if (a.length !== b.length) {
    // Do a dummy comparison to waste time consistent with matching operation
    let dummy = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      dummy |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    // Add timing variance to obscure the early mismatch
    const variance = Math.floor(Math.random() * 15); // 0-15ms random delay
    await new Promise(resolve => setTimeout(resolve, variance));
    return false;
  }

  // Fixed-time comparison: XOR all bytes regardless of early mismatch
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  // Add consistent random delay (5-15ms) to obscure timing of correct vs incorrect
  const delay = 5 + Math.floor(Math.random() * 10);
  await new Promise(resolve => setTimeout(resolve, delay));

  return mismatch === 0;
}

/**
 * Derive a key from a PIN for use in HMAC signing operations.
 * This ensures CSRF signatures are bound to the user's authentication state.
 *
 * @param pin - User's 4-6 digit PIN
 * @param salt - Optional salt for key derivation (defaults to a secure random if not provided)
 * @returns Promise<CryptoKey> - HMAC key suitable for signing
 */
export async function derivePinKey(pin: string, salt?: string): Promise<CryptoKey> {
  if (!salt) {
    // Generate a random 16-byte salt if not provided
    const saltArray = window.crypto.getRandomValues(new Uint8Array(16));
    salt = Array.from(saltArray, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  const encoder = new TextEncoder();
  const pinBuffer = encoder.encode(pin);
  const saltBuffer = encoder.encode(salt);

  // Import PIN as key material
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    pinBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive a key using PBKDF2
  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  return derivedKey;
}

/**
 * Sign a request state parameter with HMAC to prevent CSRF attacks.
 * The signature proves the state hasn't been tampered with during OAuth flow.
 *
 * @param statePayload - The OAuth state payload to sign (typically a JSON string)
 * @param pin - User's PIN (used to derive signing key)
 * @returns Promise<string> - Hex-encoded HMAC signature
 */
export async function signRequest(statePayload: string, pin: string): Promise<string> {
  try {
    // Derive signing key from PIN
    const key = await derivePinKey(pin);

    // Sign the state payload with HMAC-SHA256
    const encoder = new TextEncoder();
    const data = encoder.encode(statePayload);

    const signatureBuffer = await window.crypto.subtle.sign(
      'HMAC',
      key,
      data
    );

    // Convert signature to hex string
    const signatureArray = Array.from(new Uint8Array(signatureBuffer));
    const hexSignature = signatureArray
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return hexSignature;
  } catch (error) {
    throw new Error(`Failed to sign request: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Verify a request signature against a payload.
 * Used to validate OAuth state signatures on callback.
 *
 * @param statePayload - The original OAuth state payload
 * @param signature - The hex-encoded signature to verify
 * @param pin - User's PIN (used to derive verification key)
 * @returns Promise<boolean> - True if signature is valid, false otherwise
 */
export async function verifyRequestSignature(
  statePayload: string,
  signature: string,
  pin: string
): Promise<boolean> {
  try {
    // Recompute signature for comparison
    const recomputedSignature = await signRequest(statePayload, pin);

    // Compare signatures in constant time
    return await constantTimeCompare(recomputedSignature, signature);
  } catch (error) {
    console.error('[SECURITY] Signature verification failed:', error);
    return false;
  }
}
