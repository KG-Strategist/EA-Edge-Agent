import { createWorker } from 'tesseract.js';

self.onmessage = async (e: MessageEvent) => {
  const { imageBlob } = e.data;
  try {
    const worker = await createWorker('eng', 1, {
      workerPath: '/assets/ocr/worker.min.js',
      corePath: '/assets/ocr/tesseract-core.wasm.js',
      langPath: '/assets/ocr/lang-data',
    });
    const ret = await worker.recognize(imageBlob);
    await worker.terminate();
    self.postMessage({ success: true, text: ret.data.text });
  } catch (error: any) {
    self.postMessage({ success: false, error: error.message });
  }
};
