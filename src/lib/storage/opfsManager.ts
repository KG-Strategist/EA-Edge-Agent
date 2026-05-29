import { Logger } from '../logger';

export type DownloadStatus = 'idle' | 'downloading' | 'paused' | 'complete' | 'error';

export interface DownloadCheckpoint {
  modelId: string;
  modelUrl: string;
  bytesDownloaded: number;
  totalBytes: number;
  lastUpdated: number;
}

export class OPFSManager {
  private static readonly GGUF_MAGIC = new Uint8Array([71, 71, 85, 70]); // "GGUF"
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_RETRY_MS = 1000;

  /** Generate OPFS filename for a given model ID. */
  private static getModelFilename(modelId: string): string {
    const safe = modelId.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${safe}.gguf`;
  }

  /** Generate temp filename for atomic writes. */
  private static getTempFilename(modelId: string): string {
    return `${this.getModelFilename(modelId)}.tmp`;
  }

  /** Generate checkpoint filename for resumable downloads. */
  private static getCheckpointFilename(modelId: string): string {
    return `${this.getModelFilename(modelId)}.checkpoint.json`;
  }

  /**
   * Streams a GGUF model directly from the network to OPFS.
   * Bypasses the JS Garbage Collector — chunks flow from network → disk.
   */
  public static async hydrateModel(
    modelUrl: string,
    modelId: string,
    onProgress?: (bytesDownloaded: number, totalBytes: number) => void
  ): Promise<void> {
    let lastError: Error | null = null;
    const root = await navigator.storage.getDirectory();

    const checkpoint = await this.readCheckpoint(root, modelId);
    if (checkpoint && checkpoint.modelUrl !== modelUrl) {
      Logger.warn(`[OPFS] Model URL changed for ${modelId}; clearing old temp/checkpoint state.`);
      await this.cleanupTempFile(modelId);
      await this.clearCheckpoint(root, modelId);
    }

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        Logger.info(`[OPFS] Hydration attempt ${attempt}/${this.MAX_RETRIES}: ${modelUrl} → ${this.getModelFilename(modelId)}`);

        let resumeFrom = await this.getResumableOffset(root, modelId, modelUrl);

        // Dispatch download start event
        window.dispatchEvent(new CustomEvent('EA_DOWNLOAD_STATE_UPDATE', {
          detail: {
            isActive: true,
            status: 'Downloading' as const,
            modelId,
            progressPercentage: 0,
            progressText: resumeFrom > 0 ? `Resuming model download from ${resumeFrom.toLocaleString()} bytes...` : 'Connecting to model repository...',
          },
        }));

        const headers = new Headers();
        if (resumeFrom > 0) {
          headers.set('Range', `bytes=${resumeFrom}-`);
        }

        const response = await fetch(modelUrl, { headers });
        if (!response.ok) {
          if (response.status === 416 && resumeFrom > 0) {
            const expectedTotal = this.parseContentRangeTotal(response.headers.get('content-range'));
            const tempSize = await this.getTempFileSize(root, modelId);
            if (expectedTotal && tempSize === expectedTotal) {
              Logger.info('[OPFS] Range already complete; validating temp model before commit.');
              await this.validateGGUFSignature(root, this.getTempFilename(modelId));
              await this.atomicCommit(root, this.getTempFilename(modelId), this.getModelFilename(modelId));
              await this.clearCheckpoint(root, modelId);
              this.dispatchDownloadComplete(modelId, attempt);
              return;
            }
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        if (!response.body) {
          throw new Error('Network stream unavailable — response.body is null.');
        }

        if (resumeFrom > 0 && response.status !== 206) {
          Logger.warn('[OPFS] Server ignored range request; restarting model download from byte 0.');
          resumeFrom = 0;
        }

        const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
        const totalBytes = response.status === 206
          ? this.parseContentRangeTotal(response.headers.get('content-range')) || resumeFrom + contentLength
          : contentLength;

        const bytesReceived = await this.writeResponseToTemp({
          root,
          response,
          modelId,
          modelUrl,
          resumeFrom,
          totalBytes,
          onProgress,
        });

        Logger.info(`[OPFS] Download complete (${bytesReceived} bytes). Validating GGUF signature...`);

        await this.validateGGUFSignature(root, this.getTempFilename(modelId));

        Logger.info('[OPFS] GGUF signature valid. Committing to permanent filename...');
        await this.atomicCommit(root, this.getTempFilename(modelId), this.getModelFilename(modelId));
        await this.clearCheckpoint(root, modelId);

        Logger.info(`[OPFS] Hydration complete. Model stored at ${this.getModelFilename(modelId)}`);

        this.dispatchDownloadComplete(modelId, attempt);

        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        Logger.warn(`[OPFS] ❌ Hydration attempt ${attempt} failed:`, lastError.message);

        const isAuthError = lastError.message.includes('HTTP 401') || lastError.message.includes('HTTP 403');
        const isNotFoundError = lastError.message.includes('HTTP 404');
        const isInvalidGGUF = lastError.message.includes('INVALID_GGUF_SIGNATURE');
        if (isInvalidGGUF) {
          await this.cleanupTempFile(modelId);
          await this.clearCheckpoint(root, modelId);
          break;
        }

        if (isAuthError || isNotFoundError) {
          break;
        }

        if (attempt < this.MAX_RETRIES) {
          const delayMs = this.BASE_RETRY_MS * Math.pow(2, attempt - 1);
          Logger.info(`[OPFS] Retrying in ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    let errorMessage = lastError?.message ?? 'Unknown error';
    let userMessage = `Download failed: ${errorMessage}`;

    if (errorMessage.includes('HTTP 401') || errorMessage.includes('HTTP 403')) {
      userMessage = `Download failed: Model repository requires authentication (HTTP ${errorMessage.includes('401') ? '401' : '403'}). Please sideload the GGUF file manually via Upload Model.`;
    } else if (errorMessage.includes('HTTP 404')) {
      userMessage = `Download failed: Model file not found (HTTP 404). The URL may be incorrect or the model has been removed. Please sideload via Upload Model.`;
    }

    // Dispatch error event
    window.dispatchEvent(new CustomEvent('EA_DOWNLOAD_STATE_UPDATE', {
      detail: {
        isActive: false,
        status: 'Error' as const,
        modelId,
        progressPercentage: 0,
        message: userMessage,
        progressText: userMessage,
      },
    }));

    throw new Error(userMessage);
  }

