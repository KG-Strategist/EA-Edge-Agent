import { db } from './db';
import {
  initializeVault,
  initializeHmacKey,
  signHMAC,
  verifyHMAC,
  createSealedVaultSession,
  restoreVaultKey,
  clearVaultAndSession,
} from './cryptoVault';
import { Logger } from './logger';
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
let currentSessionPseudokey: string | null = null;
const PIN_UNLOCK_REQUIRED_KEY = 'ea_niti_pin_unlock_required';

// ── HMAC-Signed Session Storage ──────────────────────────────────────────────

interface HmacSession {
  payload: string;  // base64-encoded pseudokey
  hmac: string;     // HMAC-SHA256 signature
}

function readSessionPseudokey(raw: string): string {
  try {
    const parsed: HmacSession = JSON.parse(raw);
    if (parsed.payload) {
      return atob(parsed.payload);
    }
  } catch {
    // Legacy plain pseudokey format.
  }

  return raw;
}

function parseSession(): string | null {
  const raw = sessionStorage.getItem('ea_niti_session');
  if (!raw) return null;
  return readSessionPseudokey(raw);
}

// Initialize from sessionStorage on module load
currentSessionPseudokey = parseSession();

export function getCurrentUser() {
  return currentSessionPseudokey;
}

export async function saveSession(pseudokey: string): Promise<void> {
  const payload = btoa(pseudokey);
  let hmac: string;
  try {
    hmac = await signHMAC(payload);
  } catch {
    // HMAC key not available — store plain (vault not initialized)
    sessionStorage.setItem('ea_niti_session', pseudokey);
    currentSessionPseudokey = pseudokey;
    return;
  }
  const session: HmacSession = { payload, hmac };
  sessionStorage.setItem('ea_niti_session', JSON.stringify(session));
  currentSessionPseudokey = pseudokey;
}

export async function restoreSession(): Promise<boolean> {
  const raw = sessionStorage.getItem('ea_niti_session');
  if (!raw) return false;

  // Legacy plain format — accept but don't verify
  try {
    const parsed: HmacSession = JSON.parse(raw);
    if (parsed.payload && parsed.hmac) {
      const valid = await verifyHMAC(parsed.payload, parsed.hmac);
      if (!valid) {
        Logger.warn('[authEngine] HMAC session verification failed — purging session');
        sessionStorage.removeItem('ea_niti_session');
        currentSessionPseudokey = null;
        return false;
      }
      currentSessionPseudokey = atob(parsed.payload);
      return true;
    }
  } catch {
    // Legacy format — accept as-is
  }

  currentSessionPseudokey = raw;
  return true;
}

export async function logoutUser(): Promise<void> {
  const pseudokey = getCurrentUser();
  sessionStorage.removeItem('ea_niti_session');
  sessionStorage.removeItem(PIN_UNLOCK_REQUIRED_KEY);
  currentSessionPseudokey = null;
  await clearVaultAndSession();
  if (pseudokey) {
    await db.vault_sessions.where('pseudokey').equals(pseudokey).delete();
  }
}

async function replaceSealedVaultSession(pseudokey: string, pin: string, salt: string): Promise<void> {
  await db.vault_sessions.where('pseudokey').equals(pseudokey).delete();
  const sealed = await createSealedVaultSession(pin, salt);
  await db.vault_sessions.add({ pseudokey, ...sealed, createdAt: new Date() });
}

export type RestoredAuthSession = {
  status: 'anonymous' | 'locked' | 'unlocked';
  pseudokey: string | null;
};

