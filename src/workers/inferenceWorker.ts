/**
 * inferenceWorker.ts — Worker-Owned Wasm VM + Zero-Copy OPFS Blit
 *
 * The Wasm VM lives entirely inside this worker. The main thread never touches
 * WebAssembly.Memory, eliminating DataCloneError and detachment issues.
 *
 * Message Protocol:
 *   LOAD_AND_BLIT_MODEL { fileName, fileSize }
 *     → BLIT_PROGRESS { progress, bytesLoaded, totalBytes }
 *     → BLIT_COMPLETE { fileSize }
 *     → ERROR { payload }
 *   GENERATE { prompt, maxTokens }
 *     → INFERENCE_CHUNK { token, fullText }
 *     → INFERENCE_COMPLETE { fullText }
 *     → ERROR { payload }
 *   CLEAR_KV_CACHE
 *     → KV_CACHE_CLEARED
 *   INTERRUPT_GENERATION
 *     → ABORTED
 *   GET_STATUS
 *     → STATUS { IDLE | BLITTING | ENGINE_READY }
 *   UNLOAD
 *     → STATUS { UNLOADED } (self.close)
 */

import init, { SovereignTensorCore } from '../lib/wasm/pkg/eaniti_engine.js';
import {
  clampGenerationBudget,
  getRuntimeModelProfile,
  renderChatPrompt,
  stripStopSequences,
} from '../lib/modelRuntime';

const CHUNK_SIZE = 32 * 1024 * 1024; // 32MB
const PREFILL_CHUNK_TOKENS = 4;

// ── Worker State ─────────────────────────────────────────────────────────────
let core: SovereignTensorCore | null = null;
let wasmInstance: any = null;
let isBlitting = false;
let isEngineReady = false;
let isGenerating = false;
let activeTimeout: ReturnType<typeof setTimeout> | null = null;
let activeModelId = 'custom';
let activeChatTemplate = '';
let activeHybridCompute = false;
let activeComputeMode = 'CPU Fallback (Wasm SIMD)';
let activeHardwareBlockReason = 'WebGPU adapter not initialized.';
let activeVramUploaded = false;
let activeVramShardCount = 0;
let activeVramUploadedBytes = 0;
let activeVramMaxShardBytes = 0;
let activeVramUploadStatus = 'VRAM upload not started.';

function heartbeat(stage: string, progress = 0) {
  self.postMessage({ type: 'HEARTBEAT', stage, progress });
}

// ── Message Router ───────────────────────────────────────────────────────────
self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data;

  if (type === 'GET_STATUS') {
    self.postMessage({
      type: 'STATUS',
      status: isEngineReady ? 'ENGINE_READY' : isBlitting ? 'BLITTING' : 'IDLE',
    });
    return;
  }

  if (type === 'UNLOAD') {
    if (activeTimeout) {
      clearTimeout(activeTimeout);
      activeTimeout = null;
    }
    if (core) {
      core.free_weights_buffer();
    }
    isBlitting = false;
    isEngineReady = false;
    isGenerating = false;
    core = null;
    wasmInstance = null;
    self.postMessage({ type: 'STATUS', status: 'UNLOADED' });
    self.close();
    return;
  }

  if (type === 'GENERATE') {
    void handleGenerate(e.data).catch((error: any) => {
      isGenerating = false;
      self.postMessage({ type: 'ERROR', payload: error?.message || String(error) });
    });
    return;
  }

  if (type === 'INTERRUPT_GENERATION') {
    handleInterrupt();
    return;
  }

  if (type === 'CLEAR_KV_CACHE') {
    handleClearKVCache();
    return;
  }

  if (type === 'LOAD_AND_BLIT_MODEL') {
    await handleLoadAndBlitModel(e.data);
    return;
  }

  self.postMessage({ type: 'ERROR', payload: `Unknown message type: ${type}` });
};

