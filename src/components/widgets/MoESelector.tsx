import { useState, useEffect, useRef } from 'react';
import { setGlobalMoETarget } from '../../lib/aiEngine';
import { ChevronDown, Zap, Brain, Rocket } from 'lucide-react';
import { useStateContext } from '../../context/StateContext';

export default function MoESelector() {
  const { executionMode, setExecutionMode } = useStateContext();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (target: string) => {
    setExecutionMode(target);
    setGlobalMoETarget(target);
    setIsOpen(false);
  };

  const getActiveIcon = () => {
    switch (executionMode) {
      case 'Primary EA Agent': return <Brain size={16} className="text-purple-500" />;
      case 'Tiny Triage Agent': return <Rocket size={16} className="text-green-500" />;
      case 'Auto-Route (MoE)':
      default: return <Zap size={16} className="text-blue-500" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        title="Execution Mode"
      >
        <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">Mode:</span>
        {getActiveIcon()}
        <ChevronDown size={14} className="text-gray-500 ml-0.5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 py-1">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Execution Mode
            </span>
          </div>

          <button
            onClick={() => handleSelect('Auto-Route (MoE)')}
            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
              executionMode === 'Auto-Route (MoE)'
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <Zap size={16} className={executionMode === 'Auto-Route (MoE)' ? 'text-blue-500' : 'text-gray-400'} />
            <span className="font-medium">Auto-Route (MoE)</span>
          </button>

          <button
            onClick={() => handleSelect('Primary EA Agent')}
            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
              executionMode === 'Primary EA Agent'
                ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <Brain size={16} className={executionMode === 'Primary EA Agent' ? 'text-purple-500' : 'text-gray-400'} />
            <span className="font-medium">Primary EA Agent</span>
          </button>

          <button
            onClick={() => handleSelect('Tiny Triage Agent')}
            className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
              executionMode === 'Tiny Triage Agent'
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <Rocket size={16} className={executionMode === 'Tiny Triage Agent' ? 'text-green-500' : 'text-gray-400'} />
            <span className="font-medium">Tiny Triage Agent</span>
          </button>
        </div>
      )}
    </div>
  );
}