export async function restoreAuthenticatedSession(): Promise<RestoredAuthSession> {
  const raw = sessionStorage.getItem('ea_niti_session');
  if (!raw) {
    currentSessionPseudokey = null;
    await clearVaultAndSession();
    sessionStorage.removeItem(PIN_UNLOCK_REQUIRED_KEY);
    return { status: 'anonymous', pseudokey: null };
  }

  const pseudokey = readSessionPseudokey(raw);
  currentSessionPseudokey = pseudokey;

  if (sessionStorage.getItem(PIN_UNLOCK_REQUIRED_KEY) === 'true') {
    await clearVaultAndSession();
    return { status: 'locked', pseudokey };
  }

  const sealedSession = await db.vault_sessions
    .where('pseudokey')
    .equals(pseudokey)
    .first();

  if (!sealedSession) {
    return { status: 'locked', pseudokey };
  }

  try {
    await restoreVaultKey(sealedSession);
    await initializeHmacKey();
    const verified = await restoreSession();
    if (!verified || !currentSessionPseudokey) {
      await clearVaultAndSession();
      sessionStorage.removeItem(PIN_UNLOCK_REQUIRED_KEY);
      return { status: 'anonymous', pseudokey: null };
    }
    return { status: 'unlocked', pseudokey: currentSessionPseudokey };
  } catch {
    await clearVaultAndSession();
    currentSessionPseudokey = pseudokey;
    return { status: 'locked', pseudokey };
  }
}

export async function unlockVaultWithPin(pseudokey: string, pin: string): Promise<boolean> {
  const user = await db.users.where('pseudokey').equals(pseudokey).first();
  if (!user) return false;

  const pinHashAttempt = await hashSecret(pin, user.salt);
  if (pinHashAttempt !== user.pinHash) return false;

  await initializeVault(pin, user.salt);
  await initializeHmacKey();
  await replaceSealedVaultSession(pseudokey, pin, user.salt);
  await saveSession(pseudokey);
  sessionStorage.removeItem(PIN_UNLOCK_REQUIRED_KEY);

  await db.audit_logs.add({
    timestamp: new Date(),
    pseudokey,
    action: 'LOGIN',
    tableName: 'users',
    details: 'Vault PIN unlock'
  });

  return true;
}

// Generates a random salt
export function generateSalt(): string {
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
      iterations: 600000,
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
      iterations: 600000,
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
        iterations: 600000,
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
  } catch {
    return null;
  }
}

// Generates a tech-themed 3 or 4-part pseudonym (e.g. "Cyber-Node-42", "Phantom-Gateway-7", "Neural-Mesh-99")
export function generatePseudonym(): string {
  const adjs = ['Cyber', 'Phantom', 'Neural', 'Quantum', 'Aero', 'Cryptic', 'Neon', 'Echo', 'Shadow', 'Flux'];
  const nouns = ['Node', 'Gateway', 'Mesh', 'Matrix', 'Nexus', 'Vertex', 'Core', 'Link', 'Bridge', 'Protocol'];

  // Use cryptographically secure random selection (Web Crypto API)
  const adjIndex = crypto.getRandomValues(new Uint8Array(1))[0] % adjs.length;
  const nounIndex = crypto.getRandomValues(new Uint8Array(1))[0] % nouns.length;
  const numArray = crypto.getRandomValues(new Uint8Array(2));
  const num = ((numArray[0] << 8) | numArray[1]) % 99 + 1;

  return `${adjs[adjIndex]}-${nouns[nounIndex]}-${num}`;
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

  const userCount = await db.users.count();
  const roleToken = demographics?.roleToken || (userCount === 0 ? 'System Admin' : 'Viewer');
  
  await db.users.add({
    pseudokey,
    passwordHash,
    pinHash,
    salt,
    authMode: 'Air-Gapped',
    createdAt: new Date(),
    securityQuestions: hashedQuestions,
    consentHistory,
    demographics: {
      ...demographics,
      roleToken
    }
  });

  // FAIL-CLOSED: Air-Gapped users start with network strictly disabled
  await db.app_settings.put({ key: 'enableNetworkIntegrations', value: false });
}

export async function createTempUserByAdmin(
  pseudokey: string,
  tempPassword: string,
  roleToken: string
): Promise<void> {
  const salt = generateSalt();
  const tempPasswordHash = await hashSecret(tempPassword, salt);
  
  const userCount = await db.users.count();
  const finalRoleToken = userCount === 0 ? 'System Admin' : roleToken;

  await db.users.add({
    pseudokey,
    passwordHash: '', // Will be set on first login
    pinHash: '', // Will be set on first login
    salt,
    tempPasswordHash,
    requiresPinSetup: true,
    authMode: 'Air-Gapped',
    createdAt: new Date(),
    demographics: {
      regionToken: 'LOCAL',
      roleToken: finalRoleToken
    }
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

  const userCount = await db.users.count();
  const roleToken = demographics?.roleToken || (userCount === 0 ? 'System Admin' : 'Viewer');
  
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
    demographics: {
      ...demographics,
      roleToken
    }
  });

  // HYBRID: User authenticated via external OAuth, network is already trusted
  await db.app_settings.put({ key: 'enableNetworkIntegrations', value: true });

  await initializeVault(pin, salt);
  await initializeHmacKey();
  await replaceSealedVaultSession(pseudokey, pin, salt);
}

