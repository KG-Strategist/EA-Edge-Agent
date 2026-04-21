import { useState, useMemo, useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, AuditLog } from '../../lib/db';
import { Search, Download, CalendarDays, ClipboardList, Eye, X, RefreshCw } from 'lucide-react';
import PageHeader from '../ui/PageHeader';
import ConfirmModal from '../ui/ConfirmModal';
import { importJsonToTable } from '../../utils/importUtils';
import { useLocalBackupState } from '../../hooks/useLocalBackupState';

/** Convert a Date to a local YYYY-MM-DD string for date input comparison. */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function AuditWorkspaceTab({ setAdminSubView }: { setAdminSubView?: (v: string) => void }) {
  const logs = useLiveQuery(() => db.audit_logs.reverse().limit(500).toArray());

  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const { isConfigured, lastBackupDate, backupPath } = useLocalBackupState();
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  // ── Filtered logs (text + date range) ──────────────────────────────
  const filteredLogs = useMemo(() => {
    if (!logs) return [];

    const tokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);

    return logs.filter(log => {
      // Text filter: Tokenized Omni-Search
      if (tokens.length > 0) {
        const formattedTime = new Date(log.timestamp).toLocaleString().toLowerCase();
        const detailsStr = log.details 
          ? (typeof log.details === 'string' ? log.details : JSON.stringify(log.details)).toLowerCase() 
          : '';
        
        const searchableString = `${formattedTime} ${log.action.toLowerCase()} ${log.tableName.toLowerCase()} ${log.pseudokey.toLowerCase()} ${detailsStr}`;
        
        const matchesText = tokens.every(token => searchableString.includes(token));
        if (!matchesText) return false;
      }

      // Date range filter
      const logDate = toLocalDateString(new Date(log.timestamp));
      if (startDate && logDate < startDate) return false;
      if (endDate && logDate > endDate) return false;

      return true;
    });
  }, [logs, searchQuery, startDate, endDate]);

  // ── Pagination ─────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, startDate, endDate]);

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
      });
      const file = await fileHandle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.audit_logs && Array.isArray(data.audit_logs)) {
        await db.audit_logs.bulkPut(data.audit_logs);
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
      // TODO: Optionally trigger a UI toast error here
      return;
    }

    // Trigger backup sync - this is a placeholder that would integrate with
    // the actual backup sync engine (sideloadEngine, exportEngine, etc.)
    console.log('Backup sync initiated for path:', backupPath);
    // TODO: Integrate with actual backup export/sync logic
  }, [backupPath]);

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
          {/* Text Search */}
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              id="audit-search-input"
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search action, table, user…"
              className="w-full pl-9 pr-4 py-1.5 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg outline-none focus:border-blue-500 dark:focus:border-blue-500 text-gray-900 dark:text-white"
            />
          </div>

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
          <table className="w-full text-left border-collapse text-sm">
            <thead className="bg-gray-100 dark:bg-gray-800/80 sticky top-0 z-10">
              <tr className="text-xs uppercase text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Table</th>
                <th className="px-4 py-3 font-medium">User Alias</th>
                <th className="px-4 py-3 font-medium">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {paginatedLogs.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                      (l.action === 'CREATE' || l.action === 'INSERT') ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      l.action === 'UPDATE' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      l.action === 'DELETE' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                      {l.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-900 dark:text-white uppercase text-xs">{l.tableName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">
                    {l.pseudokey === 'DELETED_USER' ? (
                      <span className="italic text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">Deleted User</span>
                    ) : (
                      l.pseudokey
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelectedLog(l)} className="text-gray-400 hover:text-blue-500 transition-colors" title="View Details">
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    {logs && logs.length > 0 ? 'No logs match your current filters.' : 'No audit logs recorded yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination UI */}
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Previous
            </button>
            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Next
            </button>
          </div>
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
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Purge Logs
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
