import { useCallback } from 'react';
import { db } from '../lib/db';
import { TableSchemas, validateInput } from '../lib/validation';
import { Logger } from '../lib/logger';
import { useNotification } from '../context/NotificationContext';

type TableName = 
  | 'architecture_layers' 
  | 'architecture_principles' 
  | 'service_domains' 
  | 'content_metamodel' 
  | 'master_categories' 
  | 'bespoke_tags' 
  | 'prompt_templates'
  | 'review_workflows'
  | 'report_templates'
  | 'threat_models'
  | 'custom_agents';

interface UseDataPortabilityOptions {
  tableName: TableName;
  filename: string;
}

export function useDataPortability({ tableName, filename }: UseDataPortabilityOptions) {
  const { addNotification } = useNotification();
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
          addNotification('Invalid format: expected a JSON array.', 'error', 3000);
          return;
        }

        const schema = TableSchemas[tableName];
        let validatedData = importedData;

        if (schema) {
          validatedData = [];
          for (const item of importedData) {
            const { success, data, errors } = validateInput(schema, item);
            if (success && data) {
              validatedData.push(data);
            } else {
              Logger.warn('Import item skipped due to validation failure:', errors);
            }
          }
        }

        if (validatedData.length === 0 && importedData.length > 0) {
          addNotification('All items failed validation. Check logs for details.', 'error', 5000);
          return;
        }

        const table = (db as any)[tableName];
        await table.bulkPut(validatedData);
        addNotification(`Successfully imported ${validatedData.length} records.`, 'success', 3000);
      } catch (e) {
        Logger.error('Import error:', e);
        addNotification('Failed to import data. Check logs for details.', 'error', 5000);
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-imported
    event.target.value = '';
  }, [tableName, addNotification]);

  return { handleExport, handleImport };
}
