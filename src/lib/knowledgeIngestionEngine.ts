import * as pdfjs from 'pdfjs-dist';
// Explicitly bundle the worker via Vite to ensure 100% offline air-gapped capability.
// We use ?url to get the asset URL for the worker.
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

import { db } from './db';
import { storeEnterpriseEmbeddings } from './ragEngine';

// Prevent CDN fallback
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface IngestionProgress {
  filename: string;
  status: 'Pending' | 'Processing' | 'Completed' | 'Failed';
  logs: string[];
}

/**
 * Reads a File object and extracts raw text.
 * Supports .txt, .md, .csv natively. Natively parses PDFs via pdfjs-dist.
 */
async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDocument = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .filter((item: any) => item.str)
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
    }
    return fullText;
  } else {
    // Treat as plain text (.md, .txt, .json, .csv)
    return await file.text();
  }
}

/**
 * Initiates training logic. Creates job record, parses text, requests embeddings, 
 * and handles progress logs via a callback.
 */
export async function initiateTrainingJob(
  file: File,
  onProgress: (status: Partial<IngestionProgress>) => void
): Promise<void> {
  
  const jobId = await db.training_jobs.add({
    filename: file.name,
    status: 'Pending',
    logs: ['Job created. Waiting in queue...'],
    startedAt: new Date()
  });

  const updateLog = async (msg: string, status: 'Processing' | 'Completed' | 'Failed' = 'Processing') => {
    onProgress({ status, logs: [msg] });
    const existing = await db.training_jobs.get(jobId);
    if (existing) {
      existing.logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
      existing.status = status;
      if (status === 'Completed' || status === 'Failed') {
        existing.completedAt = new Date();
      }
      await db.training_jobs.put(existing);
    }
  };

  try {
    await updateLog('Parsing file contents locally...', 'Processing');
    const rawText = await extractTextFromFile(file);
    
    if (!rawText.trim()) {
      throw new Error("No readable text found in document.");
    }
    
    await updateLog(`Extracted ${rawText.length} characters. Sending to Local Vector Engine...`, 'Processing');
    
    // Defer to the RAG engine which communicates with the background WebWorker
    // The Web Worker will handle token chunking (generous 500 tokens) and Xenova vectorizing.
    await storeEnterpriseEmbeddings(file.name, rawText, (workerMsg) => {
       updateLog(workerMsg, 'Processing');
    });

    await updateLog('Ingestion complete. Knowledge integrated into Enterprise RAG.', 'Completed');
  } catch (error: any) {
    console.error('Ingestion failed:', error);
    await updateLog(`Error: ${error.message}`, 'Failed');
  }
}