// ── LOAD_AND_BLIT_MODEL Handler ──────────────────────────────────────────────
async function handleLoadAndBlitModel(data: { fileName: string; fileSize: number; modelId?: string }) {
  const { fileName, fileSize } = data;
  activeModelId = data.modelId || 'custom';
  activeChatTemplate = '';
  activeHybridCompute = false;
  activeComputeMode = 'CPU Fallback (Wasm SIMD)';
  activeHardwareBlockReason = 'WebGPU adapter not initialized.';
  activeVramUploaded = false;
  activeVramShardCount = 0;
  activeVramUploadedBytes = 0;
  activeVramMaxShardBytes = 0;
  activeVramUploadStatus = 'VRAM upload not started.';
  isBlitting = true;

  try {
    if (!fileName) throw new Error('fileName not provided.');

    // 1. Initialize Wasm inside the Worker
    heartbeat('Initializing Sovereign WASM runtime', 0.02);
    wasmInstance = await init();
    core = new SovereignTensorCore();
    heartbeat('Igniting Sovereign hybrid compute fabric', 0.03);
    try {
      activeHybridCompute = await core.init_webgpu();
      activeHardwareBlockReason = core.get_hardware_block_reason();
    } catch (gpuError: any) {
      activeHybridCompute = false;
      activeHardwareBlockReason = `WebGPU initialization threw; executing Wasm SIMD CPU lane. Cause: ${gpuError?.message || String(gpuError)}`;
    }
    activeComputeMode = activeHybridCompute ? 'Hybrid (WebGPU)' : 'CPU Fallback (Wasm SIMD)';
    heartbeat(
      activeHybridCompute ? 'Hybrid WebGPU adapter acquired' : 'CPU fallback active',
      0.04
    );

    // 2. Allocate safe memory in Rust (64-byte aligned)
    const safeOffset = core.allocate_weights_buffer(fileSize);
    heartbeat('Allocated WASM model buffer', 0.05);

    // 3. OPFS Synchronous Blit
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(fileName);
    const accessHandle = await (fileHandle as any).createSyncAccessHandle();
    const actualFileSize = accessHandle.getSize();

    if (actualFileSize === 0) {
      accessHandle.close();
      throw new Error('OPFS file is empty — cannot blit zero bytes.');
    }

    if (actualFileSize !== fileSize) {
      accessHandle.close();
      throw new Error(`File size mismatch. OPFS: ${actualFileSize}, Expected: ${fileSize}`);
    }

    let totalRead = 0;
    while (totalRead < actualFileSize) {
      const remaining = actualFileSize - totalRead;
      const currentChunkSize = Math.min(CHUNK_SIZE, remaining);

      // CRITICAL: Fetch buffer dynamically INSIDE the loop to prevent detachment
      const memoryBuffer = wasmInstance.memory.buffer;
      const readBuffer = new Uint8Array(memoryBuffer, safeOffset + totalRead, currentChunkSize);

      const bytesRead = accessHandle.read(readBuffer, { at: totalRead });
      if (bytesRead === 0) break;
      totalRead += bytesRead;

      self.postMessage({
        type: 'BLIT_PROGRESS',
        progress: totalRead / actualFileSize,
        bytesLoaded: totalRead,
        totalBytes: actualFileSize,
      });
      heartbeat('Loading GGUF model from OPFS', 0.05 + (totalRead / actualFileSize) * 0.75);
    }

    accessHandle.close();

    // 4. Initialize Tensor Graph (GGUF Header Parse + Magic Byte Check)
    heartbeat('Parsing GGUF tensor graph', 0.85);
    core.initialize_tensor_graph();
    activeChatTemplate = typeof (core as any).get_chat_template === 'function'
      ? (core as any).get_chat_template()
      : '';

    if (activeHybridCompute) {
      try {
        heartbeat('Uploading GGUF tensors to WebGPU VRAM shards', 0.92);
        await core.upload_to_vram();
        activeVramUploaded = core.is_vram_uploaded();
        activeVramShardCount = core.get_vram_shard_count();
        activeVramUploadedBytes = core.get_vram_uploaded_bytes();
        activeVramMaxShardBytes = core.get_vram_max_shard_bytes();
        activeVramUploadStatus = core.get_vram_upload_status();
        heartbeat('VRAM upload complete; Wasm RAM retained for tokenizer zero-copy', 0.98);
      } catch (uploadError: any) {
        activeVramUploaded = false;
        activeVramUploadStatus = `VRAM upload failed; preserving CPU fallback. Cause: ${uploadError?.message || String(uploadError)}`;
        activeHardwareBlockReason = activeVramUploadStatus;
        activeComputeMode = 'CPU Fallback (Wasm SIMD)';
        heartbeat('VRAM upload failed; CPU fallback active', 0.98);
      }
    }

    // Split-allocator pending: tokenizer and CPU fallback still require gguf_ptr.
    // Do not call core.free_weights_buffer() until tensor bytes are separated from metadata/token text.

    isEngineReady = true;
    heartbeat(`Sovereign tensor graph ready — ${activeComputeMode}`, 1);

    self.postMessage({
      type: 'BLIT_COMPLETE',
      fileSize: totalRead,
      modelId: activeModelId,
      metadata: {
        architecture: typeof (core as any).get_architecture === 'function' ? (core as any).get_architecture() : '',
        tokenizerModel: typeof (core as any).get_tokenizer_model === 'function' ? (core as any).get_tokenizer_model() : '',
        hasChatTemplate: activeChatTemplate.length > 0,
        vocabSize: typeof (core as any).get_vocab_size === 'function' ? (core as any).get_vocab_size() : 0,
        eosId: core.get_eos_id(),
        computeMode: activeComputeMode,
        hybridActive: activeHybridCompute,
        hardwareBlockReason: activeHardwareBlockReason,
        vramUploaded: activeVramUploaded,
        vramShardCount: activeVramShardCount,
        vramUploadedBytes: activeVramUploadedBytes,
        vramMaxShardBytes: activeVramMaxShardBytes,
        vramUploadStatus: activeVramUploadStatus,
      },
    });
  } catch (error: any) {
    self.postMessage({
      type: 'ERROR',
      payload: error instanceof Error ? error.message : String(error),
    });
  } finally {
    isBlitting = false;
  }
}

