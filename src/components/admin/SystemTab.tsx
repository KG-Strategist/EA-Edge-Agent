import React, { useState, useCallback, useEffect } from 'react';
import { db } from '../../lib/db';
import { Download, Upload, Loader2, History, Search, Calendar, BrainCircuit, AlertTriangle, Trash2, FolderOutput, HardDriveDownload, RefreshCw } from 'lucide-react';
import { requestDirectoryPermission } from '../../lib/fileSystemPermissions';
import { useLiveQuery } from 'dexie-react-hooks';
import PageHeader from '../ui/PageHeader';
import { useStateContext } from '../../context/StateContext';
import { logoutUser } from '../../lib/authEngine';
import { useLocalBackupState } from '../../hooks/useLocalBackupState';

export default function SystemTab() {
  const { identity, setIdentity } = useStateContext();
  const [isExporting, setIsExporting] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // ── Local Backup State ─────────────────────────────────────────────
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [isRestoringPermission, setIsRestoringPermission] = useState(false);

  const { isConfigured, backupPath, backupDirectoryHandle, isPermissionSuspended, permissionStatus } = useLocalBackupState();

  // ── Listen for Consent Modal Events ────────────────────────────────
  useEffect(() => {
    const handleConsentAccepted = async (e: Event) => {
      const event = e as CustomEvent;
      const { mode } = event.detail;
      
      try {
        if ('showDirectoryPicker' in window) {
          const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
          
          // Store handle and metadata
          await db.app_settings.put({ key: 'backupDirectoryHandle', value: handle });
          await db.app_settings.put({ key: 'backupConfigured', value: true });
          await db.app_settings.put({ key: 'backupPath', value: handle.name });
          await db.app_settings.put({ key: 'backupStatus', value: 'active' });
          
          setBackupError(null);
        } else {
          setBackupError("Your browser does not support the File System Access API.");
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setBackupError(null);
          return;
        }
        console.error("Failed to select directory:", err);
        setBackupError("Persistent file system access is blocked in this preview environment. Please open the app in a standalone browser tab.");
      }
    };

    const handleConsentRejected = () => {
      setBackupError(null);
    };

    const handleRevokeSuccess = () => {
      setBackupError(null);
      // Clear any other local state that might interfere with UI rendering
      setSyncToast(null);
    };

    window.addEventListener('EA_BACKUP_CONSENT_ACCEPTED', handleConsentAccepted);
    window.addEventListener('EA_BACKUP_CONSENT_REJECTED', handleConsentRejected);
    window.addEventListener('EA_BACKUP_REVOKE_SUCCESS', handleRevokeSuccess);

    return () => {
      window.removeEventListener('EA_BACKUP_CONSENT_ACCEPTED', handleConsentAccepted);
      window.removeEventListener('EA_BACKUP_CONSENT_REJECTED', handleConsentRejected);
      window.removeEventListener('EA_BACKUP_REVOKE_SUCCESS', handleRevokeSuccess);
    };
  }, []);

  const handleConfigureBackup = async () => {
    setBackupError(null);
    try {
      if ('showDirectoryPicker' in window) {
        // Check if consent already exists
        const existingConsent = await db.app_settings.get('autoDumpConsent');
        
        if (existingConsent?.value) {
          // ── RECONFIGURE FLOW: Consent already given, skip modal ──
          try {
            const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
            setDirHandle(handle);
            
            // Store handle and metadata directly
            await db.app_settings.put({ key: 'backupDirectoryHandle', value: handle });
            await db.app_settings.put({ key: 'backupPath', value: handle.name });
            await db.app_settings.put({ key: 'backupStatus', value: 'active' });
            
            // Log reconfiguration event
            await db.audit_logs.add({
              timestamp: new Date().toISOString(),
              action: 'SYSTEM_BACKUP_CONFIGURED',
              tableName: 'app_settings',
              pseudokey: identity?.pseudokey || 'SYSTEM',
              details: { path: handle.name, mode: 'reconfigure' }
            });
            
            setBackupError(null);
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
              setBackupError(null);
              return;
            }
            console.error("Failed to select directory:", err);
            setBackupError("Persistent file system access is blocked in this preview environment. Please open the app in a standalone browser tab.");
          }
        } else {
          // ── INITIAL SETUP FLOW: No consent yet, show consent modal ──
          window.dispatchEvent(new CustomEvent('EA_BACKUP_CONSENT_REQUIRED', {
            detail: {
              mode: 'initial',
              backupPath: backupPath || '',
              existingConsent: false
            }
          }));
        }
      } else {
        setBackupError("Your browser does not support the File System Access API.");
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error("Failed to configure backup:", err);
      setBackupError("Backup configuration failed. Please try again.");
    }
  };

  const handleRemoveConfiguration = async () => {
    setBackupError(null);
    try {
      // Dispatch revoke consent event (BackupConsentModal will intercept)
      window.dispatchEvent(new CustomEvent('EA_BACKUP_CONSENT_REQUIRED', {
        detail: {
          mode: 'revoke',
          backupPath: backupPath || '',
          existingConsent: true
        }
      }));
    } catch (err) {
      console.error("Failed to revoke backup configuration:", err);
      setBackupError("Failed to revoke backup configuration. Please try again.");
    }
  };

  // ── Permission Restoration Handler ────────────────────────────────
  const handleRestoreBackupAccess = async () => {
    if (!backupDirectoryHandle) {
      setBackupError("No backup directory handle available.");
      return;
    }

    setIsRestoringPermission(true);
    setBackupError(null);

    try {
      // requestPermission() MUST be called directly from user interaction
      const granted = await requestDirectoryPermission(backupDirectoryHandle);
      
      if (granted) {
        // Update backup status to active after permission restored
        await db.app_settings.put({ key: 'backupStatus', value: 'active' });
        await db.audit_logs.add({
          timestamp: new Date().toISOString(),
          action: 'SYSTEM_BACKUP_PERMISSION_RESTORED',
          tableName: 'app_settings',
          pseudokey: identity?.pseudokey || 'SYSTEM',
          details: { path: backupPath || '(Restored)', status: 'permission_granted' }
        });
        setSyncToast('Backup access restored successfully!');
        setTimeout(() => setSyncToast(null), 3000);
      } else {
        setBackupError('Permission request denied. Please try again or reconfigure your backup directory.');
        await db.audit_logs.add({
          timestamp: new Date().toISOString(),
          action: 'SYSTEM_BACKUP_PERMISSION_RESTORE_FAILED',
          tableName: 'app_settings',
          pseudokey: identity?.pseudokey || 'SYSTEM',
          details: { path: backupPath || '(Unknown)', status: 'permission_denied' }
        });
      }
    } catch (err) {
      console.error('Failed to restore backup access:', err);
      setBackupError('Failed to restore backup access. Please try again.');
      await db.audit_logs.add({
        timestamp: new Date().toISOString(),
        action: 'SYSTEM_BACKUP_PERMISSION_ERROR',
        tableName: 'app_settings',
        pseudokey: identity?.pseudokey || 'SYSTEM',
        details: { path: backupPath || '(Error)', error: err instanceof Error ? err.message : 'Unknown error' }
      });
    } finally {
      setIsRestoringPermission(false);
    }
  };

  // ── Global Wipe State ──────────────────────────────────────────────
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [isWiping, setIsWiping] = useState(false);
  const [wipeError, setWipeError] = useState('');

  const WIPE_CONFIRMATION_PHRASE = 'DELETE';
  const isConfirmValid = confirmInput === WIPE_CONFIRMATION_PHRASE;

  // ── Global Wipe Handler ────────────────────────────────────────────
  const handleGlobalWipe = useCallback(async () => {
    if (!isConfirmValid) return;
    setIsWiping(true);
    setWipeError('');

    try {
      const tables = db.tables;
      await db.transaction('rw', tables, async () => {
        for (const table of tables) {
          await table.clear();
        }
      });

      sessionStorage.clear();
      localStorage.clear();

      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      } catch (cacheErr) {
        console.warn('[SystemTab] CacheStorage wipe partial:', cacheErr);
      }

      logoutUser();
      setIdentity(null);
    } catch (err) {
      console.error('[SystemTab] Global Data Wipe failed:', err);
      setWipeError(err instanceof Error ? err.message : 'Wipe failed. Check console for details.');
      setIsWiping(false);
    }
  }, [isConfirmValid, setIdentity]);

  const handleSyncAndPurge = async () => {
    if (!dirHandle) {
      setBackupError("No backup directory selected.");
      return;
    }
    
    setIsSyncing(true);
    setSyncToast(null);
    setBackupError(null);
    
    try {
      // Get all audit logs
      const logs = await db.audit_logs.toArray();
      
      // Export logs to directory
      const logsFileName = `audit_logs_${new Date().toISOString().split('T')[0]}.json`;
      const logsFileHandle = await dirHandle.getFileHandle(logsFileName, { create: true });
      const logsWritable = await logsFileHandle.createWritable();
      await logsWritable.write(JSON.stringify(logs, null, 2));
      await logsWritable.close();
      
      setSyncToast(`Successfully backed up ${logs.length} audit logs to ${logsFileName}`);
      
      // Note: Actual purging logic would go here once configured
      // For now, just log the sync event
      await db.audit_logs.add({
        timestamp: new Date().toISOString(),
        action: 'SYSTEM_BACKUP_SYNC',
        tableName: 'app_settings',
        pseudokey: identity?.pseudokey || 'SYSTEM',
        details: { records: logs.length, status: 'success' }
      });
      
      setTimeout(() => setSyncToast(null), 4000);
    } catch (err) {
      console.error("Sync and purge failed:", err);
      setBackupError(err instanceof Error ? err.message : "Sync and purge operation failed");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCloseWipeModal = () => {
    setShowWipeModal(false);
    setConfirmInput('');
    setWipeError('');
  };

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
      const timestamp = new Date(log.timestamp).toLocaleString().toLowerCase();
      const action = parsedDetails.event.toLowerCase();
      const status = parsedDetails.status.toLowerCase();
      const alias = log.pseudokey.toLowerCase();

      const matchesSearch = timestamp.includes(q) || 
                            action.includes(q) || 
                            status.includes(q) || 
                            alias.includes(q);
      
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
      const BLACKLIST_PATTERNS = ['vector', 'embedding', 'session', 'history', 'cache', 'audit', 'logs'];
      
      const tablesToExport = db.tables.filter(table => {
        const name = table.name.toLowerCase();
        return !BLACKLIST_PATTERNS.some(pattern => name.includes(pattern));
      });

      setExportToast(`Discovery Complete: Exporting ${tablesToExport.length} Master Data Tables...`);
      
      const dump: Record<string, any[]> = {};
      await Promise.all(
        tablesToExport.map(async (table) => {
          dump[table.name] = await table.toArray();
        })
      );
      
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `niti_brain_export_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      await db.audit_logs.add({
        timestamp: new Date(),
        pseudokey: identity?.username || 'Unknown User',
        action: 'UPDATE',
        tableName: 'system_portability',
        details: JSON.stringify({ event: 'EXPORT_BRAIN', status: 'Success' })
      });
      
      setTimeout(() => setExportToast(null), 3000);
    } catch (e) {
      await db.audit_logs.add({
        timestamp: new Date(),
        pseudokey: identity?.username || 'Unknown User',
        action: 'UPDATE',
        tableName: 'system_portability',
        details: JSON.stringify({ event: 'EXPORT_BRAIN', status: 'Failed' })
      });
      alert("Failed to export database: " + e);
      setExportToast(null);
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
          'service_domains'
        ];

        // Ensure at least one known architectural array exists in the payload, preventing random JSON uploads
        const hasAnyValidKey = requiredTopLevelKeys.some(key => Array.isArray(dump[key]));
        if (!hasAnyValidKey) {
            throw new Error('Invalid NITI Brain Payload: Missing core architectural entities (e.g., principles, layers).');
        }
        
        await db.transaction('rw', 
          [db.architecture_categories, db.master_categories, db.content_metamodel,
          db.architecture_layers, db.architecture_principles, db.service_domains,
          db.bespoke_tags, db.prompt_templates, db.report_templates,
          db.review_workflows, db.app_settings, db.threat_models], 
        async () => {
          if (dump.architecture_categories) await db.architecture_categories.bulkPut(dump.architecture_categories);
          if (dump.master_categories) await db.master_categories.bulkPut(dump.master_categories);
          if (dump.content_metamodel) await db.content_metamodel.bulkPut(dump.content_metamodel);
          if (dump.architecture_layers) await db.architecture_layers.bulkPut(dump.architecture_layers);
          if (dump.architecture_principles) await db.architecture_principles.bulkPut(dump.architecture_principles);
          if (dump.service_domains) await db.service_domains.bulkPut(dump.service_domains);
          if (dump.bian_domains) await db.service_domains.bulkPut(dump.bian_domains); // Fallback for old exports
          if (dump.bespoke_tags) await db.bespoke_tags.bulkPut(dump.bespoke_tags);
          if (dump.prompt_templates) await db.prompt_templates.bulkPut(dump.prompt_templates);
          if (dump.report_templates) await db.report_templates.bulkPut(dump.report_templates);
          if (dump.review_workflows) await db.review_workflows.bulkPut(dump.review_workflows);
          if (dump.app_settings) await db.app_settings.bulkPut(dump.app_settings);
          if (dump.threat_models) await db.threat_models.bulkPut(dump.threat_models);
        });
        
        await db.audit_logs.add({
          timestamp: new Date(),
          pseudokey: identity?.username || 'Unknown User',
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
          pseudokey: identity?.username || 'Unknown User',
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
      <PageHeader 
        icon={<BrainCircuit className="text-indigo-500" />}
        title="State Portability (NITI Brain Transfer)"
        description="Export your agent's entirely localized knowledge base (Categories, Domains, Taxonomies, Templates, Workflow Pipelines, Principles) into a raw JSON struct. Use this to seed new NITI installations without re-training standard metadata manually."
      />

      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800/50 p-6">
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

         {/* Export Telemetry Toast */}
         {exportToast && (
            <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-400 font-medium">{exportToast}</p>
            </div>
         )}
      </div>

      {/* ─── Task 1: Knowledge Sync History Table ─── */}
      <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2 mb-4">
            <History size={16} className="text-gray-500" />
            Knowledge Sync & Portability History
          </h3>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
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
            </div>
            <button 
               onClick={handleExportCSV}
               className="flex items-center gap-2 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md text-xs font-semibold transition-colors shadow-sm ml-auto"
            >
              <Download size={14} />
              Export CSV
            </button>
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
                  <td colSpan={4} className="px-5 py-12 text-center text-gray-500 dark:text-gray-400">
                    <History className="w-8 h-8 text-gray-400 mb-2 mx-auto" />
                    No portability sync history recorded locally.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">Page 1 of 1</span>
          <div className="flex gap-2">
            <button disabled className="px-3 py-1 text-xs font-medium text-gray-500 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md opacity-50 cursor-not-allowed">Previous</button>
            <button disabled className="px-3 py-1 text-xs font-medium text-gray-500 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md opacity-50 cursor-not-allowed">Next</button>
          </div>
        </div>
      </div>

      {/* ── Continuous Local Backup ─────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2 flex items-center gap-2">
          <FolderOutput size={18} className="text-blue-500" />
          Continuous Local Backup
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Map a local OS directory to dump database records directly to your hard drive before purging them from the browser to prevent IndexedDB quota limits.
        </p>
        
        {isConfigured ? (
          isPermissionSuspended ? (
            // Permission Suspended State
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3 mb-3">
                <AlertTriangle size={16} className="text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-orange-800 dark:text-orange-200">Backup Access Suspended</h4>
                  <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                    Your permission to access the backup directory was revoked (likely after browser restart). Restore access to resume automatic backups.
                  </p>
                </div>
              </div>
              <p className="text-xs text-orange-700 dark:text-orange-300 mb-3 font-mono">
                Path: {backupPath}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleRestoreBackupAccess}
                  disabled={isRestoringPermission}
                  className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-2"
                >
                  <RefreshCw size={14} className={isRestoringPermission ? 'animate-spin' : ''} />
                  {isRestoringPermission ? 'Restoring...' : 'Restore Backup Access'}
                </button>
                <button
                  onClick={handleRemoveConfiguration}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Remove Configuration
                </button>
              </div>
            </div>
          ) : (
            // Active Configuration State
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">Current Configuration</h4>
              <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                Active Path: {backupPath}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleConfigureBackup}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Edit / Reconfigure
                </button>
                <button
                  onClick={handleRemoveConfiguration}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Remove Configuration
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <button
              onClick={handleConfigureBackup}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-gray-300 dark:border-gray-600"
            >
              <FolderOutput size={16} />
              Configure Backup Folder
            </button>
          </div>
        )}

        {backupError && (
          <div className="mt-3 text-red-500 dark:text-red-400 text-sm font-medium flex items-center gap-2">
            <AlertTriangle size={14} />
            {backupError}
          </div>
        )}

        {syncToast && (
          <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-lg">
            <p className="text-sm text-green-700 dark:text-green-400 font-medium">{syncToast}</p>
          </div>
        )}
      </div>

      {/* ── Danger Zone ─────────────────────────────────────────────── */}
      <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-red-800 dark:text-red-400 mb-1">Danger Zone — Global Data Wipe</h3>
            <p className="text-sm text-red-700 dark:text-red-500/80 mb-4">
              Irreversibly destroy <strong>all</strong> local data: IndexedDB tables, cached AI model weights (OPFS/CacheStorage), session tokens, and local preferences.
            </p>
            <button
              id="global-data-wipe-trigger"
              onClick={() => setShowWipeModal(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Trash2 size={14} />
              Initiate Global Data Wipe
            </button>
          </div>
        </div>
      </div>

      {/* ── Wipe Confirmation Modal ────────────────────────────────── */}
      {showWipeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={handleCloseWipeModal}>
          <div className="bg-white dark:bg-gray-900 border border-red-300 dark:border-red-800 rounded-xl p-6 w-[95%] max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Confirm Global Data Wipe</h3>
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">This action is permanent and irreversible.</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">This will destroy all data stored by EA-NITI in this browser:</p>
            <ul className="text-xs text-gray-500 dark:text-gray-500 mb-5 space-y-1 list-disc pl-4">
              <li>All IndexedDB tables (reviews, principles, domains, threat models, guardrails…)</li>
              <li>Cached AI model weights (OPFS / CacheStorage)</li>
              <li>Session tokens, preferences, and audit logs</li>
              <li>Enterprise knowledge embeddings</li>
            </ul>

            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Type <code className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs font-bold">DELETE</code> to confirm:
            </label>
            <input
              id="global-wipe-confirm-input"
              type="text"
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              placeholder="Type DELETE here"
              autoFocus
              autoComplete="off"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none mb-2"
            />

            {wipeError && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{wipeError}</p>}

            <div className="flex justify-end gap-3 mt-4">
              <button onClick={handleCloseWipeModal} disabled={isWiping} className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors text-sm">Cancel</button>
              <button
                id="global-wipe-execute-btn"
                onClick={handleGlobalWipe}
                disabled={!isConfirmValid || isWiping}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {isWiping ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Wiping…
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    Wipe All Data
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
