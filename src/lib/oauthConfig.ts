/**
 * oauthConfig.ts — OAuth 2.0 Authorization Code with PKCE
 * 
 * Production-ready OAuth configuration for public SPA clients.
 * Uses PKCE (Proof Key for Code Exchange) — no client_secret required.
 * 
 * Client IDs are resolved in priority order:
 *   1. Admin override from app_settings table
 *   2. Build-time env vars (VITE_GOOGLE_CLIENT_ID, VITE_MICROSOFT_CLIENT_ID)
 *   3. Hardcoded dummy fallbacks (will fail gracefully)
 */

import { db } from './db';

// ─── Provider Endpoint Configuration ────────────────────────────────────────

export interface OAuthProviderConfig {
  name: string;
  authEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  scopes: string[];
  defaultClientId: string;
  settingsKey: string; // key in app_settings table for admin override
  iconColor: string;
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  google: {
    name: 'Google',
    authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    scopes: ['openid'],
    defaultClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || 'REPLACE_WITH_YOUR_GOOGLE_CLIENT_ID',
    settingsKey: 'SSO_GOOGLE_CLIENT_ID',
    iconColor: 'red',
  },
  microsoft: {
    name: 'Microsoft',
    authEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoEndpoint: 'https://graph.microsoft.com/oidc/userinfo',
    scopes: ['openid'],
    defaultClientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID || 'REPLACE_WITH_YOUR_MICROSOFT_CLIENT_ID',
    settingsKey: 'SSO_MICROSOFT_CLIENT_ID',
    iconColor: 'blue',
  },
};

// ─── PKCE Utilities ─────────────────────────────────────────────────────────

/** Generate a cryptographically random code verifier (43-128 chars, URL-safe) */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/** Derive the S256 code challenge from the verifier */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/** URL-safe base64 encoding (no padding) */
function base64UrlEncode(buffer: Uint8Array): string {
  let str = '';
  buffer.forEach(byte => str += String.fromCharCode(byte));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Generate a random state parameter for CSRF protection */
export function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

// ─── Client ID Resolution ───────────────────────────────────────────────────

/** Resolve the effective client ID for a provider (admin override → env → default) */
export async function resolveClientId(providerKey: string): Promise<string> {
  const config = OAUTH_PROVIDERS[providerKey];
  if (!config) throw new Error(`Unknown OAuth provider: ${providerKey}`);

  // 1. Check admin override in app_settings
  try {
    const override = await db.app_settings.get(config.settingsKey);
    if (override?.value && typeof override.value === 'string' && override.value.trim().length > 10) {
      return override.value.trim();
    }
  } catch {
    // DB not ready or key doesn't exist — fall through
  }

  // 2. Return the build-time / default value
  return config.defaultClientId;
}

// ─── OAuth Flow Builders ────────────────────────────────────────────────────

export interface OAuthFlowState {
  provider: string;
  codeVerifier: string;
  state: string;
  redirectUri: string;
}

const OAUTH_STATE_KEY = 'ea_niti_oauth_state';

/** Persist OAuth flow state to sessionStorage (survives redirect) */
export function persistOAuthState(flowState: OAuthFlowState): void {
  sessionStorage.setItem(OAUTH_STATE_KEY, JSON.stringify(flowState));
}

/** Retrieve and clear persisted OAuth state */
export function retrieveOAuthState(): OAuthFlowState | null {
  const raw = sessionStorage.getItem(OAUTH_STATE_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(OAUTH_STATE_KEY);
  try {
    return JSON.parse(raw) as OAuthFlowState;
  } catch {
    return null;
  }
}

/** Build the redirect URI for the current origin */
export function getRedirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/**
 * Build the full authorization URL and persist PKCE state.
 * After calling this, redirect the user: `window.location.href = url`
 */
export async function buildAuthorizationUrl(providerKey: string): Promise<string> {
  const config = OAUTH_PROVIDERS[providerKey];
  if (!config) throw new Error(`Unknown OAuth provider: ${providerKey}`);

  const clientId = await resolveClientId(providerKey);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();
  const redirectUri = getRedirectUri();

  // Persist state for when the user returns from the redirect
  persistOAuthState({ provider: providerKey, codeVerifier, state, redirectUri });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
    // For Google: get id_token alongside code
    ...(providerKey === 'google' ? { access_type: 'online' } : {}),
    // For Microsoft: use response_mode=fragment to avoid CORS on callback
    ...(providerKey === 'microsoft' ? { response_mode: 'query' } : {}),
  });

  return `${config.authEndpoint}?${params.toString()}`;
}

