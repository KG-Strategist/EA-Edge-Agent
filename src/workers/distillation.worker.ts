import { pipeline, env } from '@xenova/transformers';
import { db } from '../lib/db';

// Disable local models to fetch from Hugging Face if not cached
env.allowLocalModels = false;
env.useBrowserCache = true;

class PipelineSingleton {
  static task = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance: any = null;

  static async getInstance(progress_callback?: any) {
    if (this.instance === null) {
      this.instance = pipeline(this.task as any, this.model, { progress_callback });
    }
    return this.instance;
  }
}

self.addEventListener('message', async (event) => {
  const { type, payload } = event.data;

  if (type === 'DISPOSE') {
    PipelineSingleton.instance = null;
    self.postMessage({ type: 'STATUS', message: 'Worker memory cleared.' });
    return;
  }

  if (type === 'HARVEST') {
    try {
      self.postMessage({ type: 'STATUS', message: 'Initializing embedding pipeline...' });
      
      const extractor = await PipelineSingleton.getInstance((x: any) => {
        self.postMessage({ type: 'PROGRESS', progress: x });
      });

      self.postMessage({ type: 'STATUS', message: 'Generating vector embeddings...' });

      const output = await extractor(payload.text, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data) as number[];

      const recordId = await db.semantic_memory.add({
        text: payload.text,
        embedding,
        metadata: payload.metadata || {},
        createdAt: new Date()
      });

      self.postMessage({ type: 'SUCCESS', recordId });
    } catch (error: any) {
      self.postMessage({ type: 'ERROR', error: error.message });
    }
  }
});
