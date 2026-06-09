import { Logger } from '../lib/logger';
import { db } from '../lib/db';

const GGUF_MAGIC = new Uint8Array([71, 71, 85, 70]); // "GGUF"

/**
 * SideloadService handles the air-gapped ingestion of GGUF model weights
 * directly into OPFS for the Sovereign Engine (zero-copy pipeline).
 */
export class SideloadService {
  /**
   * Validates the first 4 bytes of a file match the GGUF magic header.
   */
  static async validateGGUFSignature(file: File): Promise<void> {
    if (file.size < 4) {
      throw new Error('INVALID_GGUF_SIGNATURE: File too small to be a valid GGUF model.');
    }
    const magicBuffer = await file.slice(0, 4).arrayBuffer();
    const magicBytes = new Uint8Array(magicBuffer);
    for (let i = 0; i < 4; i++) {
      if (magicBytes[i] !== GGUF_MAGIC[i]) {
        throw new Error(
          `INVALID_GGUF_SIGNATURE: Expected [71,71,85,70] ("GGUF"), got [${magicBytes.join(',')}]`
        );
      }
    }
  }

  /** Generate OPFS filename for a given model ID. */
  private static getModelFilename(modelId: string): string {
    const safe = modelId.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${safe}.gguf`;
  }

  /**
   * Streams a GGUF model file directly from local disk into OPFS.
   * Zero-copy: file.stream().pipeTo(writable) bypasses the JS heap.
   */
  static async processModelSideload(
    file: File,
    modelId: string,
    onProgress?: (bytesWritten: number, totalBytes: number) => void
  ): Promise<void> {
    if (!file.name.endsWith('.gguf')) {
      throw new Error('Only GGUF format is supported for the Sovereign Engine.');
    }

    const filename = this.getModelFilename(modelId);

    Logger.info(`[OPFS Sideload] Validating GGUF signature for ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)...`);
    await SideloadService.validateGGUFSignature(file);
    Logger.info('[OPFS Sideload] GGUF signature valid. Streaming to OPFS...');

    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry(filename); } catch { /* Old file didn't exist */ }

    const permHandle = await root.getFileHandle(filename, { create: true });
    const writable = await permHandle.createWritable();

    let bytesWritten = 0;
    const totalBytes = file.size;

    const progressStream = new TransformStream({
      transform(chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) {
        bytesWritten += chunk.byteLength;
        if (onProgress) onProgress(bytesWritten, totalBytes);
        controller.enqueue(chunk);
      },
    });

    try {
      await file.stream().pipeThrough(progressStream).pipeTo(writable);
    } catch (error) {
      try { await root.removeEntry(filename); } catch { /* Partial file didn't exist */ }
      throw error;
    }

    const storedFile = await (await root.getFileHandle(filename)).getFile();
    if (storedFile.size !== totalBytes) {
      try { await root.removeEntry(filename); } catch { /* Partial file already gone */ }
      throw new Error(`OPFS_WRITE_INCOMPLETE: expected ${totalBytes} bytes, wrote ${storedFile.size} bytes.`);
    }
    await SideloadService.validateGGUFSignature(storedFile);

    Logger.info(`[OPFS Sideload] Model stored at ${filename}`);
  }

  /**
   * Checks if a specific GGUF model exists in OPFS.
   */
  static async isModelCached(modelId: string): Promise<boolean> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.getFileHandle(this.getModelFilename(modelId));
      return true;
    } catch { return false; }
  }

  /**
   * Deletes a specific GGUF model from OPFS.
   */
  static async deleteModel(modelId: string): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory();
      await root.removeEntry(this.getModelFilename(modelId));
      Logger.info(`[OPFS] Model ${modelId} deleted.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') {
        Logger.info(`[OPFS] Model ${modelId} not found — nothing to delete.`);
      } else { throw error; }
    }
  }

  /**
   * Returns the OPFS file handle for a specific GGUF model.
   */
  static async getModelHandle(modelId: string): Promise<FileSystemFileHandle> {
    const root = await navigator.storage.getDirectory();
    return root.getFileHandle(this.getModelFilename(modelId));
  }

  /**
   * Registers a sideloaded GGUF model in Dexie's model_registry so it appears
   * in AgentConfigTab's "Offline Sideloaded" dropdown and can be routed to
   * by both Sovereign Engine and Local Daemon.
   */
  static async registerSideloadedModel(options?: {
    name?: string;
    modelId?: string;
    contextWindow?: number;
  }): Promise<void> {
    const modelName = options?.name || 'Sideloaded GGUF Model';
    const modelId = options?.modelId || modelName;
    const contextWindow = options?.contextWindow || 4096;
    const modelUrl = `opfs://${this.getModelFilename(modelId)}`;

    try {
      const existing = await db.model_registry
        .where('name')
        .equals(modelName)
        .first();

      if (existing) {
        await db.model_registry.update(existing.id!, {
          name: modelName,
          type: existing.type || 'PRIMARY',
          modelUrl,
          isLocalhost: true,
          contextWindow,
          isActive: true,
          engineType: 'Air-Gapped Sideload',
          allowDistillation: false,
        });
        Logger.info(`[Sideload Registry] Updated existing entry: ${modelName}`);
      } else {
        await db.model_registry.add({
          name: modelName,
          type: 'PRIMARY',
          modelUrl,
          isLocalhost: true,
          isActive: true,
          engineType: 'Air-Gapped Sideload',
          contextWindow,
          allowDistillation: false,
        });
        Logger.info(`[Sideload Registry] Registered new model: ${modelName}`);
      }
    } catch (error) {
      Logger.warn('[Sideload Registry] Failed to register model in Dexie:', error);
    }
  }
}
