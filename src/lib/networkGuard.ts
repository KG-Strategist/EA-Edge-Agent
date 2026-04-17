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
export function validateEndpointUrl(url: string): boolean {
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

  // 2. Block explicit localhost addresses
  const localhostAddresses = ['localhost', '127.0.0.1', '::1', '0.0.0.0', '::'];
  if (localhostAddresses.includes(hostname)) {
    throw new Error(`Internal network access denied: localhost (${hostname}) is not allowed`);
  }

  // 3. Block AWS/GCP/Azure metadata endpoints
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
  if (ipv4Match) {
    const [, octet1Str, octet2Str, octet3Str] = ipv4Match;
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

  // 5. In production, enforce HTTPS for external endpoints
  if (import.meta.env.PROD && parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS allowed in production. Insecure HTTP is not permitted.');
  }

  return true;
}
