export async function decompressGzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    return bytes;
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Browser does not support gzip decompression for runtime corpus assets.');
  }

  const sourceBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([sourceBuffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  const decompressedBuffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(decompressedBuffer);
}

export async function fetchJsonAsset<T>(preferredUrl: string, fallbackUrl?: string): Promise<T> {
  const urls = fallbackUrl ? [preferredUrl, fallbackUrl] : [preferredUrl];
  let lastError: unknown;

  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${url} returned HTTP ${response.status}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const decoded = await decompressGzipBytes(bytes);
      return JSON.parse(new TextDecoder().decode(decoded)) as T;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
