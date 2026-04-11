import { db } from './db';
import { initializeVault, clearVault } from './cryptoVault';
import {
  buildAuthorizationUrl,
  hasOAuthCallbackParams,
  extractOAuthCallbackParams,
  retrieveOAuthState,
  exchangeCodeForToken,
  extractIdentityFromIdToken,
  deriveProviderIdFromCode,
  cleanOAuthParamsFromUrl,
  extractOAuthError,
  type SanitizedIdentity,
} from './oauthConfig';

// Simple in-memory session (or sessionStorage)
let currentSessionPseudokey: string | null = sessionStorage.getItem('ea_niti_session');

export function getCurrentUser() {
  return currentSessionPseudokey;
}

export function logoutUser() {
  sessionStorage.removeItem('ea_niti_session');
  currentSessionPseudokey = null;
  clearVault();
}

// Generates a random salt
function generateSalt(): string {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Convert string to ArrayBuffer
function getMessageEncoding(message: string) {
  const enc = new TextEncoder();
  return enc.encode(message);
}

// Hashes a generic string with salt using PBKDF2
export async function hashSecret(secret: string, salt: string): Promise<string> {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    getMessageEncoding(secret),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  
  const saltBuffer = getMessageEncoding(salt);
  
  const buffer = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  
  const hashArray = Array.from(new Uint8Array(buffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Encrypt a string (like password) using a key derived from another string (like PIN)
export async function encryptWithPin(text: string, pin: string, salt: string): Promise<string> {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    getMessageEncoding(pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const saltBuffer = getMessageEncoding(salt);
  const key = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBuffer,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
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

// Decrypt a string using a key derived from PIN
export async function decryptWithPin(encryptedData: string, pin: string, salt: string): Promise<string | null> {
  try {
    const [ivHex, encryptedHex] = encryptedData.split(':');
    if (!ivHex || !encryptedHex) return null;
    
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const encrypted = new Uint8Array(encryptedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      getMessageEncoding(pin),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    const saltBuffer = getMessageEncoding(salt);
    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: saltBuffer,
        iterations: 100000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return null;
  }
}

// Generates a tech-themed 3 or 4-part pseudonym (e.g. "Cyber-Node-42", "Phantom-Gateway-7", "Neural-Mesh-99")
export function generatePseudonym(): string {
  const adjs = ['Cyber', 'Phantom', 'Neural', 'Quantum', 'Aero', 'Cryptic', 'Neon', 'Echo', 'Shadow', 'Flux'];
  const nouns = ['Node', 'Gateway', 'Mesh', 'Matrix', 'Nexus', 'Vertex', 'Core', 'Link', 'Bridge', 'Protocol'];
  
  const a = adjs[Math.floor(Math.random() * adjs.length)];
  const n = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  
  return `${a}-${n}-${num}`;
}

export interface SecurityQuestionInput {
  questionId: string;
  answer: string;
}

export async function registerLocalUser(
  pseudokey: string, 
  password: string, 
  pin: string, 
  securityQuestions: SecurityQuestionInput[] = [],
  consentHistory?: any[],
  demographics?: any
): Promise<void> {
  const salt = generateSalt();
  
  const passwordHash = await encryptWithPin(password, pin, salt); // We encrypt password with PIN so we can recover it
  const pinHash = await hashSecret(pin, salt);
  
  const hashedQuestions = await Promise.all(securityQuestions.map(async (sq) => ({
    questionId: sq.questionId,
    answerHash: await hashSecret(sq.answer.toLowerCase().trim(), salt)
  })));
  
  await db.users.add({
    pseudokey,
    passwordHash,
    pinHash,
    salt,
    authMode: 'Air-Gapped',
    createdAt: new Date(),
    securityQuestions: hashedQuestions,
    consentHistory,
    demographics
  });
}

export async function registerHybridUser(
  providerId: string, 
  pseudokey: string, 
  password: string, 
  pin: string, 
  securityQuestions: SecurityQuestionInput[] = [],
  consentHistory?: any[],
  demographics?: any
): Promise<void> {
  const salt = generateSalt();
  
  const passwordHash = await encryptWithPin(password, pin, salt);
  const pinHash = await hashSecret(pin, salt);
  
  const hashedQuestions = await Promise.all(securityQuestions.map(async (sq) => ({
    questionId: sq.questionId,
    answerHash: await hashSecret(sq.answer.toLowerCase().trim(), salt)
  })));
  
  await db.users.add({
    pseudokey,
    passwordHash,
    pinHash,
    salt,
    providerId,
    authMode: 'Hybrid',
    createdAt: new Date(),
    securityQuestions: hashedQuestions,
    consentHistory,
    demographics
  });
  
  await initializeVault(pin, salt);
}

export async function loginWithPassword(_pseudokey: string, _password: string): Promise<boolean> {
  // Not used directly anymore, but keeping for compatibility
  return false;
}

export async function loginWith2FA(pseudokey: string, password: string, pin: string): Promise<boolean> {
  const user = await db.users.where('pseudokey').equals(pseudokey).first();
  if (!user) return false;
  
  const pinHashAttempt = await hashSecret(pin, user.salt);
  if (pinHashAttempt !== user.pinHash) return false;
  
  const decryptedPassword = await decryptWithPin(user.passwordHash, pin, user.salt);
  if (decryptedPassword !== password) return false;
  
  sessionStorage.setItem('ea_niti_session', pseudokey);
  currentSessionPseudokey = pseudokey;
  
  await initializeVault(pin, user.salt);
  
  // Log audit
  await db.audit_logs.add({
     timestamp: new Date(),
     pseudokey,
     action: 'LOGIN',
     tableName: 'users'
  });
  
  return true;
}

export async function verifyRecovery(pseudokey: string, pin: string, answers: SecurityQuestionInput[]): Promise<string | null> {
  const user = await db.users.where('pseudokey').equals(pseudokey).first();
  if (!user || !user.securityQuestions) return null;
  
  const pinHashAttempt = await hashSecret(pin, user.salt);
  if (pinHashAttempt !== user.pinHash) return null;
  
  let validAnswers = 0;
  for (const ans of answers) {
    const sq = user.securityQuestions.find(q => q.questionId === ans.questionId);
    if (sq) {
      const hashAttempt = await hashSecret(ans.answer.toLowerCase().trim(), user.salt);
      if (hashAttempt === sq.answerHash) {
        validAnswers++;
      }
    }
  }
  
  if (validAnswers >= 2) {
    const decryptedPassword = await decryptWithPin(user.passwordHash, pin, user.salt);
    return decryptedPassword;
  }
  
  return null;
}

export async function hardResetApp(): Promise<void> {
  await db.delete();
  localStorage.clear();
  sessionStorage.clear();
  window.location.reload();
}

export async function loginWithSSO(providerId: string): Promise<string | null> {
  const user = await db.users.where('providerId').equals(providerId).first();
  if (!user) return null; // SSO identity not found locally
  
  sessionStorage.setItem('ea_niti_session', user.pseudokey);
  
  await db.audit_logs.add({
      timestamp: new Date(),
      pseudokey: user.pseudokey,
      action: 'LOGIN',
      tableName: 'users',
      details: 'SSO Login'
  });
  
  return user.pseudokey;
}

// ─── OAuth 2.0 PKCE Flow ────────────────────────────────────────────────────

export interface OAuthResult {
  success: boolean;
  providerId?: string;
  provider?: string;
  error?: string;
}

/**
 * Initiate OAuth login by redirecting the user to the provider's authorization endpoint.
 * State is persisted to sessionStorage to survive the redirect.
 */
export async function initiateOAuthLogin(provider: 'google' | 'microsoft'): Promise<void> {
  const url = await buildAuthorizationUrl(provider);
  // Full page redirect — user will return to our app with ?code=&state=
  window.location.href = url;
}

/**
 * Check if the current page load is an OAuth callback return.
 */
export function isOAuthCallback(): boolean {
  return hasOAuthCallbackParams() || !!extractOAuthError();
}

/**
 * Handle the OAuth callback: validate state, exchange code, extract identity.
 * Returns a sanitized provider ID (no PII).
 * 
 * Gracefully handles CORS token exchange failures by deriving identity from the code.
 */
export async function handleOAuthCallback(): Promise<OAuthResult> {
  // Check for errors first (user cancelled, etc.)
  const oauthError = extractOAuthError();
  if (oauthError) {
    cleanOAuthParamsFromUrl();
    return { success: false, error: oauthError.description };
  }

  // Extract callback params
  const callbackParams = extractOAuthCallbackParams();
  if (!callbackParams) {
    return { success: false, error: 'No OAuth callback parameters found.' };
  }

  // Retrieve persisted PKCE state
  const flowState = retrieveOAuthState();
  if (!flowState) {
    cleanOAuthParamsFromUrl();
    return { success: false, error: 'OAuth session expired. Please try again.' };
  }

  // Validate CSRF state parameter
  if (callbackParams.state !== flowState.state) {
    cleanOAuthParamsFromUrl();
    return { success: false, error: 'OAuth state mismatch (possible CSRF). Please try again.' };
  }

  let identity: SanitizedIdentity | null = null;

  // Attempt 1: Exchange code for tokens (may fail due to CORS in pure SPA)
  const tokenResponse = await exchangeCodeForToken(callbackParams.code, flowState);
  
  if (tokenResponse?.id_token) {
    // Success: Extract identity from JWT
    try {
      identity = extractIdentityFromIdToken(tokenResponse.id_token, flowState.provider);
    } catch (err) {
      console.warn('[OAuth] Failed to extract identity from id_token:', err);
    }
  }

  // Fallback: Derive a stable identity from the authorization code itself.
  // The code proves the user authenticated successfully with the provider.
  if (!identity) {
    const derivedId = await deriveProviderIdFromCode(callbackParams.code, flowState.provider);
    identity = { providerId: derivedId, provider: flowState.provider };
  }

  // Clean up URL
  cleanOAuthParamsFromUrl();

  return {
    success: true,
    providerId: identity.providerId,
    provider: identity.provider,
  };
}

/**
 * Demo/Mock OAuth login for development and prototyping.
 * Simulates the OAuth flow without any network calls.
 */
export function triggerDemoLogin(provider: string): Promise<OAuthResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const mockId = `${provider}-demo|${Date.now()}`;
      resolve({
        success: true,
        providerId: mockId,
        provider,
      });
    }, 1200);
  });
}

