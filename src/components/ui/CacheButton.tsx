import { useState, useEffect } from 'react';
import { Download, Loader2, CheckCircle2 } from 'lucide-react';
import { useStateContext } from '../../context/StateContext';
import { isModelCached } from '../../lib/aiEngine';
import { checkNetworkConsent, NetworkDisabledError } from '../../utils/networkGuard';

interface CacheButtonProps {
  modelId: string;
  modelUrl: string;
  onPull: (id: string, url: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function CacheButton({ modelId, modelUrl, onPull, disabled, className }: CacheButtonProps) {
  const { downloadState } = useStateContext();
  const [isCached, setIsCached] = useState<boolean | null>(null);

  useEffect(() => {
    const checkCache = async () => {
      if (!modelId) return;
      const cached = await isModelCached(modelId);
      setIsCached(cached);
    };
    checkCache();
    
    // Periodically check cache to catch external updates
    const interval = setInterval(checkCache, 5000);
    return () => clearInterval(interval);
  }, [modelId]);

  // If global download state says this model is complete, update local state immediately
  useEffect(() => {
    if (downloadState.status === 'Complete' && downloadState.modelId === modelId) {
      setIsCached(true);
    }
  }, [downloadState.status, downloadState.modelId, modelId]);

  const isDownloading = downloadState.status === 'Downloading' && downloadState.modelId === modelId;

  const handlePullClick = async () => {
    try {
      await checkNetworkConsent();
      onPull(modelId, modelUrl);
    } catch (error) {
      if (error instanceof NetworkDisabledError) {
        window.dispatchEvent(new CustomEvent('EA_NETWORK_BLOCK_ALERT', {
          detail: { 
            title: 'External Network Disabled',
            message: 'You must enable External Network Features in the Network & Privacy settings to download web caches. Air-gap mode is currently strictly enforced.'
          }
        }));
      } else {
        console.error('Network check failed:', error);
      }
    }
  };

  // 3. CACHED (Present)
  if (isCached) {
    return (
      <button
        disabled
        className={`flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-green-200 dark:border-green-900/30 bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-400 cursor-default opacity-100 ${className}`}
      >
        <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
        Cached
      </button>
    );
  }

  // 2. DOWNLOADING
  if (isDownloading) {
    return (
      <button
        disabled
        className={`flex items-center px-3 py-1.5 rounded-md text-xs font-medium border border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 cursor-wait ${className}`}
      >
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Caching...
      </button>
    );
  }

  // 1. MISSING (Default)
  return (
    <button
      onClick={handlePullClick}
      disabled={disabled}
      className={`flex items-center px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <Download className="w-4 h-4 mr-2" />
      Cache
    </button>
  );
}
