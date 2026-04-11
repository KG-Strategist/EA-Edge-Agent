export async function sideloadModelToCache(
  files: FileList,
  modelId: string,
  modelUrl: string,
  onProgress: (text: string, progress: number) => void
): Promise<void> {
  // WebLLM uses 'webllm/model' cache
  const cacheName = 'webllm/model';
  const cache = await caches.open(cacheName);

  const total = files.length;
  let processed = 0;

  // Ensure modelUrl ends with a slash
  const baseUrl = modelUrl.endsWith('/') ? modelUrl : `${modelUrl}/`;

  for (let i = 0; i < total; i++) {
    const file = files[i];
    
    // We only need the filename, assuming a flat directory structure in the upload
    // or we can use webkitRelativePath to reconstruct if needed.
    // Usually, huggingface repos are flat for the model weights.
    // If the user uploads a folder, webkitRelativePath is "Folder/filename.bin"
    const filename = file.name;
    
    // Skip hidden files like .DS_Store
    if (filename.startsWith('.')) {
      processed++;
      continue;
    }

    const syntheticUrl = new URL(filename, baseUrl).toString();

    onProgress(`Caching ${filename}...`, Math.round((processed / total) * 100));

    // Create a synthetic response from the File object
    // File object is a Blob, so we can just pass it to Response
    const response = new Response(file, {
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'Content-Length': file.size.toString(),
        // Add CORS headers just in case WebLLM checks them
        'Access-Control-Allow-Origin': '*',
      }
    });

    // Put into cache
    await cache.put(syntheticUrl, response);
    processed++;
  }

  onProgress(`Successfully cached ${processed} files for ${modelId}.`, 100);
}
