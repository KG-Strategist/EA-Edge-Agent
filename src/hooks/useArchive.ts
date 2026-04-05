import { useState, useCallback } from 'react';
import { db } from '../lib/db';

type TableName = 
  | 'architecture_layers' 
  | 'architecture_principles' 
  | 'bian_domains' 
  | 'content_metamodel' 
  | 'master_categories' 
  | 'bespoke_tags' 
  | 'prompt_templates';

interface UseArchiveOptions {
  /** Dexie table name */
  tableName: TableName;
  /** The field that represents status/active state. E.g., 'status' or 'isActive' */
  statusField: string;
  /** The value that represents 'archived'. E.g., 'Deprecated' or false */
  archivedValue: string | boolean;
  /** The default 'active' value to restore to. E.g., 'Active' or true */
  activeValue: string | boolean;
}

export function useArchive({ tableName, statusField, archivedValue, activeValue }: UseArchiveOptions) {
  const [showArchived, setShowArchived] = useState(false);

  const archiveItem = useCallback(async (id: number) => {
    const table = (db as any)[tableName];
    if (table) {
      await table.update(id, { [statusField]: archivedValue });
    }
  }, [tableName, statusField, archivedValue]);

  const restoreItem = useCallback(async (id: number) => {
    const table = (db as any)[tableName];
    if (table) {
      await table.update(id, { [statusField]: activeValue });
    }
  }, [tableName, statusField, activeValue]);

  const permanentDeleteItem = useCallback(async (id: number) => {
    const table = (db as any)[tableName];
    if (table) {
      await table.delete(id);
    }
  }, [tableName]);

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
