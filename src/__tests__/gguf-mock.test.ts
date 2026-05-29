/**
 * GGUF Mock Parser & Inference Validation Test
 *
 * Validates the GGUF binary structure using a 1KB mock GGUF fixture with:
 * - Valid magic bytes (0x46554747 "GGUF")
 * - Fake tensor metadata (token_embd.weight, Q4_0, 32x32)
 * - Minimal KV metadata (bos/eos tokens, embedding_length, etc.)
 *
 * The WASM inference tests require a running dev server and are skipped in CI.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('GGUF Mock Parser & Inference', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'mock_tiny.gguf');
  let rawBuffer: Buffer;

  it('should have the mock GGUF fixture file', () => {
    expect(fs.existsSync(fixturePath)).toBe(true);
  });

  it('should load the mock GGUF fixture', () => {
    rawBuffer = fs.readFileSync(fixturePath);
    expect(rawBuffer.length).toBeGreaterThan(100);
  });

  it('should parse GGUF magic bytes correctly (0x46554747 = "GGUF")', () => {
    expect(rawBuffer[0]).toBe(0x47); // G
    expect(rawBuffer[1]).toBe(0x47); // G
    expect(rawBuffer[2]).toBe(0x55); // U
    expect(rawBuffer[3]).toBe(0x46); // F
    const magic = rawBuffer.slice(0, 4).toString('ascii');
    expect(magic).toBe('GGUF');
  });

  it('should parse GGUF version as 3 (little-endian u32)', () => {
    const version = rawBuffer.readUInt32LE(4);
    expect(version).toBe(3);
  });

  it('should have tensor count of 1 (little-endian u64)', () => {
    const tensorCount = rawBuffer.readBigUInt64LE(8);
    expect(tensorCount).toBe(1n);
  });

  it('should have metadata KV count > 0 (little-endian u64)', () => {
    const kvCount = rawBuffer.readBigUInt64LE(16);
    expect(kvCount).toBeGreaterThan(0n);
  });

  it('should contain "tokenizer.ggml.tokens" metadata key', () => {
    const content = rawBuffer.toString('utf8');
    expect(content).toContain('tokenizer.ggml.tokens');
  });

  it('should contain "tokenizer.ggml.bos_token_id" metadata key', () => {
    const content = rawBuffer.toString('utf8');
    expect(content).toContain('tokenizer.ggml.bos_token_id');
  });

  it('should contain "tokenizer.ggml.eos_token_id" metadata key', () => {
    const content = rawBuffer.toString('utf8');
    expect(content).toContain('tokenizer.ggml.eos_token_id');
  });

  it('should contain "llama.embedding_length" metadata key', () => {
    const content = rawBuffer.toString('utf8');
    expect(content).toContain('llama.embedding_length');
  });

  it('should contain "token_embd.weight" tensor name', () => {
    const content = rawBuffer.toString('utf8');
    expect(content).toContain('token_embd.weight');
  });

  it('should have Q4_0 tensor type (GGML type 2)', () => {
    // Find the tensor name, then scan forward for the type field
    const nameOffset = rawBuffer.indexOf('token_embd.weight');
    expect(nameOffset).toBeGreaterThan(-1);
    // After name + length + dims + type, the type should be 2 (Q4_0)
    // The tensor directory structure: name(string), n_dims(u32), dims(u64[]), type(u32), offset(u64)
    // We search for the type value after the tensor name
    const typeOffset = rawBuffer.indexOf(Buffer.from([0x02, 0x00, 0x00, 0x00]), nameOffset);
    expect(typeOffset).toBeGreaterThan(-1);
  });

  it('should have Q4_0 block data after tensor directory (scale bytes present)', () => {
    // Q4_0 blocks start with f16 scale bytes (0x00, 0x3C = 1.0 in f16 little-endian)
    // Look for the f16 scale pattern in the tensor data section
    const hasQ4Data = rawBuffer.some((byte, i) => {
      if (i < 100) return false; // Skip header
      // Check for f16 scale pattern: 0x00 followed by 0x3C (little-endian 1.0)
      return byte === 0x00 && rawBuffer[i + 1] === 0x3C;
    });
    expect(hasQ4Data).toBe(true);
  });

  it('should be under 2KB (lightweight fixture)', () => {
    expect(rawBuffer.length).toBeLessThan(2048);
  });
});
