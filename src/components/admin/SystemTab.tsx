import React, { useState } from 'react';
import { db } from '../../lib/db';
import { Download, Upload, Loader2, RefreshCcw, History, Search, Calendar } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

export default function SystemTab() {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Fetch sync history from audit_logs table
  const syncLogs = useLiveQuery(() => 
    db.audit_logs
      .where('tableName')
      .equals('system_portability')
      .reverse()
      .toArray()
  ) || [];

  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredLogs = syncLogs.filter(log => {
      let parsedDetails = { event: 'UNKNOWN', status: 'UNKNOWN' };
      try {
        if (log.details) parsedDetails = JSON.parse(log.details);
      } catch (e) {
        // Ignore parse error
      }

      const q = searchQuery.toLowerCase();
      const matchesSearch = parsedDetails.event.toLowerCase().includes(q) || 
                            log.pseudokey.toLowerCase().includes(q) ||
                            parsedDetails.status.toLowerCase().includes(q);
      
      if (!matchesSearch) return false;

      const logDate = new Date(log.timestamp);
      if (startDate && logDate < new Date(startDate)) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (logDate > end) return false;
      }
      
      return true;
  });

  const handleExportCSV = () => {
    const headers = ['Timestamp,Action,Status,User Alias'];
    const rows = filteredLogs.map(log => {
      let parsedDetails = { event: 'UNKNOWN', status: 'UNKNOWN' };
      try {
        if (log.details) parsedDetails = JSON.parse(log.details);
      } catch (e) {
        // Ignore parse error
      }
      return `"${new Date(log.timestamp).toISOString()}","${parsedDetails.event}","${parsedDetails.status}","${log.pseudokey}"`;
    });
    
    const csvContent = headers.concat(rows).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'niti_portability_sync_log.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportBrain = async () => {
    setIsExporting(true);
    try {
      const dump = {
        architecture_categories: await db.architecture_categories.toArray(),
        master_categories: await db.master_categories.toArray(),
        content_metamodel: await db.content_metamodel.toArray(),
        architecture_layers: await db.architecture_layers.toArray(),
        architecture_principles: await db.architecture_principles.toArray(),
        bian_domains: await db.bian_domains.toArray(),
        bespoke_tags: await db.bespoke_tags.toArray(),
        prompt_templates: await db.prompt_templates.toArray(),
        report_templates: await db.report_templates.toArray(),
        review_workflows: await db.review_workflows.toArray(),
        app_settings: await db.app_settings.toArray(),
        threat_models: await db.threat_models.toArray()
      };
      
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `niti_brain_export_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      await db.audit_logs.add({
        timestamp: new Date(),
        pseudokey: sessionStorage.getItem('ea_niti_pseudokey') || 'System',
        action: 'UPDATE',
        tableName: 'system_portability',
        details: JSON.stringify({ event: 'EXPORT_BRAIN', status: 'Success' })
      });
    } catch (e) {
      await db.audit_logs.add({
        timestamp: new Date(),
        pseudokey: sessionStorage.getItem('ea_niti_pseudokey') || 'System',
        action: 'UPDATE',
        tableName: 'system_portability',
        details: JSON.stringify({ event: 'EXPORT_BRAIN', status: 'Failed' })
      });
      alert("Failed to export database: " + e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportBrain = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!confirm("WARNING: Importing a NITI Brain state will overwrite duplicate keys. Continue?")) {
        event.target.value = '';
        return;
    }

    setIsImporting(true);
    setImportError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        
        let dump;
        try {
          dump = JSON.parse(text);
        } catch {
          throw new Error('Invalid NITI Brain Payload: File is not a valid JSON document.');
        }
        
        // Strict Schema Validation
        if (!dump || typeof dump !== 'object') {
          throw new Error('Invalid NITI Brain Payload: Root element is not a JSON object.');
        }

        const requiredTopLevelKeys = [
          'architecture_categories',
          'master_categories',
          'content_metamodel',
          'architecture_layers',
          'architecture_principles',
          'bian_domains'
        ];

        // Ensure at least one known architectural array exists in the payload, preventing random JSON uploads
        const hasAnyValidKey = requiredTopLevelKeys.some(key => Array.isArray(dump[key]));
        if (!hasAnyValidKey) {
            throw new Error('Invalid NITI Brain Payload: Missing core architectural entities (e.g., principles, layers).');
        }
        
        await db.transaction('rw', 
          [db.architecture_categories, db.master_categories, db.content_metamodel,
          db.architecture_layers, db.architecture_principles, db.bian_domains,
          db.bespoke_tags, db.prompt_templates, db.report_templates,
          db.review_workflows, db.app_settings, db.threat_models], 
        async () => {
          if (dump.architecture_categories) await db.architecture_categories.bulkPut(dump.architecture_categories);
          if (dump.master_categories) await db.master_categories.bulkPut(dump.master_categories);
          if (dump.content_metamodel) await db.content_metamodel.bulkPut(dump.content_metamodel);
          if (dump.architecture_layers) await db.architecture_layers.bulkPut(dump.architecture_layers);
          if (dump.architecture_principles) await db.architecture_principles.bulkPut(dump.architecture_principles);
          if (dump.bian_domains) await db.bian_domains.bulkPut(dump.bian_domains);
          if (dump.bespoke_tags) await db.bespoke_tags.bulkPut(dump.bespoke_tags);
          if (dump.prompt_templates) await db.prompt_templates.bulkPut(dump.prompt_templates);
          if (dump.report_templates) await db.report_templates.bulkPut(dump.report_templates);
          if (dump.review_workflows) await db.review_workflows.bulkPut(dump.review_workflows);
          if (dump.app_settings) await db.app_settings.bulkPut(dump.app_settings);
          if (dump.threat_models) await db.threat_models.bulkPut(dump.threat_models);
        });
        
        await db.audit_logs.add({
          timestamp: new Date(),
          pseudokey: sessionStorage.getItem('ea_niti_pseudokey') || 'System',
          action: 'UPDATE',
          tableName: 'system_portability',
          details: JSON.stringify({ event: 'IMPORT_MERGE', status: 'Success' })
        });

        alert("NITI Brain state successfully restored! The agent interface will reload to apply changes.");
        window.location.reload();
      } catch (err: any) {
        setImportError(err.message || 'Validation failed');
        await db.audit_logs.add({
          timestamp: new Date(),
          pseudokey: sessionStorage.getItem('ea_niti_pseudokey') || 'System',
          action: 'UPDATE',
          tableName: 'system_portability',
          details: JSON.stringify({ event: 'IMPORT_MERGE', status: 'Failed' })
        });
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800/50 p-6">
         <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
           <RefreshCcw className="text-indigo-500" />
           State Portability (NITI Brain Transfer)
         </h3>
         <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
           Export your agent's entirely localized knowledge base (Categories, Domains, Taxonomies, Templates, Workflow Pipelines, Principles) into a raw JSON struct. Use this to seed new NITI installations without re-training standard metadata manually. (Note: Review Sessions and Vector Embeddings are deliberately excluded from brain dumps for privacy isolation layer.)
         </p>
         
         <div className="flex gap-4 items-center mb-4">
            <button 
               onClick={handleExportBrain}
               disabled={isExporting}
               className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-md disabled:opacity-50"
            >
               {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
               Export Knowledge Base
            </button>
            <div className="relative">
               <input 
                  type="file" 
                  accept=".json"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleImportBrain}
                  disabled={isImporting}
                  id="import-upload"
                  aria-label="Import upload"
                  title="Import upload"
               />
               <button 
                  className={`flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-800 border-2 border-indigo-200 dark:border-indigo-700 hover:border-indigo-500 dark:hover:border-indigo-400 text-indigo-700 dark:text-indigo-300 rounded-lg font-medium transition-colors ${isImporting ? 'opacity-50' : ''}`}
               >
                  {isImporting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                  Import & Merge State
               </button>
            </div>
         </div>

         {/* Localized Error Banner for Validation */}
         {importError && (
            <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">Import Aborted</p>
                <p className="text-xs text-red-600 dark:text-red-300 mt-1">{importError}</p>
            </div>
         )}
      </div>

      {/* ─── Task 1: Knowledge Sync History Table ─── */}
      <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
             <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
               <History size={16} className="text-gray-500" />
               Knowledge Sync & Portability History
             </h3>
             <div className="flex flex-wrap items-center gap-3">
               <div className="relative">
                 <Search size={14} className="absolute left-2.5 top-2 text-gray-400" />
                 <input 
                   type="text" 
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                   placeholder="Search logs..." 
                   className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md focus:border-indigo-500 outline-none w-48 text-gray-800 dark:text-gray-200"
                 />
               </div>
               <div className="flex items-center gap-2 relative">
                 <Calendar size={14} className="absolute left-2.5 top-2 text-gray-400" />
                 <input 
                   type="date"
                   value={startDate}
                   onChange={e => setStartDate(e.target.value)}
                   className="pl-8 pr-2 py-1.5 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md outline-none text-gray-800 dark:text-gray-200"
                   aria-label="Start date"
                   title="Start date"
                   placeholder="Start date"
                 />
                 <span className="text-gray-400 text-xs">-</span>
                 <input 
                   type="date"
                   value={endDate}
                   onChange={e => setEndDate(e.target.value)}
                   className="px-2 py-1.5 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md outline-none text-gray-800 dark:text-gray-200"
                   aria-label="End date"
                   title="End date"
                   placeholder="End date"
                 />
               </div>
               <button 
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md text-xs font-semibold transition-colors shadow-sm"
               >
                 <Download size={14} />
                 Export CSV
               </button>
             </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-100 dark:bg-gray-900/50">
              <tr>
                <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Timestamp</th>
                <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Action</th>
                <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
                <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">User Alias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredLogs.length > 0 ? (
                filteredLogs.map(log => {
                  let parsedDetails = { event: 'UNKNOWN', status: 'UNKNOWN' };
                  try {
                    if (log.details) parsedDetails = JSON.parse(log.details);
                  } catch (e) {
                    // Ignore parse error
                  }

                  return (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{new Date(log.timestamp).toLocaleString()}</td>
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-gray-200">{parsedDetails.event}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          parsedDetails.status === 'Success' 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {parsedDetails.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-gray-600 dark:text-gray-400">{log.pseudokey}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-gray-500 dark:text-gray-400">
                    No portability sync history recorded locally.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
