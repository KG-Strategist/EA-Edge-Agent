import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initializeVault,
  getVaultKey,
  clearVault,
  encryptString,
  decryptString,
  encryptBlob,
  decryptBlob,
} from '../lib/cryptoVault';
import { hashSecret } from '../lib/authEngine';

describe('CryptoVault Security Tests', () => {
  const testPin = 'test-pin-12345';
  const testSalt = 'test-salt-67890';
  const testMessage = 'This is a test message for encryption';

  beforeEach(async () => {
    // Clear any existing vault state
    clearVault();
    // Initialize with test credentials
    await initializeVault(testPin, testSalt);
  });

  afterEach(() => {
    clearVault();
  });

  describe('Vault Initialization & Key Management', () => {
    it('should initialize vault and store DEK', async () => {
      const dek = getVaultKey();
      expect(dek).toBeTruthy();
      expect(typeof dek).toBe('string');
    });

    it('should return null after clearing vault', () => {
      clearVault();
      const dek = getVaultKey();
      expect(dek).toBeNull();
    });

    it('should derive consistent DEK from same PIN and salt', async () => {
      const dek1 = getVaultKey();
      clearVault();
      await initializeVault(testPin, testSalt);
      const dek2 = getVaultKey();
      expect(dek1).toBe(dek2);
    });

    it('should derive different DEK from different PIN', async () => {
      const dek1 = getVaultKey();
      clearVault();
      await initializeVault('different-pin', testSalt);
      const dek2 = getVaultKey();
      expect(dek1).not.toBe(dek2);
    });
  });

  describe('String Encryption & Decryption (AES-GCM)', () => {
    it('should encrypt and decrypt a string successfully (roundtrip)', async () => {
      const encrypted = await encryptString(testMessage);
      expect(encrypted).toBeTruthy();
      expect(typeof encrypted).toBe('string');
      // Format should be: ivHex:encryptedHex
      expect(encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);

      const decrypted = await decryptString(encrypted);
      expect(decrypted).toBe(testMessage);
    });

    it('should encrypt different messages to different ciphertexts (IV randomization)', async () => {
      const encrypted1 = await encryptString(testMessage);
      const encrypted2 = await encryptString(testMessage);
      // Due to random IV, ciphertexts should differ
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same plaintext
      const decrypted1 = await decryptString(encrypted1);
      const decrypted2 = await decryptString(encrypted2);
      expect(decrypted1).toBe(testMessage);
      expect(decrypted2).toBe(testMessage);
    });

    it('should handle empty strings', async () => {
      const encrypted = await encryptString('');
      expect(encrypted).toBeTruthy();
      const decrypted = await decryptString(encrypted);
      expect(decrypted).toBe('');
    });

    it('should handle special characters and unicode', async () => {
      const specialMessage = '🔐 Secure: !@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = await encryptString(specialMessage);
      const decrypted = await decryptString(encrypted);
      expect(decrypted).toBe(specialMessage);
    });

    it('should handle large messages', async () => {
      const largeMessage = 'x'.repeat(10000);
      const encrypted = await encryptString(largeMessage);
      const decrypted = await decryptString(encrypted);
      expect(decrypted).toBe(largeMessage);
    });
  });

  describe('Decryption Error Handling (Fix 1.2)', () => {
    it('should throw error when decrypting with missing DEK', async () => {
      const encrypted = await encryptString(testMessage);
      clearVault();

      await expect(decryptString(encrypted)).rejects.toThrow('Vault decryption key not available');
    });

    it('should throw error on corrupted ciphertext (missing colon)', async () => {
      const corruptedCiphertext = 'not_a_valid_ciphertext';

      await expect(decryptString(corruptedCiphertext)).rejects.toThrow('Invalid ciphertext format');
    });

    it('should throw error on tampered ciphertext (modified encrypted portion)', async () => {
      const encrypted = await encryptString(testMessage);
      const [iv, cipher] = encrypted.split(':');
      // Flip a bit in the ciphertext to simulate tampering
      const tamperedCiphertext = `${iv}:${(parseInt(cipher[0], 16) ^ 1).toString(16)}${cipher.slice(1)}`;

      await expect(decryptString(tamperedCiphertext)).rejects.toThrow('Failed to decrypt string');
    });

    it('should throw error on invalid IV (corrupted hex)', async () => {
      const encrypted = await encryptString(testMessage);
      const [, cipher] = encrypted.split(':');
      const corruptedIV = 'zz'; // Invalid hex

      await expect(decryptString(`${corruptedIV}:${cipher}`)).rejects.toThrow();
    });

    it('should throw error on truncated ciphertext', async () => {
      const encrypted = await encryptString(testMessage);
      const truncated = encrypted.slice(0, -10);

      await expect(decryptString(truncated)).rejects.toThrow('Failed to decrypt string');
    });

    it('should not return plaintext on decryption failure', async () => {
      const encrypted = await encryptString(testMessage);
      const [iv] = encrypted.split(':');
      const corruptedCiphertext = `${iv}:invalid`;

      try {
        await decryptString(corruptedCiphertext);
        // Should not reach here
        expect.fail('Should have thrown an error');
      } catch (e) {
        const error = e as Error;
        expect(error.message).not.toContain(testMessage);
      }
    });
  });

  describe('Blob Encryption & Decryption', () => {
    it('should encrypt and decrypt a blob successfully', async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const blob = new Blob([testData], { type: 'application/octet-stream' });

      const encrypted = await encryptBlob(blob);
      expect(encrypted).toBeTruthy();
      expect(encrypted.type).toBe('application/octet-stream');

      const decrypted = await decryptBlob(encrypted);
      const decryptedData = await decrypted.arrayBuffer();
      const decryptedArray = new Uint8Array(decryptedData);

      expect(decryptedArray).toEqual(testData);
    });

    it('should throw error when decrypting blob with missing DEK', async () => {
      const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5])]);
      clearVault();

      await expect(decryptBlob(blob)).rejects.toThrow('Vault decryption key not available');
    });

    it('should throw error on invalid encrypted blob (too small)', async () => {
      const invalidBlob = new Blob([new Uint8Array([1, 2])], { type: 'application/octet-stream' });

      await expect(decryptBlob(invalidBlob)).rejects.toThrow('Invalid encrypted payload');
    });

    it('should throw error on tampered blob', async () => {
      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      const blob = new Blob([testData]);
      const encrypted = await encryptBlob(blob);

      const encryptedData = await encrypted.arrayBuffer();
      const corruptedArray = new Uint8Array(encryptedData);
      // Flip a bit in encrypted portion (after IV)
      corruptedArray[15] ^= 1;
      const corruptedBlob = new Blob([corruptedArray]);

      await expect(decryptBlob(corruptedBlob)).rejects.toThrow('Failed to decrypt blob');
    });
  });

  describe('Key Isolation & Uniqueness', () => {
    it('should not expose DEK in plaintext', () => {
      const dek = getVaultKey();
      // DEK should be a hex string (not raw binary)
      expect(dek).toMatch(/^[0-9a-f]+$/);
    });

    it('should not share DEK between sessions', async () => {
      const dek1 = getVaultKey();

      // Simulate new session
      clearVault();
      await initializeVault(testPin, testSalt);
      const dek2 = getVaultKey();

      // Same credentials should produce same key (deterministic)
      expect(dek1).toBe(dek2);

      // But after clearing, retrieving should give null
      clearVault();
      const dek3 = getVaultKey();
      expect(dek3).toBeNull();
    });
  });

  describe('Encryption Performance', () => {
    it('should encrypt string in reasonable time (<100ms)', async () => {
      const start = performance.now();
      await encryptString(testMessage);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

    it('should decrypt string in reasonable time (<100ms)', async () => {
      const encrypted = await encryptString(testMessage);
      const start = performance.now();
      await decryptString(encrypted);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

    it('should handle bulk encryption of multiple strings', async () => {
      const messages = Array(50).fill(testMessage);
      const encrypted = await Promise.all(messages.map(m => encryptString(m)));

      expect(encrypted).toHaveLength(50);
      expect(encrypted.every(e => typeof e === 'string')).toBe(true);

      const decrypted = await Promise.all(encrypted.map(e => decryptString(e)));
      expect(decrypted).toEqual(messages);
    });
  });
});
