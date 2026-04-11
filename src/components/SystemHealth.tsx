import React, { useEffect, useState, useRef } from 'react';
import { useStateContext } from '../context/StateContext';
import { Cpu, Database, Brain, Network, UploadCloud } from 'lucide-react';
import { isModelCached, getActiveModelId } from '../lib/aiEngine';

export default function SystemHealth() {
  const { systemHealth, setSystemHealth, downloadState } = useStateContext();
  const [eaCoreCached, setEaCoreCached] = useState<boolean | null>(null);
  const [domainSmeCached, setDomainSmeCached] = useState<boolean | null>(null);

  const [isSideloading, setIsSideloading] = useState(false);
  const [sideloadProgress, setSideloadProgress] = useState({ text: '', percent: 0 });
  const [sideloadTarget, setSideloadTarget] = useState<'Core' | 'Tiny' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkWebGPU = async () => {
      const isSupported = 'gpu' in navigator;
      setSystemHealth((prev: any) => ({ ...prev, webGpuSupported: isSupported }));
    };
    checkWebGPU();
    const checkCaches = async () => {
      const activeTiny = await getActiveModelId('Tiny');
      const activeCore = await getActiveModelId('Core');
      const tinyCached = await isModelCached(activeTiny);
      const coreCached = await isModelCached(activeCore);
      setEaCoreCached(tinyCached);
      setDomainSmeCached(coreCached);
      
      // Update global context
      setSystemHealth((prev: any) => ({
        ...prev,
        modelsCached: coreCached || tinyCached,
      }));
    };
    checkCaches();
    const interval = setInterval(checkCaches, 5000);
    return () => clearInterval(interval);
  }, [setSystemHealth]);

  const handleSideloadClick = (target: 'Core' | 'Tiny') => {
    setSideloadTarget(target);
    fileInputRef.current?.click();
  };

  const handlePullWebCache = async (targetMode: 'Primary EA Agent' | 'Tiny Triage Agent') => {
    if (!navigator.onLine) {
       alert("Air-gap mode active. Please use sideloaded models.");
       return;
    }

    const { getActiveModelId } = await import('../lib/aiEngine');
    const activeId = await getActiveModelId(targetMode === 'Primary EA Agent' ? 'Core' : 'Tiny');
    
    window.dispatchEvent(new CustomEvent('EA_AI_CONSENT_REQUIRED', {
        detail: { networkEnabled: true, targetModelId: activeId, executionTarget: targetMode }
    }));
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !sideloadTarget) return;

    setIsSideloading(true);
    setSideloadProgress({ text: 'Starting offline sideload...', percent: 0 });

    try {
      const { getDynamicAppConfig, getActiveModelId } = await import('../lib/aiEngine');
      const { sideloadModelToCache } = await import('../lib/sideloadEngine');
      const { db } = await import('../lib/db');

      const activeModelId = await getActiveModelId(sideloadTarget);
      const appConfig = await getDynamicAppConfig();
      const modelConfig = appConfig.model_list.find(m => m.model_id === activeModelId);
      
      if (!modelConfig) throw new Error("Model configuration not found.");

      await sideloadModelToCache(files, activeModelId, modelConfig.model, (text, percent) => {
        setSideloadProgress({ text, percent });
      });

      const existing = await db.model_registry.where('name').equals(activeModelId).first();
      if (!existing) {
        await db.model_registry.add({
          name: activeModelId,
          type: sideloadTarget === 'Core' ? 'PRIMARY' : 'SECONDARY',
          modelUrl: modelConfig.model,
          isLocalhost: true,
          isActive: true,
          allowDistillation: false
        });
      } else {
        await db.model_registry.update(existing.id!, { isLocalhost: true });
      }

      setSideloadProgress({ text: 'Sideload complete!', percent: 100 });
      
      setTimeout(() => {
        setIsSideloading(false);
        setSideloadProgress({ text: '', percent: 0 });
        setSideloadTarget(null);
      }, 3000);

    } catch (error) {
      console.error("Sideload failed:", error);
      setSideloadProgress({ text: `Error: ${error instanceof Error ? error.message : String(error)}`, percent: 0 });
      setTimeout(() => {
        setIsSideloading(false);
        setSideloadTarget(null);
      }, 5000);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm dark:shadow-none">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4 uppercase tracking-wider">System Health</h3>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className="text-gray-500 dark:text-gray-400" size={18} />
            <span className="text-sm text-gray-700 dark:text-gray-200">WebGPU</span>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              systemHealth.webGpuSupported
                ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400'
            }`}
          >
            {systemHealth.webGpuSupported ? 'Supported' : 'Unsupported'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="text-gray-500 dark:text-gray-400" size={18} />
            <span className="text-sm text-gray-700 dark:text-gray-200">Local Database</span>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            systemHealth.dbStatus === 'Connected (IndexedDB)' 
              ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400' 
              : systemHealth.dbStatus === 'Error'
                ? 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400'
                : 'bg-yellow-100 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
          }`}>
            {systemHealth.dbStatus}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="text-gray-500 dark:text-gray-400" size={18} />
            <span className="text-sm text-gray-700 dark:text-gray-200">Primary EA Agent</span>
          </div>
          <div className="flex items-center gap-2">
            {!eaCoreCached && (
              <>
                <button 
                  onClick={() => handleSideloadClick('Tiny')}
                  disabled={isSideloading}
                  className="text-xs px-2 py-1 bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:hover:bg-purple-500/30 rounded-md transition-colors flex items-center gap-1 disabled:opacity-50"
                  title="Offline Sideload (USB)"
                >
                  <UploadCloud size={12} /> Sideload
                </button>
                {(() => {
                  const isThisDownloading = downloadState.status === 'Downloading' && downloadState.modelId && (systemHealth as any).aiModelsStatus?.includes('Downloading');
                  return (
                    <button
                      onClick={() => handlePullWebCache('Primary EA Agent')}
                      disabled={isSideloading || !!isThisDownloading}
                      className={`text-xs px-2 py-1 rounded-md transition-colors font-bold uppercase flex items-center gap-1 disabled:opacity-50 ${isThisDownloading ? 'bg-blue-600 text-white opacity-70 cursor-wait animate-pulse' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/30'}`}
                      title={isThisDownloading ? 'Caching in progress...' : "Download to IndexedDB"}
                    >
                      {isThisDownloading ? 'DOWNLOADING...' : 'PULL WEB CACHE'}
                    </button>
                  );
                })()}
              </>
            )}
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
               eaCoreCached
                  ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {eaCoreCached ? 'Cached (Ready)' : 'Missing'}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Network className="text-gray-500 dark:text-gray-400" size={18} />
            <span className="text-sm text-gray-700 dark:text-gray-200">Tiny Triage Agent</span>
          </div>
          <div className="flex items-center gap-2">
             {!domainSmeCached && !systemHealth.aiModelsStatus.startsWith('Downloading') && (
              <>
                <button 
                  onClick={() => handleSideloadClick('Core')}
                  disabled={isSideloading}
                  className="text-xs px-2 py-1 bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-500/20 dark:text-purple-400 dark:hover:bg-purple-500/30 rounded-md transition-colors flex items-center gap-1 disabled:opacity-50"
                  title="Offline Sideload (USB)"
                >
                  <UploadCloud size={12} /> Sideload
                </button>
                {(() => {
                  const isThisDownloading = downloadState.status === 'Downloading' && downloadState.modelId && (systemHealth as any).aiModelsStatus?.includes('Downloading');
                  return (
                    <button
                      onClick={() => handlePullWebCache('Tiny Triage Agent')}
                      disabled={isSideloading || !!isThisDownloading}
                      className={`text-xs px-2 py-1 rounded-md transition-colors font-bold uppercase flex items-center gap-1 disabled:opacity-50 ${isThisDownloading ? 'bg-blue-600 text-white opacity-70 cursor-wait animate-pulse' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/30'}`}
                      title={isThisDownloading ? 'Caching in progress...' : "Download to IndexedDB"}
                    >
                      {isThisDownloading ? 'DOWNLOADING...' : 'PULL WEB CACHE'}
                    </button>
                  );
                })()}
              </>
            )}
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              systemHealth.aiModelsStatus.startsWith('Downloading')
                  ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                  : domainSmeCached
                      ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
               {systemHealth.aiModelsStatus.startsWith('Downloading') ? systemHealth.aiModelsStatus : (domainSmeCached ? 'Cached (Ready)' : 'Missing')}
            </span>
          </div>
        </div>
      </div>
      
      {isSideloading && (
        <div className="mt-4 bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between text-[10px] font-medium text-gray-700 dark:text-gray-300 mb-1">
            <span>{sideloadProgress.text}</span>
            <span>{sideloadProgress.percent}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div className="bg-purple-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${sideloadProgress.percent}%` }}></div>
          </div>
        </div>
      )}

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFolderSelect} 
        className="hidden" 
        // @ts-expect-error - webkitdirectory is non-standard but supported in most modern browsers
        webkitdirectory="" 
        multiple 
        aria-label="Select folder to sideload model"
        title="Select model folder"
        placeholder="Select model folder"
      />
    </div>
  );
}
