import React, { useState } from 'react';
import { Info, ChevronDown, ChevronUp } from 'lucide-react';

interface PageInfoTileProps {
  title: string;
  description: React.ReactNode;
  defaultExpanded?: boolean;
}

export default function PageInfoTile({ title, description, defaultExpanded = false }: PageInfoTileProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl mb-6 overflow-hidden transition-all duration-300">
      <button 
        type="button"
        onClick={() => setExpanded(!expanded)} 
        className="w-full flex items-center justify-between p-4 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Info className="text-blue-600 dark:text-blue-400 shrink-0" size={18} />
          <h4 className="font-medium text-blue-900 dark:text-blue-300 text-sm">{title}</h4>
        </div>
        {expanded ? (
          <ChevronUp className="text-blue-500/70" size={16} />
        ) : (
          <ChevronDown className="text-blue-500/70" size={16} />
        )}
      </button>
      
      {expanded && (
        <div className="px-10 pb-4 text-sm text-blue-800/80 dark:text-blue-200/80 leading-relaxed animate-in fade-in slide-in-from-top-2">
          {description}
        </div>
      )}
    </div>
  );
}
