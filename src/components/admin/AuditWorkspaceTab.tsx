import { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { Search, Download, CalendarDays } from 'lucide-react';

/** Convert a Date to a local YYYY-MM-DD string for date input comparison. */
function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function AuditWorkspaceTab() {
  const logs = useLiveQuery(() => db.audit_logs.reverse().limit(500).toArray());

  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // ── Filtered logs (text + date range) ──────────────────────────────
  const filteredLogs = useMemo(() => {
    if (!logs) return [];

    const query = searchQuery.toLowerCase().trim();

    return logs.filter(log => {
      // Text filter: match against action, tableName, pseudokey
      if (query) {
        const matchesText =
          log.action.toLowerCase().includes(query) ||
          log.tableName.toLowerCase().includes(query) ||
          log.pseudokey.toLowerCase().includes(query);
        if (!matchesText) return false;
      }

      // Date range filter
      const logDate = toLocalDateString(new Date(log.timestamp));
      if (startDate && logDate < startDate) return false;
      if (endDate && logDate > endDate) return false;

      return true;
    });
  }, [logs, searchQuery, startDate, endDate]);

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

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Audit Workspace</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Immutable log of system modifications and access. (Offline)</p>
        </div>
      </div>

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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {filteredLogs.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                      l.action === 'CREATE' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                      l.action === 'UPDATE' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      l.action === 'DELETE' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                      'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                      {l.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white uppercase text-xs">{l.tableName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{l.pseudokey}</td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    {logs && logs.length > 0 ? 'No logs match your current filters.' : 'No audit logs recorded yet.'}
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