  /**
   * Checks if a specific GGUF model exists in OPFS.
   */
  public static async isModelCached(modelId: string): Promise<boolean> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.getFileHandle(this.getModelFilename(modelId));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deletes a specific GGUF model from OPFS.
   */
  public static async deleteModel(modelId: string): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(this.getModelFilename(modelId));
      Logger.info(`[OPFS] Model ${modelId} deleted successfully.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        Logger.info(`[OPFS] Model ${modelId} not found — nothing to delete.`);
      } else {
        throw error;
      }
    }
  }

  /**
    * Returns the size of a specific stored GGUF model in bytes.
    */
  public static async getModelSize(modelId: string): Promise<number> {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(this.getModelFilename(modelId));
    const file = await fileHandle.getFile();
    return file.size;
  }

  /**
   * Checks if a model file exists in OPFS.
   */
  public static async hasModel(modelId: string): Promise<boolean> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.getFileHandle(this.getModelFilename(modelId));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Returns the OPFS file handle for a specific stored GGUF model.
   * Used by inferenceWorker.ts for createSyncAccessHandle.
   */
  public static async getModelFileHandle(modelId: string): Promise<FileSystemFileHandle> {
    const root = await navigator.storage.getDirectory();
    return root.getFileHandle(this.getModelFilename(modelId));
  }

  /**
   * Evicts stale GGUF model files from OPFS that do not match the active model.
   * Call once at app bootstrap to reclaim disk space.
   * Iterates the OPFS root and removes any *.gguf file whose name differs from
   * the active model filename.
   */
  public static async evictStaleModels(activeModelIds: string | string[]): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      const ids = Array.isArray(activeModelIds) ? activeModelIds : [activeModelIds];
      const activeFilenames = new Set(ids.map(id => this.getModelFilename(id)));
      let evictedCount = 0;

      for await (const [entryName, entry] of (root as any).entries()) {
        if (entry.kind === 'file' && entryName.endsWith('.gguf') && !activeFilenames.has(entryName)) {
          try {
            await root.removeEntry(entryName);
            Logger.info(`[OPFS] Evicted stale model: ${entryName}`);
            evictedCount++;
          } catch (evictError) {
            Logger.warn(`[OPFS] Failed to evict ${entryName}:`, evictError instanceof Error ? evictError.message : String(evictError));
          }
        }
      }

      if (evictedCount > 0) {
        Logger.info(`[OPFS] Eviction complete. Removed ${evictedCount} stale model(s). Freed ~${evictedCount * 500} MB (estimated).`);
      } else {
        Logger.info('[OPFS] No stale models to evict.');
      }
    } catch (error) {
      Logger.warn('[OPFS] Eviction scan failed:', error instanceof Error ? error.message : String(error));
    }
  }

  // ─── Internal Methods ─────────────────────────────────────────────────────

  private static async writeResponseToTemp({
    root,
    response,
    modelId,
    modelUrl,
    resumeFrom,
    totalBytes,
    onProgress,
  }: {
    root: FileSystemDirectoryHandle;
    response: Response;
    modelId: string;
    modelUrl: string;
    resumeFrom: number;
    totalBytes: number;
    onProgress?: (bytesDownloaded: number, totalBytes: number) => void;
  }): Promise<number> {
    if (!response.body) throw new Error('Network stream unavailable — response.body is null.');

    const tempHandle = await root.getFileHandle(this.getTempFilename(modelId), { create: true });
    const writable = await tempHandle.createWritable({ keepExistingData: true });
    if (resumeFrom > 0) {
      await writable.seek(resumeFrom);
    } else {
      await writable.truncate(0);
    }

    const reader = response.body.getReader();
    let bytesReceived = resumeFrom;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
        bytesReceived += value.byteLength;

        await this.writeCheckpoint(root, {
          modelId,
          modelUrl,
          bytesDownloaded: bytesReceived,
          totalBytes,
          lastUpdated: Date.now(),
        });

        if (onProgress) onProgress(bytesReceived, totalBytes);
        const percent = totalBytes > 0 ? Math.round((bytesReceived / totalBytes) * 100) : 0;
        window.dispatchEvent(new CustomEvent('EA_DOWNLOAD_STATE_UPDATE', {
          detail: {
            isActive: true,
            status: 'Downloading' as const,
            modelId,
            progressPercentage: percent,
            progressText: `Downloading model weights... ${percent}%`,
          },
        }));
      }
    } finally {
      await writable.close();
      reader.releaseLock();
    }

    return bytesReceived;
  }

  private static async getResumableOffset(
    root: FileSystemDirectoryHandle,
    modelId: string,
    modelUrl: string
  ): Promise<number> {
    const checkpoint = await this.readCheckpoint(root, modelId);
    if (!checkpoint || checkpoint.modelUrl !== modelUrl) return 0;
    const tempSize = await this.getTempFileSize(root, modelId);
    return Math.max(0, Math.min(checkpoint.bytesDownloaded, tempSize));
  }

  private static async getTempFileSize(root: FileSystemDirectoryHandle, modelId: string): Promise<number> {
    try {
      const tempHandle = await root.getFileHandle(this.getTempFilename(modelId));
      const tempFile = await tempHandle.getFile();
      return tempFile.size;
    } catch {
      return 0;
    }
  }

  private static parseContentRangeTotal(contentRange: string | null): number | null {
    if (!contentRange) return null;
    const match = contentRange.match(/\/([0-9]+)$/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private static async readCheckpoint(
    root: FileSystemDirectoryHandle,
    modelId: string
  ): Promise<DownloadCheckpoint | null> {
    try {
      const handle = await root.getFileHandle(this.getCheckpointFilename(modelId));
      const text = await (await handle.getFile()).text();
      return JSON.parse(text) as DownloadCheckpoint;
    } catch {
      return null;
    }
  }

  private static async writeCheckpoint(
    root: FileSystemDirectoryHandle,
    checkpoint: DownloadCheckpoint
  ): Promise<void> {
    const handle = await root.getFileHandle(this.getCheckpointFilename(checkpoint.modelId), { create: true });
    const writable = await handle.createWritable();
    await writable.write(new Blob([JSON.stringify(checkpoint)], { type: 'application/json' }));
    await writable.close();
  }

  private static async clearCheckpoint(root: FileSystemDirectoryHandle, modelId: string): Promise<void> {
    try {
      await root.removeEntry(this.getCheckpointFilename(modelId));
    } catch {
      // Checkpoint didn't exist — that's fine.
    }
  }

  private static dispatchDownloadComplete(modelId: string, attempt: number): void {
    try {
      window.dispatchEvent(new CustomEvent('EA_DOWNLOAD_STATE_UPDATE', {
        detail: {
          isActive: false,
          status: 'Complete' as const,
          modelId,
          progressPercentage: 100,
          progressText: 'Download complete',
        },
      }));
      Logger.warn(`[OPFS] ✅ hydrateModel success exit — modelId: ${modelId}, attempt: ${attempt}`);
    } catch (dispatchError) {
      Logger.warn(`[OPFS] ⚠️ dispatchEvent for Complete threw: ${dispatchError instanceof Error ? dispatchError.message : String(dispatchError)} — continuing to return`);
    }
  }

  /**
   * Validates the first 4 bytes of a file match the GGUF magic header.
   * Throws INVALID_GGUF_SIGNATURE if validation fails.
   */
  private static async validateGGUFSignature(
    root: FileSystemDirectoryHandle,
    filename: string
  ): Promise<void> {
    const fileHandle = await root.getFileHandle(filename);
    const file = await fileHandle.getFile();

    if (file.size < 4) {
      await root.removeEntry(filename);
      throw new Error('INVALID_GGUF_SIGNATURE: File too small to be a valid GGUF model.');
    }

    const magicBuffer = await file.slice(0, 4).arrayBuffer();
    const magicBytes = new Uint8Array(magicBuffer);

    for (let i = 0; i < 4; i++) {
      if (magicBytes[i] !== this.GGUF_MAGIC[i]) {
        await root.removeEntry(filename);
        throw new Error(
          `INVALID_GGUF_SIGNATURE: Expected [71,71,85,70] ("GGUF"), got [${magicBytes.join(',')}]`
        );
      }
    }
  }

  /**
   * Atomically commits a temp file to the permanent filename.
   * Removes the old file first (if exists), then renames via copy+delete.
   * Note: OPFS doesn't support rename, so we copy then delete.
   */
  private static async atomicCommit(
    root: FileSystemDirectoryHandle,
    tempName: string,
    permanentName: string
  ): Promise<void> {
    try {
      await root.removeEntry(permanentName);
    } catch {
      // Old file didn't exist — that's fine
    }

    const tempHandle = await root.getFileHandle(tempName);
    const tempFile = await tempHandle.getFile();

    const permHandle = await root.getFileHandle(permanentName, { create: true });
    const permWritable = await permHandle.createWritable();

    await tempFile.stream().pipeTo(permWritable);

    await root.removeEntry(tempName);
  }

  /**
   * Cleans up the temporary file if it exists.
   */
  private static async cleanupTempFile(modelId: string): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(this.getTempFilename(modelId));
    } catch {
      // Temp file didn't exist — that's fine
    }
  }
}
