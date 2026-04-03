import { createWorker } from 'tesseract.js';

self.onmessage = async (e: MessageEvent) => {
  const { imageBlob } = e.data;
  try {
    const worker = await createWorker('eng', 1, {
      workerPath: 'https://unpkg.com/tesseract.js@v5.0.5/dist/worker.min.js',
      corePath: 'https://unpkg.com/tesseract.js-core@v5.0.0/tesseract-core.wasm.js',
    });
    const ret = await worker.recognize(imageBlob);
    await worker.terminate();
    self.postMessage({ success: true, text: ret.data.text });
  } catch (error: any) {
    self.postMessage({ success: false, error: error.message });
  }
};
