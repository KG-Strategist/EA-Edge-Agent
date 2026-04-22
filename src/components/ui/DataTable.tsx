import React, { useState, useMemo, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';

export interface DataTableColumn<T> {
  key: keyof T | string;
  label: React.ReactNode;
  width?: string;
  render?: (row: T, value: any) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
}

export interface DataTableAction<T> {
  label: string;
  icon: React.ReactNode;
  onClick: (row: T) => void;
  className?: string;
  disabled?: (row: T) => boolean;
  title?: (row: T) => string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  actions?: DataTableAction<T>[];
  keyField: keyof T;
  emptyMessage?: string;
  striped?: boolean;
  hover?: boolean;
  containerClassName?: string;
  pagination?: boolean;
  itemsPerPage?: number;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchFields?: (keyof T)[];
  renderExpandedRow?: (row: T) => React.ReactNode;
}

interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  actions,
  keyField,
  emptyMessage = 'No data found.',
  striped = true,
  hover = true,
  containerClassName = '',
  pagination = false,
  itemsPerPage = 10,
  searchable = false,
  searchPlaceholder = 'Search...',
  searchFields = [],
  renderExpandedRow,
}: DataTableProps<T>) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, data]);

  const filteredData = useMemo(() => {
    if (!searchable || !searchTerm.trim() || searchFields.length === 0) return data;
    const lowerQuery = searchTerm.toLowerCase();
    return data.filter(row => {
      return searchFields.some(field => {
        const val = row[field];
        if (val == null) return false;
        return String(val).toLowerCase().includes(lowerQuery);
      });
    });
  }, [data, searchTerm, searchable, searchFields]);

  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;

    const sorted = [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key as keyof T];
      const bVal = b[sortConfig.key as keyof T];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bVal == null) return sortConfig.direction === 'asc' ? -1 : 1;

      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [filteredData, sortConfig]);

  const displayData = useMemo(() => {
    if (!pagination) return sortedData;
    const start = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(start, start + itemsPerPage);
  }, [sortedData, pagination, currentPage, itemsPerPage]);

  const handleSort = (columnKey: string) => {
    setSortConfig(prev => {
      if (prev?.key === columnKey) {
        return prev.direction === 'asc'
          ? { key: columnKey, direction: 'desc' }
          : null;
      }
      return { key: columnKey, direction: 'asc' };
    });
    setCurrentPage(1);
  };

  return (
    <div className={`flex flex-col gap-4 ${containerClassName}`}>
      {searchable && (
        <div className="flex justify-end">
          <div className="relative w-full sm:w-64 shrink-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
        <table className="w-full text-left border-separate border-spacing-0">
          <thead className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-900 shadow-[0_1px_0_0_theme(colors.gray.200)] dark:shadow-[0_1px_0_0_theme(colors.gray.700)]">
            <tr>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={`px-6 py-3 font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider ${
                    col.width ? `w-${col.width}` : ''
                  } ${col.headerClassName || ''} ${
                    col.sortable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors' : ''
                  }`}
                  onClick={() => col.sortable && handleSort(String(col.key))}
                >
                  <div className="flex items-center gap-2">
                    <span>{col.label}</span>
                    {col.sortable && (
                      <div className="inline-flex items-center">
                        {sortConfig?.key === String(col.key) ? (
                          sortConfig.direction === 'asc' ? (
                            <ChevronUp size={14} className="text-blue-500" />
                          ) : (
                            <ChevronDown size={14} className="text-blue-500" />
                          )
                        ) : (
                          <div className="w-[14px] h-[14px]" />
                        )}
                      </div>
                    )}
                  </div>
                </th>
              ))}
              {actions && actions.length > 0 && (
                <th className="px-6 py-3 font-semibold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider text-right">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {displayData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (actions ? 1 : 0)}
                  className="px-6 py-8 text-center text-gray-500 dark:text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              displayData.map((row, idx) => (
                <React.Fragment key={String(row[keyField])}>
                  <tr
                    className={`border-b border-gray-100 dark:border-gray-800/50 ${
                      hover ? 'hover:bg-gray-50 dark:hover:bg-gray-800/30' : ''
                    } ${striped && idx % 2 === 0 ? 'bg-gray-50/30 dark:bg-gray-800/20' : ''}`}
                  >
                    {columns.map((col) => {
                      const value = row[col.key as keyof T];
                      return (
                        <td
                          key={String(col.key)}
                          className={`px-6 py-4 text-gray-900 dark:text-gray-200 ${col.className || ''}`}
                        >
                          {col.render ? col.render(row, value) : String(value)}
                        </td>
                      );
                    })}
                    {actions && actions.length > 0 && (
                      <td className="px-6 py-4 text-right space-x-2 flex justify-end">
                        {actions.map((action, idx) => (
                          <button
                            key={idx}
                            onClick={() => action.onClick(row)}
                            disabled={action.disabled?.(row)}
                            title={action.title?.(row)}
                            className={`p-1.5 transition-colors ${
                              action.className ||
                              'text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
                            } ${action.disabled?.(row) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            aria-label={action.label}
                          >
                            {action.icon}
                          </button>
                        ))}
                      </td>
                    )}
                  </tr>
                  {renderExpandedRow && renderExpandedRow(row) && (
                    <tr>
                      <td colSpan={columns.length + (actions?.length ? 1 : 0)}>
                        {renderExpandedRow(row)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer – always mounted, even when there are no rows */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
          Showing {sortedData.length === 0 ? 0 : ((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, sortedData.length)} of {sortedData.length} entries
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))
            }
            disabled={currentPage === 1}
            className="p-1.5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Previous Page"
            aria-label="Previous Page"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setCurrentPage(p => Math.min(Math.ceil(sortedData.length / itemsPerPage), p + 1))}
            disabled={currentPage >= Math.ceil(sortedData.length / itemsPerPage) || sortedData.length === 0}
            className="p-1.5 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Next Page"
            aria-label="Next Page"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
