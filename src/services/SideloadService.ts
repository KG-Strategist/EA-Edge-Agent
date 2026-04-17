import { db } from '../lib/db';

/**
 * SideloadService handles the air-gapped ingestion of model weights
 * directly into the browser's CacheStorage.
 */
export class SideloadService {
  /**
   * Processes a folder of model files and injects them into the WebLLM cache.
   * @param fileList The list of files from a webkitdirectory input.
   * @param modelAlias The user-defined name for the model.
   * @param modelUrl The base URL that WebLLM will use to look up these files.
   * @param onProgress Callback for UI updates.
   */
  static async processSideloadFolder(
    fileList: FileList | File[],
    modelAlias: string,
    modelUrl: string,
    onProgress: (msg: string, percent: number) => void
  ): Promise<void> {
    const cacheName = 'webllm/model';
    const cache = await caches.open(cacheName);
    
    const files = Array.from(fileList);
    const totalFiles = files.length;
    let processedFiles = 0;

    // Ensure modelUrl ends with a slash for proper URL joining
    const baseUrl = modelUrl.endsWith('/') ? modelUrl : `${modelUrl}/`;

    for (const file of files) {
      // Use webkitRelativePath to get the path within the folder
      // If webkitRelativePath is empty (e.g. single file select), fallback to name
      const relativePath = file.webkitRelativePath || file.name;
      
      // We want the path relative to the selected folder's root
      // e.g. if folder "Llama" is selected, webkitRelativePath is "Llama/config.json"
      // We want to strip the top-level folder name to match how WebLLM expects URLs
      const pathParts = relativePath.split('/');
      const cleanPath = pathParts.length > 1 ? pathParts.slice(1).join('/') : relativePath;

      // Skip hidden files
      if (file.name.startsWith('.')) {
        processedFiles++;
        continue;
      }

      const syntheticUrl = new URL(cleanPath, baseUrl).toString();
      
      onProgress(`Caching ${file.name}...`, Math.round((processedFiles / totalFiles) * 100));

      const response = new Response(file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'Content-Length': file.size.toString(),
          'Access-Control-Allow-Origin': '*',
        }
      });

      await cache.put(syntheticUrl, response);
      processedFiles++;
    }

    // Register in Database
    await db.model_registry.add({
      name: modelAlias,
      type: 'SECONDARY',
      engineType: 'Air-Gapped Sideload',
      modelUrl: modelUrl,
      isLocalhost: true,
      isActive: true,
      allowDistillation: false,
      contextWindow: 4096 // Default
    });

    onProgress(`Sideload complete: ${modelAlias} registered.`, 100);
  }

  /**
   * Deletes a sideloaded model from the WebLLM cache.
   * @param modelUrl The base URL of the model to delete.
   */
  static async deleteSideloadedModel(modelUrl: string): Promise<void> {
    const cacheName = 'webllm/model';
    const cache = await caches.open(cacheName);
    
    // Ensure modelUrl ends with a slash for proper URL matching
    const baseUrl = modelUrl.endsWith('/') ? modelUrl : `${modelUrl}/`;
    
    const keys = await cache.keys();
    for (const request of keys) {
      if (request.url.startsWith(baseUrl)) {
        await cache.delete(request);
      }
    }
  }
}
