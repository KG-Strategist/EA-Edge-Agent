import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, AuditLog } from '../../lib/db';
import { Download, CalendarDays, ClipboardList, Eye, X, RefreshCw } from 'lucide-react';
import PageHeader from '../ui/PageHeader';
import ConfirmModal from '../ui/ConfirmModal';
import DataTable from '../ui/DataTable';
import { useLocalBackupState } from '../../hooks/useLocalBackupState';
import { useStateContext } from '../../context/StateContext';

/** Convert a Date to a local YYYY-MM-DD string for date input comparison. */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const getActionBadgeColor = (action: string): string => {
  const map: Record<string, string> = {
    'CREATE': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'UPDATE': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    'DELETE': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    'LOGIN': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    'SYSTEM_BACKUP_CONFIGURED': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'SYSTEM_BACKUP_REVOKED': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    'WEBLLM_CACHE_CONSENT': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  };
  return map[action] || 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
};

export default function AuditWorkspaceTab({ setAdminSubView }: { setAdminSubView?: (v: string) => void }) {
  const logs = useLiveQuery(() => db.audit_logs.reverse().limit(500).toArray());

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const { isConfigured, lastBackupDate, backupPath } = useLocalBackupState();
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const { identity } = useStateContext();

  // ── Date Range Filtering (Text search moved to DataTable) ────────────────────
  const filteredLogs = useMemo(() => {
    if (!logs) return [];

    return logs.filter(log => {
      const logDate = toLocalDateString(new Date(log.timestamp));
      if (startDate && logDate < startDate) return false;
      if (endDate && logDate > endDate) return false;

      return true;
    });
  }, [logs, startDate, endDate]);

  // ── CSV Export ─────────────────────────────────────────────────────
  const handleExportCSV = useCallback(() => {
    if (filteredLogs.length === 0) return;

    const headers = ['Timestamp', 'Action', 'Table', 'User'];
    const rows = filteredLogs.map(l => [
      new Date(l.timestamp).toISOString(),
      l.action,
      l.tableName,
      l.pseudokey,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ea_niti_audit_log.csv';
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredLogs]);

  const handlePurgeLogs = async () => {
    if (!lastBackupDate) return;
    setIsPurging(true);
    try {
      await db.audit_logs.where('timestamp').below(lastBackupDate).delete();
      setShowPurgeModal(false);
    } catch (err) {
      console.error('Purge failed:', err);
    } finally {
      setIsPurging(false);
    }
  };

  const handleImportLogs = async () => {
    try {
      const [fileHandle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
      });
      const file = await fileHandle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      const logsToImport = Array.isArray(data) ? data : (data.audit_logs || []);

      if (logsToImport.length > 0) {
        await db.audit_logs.bulkPut(logsToImport);
        // Optional: Add a success toast here

        // Audit the Import Action
        await db.audit_logs.add({
          timestamp: new Date(),
          action: 'CREATE',
          tableName: 'audit_logs',
          pseudokey: (identity as any)?.pseudokey || 'SYSTEM',
          details: JSON.stringify({ fileName: file.name, recordsImported: logsToImport.length })
        });
      } else {
        console.error("Import failed: No valid audit logs found in the selected file.");
      }
    } catch (err) {
      console.error('Import failed:', err);
    }
  };

  const handleSyncBackup = useCallback(async () => {
    // Strict action guard: Verify database-level configuration exists
    const activeConfig = await db.app_settings.get('backupDirectoryHandle');
    if (!activeConfig || !activeConfig.value) {
      console.error("Sync aborted: No valid local backup configuration found in database.");
      // ROADMAP (MVP 2.0): Optionally trigger a UI toast error here
      return;
    }

    try {
      const dirHandle = activeConfig.value as FileSystemDirectoryHandle;

      // Fetch all logs
      const logsToExport = await db.audit_logs.toArray();

      // Serialize
      const fileContent = JSON.stringify(logsToExport, null, 2);

      // Generate filename
      const fileName = `ea_niti_audit_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

      // Execute OS Write
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(fileContent);
      await writable.close();

      // Update state
      await db.app_settings.put({ key: 'lastBackupDate', value: new Date().toISOString() });

      // Log the action (Sanitized payload ONLY)
      await db.audit_logs.add({
        timestamp: new Date(),
        action: 'SYSTEM_BACKUP_SYNC',
        tableName: 'audit_logs',
        pseudokey: (identity as any)?.pseudokey || 'SYSTEM',
        details: JSON.stringify({ path: backupPath, filesExported: 1 }) // NO raw dirHandle
      });
    } catch (err) {
      console.error('Sync backup failed:', err);
      // ROADMAP: Add toast notification for user feedback
    }
  }, [backupPath, identity]);

  return (
    <div className="flex flex-col h-full w-full">
      <PageHeader 
        icon={<ClipboardList className="text-emerald-500" />}
        title="Audit Workspace"
        description="Immutable log of system modifications and access. (Offline)"
      />

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden flex-1 flex flex-col">
        {/* Toolbar: Search + Date Range + Export */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex flex-wrap gap-3 items-center shrink-0">


          {/* Date Range */}
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-gray-400 shrink-0" />
            <input
              id="audit-start-date"
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg outline-none focus:border-blue-500 dark:focus:border-blue-500 text-gray-900 dark:text-white"
              aria-label="Start date"
              title="Start date"
              placeholder="Select start date"
            />
            <span className="text-xs text-gray-400">to</span>
            <input
              id="audit-end-date"
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg outline-none focus:border-blue-500 dark:focus:border-blue-500 text-gray-900 dark:text-white"
              aria-label="End date"
              title="End date"
              placeholder="Select end date"
            />
          </div>

          {/* Spacer + Export */}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">
              {filteredLogs.length} record{filteredLogs.length !== 1 ? 's' : ''}
            </span>
            {isConfigured && backupPath ? (
              <span className="text-sm font-mono text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-1.5 rounded-md border border-green-200 dark:border-green-800/50">
                Selected: {backupPath}
              </span>
            ) : (
              !isConfigured && setAdminSubView && (
                <button
                  onClick={() => setAdminSubView('system')}
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Configure Local Backup
                </button>
              )
            )}
            <button
              id="audit-export-csv-btn"
              onClick={handleExportCSV}
              disabled={filteredLogs.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <DataTable<AuditLog>
            data={filteredLogs}
            keyField="id"
            pagination={true}
            itemsPerPage={15}
            searchable={true}
            searchPlaceholder="Filter by action, table, user..."
            searchFields={['action', 'tableName', 'pseudokey', 'details']}
            columns={[
              {
                key: 'timestamp',
                label: 'Timestamp',
                render: (row) => new Date(row.timestamp).toLocaleString()
              },
              {
                key: 'action',
                label: 'Action',
                render: (row) => (
                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${getActionBadgeColor(row.action)}`}>
                    {row.action}
                  </span>
                )
              },
              {
                key: 'tableName',
                label: 'Table',
                render: (row) => (
                  <span className="font-mono text-gray-900 dark:text-white uppercase text-xs">
                    {row.tableName}
                  </span>
                )
              },
              {
                key: 'pseudokey',
                label: 'User Alias',
                render: (row) => (
                  row.pseudokey === 'DELETED_USER' ? (
                    <span className="italic text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                      Deleted User
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-gray-600 dark:text-gray-300">
                      {row.pseudokey}
                    </span>
                  )
                )
              }
            ]}
            actions={[
              {
                label: 'View Details',
                icon: <Eye size={16} />,
                onClick: (row) => setSelectedLog(row)
              }
            ]}
            emptyMessage={logs && logs.length > 0 ? 'No logs match your current filters.' : 'No audit logs recorded yet.'}
            containerClassName="flex flex-col"
          />
        </div>
      </div>

      {/* Lifecycle Dashboard */}
      {isConfigured && backupPath && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Backup Lifecycle</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            Logs safely pruned and backed up until: {lastBackupDate ? new Date(lastBackupDate).toLocaleString() : 'N/A'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleSyncBackup}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <RefreshCw size={14} />
              Sync Backup
            </button>
            <button
              onClick={() => setShowPurgeModal(true)}
              disabled={!lastBackupDate || isPurging}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-medium transition-colors"
            >
              {isPurging ? 'Purging...' : 'Purge Logs'}
            </button>
            <button
              onClick={handleImportLogs}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Import Historical Logs
            </button>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setSelectedLog(null)}>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-[95%] max-w-2xl mx-4 shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Audit Record Details</h3>
              <button onClick={() => setSelectedLog(null)} aria-label="Close audit details" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <pre className="font-mono text-sm bg-gray-900 text-gray-300 p-4 rounded whitespace-pre-wrap break-all">
                {JSON.stringify(
                  {
                    id: selectedLog.id,
                    timestamp: new Date(selectedLog.timestamp).toISOString(),
                    action: selectedLog.action,
                    tableName: selectedLog.tableName,
                    pseudokey: selectedLog.pseudokey,
                    details: selectedLog.details ? (() => {
                      try {
                        return JSON.parse(selectedLog.details);
                      } catch {
                        return selectedLog.details;
                      }
                    })() : null
                  },
                  null,
                  2
                )}
              </pre>
            </div>
            <div className="mt-4 flex justify-end shrink-0">
              <button onClick={() => setSelectedLog(null)} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg text-sm font-medium transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showPurgeModal}
        title="Purge Old Logs"
        message="This will permanently delete audit logs older than the last backup date. Continue?"
        onConfirm={handlePurgeLogs}
        onCancel={() => setShowPurgeModal(false)}
      />
    </div>
  );
}
