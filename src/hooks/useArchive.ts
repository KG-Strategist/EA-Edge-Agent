import { useState, useCallback } from 'react';
import { db } from '../lib/db';

type TableName = 
  | 'architecture_layers' 
  | 'architecture_principles' 
  | 'bian_domains' 
  | 'content_metamodel' 
  | 'master_categories' 
  | 'bespoke_tags' 
  | 'prompt_templates'
  | 'training_jobs'
  | 'custom_agents';

interface UseArchiveOptions {
  /** Dexie table name */
  tableName: TableName;
  /** The field that represents status/active state. E.g., 'status' or 'isActive' */
  statusField: string;
  /** The value that represents 'archived'. E.g., 'Deprecated', 'PURGED', or false */
  archivedValue: string | boolean;
  /** The default 'active' value to restore to. E.g., 'Active' or true */
  activeValue: string | boolean;
  /** Specifies if this is a RAG entity requiring Hybrid-Purge */
  isRagEntity?: boolean; 
}

export function useArchive({ tableName, statusField, archivedValue, activeValue, isRagEntity = false }: UseArchiveOptions) {
  const [showArchived, setShowArchived] = useState(false);

  const archiveItem = useCallback(async (identifier: number | string) => {
    const table = (db as any)[tableName];
    if (!table) return;

    if (isRagEntity && typeof identifier === 'string') {
      // ─── TASK 1: HYBRID-PURGE FOR RAG ENTITIES ───
      // 1. Hard Delete vectors form enterprise_knowledge
      // 2. Soft Delete metadata in training_jobs
      await db.transaction('rw', db.enterprise_knowledge, db.training_jobs, async () => {
        // Hard Delete (Vectors)
        const chunksToPurge = await db.enterprise_knowledge.where('sourceFile').equals(identifier).primaryKeys();
        await db.enterprise_knowledge.bulkDelete(chunksToPurge);
        
        // Soft Delete (Metadata)
        const jobsToPurge = await db.training_jobs.where('filename').equals(identifier).toArray();
        for (const job of jobsToPurge) {
          await db.training_jobs.update(job.id!, { 
            [statusField]: archivedValue, 
            purgedAt: new Date() 
          } as any);
        }
      });
    } else {
      // Standard Soft Delete
      await table.update(identifier as number, { [statusField]: archivedValue });
    }
  }, [tableName, statusField, archivedValue, isRagEntity]);

  const restoreItem = useCallback(async (identifier: number | string) => {
    const table = (db as any)[tableName];
    if (table) {
      if (isRagEntity && typeof identifier === 'string') {
        const jobs = await db.training_jobs.where('filename').equals(identifier).toArray();
        for (const job of jobs) {
           await db.training_jobs.update(job.id!, { [statusField]: activeValue } as any);
        }
      } else {
        await table.update(identifier as number, { [statusField]: activeValue });
      }
    }
  }, [tableName, statusField, activeValue, isRagEntity]);

  const permanentDeleteItem = useCallback(async (identifier: number | string) => {
    const table = (db as any)[tableName];
    if (table) {
      if (isRagEntity && typeof identifier === 'string') {
         const jobs = await db.training_jobs.where('filename').equals(identifier).primaryKeys();
         await db.training_jobs.bulkDelete(jobs);
      } else {
         await table.delete(identifier as number);
      }
    }
  }, [tableName, isRagEntity]);

  /** Filter function: returns true if the item should be shown in current view mode */
  const filterByArchiveStatus = useCallback((item: any) => {
    const val = item[statusField];
    if (showArchived) {
      return val === archivedValue;
    }
    return val !== archivedValue;
  }, [showArchived, statusField, archivedValue]);

  return {
    showArchived,
    setShowArchived,
    archiveItem,
    restoreItem,
    permanentDeleteItem,
    filterByArchiveStatus,
  };
}
