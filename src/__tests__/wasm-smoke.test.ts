import { describe, it, expect } from 'vitest';

describe('WASM Engine Smoke Tests', () => {
  it('should have WASM binary file present', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const wasmPath = path.join(process.cwd(), 'src/lib/wasm/pkg/eaniti_engine_bg.wasm');
    expect(fs.existsSync(wasmPath)).toBe(true);
    const stats = fs.statSync(wasmPath);
    expect(stats.size).toBeGreaterThan(10000);
  });

  it('should have TypeScript bindings for all required WASM functions', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const dtsPath = path.join(process.cwd(), 'src/lib/wasm/pkg/eaniti_engine.d.ts');
    const dtsContent = fs.readFileSync(dtsPath, 'utf-8');

    const requiredBindings = [
      'allocate_weights_buffer',
      'initialize_tensor_graph',
      'begin_prefill',
      'prefill_next_chunk',
      'is_prefill_complete',
      'prefill_prompt',
      'generate_next_token',
      'decode_single_token',
      'get_eos_id',
      'get_architecture',
      'get_tokenizer_model',
      'get_chat_template',
      'get_vocab_size',
      'compute_epistemic_state',
      'clear_kv_cache',
      'free_weights_buffer',
      'reset_generation_state',
      'is_loaded',
    ];

    for (const binding of requiredBindings) {
      expect(dtsContent).toContain(binding);
    }
  });

  it('should have WASM JS glue code present', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const jsPath = path.join(process.cwd(), 'src/lib/wasm/pkg/eaniti_engine.js');
    expect(fs.existsSync(jsPath)).toBe(true);
    const content = fs.readFileSync(jsPath, 'utf-8');
    expect(content).toContain('SovereignTensorCore');
  });

  it('should have SovereignEngine.ts with all lifecycle methods', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const sePath = path.join(process.cwd(), 'src/lib/wasm/SovereignEngine.ts');
    const content = fs.readFileSync(sePath, 'utf-8');

    const requiredMethods = [
      'ensureInitialized',
      'generateText',
      'abortGeneration',
      'clearContext',
      'bootWorkerAndLoadModel',
    ];

    for (const method of requiredMethods) {
      expect(content).toContain(method);
    }
  });

  it('should have inferenceWorker.ts with all message handlers', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const workerPath = path.join(process.cwd(), 'src/workers/inferenceWorker.ts');
    const content = fs.readFileSync(workerPath, 'utf-8');

    const requiredHandlers = [
      'LOAD_AND_BLIT_MODEL',
      'GENERATE',
      'INTERRUPT_GENERATION',
      'CLEAR_KV_CACHE',
      'begin_prefill',
      'prefill_next_chunk',
      'HEARTBEAT',
      'generate_next_token',
      'decode_single_token',
    ];

    for (const handler of requiredHandlers) {
      expect(content).toContain(handler);
    }
  });

  it('should have mock GGUF files for all architectures with valid GGUF magic', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const fixturesDir = path.join(process.cwd(), 'src/__tests__/fixtures');

    for (const arch of ['llama', 'qwen2', 'gemma2']) {
      const mockPath = path.join(fixturesDir, `mock_${arch}.gguf`);
      expect(fs.existsSync(mockPath), `mock_${arch}.gguf should exist`).toBe(true);

      const buffer = fs.readFileSync(mockPath);
      expect(buffer.length).toBeGreaterThan(1000, `mock_${arch}.gguf should have substantial data`);

      expect(buffer[0]).toBe(0x47); // 'G'
      expect(buffer[1]).toBe(0x47); // 'G'
      expect(buffer[2]).toBe(0x55); // 'U'
      expect(buffer[3]).toBe(0x46); // 'F'

      const version = buffer.readUInt32LE(4);
      expect(version).toBe(3);

      const tensorCount = buffer.readBigUInt64LE(8);
      expect(Number(tensorCount)).toBeGreaterThanOrEqual(12);
    }
  });

  it('should have mock GGUF files with correct architecture field per file', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const fixturesDir = path.join(process.cwd(), 'src/__tests__/fixtures');

    for (const arch of ['llama', 'qwen2', 'gemma2']) {
      const mockPath = path.join(fixturesDir, `mock_${arch}.gguf`);
      const buffer = fs.readFileSync(mockPath);
      const content = buffer.toString('utf8');

      expect(content).toContain(`general.architecture`);
      expect(content).toContain(`tokenizer.ggml.tokens`);
      expect(content).toContain(`tokenizer.ggml.bos_token_id`);
      expect(content).toContain(`tokenizer.ggml.eos_token_id`);
      expect(content).toContain(`general.alignment`);

      const archPrefix = `${arch}.`;
      expect(content).toContain(`${archPrefix}embedding_length`, `mock_${arch}.gguf should contain ${archPrefix}embedding_length`);
      expect(content).toContain(`${archPrefix}block_count`, `mock_${arch}.gguf should contain ${archPrefix}block_count`);
      expect(content).toContain(`${archPrefix}attention.head_count`, `mock_${arch}.gguf should contain ${archPrefix}attention.head_count`);
      expect(content).toContain(`${archPrefix}feed_forward_length`, `mock_${arch}.gguf should contain ${archPrefix}feed_forward_length`);
      expect(content).toContain(`${archPrefix}context_length`, `mock_${arch}.gguf should contain ${archPrefix}context_length`);
      expect(content).toContain(`${archPrefix}vocab_size`, `mock_${arch}.gguf should contain ${archPrefix}vocab_size`);
    }
  });
});