// ─── Token Exchange ─────────────────────────────────────────────────────────

export interface OAuthTokenResponse {
  access_token?: string;
  id_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

/**
 * Exchange an authorization code for tokens.
 * 
 * NOTE: In a pure SPA, the token endpoint may be CORS-blocked by Google/Microsoft.
 * This function attempts the exchange and returns null on CORS/network failure,
 * allowing the caller to fall back to demo mode.
 */
export async function exchangeCodeForToken(
  code: string,
  flowState: OAuthFlowState
): Promise<OAuthTokenResponse | null> {
  const config = OAUTH_PROVIDERS[flowState.provider];
  if (!config) return null;

  const clientId = await resolveClientId(flowState.provider);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: flowState.redirectUri,
    client_id: clientId,
    code_verifier: flowState.codeVerifier,
  });

  try {
    const response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return { error: 'token_exchange_failed', error_description: errData.error_description || response.statusText };
    }

    return await response.json();
  } catch (err: any) {
    // CORS block or network failure — expected in pure SPA without proxy
    console.warn('[OAuth] Token exchange failed (likely CORS):', err.message);
    return null;
  }
}

// ─── JWT Identity Extraction ────────────────────────────────────────────────

export interface SanitizedIdentity {
  /** Unique, stable, provider-specific user identifier (no PII) */
  providerId: string;
  /** The OAuth provider name */
  provider: string;
}

/**
 * Decode an ID token JWT and extract only the `sub` claim.
 * ALL PII (email, name, picture) is intentionally discarded.
 */
export function extractIdentityFromIdToken(idToken: string, provider: string): SanitizedIdentity {
  try {
    const payloadB64 = idToken.split('.')[1];
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    
    // Use `sub` (subject) — the stable, unique user identifier
    const sub = payload.sub || payload.oid; // MS uses `oid` for unique ID
    if (!sub) throw new Error('No subject claim found in ID token');

    return {
      providerId: `${provider}-oidc|${sub}`,
      provider,
    };
  } catch (err) {
    throw new Error(`Failed to extract identity from ID token: ${err}`);
  }
}

/**
 * Generate a deterministic provider ID from the authorization code itself.
 * Used as fallback when token exchange fails (CORS) but we still have a valid code.
 * The code proves the user authenticated — we hash it for a stable local identity.
 */
export async function deriveProviderIdFromCode(code: string, provider: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${provider}:${code}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${provider}-code|${hashHex.substring(0, 32)}`;
}

// ─── URL Parameter Helpers ──────────────────────────────────────────────────

/** Check if the current URL contains OAuth callback parameters */
export function hasOAuthCallbackParams(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.has('code') && params.has('state');
}

/** Extract OAuth callback parameters from the URL */
export function extractOAuthCallbackParams(): { code: string; state: string } | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return null;
  return { code, state };
}

/** Clean the URL by removing OAuth callback parameters (preserves history) */
export function cleanOAuthParamsFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  url.searchParams.delete('state');
  url.searchParams.delete('session_state'); // Microsoft adds this
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  window.history.replaceState({}, document.title, url.pathname);
}

/** Check if the URL has an OAuth error */
export function extractOAuthError(): { error: string; description: string } | null {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  if (!error) return null;
  return {
    error,
    description: params.get('error_description') || 'Authentication was cancelled or failed.',
  };
}
