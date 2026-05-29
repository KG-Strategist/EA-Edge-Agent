import { useEffect, useState, useCallback } from 'react';
import { useStateContext } from '../../context/StateContext';
import { Cpu, Database, Shield, HardDrive, HelpCircle, Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { SideloadService } from '../../services/SideloadService';
import { OPFSManager } from '../../lib/storage/opfsManager';
import { localDaemon } from '../../lib/providers/LocalDaemonProvider';
import { checkNetworkConsent } from '../../lib/networkGuard';
import CacheButton from '../ui/CacheButton';

export default function SystemHealth() {
  const { systemHealth, setSystemHealth } = useStateContext();
  const [isDaemonActive, setIsDaemonActive] = useState(localDaemon.isConnected);

  const [primaryCached, setPrimaryCached] = useState(false);
  const [triageCached, setTriageCached] = useState(false);
  const [primarySize, setPrimarySize] = useState<number>(0);
  const [triageSize, setTriageSize] = useState<number>(0);

  const [isSideloading, setIsSideloading] = useState(false);
  const [sideloadProgress, setSideloadProgress] = useState({ text: '', percent: 0 });
  const [_sideloadTarget, setSideloadTarget] = useState<'primary' | 'triage' | null>(null);

  const primaryConfig = useLiveQuery(() => db.app_settings.get('core-primary')) || null;
  const triageConfig = useLiveQuery(() => db.app_settings.get('core-triage')) || null;
  const daemonSetting = useLiveQuery(() => db.app_settings.get('daemonEnabled')) || null;
  const daemonEnabled = daemonSetting?.value === true;

  const primaryId = primaryConfig?.value?.id || '';
  const primaryUrl = primaryConfig?.value?.url || '';
  const primaryModelSize = primaryConfig?.value?.modelSize || 'Varies';
  const triageId = triageConfig?.value?.id || '';
  const triageUrl = triageConfig?.value?.url || '';
  const triageModelSize = triageConfig?.value?.modelSize || 'Varies';

  const checkCaches = useCallback(async () => {
    if (primaryId) {
      const cached = await OPFSManager.isModelCached(primaryId);
      setPrimaryCached(cached);
      if (cached) {
        try {
          const size = await OPFSManager.getModelSize(primaryId);
          setPrimarySize(size);
        } catch {
          setPrimarySize(0);
        }
      }
    }
    if (triageId) {
      const cached = await OPFSManager.isModelCached(triageId);
      setTriageCached(cached);
      if (cached) {
        try {
          const size = await OPFSManager.getModelSize(triageId);
          setTriageSize(size);
        } catch {
          setTriageSize(0);
        }
      }
    }
  }, [primaryId, triageId]);

  useEffect(() => {
    const checkWebGPU = async () => {
      const isSupported = 'gpu' in navigator;
      setSystemHealth((prev: any) => ({ ...prev, webGpuSupported: isSupported }));
    };
    checkWebGPU();

    checkCaches();
    const interval = setInterval(checkCaches, 5000);

    const unsubscribe = localDaemon.subscribe(setIsDaemonActive);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [setSystemHealth, checkCaches]);

  const handlePullWebCache = async (targetMode: 'Primary EA Agent' | 'Tiny Triage Agent') => {
    // Primary gate: respect app-level network consent (IndexedDB)
    const networkAllowed = await checkNetworkConsent();
    if (!networkAllowed) {
      return;
    }

    // Soft warning: browser reports offline but user has consented — warn but don't block
    if (!navigator.onLine) {
      console.warn('[SystemHealth] Browser reports offline. Download may fail.');
    }

    const modelId = targetMode === 'Primary EA Agent' ? primaryId : triageId;
    const modelUrl = targetMode === 'Primary EA Agent' ? primaryUrl : triageUrl;
    const modelSize = targetMode === 'Primary EA Agent' ? primaryModelSize : triageModelSize;

    window.dispatchEvent(new CustomEvent('EA_AI_CONSENT_REQUIRED', {
      detail: { networkEnabled: true, targetModelId: modelId, targetModelUrl: modelUrl, modelSize, executionTarget: targetMode },
    }));
  };

  const handleFolderSelect = async (files: FileList, target: 'primary' | 'triage') => {
    setSideloadTarget(target);
    setIsSideloading(true);
    setSideloadProgress({ text: 'Starting offline sideload...', percent: 0 });

    try {
      const ggufFile = Array.from(files).find(f => f.name.endsWith('.gguf'));
      if (!ggufFile) throw new Error("No .gguf file found. Select a GGUF model file for the Sovereign Engine.");

      const modelId = target === 'primary' ? primaryId : triageId;
      const effectiveModelId = modelId || ggufFile.name.replace('.gguf', '');

      await SideloadService.processModelSideload(ggufFile, effectiveModelId, (bytesWritten, totalBytes) => {
        const percent = Math.round((bytesWritten / totalBytes) * 100);
        setSideloadProgress({ text: `Writing ${ggufFile.name} to OPFS...`, percent });
      });

      await SideloadService.registerSideloadedModel({
        name: ggufFile.name.replace('.gguf', ''),
        modelId: effectiveModelId,
        contextWindow: 4096,
      });

      setSideloadProgress({ text: 'Sideload complete!', percent: 100 });

      if (target === 'primary') {
        setPrimaryCached(true);
        setPrimarySize(ggufFile.size);
      } else {
        setTriageCached(true);
        setTriageSize(ggufFile.size);
      }

      setTimeout(() => {
        setIsSideloading(false);
        setSideloadProgress({ text: '', percent: 0 });
        setSideloadTarget(null);
      }, 3000);

    } catch (error) {
      setSideloadProgress({ text: `Error: ${error instanceof Error ? error.message : String(error)}`, percent: 0 });
      setTimeout(() => {
        setIsSideloading(false);
        setSideloadTarget(null);
      }, 5000);
    }
  };

  const primaryMB = primarySize > 0 ? (primarySize / 1024 / 1024).toFixed(1) : null;
  const triageMB = triageSize > 0 ? (triageSize / 1024 / 1024).toFixed(1) : null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm dark:shadow-none">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4 uppercase tracking-wider">System Health</h3>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu className="text-gray-500 dark:text-gray-400" size={18} />
            <span className="text-sm text-gray-700 dark:text-gray-200">Browser GPU</span>
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
            <Shield className="text-gray-500 dark:text-gray-400" size={18} />
            <span className="text-sm text-gray-700 dark:text-gray-200">Local Daemon</span>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            isDaemonActive
              ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400'
              : daemonEnabled
                ? 'bg-yellow-100 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
          }`}>
            {isDaemonActive ? 'Connected' : daemonEnabled ? 'Offline' : 'Not Installed'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HardDrive className="text-gray-500 dark:text-gray-400" size={18} />
            <span className="text-sm text-gray-700 dark:text-gray-200">Primary EA Agent</span>
          </div>
          <div className="flex items-center flex-wrap gap-2 justify-end">
            {primaryCached ? (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400">
                <CheckCircle2 size={12} />
                Cached {primaryMB && `(${primaryMB} MB)`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <AlertCircle size={12} />
                Not Cached
              </span>
            )}
            {!primaryCached && !isSideloading && (
              <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-medium cursor-pointer transition-colors">
                <Upload size={12} />
                Sideload
                <input
                  type="file"
                  accept=".gguf"
                  className="hidden"
                  onChange={(e) => { if (e.target.files) handleFolderSelect(e.target.files, 'primary'); }}
                  aria-label="Sideload model for Primary EA Agent"
                />
              </label>
            )}
            <CacheButton
              modelId={primaryId}
              modelUrl={primaryUrl}
              onPull={() => handlePullWebCache('Primary EA Agent')}
              disabled={isSideloading || !primaryId}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HardDrive className="text-gray-500 dark:text-gray-400" size={18} />
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700 dark:text-gray-200">Tiny Triage Agent</span>
              <span className="group relative">
                <HelpCircle size={14} className="text-gray-400 cursor-help" />
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
                  Download model weights to OPFS for offline Sovereign Engine inference
                </span>
              </span>
            </div>
          </div>
          <div className="flex items-center flex-wrap gap-2 justify-end">
            {triageCached ? (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400">
                <CheckCircle2 size={12} />
                Cached {triageMB && `(${triageMB} MB)`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <AlertCircle size={12} />
                Not Cached
              </span>
            )}
            {!triageCached && !isSideloading && (
              <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-xs font-medium cursor-pointer transition-colors">
                <Upload size={12} />
                Sideload
                <input
                  type="file"
                  accept=".gguf"
                  className="hidden"
                  onChange={(e) => { if (e.target.files) handleFolderSelect(e.target.files, 'triage'); }}
                  aria-label="Sideload model for Tiny Triage Agent"
                />
              </label>
            )}
            <CacheButton
              modelId={triageId}
              modelUrl={triageUrl}
              onPull={() => handlePullWebCache('Tiny Triage Agent')}
              disabled={isSideloading || !triageId}
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
