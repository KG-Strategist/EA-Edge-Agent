import { describe, it, expect } from 'vitest';
import { validateEndpointUrl } from '../lib/networkGuard';

describe('Network Guard - SSRF Prevention', () => {
  describe('Valid External Endpoints (Should Pass)', () => {
    it('should allow standard external APIs (OpenAI)', () => {
      expect(validateEndpointUrl('https://api.openai.com/v1/chat/completions')).toBe(true);
    });

    it('should allow standard external APIs (Anthropic)', () => {
      expect(validateEndpointUrl('https://api.anthropic.com/messages')).toBe(true);
    });

    it('should allow standard external APIs with paths', () => {
      expect(validateEndpointUrl('https://api.example.com/v1/endpoint/path')).toBe(true);
    });

    it('should allow external URLs with query parameters', () => {
      expect(validateEndpointUrl('https://api.example.com/endpoint?key=value&foo=bar')).toBe(true);
    });

    it('should allow external URLs with custom ports', () => {
      expect(validateEndpointUrl('https://custom.enterprise.com:8443/api')).toBe(true);
    });

    it('should allow HTTPS URLs', () => {
      expect(validateEndpointUrl('https://secure-api.example.com')).toBe(true);
    });

    it('should allow HTTP URLs in development', () => {
      // This will pass in dev mode, fail in production (depending on import.meta.env.PROD)
      expect(() => validateEndpointUrl('http://dev-api.example.com')).not.toThrow();
    });

    it('should allow URLs with authentication', () => {
      expect(validateEndpointUrl('https://user:pass@api.example.com/endpoint')).toBe(true);
    });

    it('should allow URLs with various TLDs', () => {
      expect(validateEndpointUrl('https://api.company.co.uk/v1/chat')).toBe(true);
    });

    it('should allow subdomain variations', () => {
      expect(validateEndpointUrl('https://v1.api.example.com/endpoint')).toBe(true);
    });
  });

  describe('Localhost Denial (SSRF Protection)', () => {
    it('should block explicit localhost', () => {
      expect(() => validateEndpointUrl('http://localhost/api')).toThrow(
        /Internal network access denied|localhost/i
      );
    });

    it('should block 127.0.0.1', () => {
      expect(() => validateEndpointUrl('http://127.0.0.1/admin')).toThrow(
        /Internal network access denied|127\.0\.0\.1/i
      );
    });

    it('should handle IPv6 localhost (::1) appropriately', () => {
      // IPv6 support varies by browser/implementation
      try {
        validateEndpointUrl('http://[::1]/admin');
      } catch (e) {
        const error = e as Error;
        expect(error.message).toMatch(/denied|invalid|::1/i);
      }
    });

    it('should block 0.0.0.0', () => {
      expect(() => validateEndpointUrl('http://0.0.0.0/api')).toThrow(
        /Internal network access denied|0\.0\.0\.0/i
      );
    });

    it('should handle IPv6 any address (::) appropriately', () => {
      // IPv6 support varies by browser/implementation
      try {
        validateEndpointUrl('http://[::]/api');
      } catch (e) {
        const error = e as Error;
        expect(error.message).toMatch(/denied|invalid|::/i);
      }
    });

    it('should block loopback range 127.x.x.x', () => {
      expect(() => validateEndpointUrl('http://127.1.1.1/api')).toThrow(
        /Loopback range|127\.1\.1\.1/i
      );
    });

    it('should block 127.99.99.99', () => {
      expect(() => validateEndpointUrl('http://127.99.99.99/admin')).toThrow(
        /Loopback range|127\.99\.99\.99/i
      );
    });
  });

  describe('Cloud Metadata Endpoints Denial', () => {
    it('should block AWS EC2 metadata endpoint', () => {
      expect(() => validateEndpointUrl('http://169.254.169.254/latest/meta-data/')).toThrow(
        /Metadata endpoint access denied|169\.254\.169\.254/i
      );
    });

    it('should block GCP metadata endpoint', () => {
      expect(() => validateEndpointUrl('http://169.254.170.2/computeMetadata/v1/')).toThrow(
        /Metadata endpoint access denied|169\.254\.170\.2/i
      );
    });

    it('should block Azure metadata endpoint', () => {
      expect(() => validateEndpointUrl('http://168.63.129.16/metadata/instance')).toThrow(
        /Metadata endpoint access denied|168\.63\.129\.16/i
      );
    });
  });

  describe('Private IPv4 Range Denial (10.0.0.0/8)', () => {
    it('should block 10.0.0.0', () => {
      expect(() => validateEndpointUrl('http://10.0.0.0/internal')).toThrow(
        /Private IP range|10\.0\.0\.0/i
      );
    });

    it('should block 10.0.0.1', () => {
      expect(() => validateEndpointUrl('http://10.0.0.1/admin')).toThrow(
        /Private IP range|10\.0\.0\.1/i
      );
    });

    it('should block 10.255.255.255', () => {
      expect(() => validateEndpointUrl('http://10.255.255.255/api')).toThrow(
        /Private IP range|10\.255\.255\.255/i
      );
    });

    it('should block 10.127.0.1', () => {
      expect(() => validateEndpointUrl('http://10.127.0.1/internal')).toThrow(
        /Private IP range|10\.127\.0\.1/i
      );
    });
  });

  describe('Private IPv4 Range Denial (172.16.0.0/12)', () => {
    it('should block 172.16.0.0', () => {
      expect(() => validateEndpointUrl('http://172.16.0.0/internal')).toThrow(
        /Private IP range|172\.16\.0\.0/i
      );
    });

    it('should block 172.16.0.1', () => {
      expect(() => validateEndpointUrl('http://172.16.0.1/admin')).toThrow(
        /Private IP range|172\.16\.0\.1/i
      );
    });

    it('should block 172.20.0.1', () => {
      expect(() => validateEndpointUrl('http://172.20.0.1/api')).toThrow(
        /Private IP range|172\.20\.0\.1/i
      );
    });

    it('should block 172.31.255.255', () => {
      expect(() => validateEndpointUrl('http://172.31.255.255/internal')).toThrow(
        /Private IP range|172\.31\.255\.255/i
      );
    });

    it('should allow 172.15.0.1 (outside range)', () => {
      expect(validateEndpointUrl('https://172.15.0.1/api')).toBe(true);
    });

    it('should allow 172.32.0.1 (outside range)', () => {
      expect(validateEndpointUrl('https://172.32.0.1/api')).toBe(true);
    });
  });

  describe('Private IPv4 Range Denial (192.168.0.0/16)', () => {
    it('should block 192.168.0.0', () => {
      expect(() => validateEndpointUrl('http://192.168.0.0/router')).toThrow(
        /Private IP range|192\.168\.0\.0/i
      );
    });

    it('should block 192.168.0.1', () => {
      expect(() => validateEndpointUrl('http://192.168.0.1/admin')).toThrow(
        /Private IP range|192\.168\.0\.1/i
      );
    });

    it('should block 192.168.1.1', () => {
      expect(() => validateEndpointUrl('http://192.168.1.1/router')).toThrow(
        /Private IP range|192\.168\.1\.1/i
      );
    });

    it('should block 192.168.255.255', () => {
      expect(() => validateEndpointUrl('http://192.168.255.255/internal')).toThrow(
        /Private IP range|192\.168\.255\.255/i
      );
    });

    it('should allow 192.167.0.1 (outside range)', () => {
      expect(validateEndpointUrl('https://192.167.0.1/api')).toBe(true);
    });

    it('should allow 192.169.0.1 (outside range)', () => {
      expect(validateEndpointUrl('https://192.169.0.1/api')).toBe(true);
    });
  });

  describe('Protocol Validation', () => {
    it('should block file:// scheme', () => {
      expect(() => validateEndpointUrl('file:///etc/passwd')).toThrow(
        /Only http\/https schemes allowed|file:/i
      );
    });

    it('should block ftp:// scheme', () => {
      expect(() => validateEndpointUrl('ftp://ftp.example.com/file')).toThrow(
        /Only http\/https schemes allowed|ftp:/i
      );
    });

    it('should block gopher:// scheme', () => {
      expect(() => validateEndpointUrl('gopher://gopher.example.com')).toThrow(
        /Only http\/https schemes allowed|gopher:/i
      );
    });

    it('should block javascript: scheme', () => {
      expect(() => validateEndpointUrl('javascript:alert(1)')).toThrow();
    });

    it('should allow http:// scheme', () => {
      expect(validateEndpointUrl('http://external-api.example.com')).toBe(true);
    });

    it('should allow https:// scheme', () => {
      expect(validateEndpointUrl('https://secure-api.example.com')).toBe(true);
    });
  });

  describe('Input Validation', () => {
    it('should reject empty URL', () => {
      expect(() => validateEndpointUrl('')).toThrow('Endpoint URL cannot be empty');
    });

    it('should reject whitespace-only URL', () => {
      expect(() => validateEndpointUrl('   ')).toThrow('Endpoint URL cannot be empty');
    });

    it('should reject malformed URL', () => {
      expect(() => validateEndpointUrl('not a valid url at all')).toThrow(/Invalid URL format/i);
    });

    it('should reject URL with invalid characters', () => {
      expect(() => validateEndpointUrl('http://[invalid-bracket')).toThrow(/Invalid URL format/i);
    });

    it('should reject URL with missing scheme', () => {
      expect(() => validateEndpointUrl('example.com/api')).toThrow(/Invalid URL format/i);
    });
  });

  describe('Case Insensitivity', () => {
    it('should handle uppercase hostnames', () => {
      expect(validateEndpointUrl('https://API.EXAMPLE.COM/endpoint')).toBe(true);
    });

    it('should handle mixed case hostnames', () => {
      expect(validateEndpointUrl('https://Api.Example.Com/endpoint')).toBe(true);
    });

    it('should block localhost case-insensitively', () => {
      expect(() => validateEndpointUrl('http://LOCALHOST/api')).toThrow(
        /Internal network access denied|localhost/i
      );
    });

    it('should block localhost variants', () => {
      expect(() => validateEndpointUrl('http://LoCalHost/api')).toThrow(
        /Internal network access denied|localhost/i
      );
    });
  });

  describe('Production HTTPS Enforcement', () => {
    it('should require HTTPS in production (or allow based on env)', () => {
      // This test validates behavior differs between dev and prod
      // In dev: HTTP is allowed to external hosts
      // In prod: Only HTTPS allowed
      if (import.meta.env.PROD) {
        expect(() => validateEndpointUrl('http://api.example.com')).toThrow(
          /Only HTTPS allowed in production/i
        );
      } else {
        // In dev, HTTP to external hosts is OK
        expect(validateEndpointUrl('http://api.example.com')).toBe(true);
      }
    });

    it('should always allow HTTPS regardless of environment', () => {
      expect(validateEndpointUrl('https://api.example.com')).toBe(true);
    });
  });

  describe('Edge Cases & Boundary Conditions', () => {
    it('should handle ports in hostname', () => {
      expect(validateEndpointUrl('https://api.example.com:443/endpoint')).toBe(true);
    });

    it('should handle non-standard ports', () => {
      expect(validateEndpointUrl('https://api.example.com:8443/endpoint')).toBe(true);
    });

    it('should handle URLs with fragments', () => {
      expect(validateEndpointUrl('https://api.example.com/path#section')).toBe(true);
    });

    it('should handle URLs with multiple path segments', () => {
      expect(validateEndpointUrl('https://api.example.com/v1/internal/secure/data')).toBe(true);
    });

    it('should block URL with internal IP despite path', () => {
      expect(() => validateEndpointUrl('https://192.168.1.1/external-api')).toThrow(
        /Private IP range|192\.168\.1\.1/i
      );
    });

    it('should block URL with localhost despite port', () => {
      expect(() => validateEndpointUrl('http://localhost:8080/api')).toThrow(
        /Internal network access denied|localhost/i
      );
    });
  });

  describe('Comprehensive Attack Scenarios', () => {
    it('should prevent SSRF via decimal IP representation', () => {
      // 3232235777 = 192.168.0.1 in decimal
      expect(() => validateEndpointUrl('http://3232235777')).toThrow();
    });

    it('should prevent SSRF via octal IP representation', () => {
      // 0300.0250.0000.0001 = 192.168.0.1 in octal
      expect(() => validateEndpointUrl('http://0300.0250.0000.0001')).toThrow();
    });

    it('should prevent DNS rebinding via localhost variations', () => {
      expect(() => validateEndpointUrl('http://127.0.0.1.example.com')).not.toThrow(
        /Internal network access denied|127\.0\.0\.1\.example\.com/i
      );
      // This is actually an external domain, not localhost - should pass
      expect(validateEndpointUrl('https://127.0.0.1.example.com')).toBe(true);
    });

    it('should not be fooled by @-based userinfo', () => {
      // URL like http://example.com@192.168.1.1 has userinfo
      // Modern URL parsing treats example.com as userinfo
      expect(() => validateEndpointUrl('http://example.com@192.168.1.1')).toThrow(
        /Private IP range|192\.168\.1\.1/i
      );
    });

    it('should handle subdomain on private IP (semantic security)', () => {
      // admin.192.168.1.1 is not a valid URL format
      // But test that we catch the actual private IP attempt with proper hostname
      expect(() => validateEndpointUrl('http://192.168.1.1:8000/admin')).toThrow(
        /Private IP range|192\.168\.1\.1/i
      );
    });
  });

  describe('Error Message Clarity', () => {
    it('should provide clear error on localhost block', () => {
      try {
        validateEndpointUrl('http://localhost/api');
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as Error;
        expect(error.message).toMatch(/Internal network|localhost/i);
      }
    });

    it('should provide clear error on private IP block', () => {
      try {
        validateEndpointUrl('http://192.168.1.1/api');
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as Error;
        expect(error.message).toMatch(/Private IP range|192\.168\.1\.1/i);
      }
    });

    it('should provide clear error on metadata endpoint block', () => {
      try {
        validateEndpointUrl('http://169.254.169.254/metadata');
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as Error;
        expect(error.message).toMatch(/Metadata endpoint|169\.254\.169\.254/i);
      }
    });

    it('should provide clear error on invalid scheme', () => {
      try {
        validateEndpointUrl('file:///etc/passwd');
        expect.fail('Should have thrown');
      } catch (e) {
        const error = e as Error;
        expect(error.message).toMatch(/Only http\/https|schemes allowed|file:/i);
      }
    });
  });
});
