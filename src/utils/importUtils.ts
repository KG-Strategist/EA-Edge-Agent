// Agent Skill: Data Import Utility
// Purpose: Provides native file parsing and bulk insertion for JSON data into Dexie tables.
// Inputs: fileHandle (from showOpenFilePicker), table (Dexie Table), key (array key in JSON, e.g., 'audit_logs')
// Outputs: Promise<void> (resolves on successful bulkPut)
// Dependencies: Native File System API, Dexie
// Example: await importJsonToTable(fileHandle, db.audit_logs, 'audit_logs');

import Dexie from 'dexie';

export async function importJsonToTable<T>(
  fileHandle: FileSystemFileHandle,
  table: Dexie.Table<T>,
  dataKey: string
): Promise<void> {
  const file = await fileHandle.getFile();
  const text = await file.text();
  const data = JSON.parse(text);
  if (data[dataKey] && Array.isArray(data[dataKey])) {
    await table.bulkPut(data[dataKey]);
  } else {
    throw new Error(`Invalid JSON: missing or invalid ${dataKey} array`);
  }
}