import { db } from './db';

let worker: Worker | null = null;
let messageIdCounter = 0;
const pendingRequests = new Map<number, { resolve: Function, reject: Function, onProgress?: Function }>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./embeddingWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, type, success, error, progressMsg, ...data } = e.data;
      const promise = pendingRequests.get(id);
      if (promise) {
        if (type === 'PROGRESS') {
           if (promise.onProgress) promise.onProgress(progressMsg);
           return;
        }
        if (success) {
          promise.resolve(data);
        } else {
          promise.reject(new Error(error));
        }
        pendingRequests.delete(id);
      }
    };
  }
  return worker;
}

function postMessageAsync(type: string, payload: any, onProgress?: Function): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = messageIdCounter++;
    pendingRequests.set(id, { resolve, reject, onProgress });
    const w = getWorker();
    w.postMessage({ id, type, payload });
  });
}

export async function storeReviewEmbeddings(sessionId: number, text: string) {
  const result = await postMessageAsync('EMBED_AND_CHUNK', { text, sessionId });
  if (result.embeddings && result.embeddings.length > 0) {
    await db.review_embeddings.bulkAdd(result.embeddings);
  }
}

export async function findSimilarReviews(queryText: string): Promise<string[]> {
  const storedEmbeddings = await db.review_embeddings.toArray();
  if (storedEmbeddings.length === 0) return [];
  
  const result = await postMessageAsync('FIND_SIMILAR', { queryText, storedEmbeddings });
  return result.top3.map((item: any) => item.text);
}

export async function storeEnterpriseEmbeddings(
  filename: string, 
  text: string, 
  onProgress?: (msg: string) => void
) {
  const result = await postMessageAsync('EMBED_ENTERPRISE', { text, filename }, onProgress);
  if (result.embeddings && result.embeddings.length > 0) {
    await db.enterprise_knowledge.bulkAdd(result.embeddings);
  }
}

export async function findRelevantEnterpriseContext(queryText: string): Promise<string[]> {
  const storedEmbeddings = await db.enterprise_knowledge.toArray();
  if (storedEmbeddings.length === 0) return [];
  
  const result = await postMessageAsync('FIND_SIMILAR_ENTERPRISE', { queryText, storedEmbeddings });
  return result.top3.map((item: any) => `[Source: ${item.sourceFile}]\n${item.textChunk}`);
}
