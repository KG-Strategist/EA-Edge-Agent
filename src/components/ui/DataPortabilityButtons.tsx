import React from 'react';
import { Download, Upload } from 'lucide-react';

interface DataPortabilityButtonsProps {
  onExport: () => void;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function DataPortabilityButtons({ onExport, onImport }: DataPortabilityButtonsProps) {
  return (
    <>
      <label className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer transition-colors text-sm border border-gray-200 dark:border-transparent">
        <Upload size={16} />
        <span className="hidden sm:inline">Import</span>
        <input type="file" accept=".json" className="hidden" onChange={onImport} />
      </label>
      <button 
        onClick={onExport} 
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors text-sm border border-gray-200 dark:border-transparent"
      >
        <Download size={16} />
        <span className="hidden sm:inline">Export</span>
      </button>
    </>
  );
}
