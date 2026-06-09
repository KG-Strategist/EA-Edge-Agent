import { db } from './db';
import { vectoriser } from './SemanticArena';
import { Logger } from './logger';

// Lazy-load pdfjs to avoid circular dependency at module load time.
let pdfjs: any = null;
let pdfjsInitialized = false;

async function initPdfJs() {
  if (pdfjsInitialized) return;
  try {
    const pdfModule = await import('pdfjs-dist');
    const workerModule = await import('pdfjs-dist/build/pdf.worker.mjs?url');
    pdfjs = pdfModule;
    pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
    pdfjsInitialized = true;
  } catch (error) {
    Logger.warn('[KnowledgeIngestion] pdfjs initialization failed', error);
    pdfjsInitialized = true;
  }
}

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
    await initPdfJs();
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
 * Initiates training logic. Creates job record, parses text, projects to bitfields,
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
    
    await updateLog(`Extracted ${rawText.length} characters. Projecting to orthogonal bitfields...`, 'Processing');
    
    // Project text to orthogonal bitfields via MoatVectoriser
    const layers = await vectoriser.projectOrthogonalLayersToBitfields(rawText);
    
    let ingested = 0;
    for (const { vector, orthogonal } of layers) {
      await db.semantic_memory.add({
        subject: orthogonal.Subject || '',
        predicate: orthogonal.Intent || '',
        object: orthogonal.Target || '',
        context: rawText.substring(0, 1000),
        orthogonal_components: orthogonal,
        vector: vector.slice(),
        beliefState: 1,
        source: 'enterprise_ingestion',
        createdAt: new Date()
      });
      ingested++;
    }

    await updateLog(`Ingestion complete. ${ingested} orthogonal layers integrated into Semantic Memory.`, 'Completed');
  } catch (error: any) {
    Logger.error('Ingestion failed:', error);
    await updateLog(`Error: ${error.message}`, 'Failed');
  }
}
