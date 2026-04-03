import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

let extractor: any = null;

async function getExtractor() {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractor;
}

function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data;
  
  try {
    const extract = await getExtractor();
    
    if (type === 'EMBED_AND_CHUNK') {
      const { text, sessionId } = payload;
      const chunks = chunkText(text);
      const embeddings = [];
      
      for (const chunk of chunks) {
        const output = await extract(chunk, { pooling: 'mean', normalize: true });
        embeddings.push({
          sessionId,
          text: chunk,
          embedding: Array.from(output.data)
        });
      }
      self.postMessage({ id, success: true, embeddings });
    } 
    else if (type === 'FIND_SIMILAR') {
      const { queryText, storedEmbeddings } = payload;
      const output = await extract(queryText, { pooling: 'mean', normalize: true });
      const queryEmbedding = Array.from(output.data) as number[];
      
      const scored = storedEmbeddings.map((item: any) => ({
        ...item,
        score: cosineSimilarity(queryEmbedding, item.embedding)
      }));
      
      scored.sort((a: any, b: any) => b.score - a.score);
      const top3 = scored.slice(0, 3);
      
      self.postMessage({ id, success: true, top3 });
    }
  } catch (error: any) {
    self.postMessage({ id, success: false, error: error.message });
  }
};
