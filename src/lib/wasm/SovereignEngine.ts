import { Logger } from '../logger';
import { OPFSManager } from '../storage/opfsManager';

/**
 * SovereignEngine — Dumb Router to Worker-Owned Wasm VM
 *
 * The Wasm VM lives entirely inside the inference worker. This class:
 *   1. Discovers the GGUF file size via OPFSManager (per-model)
 *   2. Validates against the VRAM Governor (fileSize + 500MB KV cache)
 *   3. Spawns the worker and sends LOAD_AND_BLIT_MODEL
 *   4. Listens for BLIT_COMPLETE or ERROR with a 60s timeout
 *
 * Lifecycle:
 *   1. ensureInitialized(modelId) → bootWorkerAndLoadModel() → isReady = true
 *   2. generateText(messages, onToken) → streaming token inference
 *   3. unload() → isReady = false, initPromise = null, cleanup()
 */

const KV_CACHE_RESERVE = 536_870_912; // 500MB

interface VRAMProfile {
  limitBytes: number;
  label: string;
}

export class SovereignEngine {
  private worker: Worker | null = null;
  private isReady = false;
  private initPromise: Promise<void> | null = null;
  private activeModelId: string | null = null;
  private hardwareBlockReason = '';
  private activeComputeMode = 'CPU Fallback (Wasm SIMD)';

  // Generation mutex
  private isGenerating = false;
  private pendingReject: ((reason: Error) => void) | null = null;

  /**
   * VRAM Governor — determines max memory allocation based on device profile.
   */
  private static getVRAMProfile(): VRAMProfile {
    const ua = navigator.userAgent;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
    const deviceMemory = (navigator as any).deviceMemory;

    if (isSafari || isMobile) {
      return { limitBytes: 1.5 * 1024 * 1024 * 1024, label: 'Safari/Mobile (1.5GB)' };
    }

    if (deviceMemory && deviceMemory >= 8) {
      return { limitBytes: 3 * 1024 * 1024 * 1024, label: `Chromium/Desktop (${deviceMemory}GB RAM → 3GB)` };
    }

    return { limitBytes: 2 * 1024 * 1024 * 1024, label: 'Chromium/Desktop (default 2GB)' };
  }

