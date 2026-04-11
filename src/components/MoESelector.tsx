import { useState, useEffect } from 'react';
import { scanLocalModels, setGlobalMoETarget, globalMoETarget } from '../lib/aiEngine';
import { ChevronDown, HardDrive, Zap, AlertCircle } from 'lucide-react';

interface CachedModel {
  modelId: string;
  isCached: boolean;
}

export default function MoESelector() {
  const [models, setModels] = useState<CachedModel[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<string>(globalMoETarget);

  useEffect(() => {
    let isMounted = true;
    const fetchModels = async () => {
      // Do not block UI thread, run async
      const results = await scanLocalModels();
      if (isMounted) {
        setModels(results);
      }
    };
    fetchModels();

    // Listen for cache updates if any (optional, but good for reactivity)
    const handleProgress = () => {
      fetchModels();
    };
    window.addEventListener('EA_AI_PROGRESS', handleProgress);
    return () => {
      isMounted = false;
      window.removeEventListener('EA_AI_PROGRESS', handleProgress);
    };
  }, []);

  const handleSelect = (target: string) => {
    setSelected(target);
    setGlobalMoETarget(target);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      >
        <Zap size={14} className="text-blue-500" />
        <span className="truncate max-w-[120px]">
          {selected === 'Auto-Route (MoE)' ? 'Auto-Route (MoE)' : selected}
        </span>
        <ChevronDown size={14} className="text-gray-500" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-64 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 py-1">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Execution Target
            </span>
          </div>

          <button
            onClick={() => handleSelect('Auto-Route (MoE)')}
            className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${
              selected === 'Auto-Route (MoE)'
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <span className="font-medium">Auto-Route (MoE)</span>
            <span className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">Default</span>
          </button>

          <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 mt-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Local OPFS Cache
            </span>
          </div>

          {models.length === 0 ? (
            <div className="px-4 py-2 text-sm text-gray-500 italic">Scanning cache...</div>
          ) : (
            models.map((m) => (
              <button
                key={m.modelId}
                onClick={() => m.isCached && handleSelect(m.modelId)}
                disabled={!m.isCached}
                className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${
                  selected === m.modelId 
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
                    : m.isCached 
                      ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800' 
                      : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
                }`}
              >
                <span className="truncate pr-2">{m.modelId}</span>
                {m.isCached ? (
                  <div title="Cached Locally"><HardDrive size={14} className="text-green-500 shrink-0" /></div>
                ) : (
                  <div title="Requires Download"><AlertCircle size={14} className="text-amber-500 shrink-0" /></div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