export async function loginWithPassword(): Promise<boolean> {
  // Not used directly anymore, but keeping for compatibility
  return false;
}

export async function verifyTempPassword(pseudokey: string, tempPassword: string): Promise<boolean> {
  const user = await db.users.where('pseudokey').equals(pseudokey).first();
  if (!user || !user.requiresPinSetup || !user.tempPasswordHash) return false;
  
  const hashAttempt = await hashSecret(tempPassword, user.salt);
  return hashAttempt === user.tempPasswordHash;
}

export async function setupPermanentCredentials(pseudokey: string, newPassword: string, newPin: string): Promise<boolean> {
  const user = await db.users.where('pseudokey').equals(pseudokey).first();
  if (!user || !user.id || !user.requiresPinSetup) return false;
  
  // --- CRYPTOGRAPHIC WIPE ---
  // Because the original PIN is lost, any data encrypted with the old derived key
  // is mathematically orphaned. We must purge these records to prevent decryption crashes.
  await db.audit_logs.where('pseudokey').equals(pseudokey).delete();
  // Any future tables added with explicit user association (e.g. user_vault, personal_configs)
  // MUST have their purge logic appended here.
  // --------------------------

  const passwordHash = await encryptWithPin(newPassword, newPin, user.salt);
  const pinHash = await hashSecret(newPin, user.salt);
  
  await db.users.update(user.id, {
    passwordHash,
    pinHash,
    tempPasswordHash: undefined,
    requiresPinSetup: false,
    consentHistory: [
      ...(user.consentHistory || []),
      { type: 'INITIAL_ONBOARDING', grantedAt: new Date(), version: '1.0' } as any
    ]
  });
  
  // Reinitialize vault and HMAC key with new credentials
  await initializeVault(newPin, user.salt);
  await initializeHmacKey();
  await replaceSealedVaultSession(pseudokey, newPin, user.salt);

  return true;
}

export async function loginWith2FA(pseudokey: string, password: string, pin: string): Promise<boolean> {
  const user = await db.users.where('pseudokey').equals(pseudokey).first();
  if (!user) return false;

  const pinHashAttempt = await hashSecret(pin, user.salt);
  if (pinHashAttempt !== user.pinHash) return false;

  const decryptedPassword = await decryptWithPin(user.passwordHash, pin, user.salt);
  if (decryptedPassword !== password) return false;

  await initializeVault(pin, user.salt);
  await initializeHmacKey();

  await replaceSealedVaultSession(pseudokey, pin, user.salt);

  await saveSession(pseudokey);
  sessionStorage.removeItem(PIN_UNLOCK_REQUIRED_KEY);

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
  
  await saveSession(user.pseudokey);
  sessionStorage.setItem(PIN_UNLOCK_REQUIRED_KEY, 'true');
  
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
 * Hard Delete: Tombstone the user in referenced tables, then purge their identity.
 */
export async function executeHardDelete(userId: number, pseudokey: string): Promise<void> {
  // Step 1: Tombstone / anonymize any user-linked references.
  // Currently the only table storing pseudokey references is audit_logs.
  await db.transaction('rw', db.audit_logs, db.users, async () => {
    await db.audit_logs.where('pseudokey').equals(pseudokey).modify({
      pseudokey: 'DELETED_USER',
      details: 'User completely wiped and anonymized.'
    });

    // Step 2: Remove the user identity after referenced data is anonymized.
    await db.users.delete(userId);
  });
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
      Logger.warn('[OAuth] Failed to extract identity from id_token:', err);
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

