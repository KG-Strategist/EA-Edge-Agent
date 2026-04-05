import React, { useEffect, useState } from 'react';
import { useStateContext } from '../context/StateContext';
import { Cpu, Database, Brain, Network } from 'lucide-react';
import { isModelCached, getActiveModelId, DEFAULT_PRIMARY_MODEL_ID, DEFAULT_TINY_MODEL_ID } from '../lib/aiEngine';

export default function SystemHealth() {
  const { systemHealth, setSystemHealth } = useStateContext();
  const [eaCoreCached, setEaCoreCached] = useState<boolean | null>(null);
  const [domainSmeCached, setDomainSmeCached] = useState<boolean | null>(null);

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
            <span className="text-sm text-gray-700 dark:text-gray-200">EA Core Model</span>
          </div>
          <div className="flex items-center gap-2">
            {!eaCoreCached && (
              <button 
                onClick={() => import('../lib/aiEngine').then(m => m.initAIEngine(() => {}, false, 'EA Core Model').catch(()=>{}))}
                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/30 rounded-md transition-colors"
                title="Download to IndexedDB"
              >
                Cache Model
              </button>
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
            <span className="text-sm text-gray-700 dark:text-gray-200">Domain SME Model</span>
          </div>
          <div className="flex items-center gap-2">
             {!domainSmeCached && !systemHealth.aiModelsStatus.startsWith('Downloading') && (
              <button 
                onClick={() => import('../lib/aiEngine').then(m => m.initAIEngine(() => {}, false, 'Domain SME Model').catch(()=>{}))}
                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/30 rounded-md transition-colors"
                title="Download to IndexedDB"
              >
                Cache Model
              </button>
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
    </div>
  );
}
