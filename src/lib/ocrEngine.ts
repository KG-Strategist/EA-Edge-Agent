export function runOCR(imageBlob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./ocrWorker.ts', import.meta.url), { type: 'module' });
    
    worker.onmessage = (e) => {
      if (e.data.success) {
        resolve(e.data.text);
      } else {
        reject(new Error(e.data.error));
      }
      worker.terminate();
    };
    
    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };
    
    worker.postMessage({ imageBlob });
  });
}
