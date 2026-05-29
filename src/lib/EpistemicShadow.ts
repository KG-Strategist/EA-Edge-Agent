import { Logger } from './logger';
import { db } from './db';
import { localDaemon } from './providers/LocalDaemonProvider';
import { sovereignEngine } from './wasm/SovereignEngine';
import { distillDelta } from './aiEngine';

interface DistillationDelta {
  userMessage: string;
  aiResponse: string;
}

type DistillationMode = 'off' | 'wasm' | 'daemon' | 'auto';

export function isDistillableExchange(userMessage: string, aiResponse: string): boolean {
  const response = aiResponse.trim();
  if (response.length < 24) return false;

  const combined = `${userMessage}\n${response}`.toLowerCase();
  const blockedMarkers = [
    'structurally,',
    'unsupported_tensor_type',
    'cached gguf',
    'worker not available',
    'watchdog_timeout',
    'neuro-symbolic fallback',
    'critical guardrail intercept',
    'i do not have source-backed structural data',
    'i lack the structural data',
    'i don\'t recognize',
    'could you clarify',
  ];

  if (blockedMarkers.some(marker => combined.includes(marker))) return false;
  if (/\b(updats|areincorporat|reincorporat)\b/.test(combined)) return false;
  return true;
}

export class EpistemicShadowOrchestrator {
  private queue: DistillationDelta[] = [];
  private abortController: AbortController | null = null;
  private isRunning = false;

  /**
   * Enqueue a chat turn for background distillation.
   * Starts the idle processing loop if not already running.
   */
  public enqueueDelta(userMessage: string, aiResponse: string): void {
    if (!isDistillableExchange(userMessage, aiResponse)) return;

    this.queue.push({ userMessage, aiResponse });
    if (!this.isRunning) {
      this.isRunning = true;
      this.processQueue();
    }
  }

  /**
   * Cancel any background distillation in progress. The user's next prompt
   * always takes priority — we drop everything and yield the engine.
   */
  public interrupt(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isRunning = false;
  }

  /**
   * Non-blocking recursive idle loop via setTimeout.
   * Checks settings, engine readiness, and processes queue items one at a time.
   */
  private async processQueue(): Promise<void> {
    if (!this.isRunning) return;

    // Check user settings
    let mode: DistillationMode = 'auto';
    try {
      const setting = await db.app_settings.get('backgroundDistillation');
      mode = (setting?.value as DistillationMode) || 'auto';
    } catch {
      // Default to auto if DB unavailable
    }

    if (mode === 'off') {
      this.queue = [];
      this.isRunning = false;
      return;
    }

    if (this.queue.length === 0) {
      this.isRunning = false;
      return;
    }

    // Check engine readiness
    const daemonReady = localDaemon.isConnected;
    const wasmReady = sovereignEngine.isIdle;

    const shouldUseDaemon = (mode === 'daemon') || (mode === 'auto' && daemonReady);
    const shouldUseWasm = (mode === 'wasm') || (mode === 'auto' && !daemonReady);

    if (shouldUseDaemon) {
      // Daemon is ready — proceed immediately
      await this.executeNext(mode);
    } else if (shouldUseWasm && wasmReady) {
      // Wasm is idle — proceed
      await this.executeNext(mode);
    } else {
      // Engine busy — retry in 1000ms
      setTimeout(() => this.processQueue(), 1000);
    }
  }

  /**
   * Execute distillation on the next queue item.
   * Creates a fresh AbortController for preemption.
   */
  private async executeNext(_mode: DistillationMode): Promise<void> {
    if (this.queue.length === 0) {
      this.isRunning = false;
      return;
    }

    this.abortController = new AbortController();
    const { signal } = this.abortController;
    const delta = this.queue.shift()!;
    const text = `${delta.userMessage}\n\n${delta.aiResponse}`;

    try {
      await distillDelta(text, signal);

      // Success — process next item immediately
      setTimeout(() => this.processQueue(), 0);
    } catch (err) {
      if (err instanceof Error && err.message === 'AbortError') {
        // Preempted by user — re-queue at front
        this.queue.unshift(delta);
        this.abortController = null;
        Logger.info('[EpistemicShadow] Distillation aborted. Delta re-queued.');
        // Wait 500ms before retrying
        setTimeout(() => this.processQueue(), 500);
      } else {
        // Other error — log and retry after delay
        Logger.warn('[EpistemicShadow] Distillation error:', err);
        this.abortController = null;
        setTimeout(() => this.processQueue(), 2000);
      }
    }
  }

  /**
   * Phase 4.x scaffold: Trigger full corpus training pipeline.
   * Reserved for Local OPFS Corpus Compilation and autonomous knowledge harvesting.
   */
  public async triggerCorpusTraining() {
    Logger.info("[EPISTEMIC SHADOW] Corpus Training Triggered. Reserved for Phase 4.x Local OPFS Corpus Compilation.");
  }
}

export const epistemicShadow = new EpistemicShadowOrchestrator();
