import { db } from '../db';
import { Logger } from '../logger';

type ConnectionListener = (isConnected: boolean) => void;

const DEFAULT_DAEMON_URL = 'ws://127.0.0.1:8080';

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

export class LocalDaemonProvider {
  private ws: WebSocket | null = null;
  private _isConnected = false;
  private _connectionAttempted = false;
  private pendingResolvers = new Map<string, {
    resolve: (value: string) => void;
    reject: (reason: Error) => void;
    onToken?: (token: string) => void;
  }>();
  private listeners = new Set<ConnectionListener>();
  private daemonUrl = DEFAULT_DAEMON_URL;
  private currentGenerationId: string | null = null;

  public get isConnected() { return this._isConnected; }

  public async isEnabled(): Promise<boolean> {
    try {
      const setting = await db.app_settings.get('daemonEnabled');
      return setting?.value === true;
    } catch {
      return false;
    }
  }

  public subscribe(listener: ConnectionListener) {
    this.listeners.add(listener);
    listener(this._isConnected);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach(l => l(this._isConnected));
  }

  private async getDaemonUrl(): Promise<string> {
    if (this.daemonUrl !== DEFAULT_DAEMON_URL) return this.daemonUrl;
    try {
      const setting = await db.app_settings.get('daemonWsUrl');
      if (setting?.value) {
        this.daemonUrl = setting.value;
      }
    } catch {
      // Fallback to default
    }
    return this.daemonUrl;
  }

  /**
   * Attempts to connect to the local Rust daemon.
   * Caches failures to prevent 2-second penalties on the hot path.
   */
  public async pingDaemon(forceRetry = false): Promise<boolean> {
    if (this._isConnected) return true;
    if (this._connectionAttempted && !forceRetry) return false;

    if (!await this.isEnabled()) {
      this._connectionAttempted = true;
      return false;
    }

    this._connectionAttempted = true;
    const url = await this.getDaemonUrl();

    return new Promise((resolve) => {
      try {
        const socket = new WebSocket(url);

        const timeout = setTimeout(() => {
          if (socket.readyState !== WebSocket.OPEN) {
            socket.close();
            this.ws = null;
            resolve(false);
          }
        }, 2000);

        socket.onopen = () => {
          clearTimeout(timeout);
          this.ws = socket;
          this._isConnected = true;
          this.setupMessageHandlers();
          this.notifyListeners();
          Logger.info('Local Daemon Detected. Offloading inference to native OS.');
          resolve(true);
        };

        socket.onerror = () => {
          clearTimeout(timeout);
          this.ws = null;
          resolve(false);
        };
      } catch {
        resolve(false);
      }
    });
  }

  private setupMessageHandlers() {
    if (!this.ws) return;

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const resolver = this.pendingResolvers.get(data.id);
        if (!resolver) return;

        // Ignore chunks from a generation that was already aborted
        if (data.id !== this.currentGenerationId) {
          return;
        }

        if (data.type === 'INFERENCE_CHUNK') {
          if (resolver.onToken) resolver.onToken(data.token);
        } else if (data.type === 'INFERENCE_COMPLETE') {
          resolver.resolve(data.fullText);
          this.pendingResolvers.delete(data.id);
          if (this.currentGenerationId === data.id) this.currentGenerationId = null;
        } else if (data.type === 'ERROR') {
          resolver.reject(new Error(data.message));
          this.pendingResolvers.delete(data.id);
          if (this.currentGenerationId === data.id) this.currentGenerationId = null;
        }
      } catch (err) {
        Logger.warn('[LocalDaemon] Failed to parse daemon message:', err);
      }
    };

    this.ws.onclose = () => {
      this._isConnected = false;
      this.ws = null;
      this.notifyListeners();
      this.pendingResolvers.forEach(r => r.reject(new Error('Daemon disconnected mid-generation.')));
      this.pendingResolvers.clear();
    };
  }

  /**
   * Streams token-by-token inference from the native OS daemon.
   * Accepts a message array for proper chat template support.
   * maxTokens: 2048 (native OS has full system RAM, no browser VRAM limits).
   */
  public async generateText(
    messages: { role: string; content: string }[],
    onToken?: (token: string) => void
  ): Promise<string> {
    if (!this._isConnected || !this.ws) throw new Error('Daemon not connected.');

    const id = generateId();
    this.currentGenerationId = id;

    return new Promise((resolve, reject) => {
      this.pendingResolvers.set(id, { resolve, reject, onToken });

      this.ws!.send(JSON.stringify({
        id,
        type: 'GENERATE',
        messages,
        maxTokens: 2048,
      }));
    });
  }

  /**
   * Abort an in-flight generation. Tells the daemon to drop compute and rejects
   * the pending promise so the UI isn't stuck waiting.
   */
  public abortGeneration(): void {
    if (!this.currentGenerationId) return;

    const id = this.currentGenerationId;
    const resolver = this.pendingResolvers.get(id);

    // Tell the native OS daemon to drop compute
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ABORT', id }));
    }

    // Reject the pending promise on main thread
    if (resolver) {
      resolver.reject(new Error('AbortError'));
      this.pendingResolvers.delete(id);
    }

    this.currentGenerationId = null;
    Logger.info('[LocalDaemon] Generation aborted. Mutex freed.');
  }

  /**
   * Reset the daemon session so the next prompt starts with a clean context.
   * Keeps the WebSocket connection alive — only clears the conversation state.
   */
  public resetSession(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'RESET_SESSION' }));
    }
    this.currentGenerationId = null;
    Logger.info('[LocalDaemon] Session reset — KV cache cleared.');
  }
}

export const localDaemon = new LocalDaemonProvider();