  /**
   * Promise Caching: Zero CPU polling, instant resolution if already booted.
   * First call performs OPFS discovery + VRAM validation + worker boot.
   * Subsequent calls return the cached Promise immediately.
   * On failure, initPromise is reset to null to allow retries.
   */
  public async ensureInitialized(modelId?: string): Promise<void> {
    if (modelId && this.activeModelId && this.activeModelId !== modelId) {
      Logger.info(`[SovereignEngine] Model switch requested (${this.activeModelId} -> ${modelId}). Rebooting worker.`);
      this.cleanup();
    }

    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          if (!modelId) {
            throw new Error('SovereignEngine.ensureInitialized requires a modelId parameter.');
          }

          // Step 1: Discover file size from OPFS (per-model)
          const fileSize = await OPFSManager.getModelSize(modelId);
          Logger.info(`[SovereignEngine] GGUF model size: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);

          // Step 2: VRAM Governor validation
          const vram = SovereignEngine.getVRAMProfile();
          const requiredBytes = fileSize + KV_CACHE_RESERVE;

          Logger.info(
            `[SovereignEngine] VRAM Profile: ${vram.label} | Required: ${(requiredBytes / 1024 / 1024).toFixed(0)} MB (${(fileSize / 1024 / 1024).toFixed(0)} MB model + 500 MB KV cache)`
          );

          if (requiredBytes > vram.limitBytes) {
            throw new Error(
              `INSUFFICIENT_WASM_MEMORY: Model requires ${(requiredBytes / 1024 / 1024).toFixed(0)} MB but device limit is ${(vram.limitBytes / 1024 / 1024).toFixed(0)} MB (${vram.label}).`
            );
          }

          // Step 3: Spawn worker and load model
          const fileName = `${modelId.replace(/[^a-zA-Z0-9._-]/g, '_')}.gguf`;
          await this.bootWorkerAndLoadModel(fileName, fileSize, modelId);
          this.activeModelId = modelId;
          this.isReady = true;
        } catch (error) {
          this.initPromise = null;
          throw error;
        }
      })();
    }
    return this.initPromise;
  }

  /**
   * Spawns the inference worker and sends the LOAD_AND_BLIT_MODEL command.
   * Waits for BLIT_COMPLETE or ERROR with a 60-second timeout.
   */
  private async bootWorkerAndLoadModel(fileName: string, fileSize: number, modelId: string): Promise<void> {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingReject = null;
    this.isGenerating = false;
    this.isReady = false;

    this.worker = new Worker(
      new URL('../../workers/inferenceWorker.ts', import.meta.url),
      { type: 'module' }
    );

    const BLIT_TIMEOUT_MS = 60_000;

    const resultPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let handler: (e: MessageEvent) => void;
      let lastProgressBucket = -1;
      let lastHeartbeatStage = '';
      const failBoot = (error: Error) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) clearTimeout(timeoutId);
        if (handler) this.worker?.removeEventListener('message', handler);
        this.cleanup();
        reject(error);
      };

      handler = (e: MessageEvent) => {
        if (e.data.type === 'BLIT_PROGRESS') {
          const bucket = Math.floor((e.data.progress || 0) * 4) * 25;
          if (bucket !== lastProgressBucket) {
            lastProgressBucket = bucket;
            Logger.info(`[SovereignEngine] Worker blit progress: ${bucket}%`);
          }
        } else if (e.data.type === 'HEARTBEAT') {
          const stage = e.data.stage || 'unknown';
          if (stage !== lastHeartbeatStage) {
            lastHeartbeatStage = stage;
            Logger.info(`[SovereignEngine] Worker heartbeat: ${stage}`);
          }
        } else if (e.data.type === 'BLIT_COMPLETE') {
          if (settled) return;
          settled = true;
          if (timeoutId !== null) clearTimeout(timeoutId);
          this.worker!.removeEventListener('message', handler);
          this.activeComputeMode = e.data.metadata?.computeMode || 'CPU Fallback (Wasm SIMD)';
          this.hardwareBlockReason = e.data.metadata?.hardwareBlockReason || '';
          const metadata = e.data.metadata
            ? ` | arch=${e.data.metadata.architecture || 'unknown'} tokenizer=${e.data.metadata.tokenizerModel || 'unknown'} vocab=${e.data.metadata.vocabSize || 'unknown'} chatTemplate=${e.data.metadata.hasChatTemplate ? 'yes' : 'no'} compute=${this.activeComputeMode} vram=${e.data.metadata.vramUploaded ? 'uploaded' : 'not-uploaded'} shards=${e.data.metadata.vramShardCount || 0}`
            : '';
          Logger.info(`[SovereignEngine] Worker boot complete. GGUF parsed: ${e.data.fileSize} bytes.${metadata}`);
          if (e.data.metadata?.vramUploadStatus) {
            Logger.info(`[SovereignEngine] ${e.data.metadata.vramUploadStatus}`);
          }
          if (this.hardwareBlockReason) {
            Logger.warn(`[SovereignEngine] Hardware fallback reason: ${this.hardwareBlockReason}`);
          }
          resolve();
        } else if (e.data.type === 'ERROR') {
          Logger.error(`[SovereignEngine] Worker error: ${e.data.payload}`);
          failBoot(new Error(e.data.payload));
        }
      };

      this.worker!.addEventListener('message', handler);

      timeoutId = setTimeout(() => {
        Logger.error(`[SovereignEngine] BLIT_TIMEOUT: Worker exceeded ${BLIT_TIMEOUT_MS / 1000}s during model loading.`);
        failBoot(new Error(`BLIT_TIMEOUT: Worker exceeded ${BLIT_TIMEOUT_MS / 1000}s during model loading.`));
      }, BLIT_TIMEOUT_MS);

      this.worker!.onerror = (err: ErrorEvent) => {
        const details = [
          err.message,
          err.filename ? `${err.filename}:${err.lineno}:${err.colno}` : '',
          err.error?.stack,
        ].filter(Boolean).join(' | ');
        const message = details || 'Worker crashed during boot.';
        Logger.error(`[SovereignEngine] Worker crash: ${message}`);
        failBoot(new Error(`Worker terminated: ${message}`));
      };

      this.worker!.postMessage({
        type: 'LOAD_AND_BLIT_MODEL',
        fileName,
        fileSize,
        modelId,
      });
    });

    return resultPromise;
  }

  /**
   * Returns the active worker (for direct message passing).
   */
  public getWorker(): Worker | null {
    return this.worker;
  }

  /**
   * True when no foreground generation is active.
   */
  public get isIdle(): boolean {
    return !this.isGenerating;
  }

  /**
   * Stop an in-flight generation. Sends an interrupt to the worker.
   */
  public abortGeneration(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'INTERRUPT_GENERATION' });
    }
    if (this.pendingReject) {
      this.pendingReject(new Error('AbortError'));
      this.pendingReject = null;
    }
    this.isGenerating = false;
    Logger.info('[SovereignEngine] Generation aborted. Mutex freed.');
  }

  /**
   * Drop the conversation context without unloading the model.
   */
  public clearContext(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'CLEAR_KV_CACHE' });
    }
    Logger.info('[SovereignEngine] KV cache clear requested.');
  }

  /**
   * Streams token-by-token inference from the worker.
   */
  public async generateText(
    messages: { role: string; content: string }[],
    onToken?: (token: string) => void,
    maxTokens?: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.isReady) {
        return reject(new Error('Engine offline.'));
      }
      if (!this.worker) {
        this.cleanup();
        return reject(new Error('Worker not available.'));
      }

      this.isGenerating = true;
      this.pendingReject = reject;
      const startTime = performance.now();
      let firstTokenTime: number | null = null;
      let tokenEvents = 0;

      const logInferenceTelemetry = (finishReason: string) => {
        const completedAt = performance.now();
        const totalMs = completedAt - startTime;
        const ttftMs = firstTokenTime === null ? null : firstTokenTime - startTime;
        const totalSeconds = Math.max(totalMs / 1000, 0.001);
        const tps = tokenEvents / totalSeconds;
        Logger.info(
          `[SovereignEngine] Inference telemetry — finish=${finishReason} compute=${this.activeComputeMode} ` +
          `TTFT=${ttftMs === null ? 'n/a' : `${ttftMs.toFixed(0)}ms`} ` +
          `TPS=${tps.toFixed(2)} token-events/s total=${totalMs.toFixed(0)}ms tokens=${tokenEvents}`
        );
        if (this.hardwareBlockReason) {
          Logger.warn(`[SovereignEngine] Inference hardware block reason: ${this.hardwareBlockReason}`);
        }
      };

      // Watchdog timer — fires if no worker message received for 120 seconds
      let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

      const resetWatchdog = () => {
        if (watchdogTimer !== null) clearTimeout(watchdogTimer);
        watchdogTimer = setTimeout(() => {
          Logger.error('[SovereignEngine] WATCHDOG_TIMEOUT: No response from inference worker for 120 seconds.');
          this.worker?.removeEventListener('message', handler);
          logInferenceTelemetry('watchdog-timeout');
          this.cleanup();
          reject(new Error('WATCHDOG_TIMEOUT: Inference worker unresponsive for 120 seconds.'));
        }, 120000);
      };

      const handler = (e: MessageEvent) => {
        resetWatchdog();
        if (e.data.type === 'INFERENCE_CHUNK') {
          tokenEvents++;
          if (firstTokenTime === null) {
            firstTokenTime = performance.now();
          }
          if (onToken) onToken(e.data.fullText);
        } else if (e.data.type === 'HEARTBEAT') {
          window.dispatchEvent(new CustomEvent('EA_AI_PROGRESS', {
            detail: {
              text: e.data.stage || 'Sovereign worker active',
              progress: typeof e.data.progress === 'number' ? e.data.progress : 0,
            },
          }));
        } else if (e.data.type === 'INFERENCE_COMPLETE') {
          if (watchdogTimer !== null) clearTimeout(watchdogTimer);
          this.worker!.removeEventListener('message', handler);
          this.pendingReject = null;
          this.isGenerating = false;
          logInferenceTelemetry(e.data.finishReason || 'complete');
          resolve(e.data.fullText);
        } else if (e.data.type === 'ERROR') {
          if (watchdogTimer !== null) clearTimeout(watchdogTimer);
          this.worker!.removeEventListener('message', handler);
          logInferenceTelemetry(`error:${e.data.payload || 'unknown'}`);
          this.cleanup();
          reject(new Error(e.data.payload));
        } else if (e.data.type === 'ABORTED') {
          if (watchdogTimer !== null) clearTimeout(watchdogTimer);
          this.worker!.removeEventListener('message', handler);
          this.pendingReject = null;
          this.isGenerating = false;
          logInferenceTelemetry('aborted');
          reject(new Error('AbortError'));
        }
      };

      this.worker.addEventListener('message', handler);
      resetWatchdog();
      this.worker.postMessage({
        type: 'GENERATE',
        messages,
        maxTokens: maxTokens ?? undefined,
        modelId: this.activeModelId,
      });
    });
  }

  /**
   * Unloads the engine: terminates the worker and resets all state.
   */
  public unload(): void {
    Logger.info('[SovereignEngine] Unloading Sovereign Engine...');
    this.isReady = false;
    this.initPromise = null;
    this.activeModelId = null;
    this.cleanup();
  }

  /**
   * Internal cleanup — terminates worker and nullifies references.
   */
  private cleanup(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingReject = null;
    this.isGenerating = false;
    this.isReady = false;
    this.initPromise = null;
    this.activeModelId = null;
    Logger.info('[SovereignEngine] Engine resources released.');
  }
}

/**
 * Singleton instance for React application access.
 */
export const sovereignEngine = new SovereignEngine();
