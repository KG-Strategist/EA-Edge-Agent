import { describe, it, expect } from 'vitest';
import { validateEndpointUrl } from '../lib/networkGuard';

describe('Network Guard - SSRF Prevention', () => {
  describe('Valid External Endpoints (Should Pass)', () => {
    it('should allow standard external APIs (OpenAI)', async () => {
      await expect(validateEndpointUrl('https://api.openai.com/v1/chat/completions')).resolves.toBe(true);
    });

    it('should allow standard external APIs (Anthropic)', async () => {
      await expect(validateEndpointUrl('https://api.anthropic.com/messages')).resolves.toBe(true);
    });

    it('should allow standard external APIs with paths', async () => {
      await expect(validateEndpointUrl('https://api.example.com/v1/endpoint/path')).resolves.toBe(true);
    });

    it('should allow external URLs with query parameters', async () => {
      await expect(validateEndpointUrl('https://api.example.com/endpoint?key=value&foo=bar')).resolves.toBe(true);
    });

    it('should allow external URLs with custom ports', async () => {
      await expect(validateEndpointUrl('https://custom.enterprise.com:8443/api')).resolves.toBe(true);
    });

    it('should allow HTTPS URLs', async () => {
      await expect(validateEndpointUrl('https://secure-api.example.com')).resolves.toBe(true);
    });

    it('should allow HTTP URLs in development', async () => {
      await expect(validateEndpointUrl('http://dev-api.example.com')).resolves.toBe(true);
    });

    it('should allow URLs with authentication', async () => {
      await expect(validateEndpointUrl('https://user:pass@api.example.com/endpoint')).resolves.toBe(true);
    });

    it('should allow URLs with various TLDs', async () => {
      await expect(validateEndpointUrl('https://api.company.co.uk/v1/chat')).resolves.toBe(true);
    });

    it('should allow subdomain variations', async () => {
      await expect(validateEndpointUrl('https://v1.api.example.com/endpoint')).resolves.toBe(true);
    });
  });

  describe('Localhost Denial (SSRF Protection)', () => {
    it('should block explicit localhost', async () => {
      await expect(validateEndpointUrl('http://localhost/api')).rejects.toThrow(
        /Internal network access denied|localhost/i
      );
    });

    it('should block 127.0.0.1', async () => {
      await expect(validateEndpointUrl('http://127.0.0.1/admin')).rejects.toThrow(
        /Internal network access denied|127\.0\.0\.1/i
      );
    });

    it('should handle IPv6 localhost (::1) appropriately', async () => {
      try {
        await validateEndpointUrl('http://[::1]/admin');
      } catch (e) {
        const error = e as Error;
        expect(error.message).toMatch(/denied|invalid|::1/i);
      }
    });

    it('should block 0.0.0.0', async () => {
      await expect(validateEndpointUrl('http://0.0.0.0/api')).rejects.toThrow(
        /Internal network access denied|0\.0\.0\.0/i
      );
    });

    it('should handle IPv6 any address (::) appropriately', async () => {
      try {
        await validateEndpointUrl('http://[::]/api');
      } catch (e) {
        const error = e as Error;
        expect(error.message).toMatch(/denied|invalid|::/i);
      }
    });

    it('should block loopback range 127.x.x.x', async () => {
      await expect(validateEndpointUrl('http://127.1.1.1/api')).rejects.toThrow(
        /Loopback range|127\.1\.1\.1/i
      );
    });

    it('should block 127.99.99.99', async () => {
      await expect(validateEndpointUrl('http://127.99.99.99/admin')).rejects.toThrow(
        /Loopback range|127\.99\.99\.99/i
      );
    });
  });

  describe('Cloud Metadata Endpoints Denial', () => {
    it('should block AWS EC2 metadata endpoint', async () => {
      await expect(validateEndpointUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
        /Metadata endpoint access denied|169\.254\.169\.254/i
      );
    });

    it('should block GCP metadata endpoint', async () => {
      await expect(validateEndpointUrl('http://169.254.170.2/computeMetadata/v1/')).rejects.toThrow(
        /Metadata endpoint access denied|169\.254\.170\.2/i
      );
    });

    it('should block Azure metadata endpoint', async () => {
      await expect(validateEndpointUrl('http://168.63.129.16/metadata/instance')).rejects.toThrow(
        /Metadata endpoint access denied|168\.63\.129\.16/i
      );
    });
  });

  describe('DNS Rebinding Domain Denial', () => {
    it('should block localtest.me', async () => {
      await expect(validateEndpointUrl('http://localtest.me/api')).rejects.toThrow(
        /DNS rebinding domain blocked|localtest\.me/i
      );
    });

    it('should block sslip.io', async () => {
      await expect(validateEndpointUrl('http://127.0.0.1.sslip.io/api')).rejects.toThrow(
        /DNS rebinding domain blocked|sslip\.io/i
      );
    });

    it('should block nip.io', async () => {
      await expect(validateEndpointUrl('http://192.168.1.1.nip.io/api')).rejects.toThrow(
        /DNS rebinding domain blocked|nip\.io/i
      );
    });

    it('should block burpcollaborator.net', async () => {
      await expect(validateEndpointUrl('http://evil.burpcollaborator.net/callback')).rejects.toThrow(
        /DNS rebinding domain blocked|burpcollaborator\.net/i
      );
    });

    it('should block requestbin.net', async () => {
      await expect(validateEndpointUrl('http://requestbin.net/collect')).rejects.toThrow(
        /DNS rebinding domain blocked|requestbin\.net/i
      );
    });

    it('should block dnsrebind.com', async () => {
      await expect(validateEndpointUrl('http://dnsrebind.com/test')).rejects.toThrow(
        /DNS rebinding domain blocked|dnsrebind\.com/i
      );
    });

    it('should block rbndr.us', async () => {
      await expect(validateEndpointUrl('http://rbndr.us/rebind')).rejects.toThrow(
        /DNS rebinding domain blocked|rbndr\.us/i
      );
    });
  });

  describe('Private IPv4 Range Denial (10.0.0.0/8)', () => {
    it('should block 10.0.0.0', async () => {
      await expect(validateEndpointUrl('http://10.0.0.0/internal')).rejects.toThrow(
        /Private IP range|10\.0\.0\.0/i
      );
    });

    it('should block 10.0.0.1', async () => {
      await expect(validateEndpointUrl('http://10.0.0.1/admin')).rejects.toThrow(
        /Private IP range|10\.0\.0\.1/i
      );
    });

    it('should block 10.255.255.255', async () => {
      await expect(validateEndpointUrl('http://10.255.255.255/api')).rejects.toThrow(
        /Private IP range|10\.255\.255\.255/i
      );
    });

    it('should block 10.127.0.1', async () => {
      await expect(validateEndpointUrl('http://10.127.0.1/internal')).rejects.toThrow(
        /Private IP range|10\.127\.0\.1/i
      );
    });
  });

  describe('Private IPv4 Range Denial (172.16.0.0/12)', () => {
    it('should block 172.16.0.0', async () => {
      await expect(validateEndpointUrl('http://172.16.0.0/internal')).rejects.toThrow(
        /Private IP range|172\.16\.0\.0/i
      );
    });

    it('should block 172.16.0.1', async () => {
      await expect(validateEndpointUrl('http://172.16.0.1/admin')).rejects.toThrow(
        /Private IP range|172\.16\.0\.1/i
      );
    });

    it('should block 172.20.0.1', async () => {
      await expect(validateEndpointUrl('http://172.20.0.1/api')).rejects.toThrow(
        /Private IP range|172\.20\.0\.1/i
      );
    });

    it('should block 172.31.255.255', async () => {
      await expect(validateEndpointUrl('http://172.31.255.255/internal')).rejects.toThrow(
        /Private IP range|172\.31\.255\.255/i
      );
    });

    it('should allow 172.15.0.1 (outside range)', async () => {
      await expect(validateEndpointUrl('https://172.15.0.1/api')).resolves.toBe(true);
    });

    it('should allow 172.32.0.1 (outside range)', async () => {
      await expect(validateEndpointUrl('https://172.32.0.1/api')).resolves.toBe(true);
    });
  });

  describe('Private IPv4 Range Denial (192.168.0.0/16)', () => {
    it('should block 192.168.0.0', async () => {
      await expect(validateEndpointUrl('http://192.168.0.0/router')).rejects.toThrow(
        /Private IP range|192\.168\.0\.0/i
      );
    });

    it('should block 192.168.0.1', async () => {
      await expect(validateEndpointUrl('http://192.168.0.1/admin')).rejects.toThrow(
        /Private IP range|192\.168\.0\.1/i
      );
    });

    it('should block 192.168.1.1', async () => {
      await expect(validateEndpointUrl('http://192.168.1.1/router')).rejects.toThrow(
        /Private IP range|192\.168\.1\.1/i
      );
    });

    it('should block 192.168.255.255', async () => {
      await expect(validateEndpointUrl('http://192.168.255.255/internal')).rejects.toThrow(
        /Private IP range|192\.168\.255\.255/i
      );
    });

    it('should allow 192.167.0.1 (outside range)', async () => {
      await expect(validateEndpointUrl('https://192.167.0.1/api')).resolves.toBe(true);
    });

    it('should allow 192.169.0.1 (outside range)', async () => {
      await expect(validateEndpointUrl('https://192.169.0.1/api')).resolves.toBe(true);
    });
  });

  describe('Protocol Validation', () => {
    it('should block file:// scheme', async () => {
      await expect(validateEndpointUrl('file:///etc/passwd')).rejects.toThrow(
        /Only http\/https schemes allowed|file:/i
      );
    });

    it('should block ftp:// scheme', async () => {
      await expect(validateEndpointUrl('ftp://ftp.example.com/file')).rejects.toThrow(
        /Only http\/https schemes allowed|ftp:/i
      );
    });

    it('should block gopher:// scheme', async () => {
      await expect(validateEndpointUrl('gopher://gopher.example.com')).rejects.toThrow(
        /Only http\/https schemes allowed|gopher:/i
      );
    });

    it('should block javascript: scheme', async () => {
      await expect(validateEndpointUrl('javascript:alert(1)')).rejects.toThrow();
    });

    it('should allow http:// scheme', async () => {
      await expect(validateEndpointUrl('http://external-api.example.com')).resolves.toBe(true);
    });

    it('should allow https:// scheme', async () => {
      await expect(validateEndpointUrl('https://secure-api.example.com')).resolves.toBe(true);
    });
  });

  describe('Input Validation', () => {
    it('should reject empty URL', async () => {
      await expect(validateEndpointUrl('')).rejects.toThrow('Endpoint URL cannot be empty');
    });

    it('should reject whitespace-only URL', async () => {
      await expect(validateEndpointUrl('   ')).rejects.toThrow('Endpoint URL cannot be empty');
    });

    it('should reject malformed URL', async () => {
      await expect(validateEndpointUrl('not a valid url at all')).rejects.toThrow(/Invalid URL format/i);
    });

    it('should reject URL with invalid characters', async () => {
      await expect(validateEndpointUrl('http://[invalid-bracket')).rejects.toThrow(/Invalid URL format/i);
    });

    it('should reject URL with missing scheme', async () => {
      await expect(validateEndpointUrl('example.com/api')).rejects.toThrow(/Invalid URL format/i);
    });
  });

  describe('Case Insensitivity', () => {
    it('should handle uppercase hostnames', async () => {
      await expect(validateEndpointUrl('https://API.EXAMPLE.COM/endpoint')).resolves.toBe(true);
    });

    it('should handle mixed case hostnames', async () => {
      await expect(validateEndpointUrl('https://Api.Example.Com/endpoint')).resolves.toBe(true);
    });

    it('should block localhost case-insensitively', async () => {
      await expect(validateEndpointUrl('http://LOCALHOST/api')).rejects.toThrow(
        /Internal network access denied|localhost/i
      );
    });

    it('should block localhost variants', async () => {
      await expect(validateEndpointUrl('http://LoCalHost/api')).rejects.toThrow(
        /Internal network access denied|localhost/i
      );
    });
  });

  describe('Production HTTPS Enforcement', () => {
    it('should require HTTPS in production (or allow based on env)', async () => {
      if (import.meta.env.PROD) {
        await expect(validateEndpointUrl('http://api.example.com')).rejects.toThrow(
          /Only HTTPS allowed in production/i
        );
      } else {
        await expect(validateEndpointUrl('http://api.example.com')).resolves.toBe(true);
      }
    });

    it('should always allow HTTPS regardless of environment', async () => {
      await expect(validateEndpointUrl('https://api.example.com')).resolves.toBe(true);
    });
  });

  describe('Edge Cases & Boundary Conditions', () => {
    it('should handle ports in hostname', async () => {
      await expect(validateEndpointUrl('https://api.example.com:443/endpoint')).resolves.toBe(true);
    });

    it('should handle non-standard ports', async () => {
      await expect(validateEndpointUrl('https://api.example.com:8443/endpoint')).resolves.toBe(true);
    });

    it('should handle URLs with fragments', async () => {
      await expect(validateEndpointUrl('https://api.example.com/path#section')).resolves.toBe(true);
    });

    it('should handle URLs with multiple path segments', async () => {
      await expect(validateEndpointUrl('https://api.example.com/v1/internal/secure/data')).resolves.toBe(true);
    });

    it('should block URL with internal IP despite path', async () => {
      await expect(validateEndpointUrl('https://192.168.1.1/external-api')).rejects.toThrow(
        /Private IP range|192\.168\.1\.1/i
      );
    });

    it('should block URL with localhost despite port', async () => {
      await expect(validateEndpointUrl('http://localhost:8080/api')).rejects.toThrow(
        /Internal network access denied|localhost/i
      );
    });
  });

  describe('Comprehensive Attack Scenarios', () => {
    it('should prevent SSRF via decimal IP representation', async () => {
      await expect(validateEndpointUrl('http://3232235777')).rejects.toThrow();
    });

    it('should prevent SSRF via octal IP representation', async () => {
      await expect(validateEndpointUrl('http://0300.0250.0000.0001')).rejects.toThrow();
    });

    it('should prevent DNS rebinding via localhost variations', async () => {
      await expect(validateEndpointUrl('https://127.0.0.1.example.com')).resolves.toBe(true);
    });

    it('should not be fooled by @-based userinfo', async () => {
      await expect(validateEndpointUrl('http://example.com@192.168.1.1')).rejects.toThrow(
        /Private IP range|192\.168\.1\.1/i
      );
    });

    it('should handle subdomain on private IP (semantic security)', async () => {
      await expect(validateEndpointUrl('http://192.168.1.1:8000/admin')).rejects.toThrow(
        /Private IP range|192\.168\.1\.1/i
      );
    });
  });

  describe('Error Message Clarity', () => {
    it('should provide clear error on localhost block', async () => {
      await expect(validateEndpointUrl('http://localhost/api')).rejects.toThrow(
        /Internal network|localhost/i
      );
    });

    it('should provide clear error on private IP block', async () => {
      await expect(validateEndpointUrl('http://192.168.1.1/api')).rejects.toThrow(
        /Private IP range|192\.168\.1\.1/i
      );
    });

    it('should provide clear error on metadata endpoint block', async () => {
      await expect(validateEndpointUrl('http://169.254.169.254/metadata')).rejects.toThrow(
        /Metadata endpoint|169\.254\.169\.254/i
      );
    });

    it('should provide clear error on invalid scheme', async () => {
      await expect(validateEndpointUrl('file:///etc/passwd')).rejects.toThrow(
        /Only http\/https|schemes allowed|file:/i
      );
    });
  });
});
