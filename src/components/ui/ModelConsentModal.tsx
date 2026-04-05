import React, { useState, useEffect } from 'react';
import { AlertTriangle, DownloadCloud, ShieldAlert, Cpu, X, Check } from 'lucide-react';
import { initAIEngine } from '../../lib/aiEngine';
import { useStateContext } from '../../context/StateContext';

export default function ModelConsentModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [networkEnabled, setNetworkEnabled] = useState(false);
  const [targetModelId, setTargetModelId] = useState('');
  const [executionTarget, setExecutionTarget] = useState('Domain SME Model');
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progressPercentage, setProgressPercentage] = useState(0);
  
  const { setSystemHealth } = useStateContext();

  useEffect(() => {
    const handleConsentEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      setNetworkEnabled(customEvent.detail.networkEnabled);
      setTargetModelId(customEvent.detail.targetModelId);
      setExecutionTarget(customEvent.detail.executionTarget || 'Domain SME Model');
      setIsOpen(true);
    };

    window.addEventListener('EA_AI_CONSENT_REQUIRED', handleConsentEvent);
    return () => window.removeEventListener('EA_AI_CONSENT_REQUIRED', handleConsentEvent);
  }, []);

  const handleDownload = async () => {
    setIsDownloading(true);
    setProgressText('Initiating download...');
    
    try {
      await initAIEngine((progress) => {
        setProgressText(progress.text);
        setProgressPercentage(Math.round(progress.progress * 100));
        setSystemHealth((prev: any) => ({
          ...prev,
          aiModelsStatus: `Downloading (${Math.round(progress.progress * 100)}%)`
        }));
      }, true, executionTarget as 'Domain SME Model' | 'EA Core Model'); // Pass forceDownload = true AND requestedTarget
      
      setSystemHealth((prev: any) => ({
        ...prev,
        aiModelsStatus: 'Loaded & Ready (WebGPU)'
      }));
      
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to download model:', error);
      setProgressText(`Error: ${error instanceof Error ? error.message : 'Download failed'}`);
      setSystemHealth((prev: any) => ({
        ...prev,
        aiModelsStatus: 'Error'
      }));
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] px-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative overflow-hidden">
        
        {/* Dynamic Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className={`p-3 rounded-xl shrink-0 ${networkEnabled ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400' : 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400'}`}>
            {networkEnabled ? <DownloadCloud size={28} /> : <ShieldAlert size={28} />}
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              {networkEnabled ? 'AI Model Download Required' : 'Air-Gap Security Block'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {networkEnabled ? 'Local caching initiated for ' + targetModelId : 'External network requests are currently disabled.'}
            </p>
          </div>
        </div>

        {/* Content Body */}
        <div className="mb-8">
          {!networkEnabled ? (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800 space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                EA NITI operates as a completely offline system. It requires the local LLM model weights to be downloaded to your browser's persistent storage.
              </p>
              <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400 font-medium">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <p>Action Blocked: To preserve air-gap integrity, you must explicitly enable "External Network Features" in the Control Panel.</p>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800 space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                To run the AI completely locally, we need to cache the neural network weights into your browser (IndexedDB).
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 mt-3 list-disc pl-5">
                <li><strong>Size:</strong> ~1.8 GB (one-time download)</li>
                <li><strong>Privacy:</strong> Once downloaded, it operates 100% offline.</li>
                <li><strong>Hardware requirement:</strong> WebGPU capable browser & device.</li>
              </ul>
              
              {isDownloading && (
                <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Download Progress</span>
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{progressPercentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progressPercentage}%` }}></div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 truncate w-full">{progressText}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-2">
          {!isDownloading && (
            <button 
              onClick={() => setIsOpen(false)} 
              className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {networkEnabled ? 'Cancel' : 'Understood'}
            </button>
          )}
          
          {networkEnabled && !isDownloading && (
            <button 
              onClick={handleDownload}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-transform active:scale-95 shadow-md shadow-blue-500/20"
            >
              <DownloadCloud size={18} />
              Consent & Download
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
