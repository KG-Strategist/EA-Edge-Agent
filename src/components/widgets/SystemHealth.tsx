import { useEffect, useState } from 'react';
import { useStateContext } from '../../context/StateContext';
import { Cpu, Database, Brain, Network } from 'lucide-react';
import { isModelCached, getActiveModelId, getActiveModelUrl, getDynamicAppConfig } from '../../lib/aiEngine';
import { SideloadService } from '../../services/SideloadService';
import { db } from '../../lib/db';
import CacheButton from '../ui/CacheButton';
import FolderUploadButton from '../ui/FolderUploadButton';

export default function SystemHealth() {
  const { systemHealth, setSystemHealth } = useStateContext();
  const [eaCoreCached, setEaCoreCached] = useState<boolean | null>(null);
  const [domainSmeCached, setDomainSmeCached] = useState<boolean | null>(null);
  
  const [activeCoreId, setActiveCoreId] = useState<string>('');
  const [activeCoreUrl, setActiveCoreUrl] = useState<string>('');
  const [activeTinyId, setActiveTinyId] = useState<string>('');
  const [activeTinyUrl, setActiveTinyUrl] = useState<string>('');

  const [isSideloading, setIsSideloading] = useState(false);
  const [sideloadProgress, setSideloadProgress] = useState({ text: '', percent: 0 });
  const [sideloadTarget, setSideloadTarget] = useState<'Core' | 'Tiny' | null>(null);

  useEffect(() => {
    const checkWebGPU = async () => {
      const isSupported = 'gpu' in navigator;
      setSystemHealth((prev: any) => ({ ...prev, webGpuSupported: isSupported }));
    };
    checkWebGPU();
    const checkCaches = async () => {
      const activeTiny = await getActiveModelId('Tiny');
      const activeCore = await getActiveModelId('Core');
      
      const tinyUrl = await getActiveModelUrl(activeTiny);
      const coreUrl = await getActiveModelUrl(activeCore);
      
      setActiveTinyId(activeTiny);
      setActiveTinyUrl(tinyUrl);
      setActiveCoreId(activeCore);
      setActiveCoreUrl(coreUrl);

      const tinyCached = await isModelCached(activeTiny);
      const coreCached = await isModelCached(activeCore);
      
      // Primary EA Agent -> Core
      // Tiny Triage Agent -> Tiny
      setEaCoreCached(coreCached);
      setDomainSmeCached(tinyCached);
      
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

  const handleSideloadClick = (files: FileList, target: 'Core' | 'Tiny') => {
    setSideloadTarget(target);
    handleFolderSelect(files, target);
  };

  const handlePullWebCache = async (targetMode: 'Primary EA Agent' | 'Tiny Triage Agent') => {
    if (!navigator.onLine) {
       alert("Air-gap mode active. Please use sideloaded models.");
       return;
    }

    const activeId = await getActiveModelId(targetMode === 'Primary EA Agent' ? 'Core' : 'Tiny');
    
    window.dispatchEvent(new CustomEvent('EA_AI_CONSENT_REQUIRED', {
        detail: { networkEnabled: true, targetModelId: activeId, executionTarget: targetMode }
    }));
  };

  const handleFolderSelect = async (files: FileList, target: 'Core' | 'Tiny') => {
    setIsSideloading(true);
    setSideloadProgress({ text: 'Starting offline sideload...', percent: 0 });

    try {
      const activeModelId = await getActiveModelId(target);
      const appConfig = await getDynamicAppConfig();
      const modelConfig = appConfig.model_list.find(m => m.model_id === activeModelId);
      
      if (!modelConfig) throw new Error("Model configuration not found.");

      await SideloadService.processSideloadFolder(files, activeModelId, modelConfig.model, (text, percent) => {
        setSideloadProgress({ text, percent });
      });

      const existing = await db.model_registry.where('name').equals(activeModelId).first();
      if (!existing) {
        await db.model_registry.add({
          name: activeModelId,
          type: target === 'Core' ? 'PRIMARY' : 'SECONDARY',
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
          <div className="flex items-center flex-wrap gap-2 justify-end">
            {!eaCoreCached && (
              <FolderUploadButton 
                onFolderSelect={(files) => handleSideloadClick(files, 'Core')}
                isLoading={isSideloading && sideloadTarget === 'Core'}
                label="Sideload"
                id="sideload-core-input"
                className="whitespace-nowrap"
              />
            )}
            <CacheButton 
              modelId={activeCoreId}
              modelUrl={activeCoreUrl}
              onPull={() => handlePullWebCache('Primary EA Agent')}
              disabled={isSideloading}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Network className="text-gray-500 dark:text-gray-400" size={18} />
            <span className="text-sm text-gray-700 dark:text-gray-200">Tiny Triage Agent</span>
          </div>
          <div className="flex items-center flex-wrap gap-2 justify-end">
             {!domainSmeCached && (
              <FolderUploadButton 
                onFolderSelect={(files) => handleSideloadClick(files, 'Tiny')}
                isLoading={isSideloading && sideloadTarget === 'Tiny'}
                label="Sideload"
                id="sideload-tiny-input"
                className="whitespace-nowrap"
              />
            )}
            <CacheButton 
              modelId={activeTinyId}
              modelUrl={activeTinyUrl}
              onPull={() => handlePullWebCache('Tiny Triage Agent')}
              disabled={isSideloading}
            />
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
    </div>
  );
}
