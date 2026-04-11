import { useStateContext } from '../../context/StateContext';
import { ChevronDown, ChevronUp, CheckCircle, AlertCircle, X, DownloadCloud } from 'lucide-react';

export default function GlobalProgressWidget() {
  const { downloadState, setDownloadState } = useStateContext();

  if (!downloadState.isActive) return null;

  const handleDismiss = () => {
    setDownloadState(prev => ({ ...prev, isActive: false }));
  };

  const handleRetry = () => {
    // Air-gapped failover logic: React Router is not physically installed in this architecture.
    // Executing the standard custom event bus navigation to reach Agent Settings.
    window.dispatchEvent(new CustomEvent('EA_NAVIGATE', { 
      detail: { view: 'agent-config', subView: 'configs' } 
    }));
    handleDismiss();
  };

  const toggleMinimize = () => {
    setDownloadState(prev => ({ ...prev, isMinimized: !prev.isMinimized }));
  };

  return (
    <div className={`fixed top-16 right-6 z-50 w-full max-w-[280px] sm:max-w-sm transition-all duration-300 transform ${downloadState.isActive ? 'translate-y-0 opacity-100 pointer-events-auto' : '-translate-y-4 opacity-0 pointer-events-none'}`}>
      <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden transition-all duration-300 ${downloadState.isMinimized ? 'w-64' : 'w-full'}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 cursor-pointer" onClick={toggleMinimize}>
          <div className="flex items-center gap-2">
            {downloadState.status === 'Downloading' && <DownloadCloud size={16} className="text-blue-600 dark:text-blue-400 animate-pulse" />}
            {downloadState.status === 'Complete' && <CheckCircle size={16} className="text-green-600 dark:text-green-400" />}
            {downloadState.status === 'Error' && <AlertCircle size={16} className="text-red-600 dark:text-red-400" />}
            
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {downloadState.status === 'Downloading' ? 'Caching Model...' : downloadState.status}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); toggleMinimize(); }} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-gray-500">
              {downloadState.isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {(downloadState.status === 'Complete' || downloadState.status === 'Error') && (
              <button onClick={(e) => { e.stopPropagation(); handleDismiss(); }} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-gray-500">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        {!downloadState.isMinimized && (
          <div className="p-4 bg-white dark:bg-gray-900">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Progress</span>
              <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{downloadState.progressPercentage}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2.5 mb-3 overflow-hidden">
              <div 
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  downloadState.status === 'Complete' ? 'bg-green-500' :
                  downloadState.status === 'Error' ? 'bg-red-500' : 'bg-blue-600'
                }`} 
                style={{ width: `${downloadState.progressPercentage}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate w-full" title={downloadState.progressText}>
              {downloadState.progressText}
            </p>
            
            {downloadState.status === 'Error' && downloadState.message && (
              <p className="text-[10px] text-red-600 dark:text-red-400 mt-2 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-800 break-words whitespace-pre-wrap max-h-24 overflow-y-auto">
                {downloadState.message}
              </p>
            )}

            {(downloadState.status === 'Complete' || downloadState.status === 'Error') && (
              <div className="mt-4 flex justify-end gap-2">
                {downloadState.status === 'Error' && (
                  <button 
                    onClick={handleRetry}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    Retry Configuration
                  </button>
                )}
                <button 
                  onClick={handleDismiss}
                  className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
