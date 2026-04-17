import { useState, useEffect } from 'react';
import { AlertTriangle, DownloadCloud, ShieldAlert } from 'lucide-react';
import { initAIEngine } from '../../lib/aiEngine';
import { useStateContext } from '../../context/StateContext';
import { db } from '../../lib/db';

export default function ModelConsentModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [networkEnabled, setNetworkEnabled] = useState(false);
  const [targetModelId, setTargetModelId] = useState('');
  const [targetModelUrl, setTargetModelUrl] = useState('');
  const [modelSize, setModelSize] = useState<string>('Size: Varies (Check documentation)');
  
  const [hasAcknowledged, setHasAcknowledged] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const { setSystemHealth, setDownloadState } = useStateContext();

  useEffect(() => {
    const handleConsentEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      setNetworkEnabled(customEvent.detail.networkEnabled);
      setTargetModelId(customEvent.detail.targetModelId);
      setTargetModelUrl(customEvent.detail.targetModelUrl);
      setModelSize(customEvent.detail.modelSize || 'Size: Varies (Check documentation)');
      setHasAcknowledged(false); // Reset acknowledgment on open
      setIsOpen(true);
    };

    window.addEventListener('EA_AI_CONSENT_REQUIRED', handleConsentEvent);
    return () => window.removeEventListener('EA_AI_CONSENT_REQUIRED', handleConsentEvent);
  }, []);

  const handleDownload = async () => {
    if (!hasAcknowledged) return;
    
    setIsProcessing(true);
    
    try {
      // 1. Await Dexie DB Transaction
      await db.audit_logs.add({
        timestamp: new Date(),
        pseudokey: sessionStorage.getItem('ea_niti_session') || 'Unknown',
        action: 'WEBLLM_CACHE_CONSENT',
        tableName: 'system',
        recordId: targetModelId,
        details: `Consented to network egress for downloading model URL: ${targetModelUrl}`
      });

      console.log('Consent logged, initiating download background task...');
      
      // 2. Only upon DB Success, setup background task and close
      setDownloadState({
        isActive: true,
        isMinimized: false,
        progressPercentage: 0,
        progressText: 'Connecting to registry...',
        modelId: targetModelId,
        status: 'Downloading'
      });
      setIsOpen(false);
      setIsProcessing(false);

      // 3. Trigger WebLLM async safely
      initAIEngine((progress) => {
        setDownloadState(prev => ({
          ...prev,
          progressPercentage: Math.round(progress.progress * 100),
          progressText: progress.text
        }));
        setSystemHealth((prev: any) => ({
          ...prev,
          aiModelsStatus: `Downloading (${Math.round(progress.progress * 100)}%)`
        }));
      }, true, targetModelId, targetModelUrl)
      .then(() => {
        setDownloadState(prev => ({
          ...prev,
          progressPercentage: 100,
          progressText: 'Download Complete! Engine cached to IDB.',
          status: 'Complete'
        }));
        setSystemHealth((prev: any) => ({
          ...prev,
          aiModelsStatus: 'Loaded & Ready (WebGPU)'
        }));
      })
      .catch((error) => {
        console.error('Failed to download model:', error);

        // TASK 3: Enhanced Cache Corruption Handling
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isCacheCorruption = errorMsg.includes("execute 'add' on 'Cache'") || errorMsg.includes('Failed to fetch');
        const userMessage = isCacheCorruption
          ? "Cache corrupted by previous 404 error. Please clear your browser's Site Data/Cache (F12 → Application → Storage → Clear site data) and refresh."
          : errorMsg;

        setDownloadState(prev => ({
          ...prev,
          progressText: `Initialization Failed (WebLLM)`,
          message: userMessage,
          status: 'Error'
        }));
        setSystemHealth((prev: any) => ({
          ...prev,
          aiModelsStatus: 'Error'
        }));
      });

    } catch (error) {
      console.error('Failed to log consent to IDB:', error);
      // DB failed, stay open but alert user
      setIsProcessing(false);
      alert('Security Audit Error: Failed to write to Audit Log. Download aborted to maintain compliance.');
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
              <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-lg">
                <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-1">🚀 Future Roadmap: Hybrid Agentic Ecosystem</h4>
                <p className="text-xs text-indigo-700 dark:text-indigo-200/80">
                  Enabling network features will soon unlock the <strong>EA Marketplace</strong> (community models/prompts) and the <strong>Global EA Network</strong> (direct chat with web-mode global agents).
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-800 space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-300">
                To run the AI completely locally, we need to cache the neural network weights into your browser (IndexedDB).
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2 mt-3 list-disc pl-5">
                <li><strong>Model:</strong> {targetModelId || 'Unknown'}</li>
                <li><strong>Size:</strong> {modelSize} (one-time download)</li>
                <li><strong>Privacy:</strong> Once downloaded, it operates 100% offline.</li>
                <li><strong>Hardware requirement:</strong> WebGPU capable browser & device.</li>
              </ul>
              
              {!isProcessing && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={hasAcknowledged} 
                      onChange={(e) => setHasAcknowledged(e.target.checked)} 
                      className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" 
                    />
                    <span className="text-xs text-gray-700 dark:text-gray-300">
                      <strong>I acknowledge that this action requires network egress.</strong> I confirm this model URL complies with internal safety and malware scanning policies.
                    </span>
                  </label>
                </div>
              )}
              
              <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-lg">
                <h4 className="text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-1">🚀 Future Roadmap: Hybrid Agentic Ecosystem</h4>
                <p className="text-xs text-indigo-700 dark:text-indigo-200/80">
                  By consenting, you are preparing your environment for the upcoming <strong>EA Marketplace</strong> and <strong>Global EA Network</strong> integrations.
                </p>
              </div>
              
              {/* Note: In-modal progress bar removed in favor of Global Progress Widget */}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-2">
          {!isProcessing && (
            <button 
              onClick={() => setIsOpen(false)} 
              className="px-5 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {networkEnabled ? 'Cancel' : 'Understood'}
            </button>
          )}
          
          {networkEnabled && (
            <button 
              onClick={handleDownload}
              disabled={!hasAcknowledged || isProcessing}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-transform active:scale-95 shadow-md shadow-blue-500/20"
            >
              <DownloadCloud size={18} />
              {isProcessing ? 'Processing...' : 'Consent & Download'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
