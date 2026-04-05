import React, { useState } from 'react';
import ConfirmModal from './ConfirmModal';

interface StatusToggleProps {
  currentStatus: string;
  statusOptions: string[];
  onChange: (newStatus: string) => void;
  colorMap?: Record<string, string>;
  size?: 'sm' | 'md';
  readonly?: boolean;
}

const DEFAULT_COLORS: Record<string, string> = {
  'Active': 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400 border-green-200 dark:border-green-800',
  'Needs Review': 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border-amber-200 dark:border-amber-800',
  'Draft': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  'Deprecated': 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400 border-gray-200 dark:border-gray-600',
  'Inactive': 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 border-red-200 dark:border-red-800',
};

export default function StatusToggle({ currentStatus, statusOptions, onChange, colorMap, size = 'sm', readonly = false }: StatusToggleProps) {
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const colors = { ...DEFAULT_COLORS, ...colorMap };
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (readonly) return;
    const currentIndex = statusOptions.indexOf(currentStatus);
    const nextIndex = (currentIndex + 1) % statusOptions.length;
    setPendingStatus(statusOptions[nextIndex]);
  };

  const handleConfirm = () => {
    if (pendingStatus) {
      onChange(pendingStatus);
      setPendingStatus(null);
    }
  };

  const colorClass = colors[currentStatus] || 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-700';
  const sizeClass = size === 'sm' ? 'text-xs px-2.5 py-1' : 'text-sm px-3 py-1.5';
  const interactionClass = readonly ? 'cursor-default opacity-80' : 'cursor-pointer hover:shadow-sm hover:scale-105';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={readonly ? undefined : `Click to change status (→ ${statusOptions[(statusOptions.indexOf(currentStatus) + 1) % statusOptions.length]})`}
        className={`inline-flex items-center gap-1 rounded-full font-medium border transition-all duration-150 select-none ${sizeClass} ${colorClass} ${interactionClass}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
        {currentStatus}
      </button>

      {!readonly && (
        <ConfirmModal
          isOpen={!!pendingStatus}
          title="Confirm Status Change"
          message={
            <span>
              Are you sure you want to change the status from <span className="font-semibold text-gray-900 dark:text-gray-100">{currentStatus}</span> to <span className="font-semibold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">{pendingStatus}</span>?
            </span>
          }
          confirmText="Change Status"
          confirmVariant="primary"
          onConfirm={handleConfirm}
          onCancel={() => setPendingStatus(null)}
        />
      )}
    </>
  );
}
