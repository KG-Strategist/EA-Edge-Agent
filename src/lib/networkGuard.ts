import { db } from './db';

/**
 * Network Guard: SSRF Prevention & URL Validation
 *
 * Validates endpoint URLs to prevent Server-Side Request Forgery (SSRF) attacks.
 * Blocks access to:
 * - Localhost (127.0.0.1, ::1)
 * - Private IP ranges (10.x, 172.16-31.x, 192.168.x)
 * - Metadata endpoints (169.254.169.254, etc.)
 * - Non-HTTP schemes (file://, gopher://, etc.)
 */

/**
 * Validates an endpoint URL for security before making HTTP requests.
 * Throws descriptive errors if URL targets internal/private resources.
 *
 * @param url - The URL to validate
 * @throws {Error} If URL is invalid or targets protected resources
 * @returns true if URL is valid and safe
 */
export async function validateEndpointUrl(url: string): Promise<boolean> {
  if (!url || !url.trim()) {
    throw new Error('Endpoint URL cannot be empty');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (e) {
    throw new Error(`Invalid URL format: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 1. Allow only HTTP/HTTPS schemes
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Only http/https schemes allowed. Got: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // BYOE Hybrid Bypass Check
  let isHybridNetworkEnabled = false;
  try {
    const networkSettings = await db.app_settings.where('key').equals('enableNetworkIntegrations').first();
    isHybridNetworkEnabled = networkSettings?.value === true;
  } catch {
    // DB unavailable (test environment) — default to disabled
    isHybridNetworkEnabled = false;
  }

  // DNS Rebinding: Block known rebinding domains and wildcard patterns
  const rebindingPatterns = [
    /localtest\.me$/i,
    /sslip\.io$/i,
    /nip\.io$/i,
    /burpcollaborator\.net$/i,
    /requestbin\.(net|com)$/i,
    /dnsrebind\.com$/i,
    /rbndr\.us$/i,
  ];
  for (const pattern of rebindingPatterns) {
    if (pattern.test(hostname)) {
      throw new Error(`DNS rebinding domain blocked: ${hostname}`);
    }
  }

  // 2. Block explicit localhost addresses
  const localhostAddresses = ['localhost', '127.0.0.1', '::1', '0.0.0.0', '::'];
  if (localhostAddresses.includes(hostname)) {
    if (!isHybridNetworkEnabled) {
      throw new Error(`Internal network access denied: localhost (${hostname}) is not allowed without Network Consent.`);
    }
    // Allow if Hybrid is enabled (user assumes risk for local dev/corporate setup)
  }

  // 3. Block AWS/GCP/Azure metadata endpoints (Always block, even in Hybrid)
  const metadataEndpoints = [
    '169.254.169.254',  // AWS EC2 metadata
    '169.254.170.2',    // GCP metadata
    '168.63.129.16',    // Azure metadata
  ];
  if (metadataEndpoints.includes(hostname)) {
    throw new Error(`Metadata endpoint access denied (${hostname})`);
  }

  // 4. Block private IPv4 ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = hostname.match(ipv4Regex);
  if (ipv4Match && !isHybridNetworkEnabled) {
    const [, octet1Str, octet2Str] = ipv4Match;
    const octet1 = parseInt(octet1Str, 10);
    const octet2 = parseInt(octet2Str, 10);

    // Check for 10.0.0.0/8
    if (octet1 === 10) {
      throw new Error(`Private IP range (10.x.x.x) access denied (${hostname})`);
    }

    // Check for 172.16.0.0/12
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) {
      throw new Error(`Private IP range (172.16-31.x.x) access denied (${hostname})`);
    }

    // Check for 192.168.0.0/16
    if (octet1 === 192 && octet2 === 168) {
      throw new Error(`Private IP range (192.168.x.x) access denied (${hostname})`);
    }

    // Check for 127.x.x.x loopback range
    if (octet1 === 127) {
      throw new Error(`Loopback range (127.x.x.x) access denied (${hostname})`);
    }
  }

  // 4b. Block private IPv6 ranges: fc00::/7 (ULA), fe80::/10 (link-local), IPv4-mapped private
  if (!isHybridNetworkEnabled && isPrivateIPv6(hostname)) {
    throw new Error(`Private IPv6 range access denied (${hostname})`);
  }

  // 5. In production, enforce HTTPS for external endpoints
  // Relaxed for Hybrid local IPs where HTTPS might not be feasible without self-signed certs
  if (import.meta.env.PROD && parsed.protocol !== 'https:' && !isHybridNetworkEnabled) {
    throw new Error('Only HTTPS allowed in production. Insecure HTTP is not permitted.');
  }

  return true;
}

export async function checkNetworkConsent(): Promise<boolean> {
  const setting = await db.app_settings.where('key').equals('enableNetworkIntegrations').first();
  return setting?.value === true;
}

/**
 * Checks if an IPv6 address falls within private/reserved ranges.
 * Covers: fc00::/7 (ULA), fe80::/10 (link-local), ::1 (loopback),
 * and IPv4-mapped private ranges (::ffff:10.x.x.x, etc.)
 */
function isPrivateIPv6(hostname: string): boolean {
  // Normalize: remove brackets if present, lowercase
  const addr = hostname.replace(/^\[|\]$/g, '').toLowerCase();

  // Loopback
  if (addr === '::1' || addr === '0:0:0:0:0:0:0:1') return true;

  // IPv4-mapped IPv6: ::ffff:x.x.x.x — check if embedded IPv4 is private
  const ipv4Mapped = addr.match(/^::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Mapped) {
    const [, o1, o2] = ipv4Mapped;
    const octet1 = parseInt(o1, 10);
    const octet2 = parseInt(o2, 10);
    if (octet1 === 10) return true;
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return true;
    if (octet1 === 192 && octet2 === 168) return true;
    if (octet1 === 127) return true;
  }

  // fc00::/7 (Unique Local Addresses): fc00:: to fdff:ffff:...
  // First two bits of first hextet must be 11 (0xfc = 11111100)
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true;

  // fe80::/10 (Link-Local Unicast): fe80:: to febf:ffff:...
  // First 10 bits: 1111111010 (0xfe8 = 111111101000)
  if (addr.startsWith('fe8') || addr.startsWith('fe9') || addr.startsWith('fea') || addr.startsWith('feb')) return true;

  // ff00::/8 (Multicast) — also block as it's not a routable unicast address
  if (addr.startsWith('ff')) return true;

  return false;
}
