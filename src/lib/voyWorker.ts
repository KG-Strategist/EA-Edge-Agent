import { Voy } from 'voy-search';

let voyIndex: Voy | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;

  try {
    if (type === 'INIT') {
      // Initialize Voy (Rust/Wasm)
      // Note: In a real implementation, we would load the Wasm module here.
      // Voy handles RAM-based cosine similarity.
      const resource = payload.resource || { embeddings: [] };
      voyIndex = new Voy(resource);
      self.postMessage({ id, status: 'success' });
    } 
    else if (type === 'ADD') {
      if (!voyIndex) throw new Error('Voy not initialized');
      voyIndex.add(payload.data);
      // Async sync to IndexedDB would happen here
      self.postMessage({ id, status: 'success' });
    }
    else if (type === 'SEARCH') {
      if (!voyIndex) throw new Error('Voy not initialized');
      const results = voyIndex.search(payload.query, payload.k || 3);
      self.postMessage({ id, status: 'success', data: results });
    }
  } catch (error: any) {
    self.postMessage({ id, status: 'error', error: error.message });
  }
};
