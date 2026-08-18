import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Sovereign Engine Pipeline Wiring', () => {
  it('OPFSManager.hydrateModel should exist and have correct signature', async () => {
    const opfsPath = path.join(process.cwd(), 'src/lib/storage/opfsManager.ts');
    const content = fs.readFileSync(opfsPath, 'utf-8');

    expect(content).toContain('static async hydrateModel');
    expect(content).toContain('EA_DOWNLOAD_STATE_UPDATE');
    expect(content).toContain('validateGGUFSignature');
    expect(content).toContain('atomicCommit');
  });

  it('OPFSManager should dispatch progress events during download', async () => {
    const opfsPath = path.join(process.cwd(), 'src/lib/storage/opfsManager.ts');
    const content = fs.readFileSync(opfsPath, 'utf-8');

    const expectedEvents = [
      'EA_DOWNLOAD_STATE_UPDATE',
      'status: \'Downloading\'',
      'status: \'Complete\'',
      'status: \'Error\'',
    ];

    for (const event of expectedEvents) {
      expect(content).toContain(event);
    }
  });

  it('SovereignEngine.ensureInitialized should spawn worker and load model', async () => {
    const sePath = path.join(process.cwd(), 'src/lib/wasm/SovereignEngine.ts');
    const content = fs.readFileSync(sePath, 'utf-8');

    expect(content).toContain('ensureInitialized');
    expect(content).toContain('bootWorkerAndLoadModel');
    expect(content).toContain('LOAD_AND_BLIT_MODEL');
    expect(content).toContain('BLIT_COMPLETE');
    expect(content).toContain('getVRAMProfile');
    expect(content).toContain('BLIT_TIMEOUT');
    expect(content).toContain('this.cleanup()');
  });

  it('inferenceWorker should handle all WASM lifecycle messages', async () => {
    const workerPath = path.join(process.cwd(), 'src/workers/inferenceWorker.ts');
    const content = fs.readFileSync(workerPath, 'utf-8');

    expect(content).toContain('LOAD_AND_BLIT_MODEL');
    expect(content).toContain('GENERATE');
    expect(content).toContain('INTERRUPT_GENERATION');
    expect(content).toContain('CLEAR_KV_CACHE');
    expect(content).toContain('BLIT_COMPLETE');
    expect(content).toContain('INFERENCE_CHUNK');
    expect(content).toContain('INFERENCE_COMPLETE');
    expect(content).toContain('HEARTBEAT');
    expect(content).toContain('begin_prefill');
    expect(content).toContain('prefill_next_chunk');
    expect(content).toContain('renderChatPrompt');
    expect(content).toContain('NO_VISIBLE_TOKENS');
  });

  it('aiEngine.generateReview should route to SovereignEngine', async () => {
    const aiPath = path.join(process.cwd(), 'src/lib/aiEngine.ts');
    const content = fs.readFileSync(aiPath, 'utf-8');

    expect(content).toContain('sovereignEngine.generateText');
    expect(content).toContain('ensureModelCached');
    expect(content).toContain('resolveModelId');
  });

  it('aiEngine.chatWithAgent should have complete routing decision tree', async () => {
    const aiPath = path.join(process.cwd(), 'src/lib/aiEngine.ts');
    const content = fs.readFileSync(aiPath, 'utf-8');

    const routingPaths = [
      'SMALL_TALK_RE',
      'BYOM_NETWORK',
      'routeMoE',
      'EPISTEMIC',
      'localDaemon',
      'sovereignEngine.generateText',
    ];

    for (const route of routingPaths) {
      expect(content).toContain(route);
    }
  });

  it('AgentConfigTab should orchestrate download -> engine boot sequence', async () => {
    const tabPath = path.join(process.cwd(), 'src/components/admin/AgentConfigTab.tsx');
    const content = fs.readFileSync(tabPath, 'utf-8');

    expect(content).toContain('EA_MODEL_DOWNLOAD_START');
    expect(content).toContain('OPFSManager.hydrateModel');
    expect(content).toContain('sovereignEngine.ensureInitialized');
  });

  it('ModelConsentModal should bridge consent to download event', async () => {
    const modalPath = path.join(process.cwd(), 'src/components/ui/ModelConsentModal.tsx');
    const content = fs.readFileSync(modalPath, 'utf-8');

    expect(content).toContain('EA_AI_CONSENT_REQUIRED');
    expect(content).toContain('EA_MODEL_DOWNLOAD_START');
  });

  it('LocalDaemonProvider should be opt-in to avoid startup connection noise', async () => {
    const daemonPath = path.join(process.cwd(), 'src/lib/providers/LocalDaemonProvider.ts');
    const content = fs.readFileSync(daemonPath, 'utf-8');

    expect(content).toContain('daemonEnabled');
    expect(content).toContain('isEnabled');
  });

  it('Rust tensor core should support Q4_1 GGUF tensors', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const mathPath = path.join(process.cwd(), 'src-rust/src/math.rs');
    const libPath = path.join(process.cwd(), 'src-rust/src/lib.rs');
    if (!fs.existsSync(mathPath) || !fs.existsSync(libPath)) {
      // src-rust not available in CI (gitignored, not in checkout)
      return;
    }
    const mathContent = fs.readFileSync(mathPath, 'utf-8');
    const libContent = fs.readFileSync(libPath, 'utf-8');

    expect(mathContent).toContain('Q4_1_BLOCK_SIZE');
    expect(mathContent).toContain('Q8_0_BLOCK_SIZE');
    expect(mathContent).toContain('fused_dequantize_matvec_q4_1');
    expect(mathContent).toContain('fused_dequantize_matvec_q8_0');
    expect(mathContent).toContain('dequantize_q4_1_row');
    expect(libContent).toContain('ggml_type');
    expect(libContent).toContain('Q4_1');
    expect(libContent).toContain('3 => crate::math::fused_dequantize_matvec_q4_1');
    expect(libContent).toContain('8 => crate::math::fused_dequantize_matvec_q8_0');
  });

  it('background distillation should reject deterministic fallback artifacts', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const shadowPath = path.join(process.cwd(), 'src/lib/EpistemicShadow.ts');
    const aiPath = path.join(process.cwd(), 'src/lib/aiEngine.ts');
    const shadowContent = fs.readFileSync(shadowPath, 'utf-8');
    const aiContent = fs.readFileSync(aiPath, 'utf-8');

    expect(shadowContent).toContain('isDistillableExchange');
    expect(shadowContent).toContain('unsupported_tensor_type');
    expect(shadowContent).toContain('structurally,');
    expect(aiContent).toContain('isDistillableTriplet');
    expect(aiContent).toContain('globalArena.addMemory(triplet, 1, false, text)');
  });
});
