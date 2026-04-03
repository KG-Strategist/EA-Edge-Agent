import React, { useEffect } from 'react';
import { useStateContext } from '../context/StateContext';
import { Cpu, Database, Brain } from 'lucide-react';

export default function SystemHealth() {
  const { systemHealth, setSystemHealth } = useStateContext();

  useEffect(() => {
    const checkWebGPU = async () => {
      const isSupported = 'gpu' in navigator;
      setSystemHealth((prev: any) => ({ ...prev, webGpuSupported: isSupported }));
    };
    checkWebGPU();
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
            <span className="text-sm text-gray-700 dark:text-gray-200">AI Models</span>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            !systemHealth.webGpuSupported
              ? 'bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400'
              : systemHealth.aiModelsStatus === 'Loaded & Ready (WebGPU)'
                ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400'
                : systemHealth.aiModelsStatus.startsWith('Downloading')
                  ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400'
                  : systemHealth.aiModelsStatus === 'Error'
                    ? 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
          }`}>
            {!systemHealth.webGpuSupported ? 'WebGPU Unsupported - Browser limits apply' : systemHealth.aiModelsStatus}
          </span>
        </div>
      </div>
    </div>
  );
}
