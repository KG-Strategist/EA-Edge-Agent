import { useCallback } from 'react';
import { db } from '../lib/db';

type TableName = 
  | 'architecture_layers' 
  | 'architecture_principles' 
  | 'bian_domains' 
  | 'content_metamodel' 
  | 'master_categories' 
  | 'bespoke_tags' 
  | 'prompt_templates'
  | 'review_workflows'
  | 'report_templates'
  | 'threat_models';

interface UseDataPortabilityOptions {
  tableName: TableName;
  filename: string;
}

export function useDataPortability({ tableName, filename }: UseDataPortabilityOptions) {
  const handleExport = useCallback(async () => {
    const table = (db as any)[tableName];
    if (!table) return;
    
    const data = await table.toArray();
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
    const anchor = document.createElement('a');
    anchor.setAttribute('href', dataStr);
    anchor.setAttribute('download', `${filename}.json`);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, [tableName, filename]);

  const handleImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async () => {
      if (!reader.result) return;
      try {
        const importedData = JSON.parse(reader.result as string);
        if (!Array.isArray(importedData)) {
          alert('Invalid format: expected a JSON array.');
          return;
        }
        const table = (db as any)[tableName];
        await table.bulkPut(importedData);
        alert(`Successfully imported ${importedData.length} records.`);
      } catch (e) {
        console.error('Import error:', e);
        alert('Failed to import data. Check console for details.');
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-imported
    event.target.value = '';
  }, [tableName]);

  return { handleExport, handleImport };
}