// ── GENERATE Handler (Token Streaming via Rust Tensor Core) ──────────────────
async function handleGenerate(data: { prompt: string; messages?: { role: string; content: string }[]; maxTokens?: number; modelId?: string }) {
  if (isGenerating) {
    self.postMessage({ type: 'ERROR', payload: 'ENGINE_BUSY: Generation already in progress.' });
    return;
  }

  if (!isEngineReady || !core) {
    self.postMessage({ type: 'ERROR', payload: 'Engine not initialized. Call LOAD_AND_BLIT_MODEL first.' });
    return;
  }

  isGenerating = true;
  const generationModelId = data.modelId || activeModelId;
  const profile = getRuntimeModelProfile(generationModelId);
  const prompt = data.messages
    ? renderChatPrompt(data.messages, generationModelId, activeChatTemplate)
    : data.prompt;
  const maxTokens = clampGenerationBudget(generationModelId, data.maxTokens);
  const useHybridAsyncAbi = activeHybridCompute && activeVramUploaded;

  // 1. Prefill phase: chunked so the main thread watchdog receives heartbeats.
  let prefillTotal = 0;
  let prefillProcessed = 0;
  try {
    prefillTotal = useHybridAsyncAbi
      ? await core.begin_prefill_async(prompt)
      : core.begin_prefill(prompt);
  } catch (e: any) {
    isGenerating = false;
    self.postMessage({ type: 'ERROR', payload: `Prefill failed: ${e.message || String(e)}` });
    return;
  }

  // 2. Decode phase (yields token-by-token via setTimeout)
  let tokensGenerated = 0;
  const tokenChunks: string[] = [];
  const generationStartTime = Date.now();
  const GENERATION_TIMEOUT_MS = profile.defaultMaxNewTokens <= 32 ? 120000 : 180000;
  const PER_TOKEN_TIMEOUT_MS = 30000;
  const FIRST_VISIBLE_TIMEOUT_MS = 45000;
  const MAX_BLANK_OR_CONTROL_TOKENS = 24;
  const MAX_REPEAT_TOKENS = 18;
  let blankOrControlTokens = 0;
  let repeatedTokenStreak = 0;
  let lastDecoded = '';

  const BASE_T = 0.8;
  const LAMBDA = 3.0;

  async function prefillStep() {
    if (!isGenerating) return;

    try {
      const processed = useHybridAsyncAbi
        ? await core!.prefill_next_chunk_async(PREFILL_CHUNK_TOKENS)
        : core!.prefill_next_chunk(PREFILL_CHUNK_TOKENS);
      prefillProcessed += processed;
      const progress = prefillTotal > 0 ? Math.min(0.95, prefillProcessed / prefillTotal) : 1;
      heartbeat(`${useHybridAsyncAbi ? 'Hybrid async ABI prefill' : 'Prefilling KV cache'} ${prefillProcessed}/${prefillTotal}`, progress);
      if (!core!.is_prefill_complete()) {
        activeTimeout = setTimeout(() => { void prefillStep(); }, 0);
        return;
      }
    } catch (e: any) {
      isGenerating = false;
      self.postMessage({ type: 'ERROR', payload: `Prefill failed: ${e.message || String(e)}` });
      return;
    }

    heartbeat('Prefill complete. Decoding response', 1);
    void decodeStep();
  }

  async function decodeStep() {
    // Total generation watchdog — guard against runaway inference
    if (Date.now() - generationStartTime > GENERATION_TIMEOUT_MS) {
      isGenerating = false;
      const partial = stripStopSequences(tokenChunks.join(''), generationModelId);
      if (partial) {
        self.postMessage({
          type: 'INFERENCE_COMPLETE',
          fullText: partial,
          finishReason: 'timeout-partial',
        });
      } else {
        self.postMessage({ type: 'ERROR', payload: `TIMEOUT: Total generation exceeded ${Math.round(GENERATION_TIMEOUT_MS / 1000)}s before visible text.` });
      }
      return;
    }

    if (!isGenerating || tokensGenerated >= maxTokens) {
      isGenerating = false;
      const fullText = stripStopSequences(tokenChunks.join(''), generationModelId);
      self.postMessage({
        type: 'INFERENCE_COMPLETE',
        fullText: fullText || 'Sovereign WASM completed without visible decoded text. Check tokenizer/chat-template compatibility for this GGUF.',
        finishReason: tokensGenerated >= maxTokens ? 'max-tokens' : 'complete',
      });
      return;
    }

    let tokenId: number;
    const tokenStartTime = Date.now();
    try {
      tokenId = useHybridAsyncAbi
        ? await core!.decode_next_token_async(0, tokensGenerated, Math.random())
        : core!.generate_next_token();
    } catch (e: any) {
      isGenerating = false;
      self.postMessage({ type: 'ERROR', payload: `Decode failed: ${e.message || String(e)}` });
      return;
    }

    // Per-token watchdog — guard against blocked single forward pass
    if (Date.now() - tokenStartTime > PER_TOKEN_TIMEOUT_MS) {
      isGenerating = false;
      self.postMessage({ type: 'ERROR', payload: 'TIMEOUT: Single token generation exceeded 30-second limit.' });
      return;
    }

    // Model-agnostic EOS check via C-ABI export
    if (tokenId === core!.get_eos_id()) {
      isGenerating = false;
      const fullText = tokenChunks.join('');
      self.postMessage({
        type: 'INFERENCE_COMPLETE',
        fullText: fullText || ' [End of Sovereign Generation]',
      });
      return;
    }

    const decoded = core!.decode_single_token(tokenId);
    const isControlToken = /^<\|.*\|>$/.test(decoded.trim()) || /^<\/?s>$/.test(decoded.trim()) || /^<.*>$/.test(decoded.trim());
    const isBlankToken = decoded.trim().length === 0;

    if (decoded === lastDecoded && decoded.length > 0) {
      repeatedTokenStreak++;
    } else {
      repeatedTokenStreak = 0;
    }
    lastDecoded = decoded;

    tokenChunks.push(decoded);
    tokensGenerated++;

    if (isControlToken || isBlankToken) {
      blankOrControlTokens++;
    } else {
      blankOrControlTokens = 0;
    }

    // Epistemic telemetry — Rust-native entropy from RunState.logits
    const epistemicData = core!.compute_epistemic_state(BASE_T, LAMBDA);
    const entropy = epistemicData[0];
    const velocity = epistemicData[1];
    const adaptiveTemp = epistemicData[2];

    const rawText = tokenChunks.join('');
    const reachedStopSequence = profile.stopSequences.some(stop => rawText.includes(stop));
    const fullText = stripStopSequences(rawText, generationModelId);

    if (reachedStopSequence) {
      isGenerating = false;
      self.postMessage({
        type: 'INFERENCE_COMPLETE',
        fullText,
        finishReason: 'stop-sequence',
      });
      return;
    }

    if (!fullText && Date.now() - generationStartTime > FIRST_VISIBLE_TIMEOUT_MS) {
      isGenerating = false;
      self.postMessage({
        type: 'ERROR',
        payload: `NO_VISIBLE_TOKENS: ${profile.modelId} produced no visible text within ${Math.round(FIRST_VISIBLE_TIMEOUT_MS / 1000)}s. Verify tokenizer and chat template compatibility.`,
      });
      return;
    }

    if (blankOrControlTokens >= MAX_BLANK_OR_CONTROL_TOKENS || repeatedTokenStreak >= MAX_REPEAT_TOKENS) {
      isGenerating = false;
      const partial = stripStopSequences(tokenChunks.join(''), generationModelId);
      if (partial) {
        self.postMessage({
          type: 'INFERENCE_COMPLETE',
          fullText: partial,
          finishReason: blankOrControlTokens >= MAX_BLANK_OR_CONTROL_TOKENS ? 'blank-control-guard' : 'repeat-guard',
        });
      } else {
        self.postMessage({
          type: 'ERROR',
          payload: `NO_VISIBLE_TOKENS: ${profile.modelId} emitted only repeated/control tokens. Verify tokenizer and chat template compatibility.`,
        });
      }
      return;
    }

    self.postMessage({
      type: 'INFERENCE_CHUNK',
      token: decoded,
      fullText,
      entropy,
      velocity,
      adaptiveTemp,
    });

    // Use queueMicrotask for low-latency token streaming.
    // Every 10 tokens, yield via setTimeout to prevent UI starvation.
    if (tokensGenerated % 10 === 0) {
      activeTimeout = setTimeout(() => { void decodeStep(); }, 0);
    } else {
      queueMicrotask(() => { void decodeStep(); });
    }
  }

  void prefillStep();
}

// ── INTERRUPT_GENERATION Handler ─────────────────────────────────────────────
function handleInterrupt() {
  if (!isGenerating) return;

  if (activeTimeout) {
    clearTimeout(activeTimeout);
    activeTimeout = null;
  }
  isGenerating = false;

  self.postMessage({ type: 'ABORTED' });
}

// ── CLEAR_KV_CACHE Handler ───────────────────────────────────────────────────
function handleClearKVCache() {
  if (activeTimeout) {
    clearTimeout(activeTimeout);
    activeTimeout = null;
  }
  isGenerating = false;

  if (core) {
    core.clear_kv_cache();
  }

  self.postMessage({ type: 'KV_CACHE_CLEARED' });
}
