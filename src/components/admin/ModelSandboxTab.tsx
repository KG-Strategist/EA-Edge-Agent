import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { encryptString } from '../../lib/cryptoVault';
import { ModelRegistrySchema } from '../../lib/validation';
import { epistemicShadow } from '../../lib/EpistemicShadow';
import { Database, Server, Plus, Info, FolderUp, TerminalSquare, Trash2 } from 'lucide-react';
import { SideloadService } from '../../services/SideloadService';
import CreatableDropdown from '../ui/CreatableDropdown';
import FileUploadButton from '../ui/FileUploadButton';
import PageHeader from '../ui/PageHeader';
import DataTable from '../ui/DataTable';
import { Logger } from '../../lib/logger';
import { useNotification } from '../../context/NotificationContext';

function EngineDiagnostics({ selectedModelId }: { selectedModelId?: string }) {
  const [logs, setLogs] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState<string>('Awaiting Target...');
  const [sourceUrl, setSourceUrl] = useState<string>('Idle');

  useEffect(() => {
    const updateMonitor = async () => {
      if (!selectedModelId) {
        setActiveModel('Awaiting Target...');
        setSourceUrl('Idle');
        return;
      }
      
      setActiveModel(selectedModelId);
      setSourceUrl('Sovereign Wasm / Daemon');
    };
    
    updateMonitor();

    const handleProgress = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { text, message } = customEvent.detail;
      const logText = message || text;
      if (logText) {
        setLogs(prev => {
          const newLogs = [...prev, `[${new Date().toLocaleTimeString()}] ${logText}`];
          return newLogs.slice(-50);
        });
      }
    };

    window.addEventListener('EA_AI_PROGRESS', handleProgress);
    window.addEventListener('DISTILLATION_EVENT', handleProgress);
    return () => {
      window.removeEventListener('EA_AI_PROGRESS', handleProgress);
      window.removeEventListener('DISTILLATION_EVENT', handleProgress);
    };
  }, [selectedModelId]);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mt-8 font-mono shadow-inner">
      <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
        <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
          <TerminalSquare className="text-green-500" size={16} />
          Engine Diagnostics Terminal
        </h3>
        <div className="flex items-center gap-2">
            <button
               disabled
               title="Phase 4.x — Local OPFS Corpus Compilation & autonomous knowledge harvesting"
               className="text-[10px] bg-gray-800/50 text-gray-600 px-2 py-1 rounded border border-gray-700/50 cursor-not-allowed"
            >
              Distillation — Phase 4.x Reserved
            </button>
           <span className="flex h-2 w-2 relative ml-2">
             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
             <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
           </span>
           <span className="text-[10px] text-gray-500 uppercase tracking-wider">Live Monitor</span>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-black/50 rounded-lg p-3 border border-gray-800/50">
           <p className="text-[10px] text-gray-500 uppercase mb-1">Target Engine ID</p>
           <p className="text-xs text-blue-400 truncate">{activeModel}</p>
        </div>
        <div className="bg-black/50 rounded-lg p-3 border border-gray-800/50">
           <p className="text-[10px] text-gray-500 uppercase mb-1">Upstream Source URL</p>
           <p className="text-[10px] text-blue-400 truncate break-all">{sourceUrl}</p>
        </div>
      </div>

      <div className="bg-black rounded-lg p-3 border border-gray-800 h-40 overflow-y-auto custom-scrollbar text-[10px] leading-relaxed text-gray-400 flex flex-col-reverse">
        <div>
          {logs.length === 0 ? (
            <p className="opacity-50 italic">Waiting for AI Engine initialization events...</p>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="mb-1 hover:bg-gray-800/50 px-1 rounded transition-colors break-words text-green-500/80">
                <span className="text-gray-600 mr-2">{'>'}</span> {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function ModelSandboxTab() {
  const { addNotification } = useNotification();
  const models = useLiveQuery(() => db.model_registry.toArray());
  const masterCategories = useLiveQuery(() => db.master_categories.toArray()) || [];
  
  const engineTypeOptions = masterCategories
    .filter(c => c.type === 'AI Engine Type')
    .map(c => ({ label: c.name, value: c.name }));
    
  const contextSourceOptions = masterCategories
    .filter(c => c.type === 'Context Source')
    .map(c => ({ label: c.name, value: c.name }));

  const [isAdding, setIsAdding] = useState(false);
  const [newModel, setNewModel] = useState<{
    name: string;
    modelUrl: string;
    allowDistillation: boolean;
    apiKey: string;
    contextWindow: number;
    engineType: 'Localhost API' | 'Air-Gapped Network' | 'Cloud VPC (Internet Required)';
    contextSource: 'Global Corpus' | 'SAMIKSHA' | 'Threat Models';
  }>({ 
    name: '', 
    modelUrl: '', 
    allowDistillation: false, 
    apiKey: '', 
    contextWindow: 4096,
    engineType: 'Localhost API',
    contextSource: 'Global Corpus'
  });
  
  // Sideload state
  const [isSideloading, setIsSideloading] = useState(false);
  const [sideloadProgress, setSideloadProgress] = useState({ text: '', percent: 0 });
  const [sideloadModelName, setSideloadModelName] = useState('');

  const [routingThreshold, setRoutingThreshold] = useState(50);
  const [telemetryOptIn, setTelemetryOptIn] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const thresholdSetting = await db.app_settings.get('routingThreshold');
      if (thresholdSetting) setRoutingThreshold(thresholdSetting.value);

      const telemetrySetting = await db.app_settings.get('telemetryOptIn');
      if (telemetrySetting) setTelemetryOptIn(telemetrySetting.value);
    };
    loadSettings();
  }, []);

  const handleThresholdChange = async (val: number) => {
    setRoutingThreshold(val);
    await db.app_settings.put({ key: 'routingThreshold', value: val });
  };



  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModel.name || !newModel.modelUrl) return;

    const payload = {
      name: newModel.name,
      type: 'SECONDARY' as const,
      modelUrl: newModel.modelUrl,
      isLocalhost: newModel.modelUrl.includes('localhost') || newModel.modelUrl.startsWith('/'),
      isActive: true,
      allowDistillation: newModel.allowDistillation,
      contextWindow: newModel.contextWindow,
      engineType: newModel.engineType,
      contextSource: newModel.contextSource
    };

    const result = ModelRegistrySchema.safeParse(payload);
    if (!result.success) {
      const errorMsg = result.error.issues.map((err: any) => `${err.path.join('.')}: ${err.message}`).join('; ');
      addNotification(`Validation error: ${errorMsg}`, 'error', 5000);
      return;
    }

    const encryptedApiKey = newModel.apiKey ? await encryptString(newModel.apiKey) : undefined;

    await db.model_registry.add({ ...result.data, encryptedApiKey });
    addNotification('Model saved successfully', 'success', 2000);
    
    setNewModel({ 
      name: '', 
      modelUrl: '', 
      allowDistillation: false, 
      apiKey: '', 
      contextWindow: 4096,
      engineType: 'Localhost API',
      contextSource: 'Global Corpus'
    });
    setIsAdding(false);
  };

  const toggleDistillation = async (id: number, currentVal: boolean) => {
    const newVal = !currentVal;
    await db.model_registry.update(id, { allowDistillation: newVal });
    if (!newVal) {
      epistemicShadow.interrupt();
    }
  };

  const handleFileSelect = async (file: File) => {
    const modelId = sideloadModelName || file.name.replace('.gguf', '');
    if (!sideloadModelName) setSideloadModelName(file.name.replace('.gguf', ''));
    await performSideload(file, modelId);
  };

  const performSideload = async (ggufFile: File, modelId: string) => {
    setIsSideloading(true);
    setSideloadProgress({ text: 'Reading files...', percent: 0 });

    try {
      await SideloadService.processModelSideload(ggufFile, modelId, (bytesWritten, totalBytes) => {
        const percent = Math.round((bytesWritten / totalBytes) * 100);
        setSideloadProgress({ text: `Writing ${ggufFile.name} to OPFS...`, percent });
      });

      await SideloadService.registerSideloadedModel({
        name: modelId,
        modelId,
        contextWindow: 4096,
      });

      setSideloadProgress({ text: 'Sideload complete! Model is now available offline.', percent: 100 });
      setSideloadModelName('');

      setTimeout(() => {
        setIsSideloading(false);
        setSideloadProgress({ text: '', percent: 0 });
      }, 3000);

    } catch (error) {
      Logger.info("Sideload failed:", error);
      setSideloadProgress({ text: `Error: ${error instanceof Error ? error.message : String(error)}`, percent: 0 });
      setTimeout(() => setIsSideloading(false), 5000);
    }
  };

  const [editTargetId, setEditTargetId] = useState<number | null>(null);

  const sideloadedModels = models?.filter(m => m.isLocalhost && m.type === 'SECONDARY') || [];

  return (
    <div data-testid="model-sandbox-tab" className="w-full max-w-5xl">
      <PageHeader 
        icon={<Database className="text-purple-500" />}
        title="Model Sandbox & Edge Routing"
        description="Configure Sovereign Engine endpoints. Add secondary models for Bring-Your-Own-Model (BYOM) telemetry processing."
      />

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden mb-8">
         <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">BYOM Engine Registry (Network/VPC/Cloud)</h3>
          <button onClick={() => setIsAdding(!isAdding)} className="flex items-center gap-1.5 text-xs font-semibold bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 px-3 py-1.5 rounded-md transition-colors text-gray-800 dark:text-gray-200">
            <Plus size={14} /> Add Secondary Model
          </button>
        </div>

        {isAdding && (
          <form onSubmit={handleAdd} className="p-5 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 grid gap-4">
             <div className="grid grid-cols-2 gap-4">
               <div>
                 <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Model Name / Alias</label>
                 <input type="text" required value={newModel.name} onChange={e => setNewModel({...newModel, name: e.target.value})} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm p-2 outline-none focus:border-blue-500" placeholder="e.g. Llama-3-BYOM" />
               </div>
               <div>
                 <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Endpoint URL</label>
                 <input type="url" required value={newModel.modelUrl} onChange={e => setNewModel({...newModel, modelUrl: e.target.value})} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm p-2 outline-none focus:border-blue-500" placeholder="https://huggingface.co/..." />
               </div>
               <div>
                 <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">API Key (Optional)</label>
                 <input type="password" value={newModel.apiKey} onChange={e => setNewModel({...newModel, apiKey: e.target.value})} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm p-2 outline-none focus:border-blue-500" placeholder="sk-..." />
               </div>
               <div>
                 <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Context Window</label>
                 <input type="number" required value={newModel.contextWindow} onChange={e => setNewModel({...newModel, contextWindow: parseInt(e.target.value) || 4096})} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm p-2 outline-none focus:border-blue-500" placeholder="4096" />
               </div>
               <div>
                 <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Engine Type</label>
                 <CreatableDropdown 
                   value={newModel.engineType}
                   onChange={val => setNewModel({...newModel, engineType: val as any})}
                   options={engineTypeOptions.length > 0 ? engineTypeOptions : [
                     { label: 'Localhost API', value: 'Localhost API' },
                     { label: 'Air-Gapped Network', value: 'Air-Gapped Network' },
                     { label: 'Cloud VPC (Internet Required)', value: 'Cloud VPC (Internet Required)' }
                   ]}
                   categoryType="AI Engine Type"
                   placeholder="Select engine type..."
                 />
               </div>
               <div>
                 <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Context Source</label>
                 <CreatableDropdown 
                   value={newModel.contextSource}
                   onChange={val => setNewModel({...newModel, contextSource: val as any})}
                   options={contextSourceOptions.length > 0 ? contextSourceOptions : [
                     { label: 'Global Corpus', value: 'Global Corpus' },
                     { label: 'SAMIKSHA', value: 'SAMIKSHA' },
                     { label: 'Threat Models', value: 'Threat Models' }
                   ]}
                   categoryType="Context Source"
                   placeholder="Select context source..."
                 />
               </div>
               <div className="col-span-2 flex items-center gap-2 mt-2">
                 <input type="checkbox" id="allowDistillation" checked={newModel.allowDistillation} onChange={e => setNewModel({...newModel, allowDistillation: e.target.checked})} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                 <label htmlFor="allowDistillation" className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable as Distillation Target</label>
               </div>
             </div>
             <div className="flex justify-end items-center gap-3 mt-4">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors">Save Engine</button>
                <button type="button" onClick={() => setIsAdding(false)} className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-white">Cancel</button>
             </div>
          </form>
        )}

        <DataTable
          data={models || []}
          keyField="id"
          searchable={true}
          searchPlaceholder="Search model definition, type, or source..."
          searchFields={['name', 'engineType', 'contextSource']}
          exportable={true}
          exportFilename="niti-models.json"
          onImport={async (parsedData) => {
            try {
              await db.model_registry.bulkPut(parsedData);
addNotification('Import successful!', 'success', 3000);
  } catch {
    addNotification('Import failed', 'error');
  }
}}
columns={[
  {
    key: 'engineType',
    label: 'Engine Type',
    sortable: true,
    render: (row) => (
      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${row.type === 'PRIMARY' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
        {row.engineType || row.type}
      </span>
    )
  },
  {
    key: 'name',
    label: 'Model Definition',
    sortable: true,
    render: (row) => (
      <span className="font-mono font-medium text-xs text-gray-900 dark:text-gray-100 line-clamp-2" title={row.name}>
        {row.name}
      </span>
    )
  },
  {
    key: 'contextSource',
    label: 'Context Source',
    sortable: true,
    render: (row) => (
      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        {row.isLocalhost ? <Server className="w-3 h-3 text-green-500" /> : <div className="w-2 h-2 rounded-full bg-yellow-500" />}
        {row.contextSource || (row.isLocalhost ? 'Localhost (Air-Gapped)' : 'External URI')}
      </span>
    )
  },
  {
    key: 'contextWindow',
    label: 'Context Window',
    sortable: true,
    render: (row) => (
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {row.contextWindow || 'N/A'}
      </span>
    )
  },
  {
    key: 'allowDistillation',
    label: 'Distillation Target',
    sortable: true,
    render: (row) => {
      if (row.type === 'PRIMARY') {
        return <span className="text-xs text-gray-400 italic">Self (Target)</span>;
      }
      return editTargetId === row.id ? (
        <select
          value={row.allowDistillation ? 'Local Dataset (JSONL)' : 'Disabled/None'}
          onChange={async (e) => {
            await toggleDistillation(row.id!, e.target.value === 'Local Dataset (JSONL)');
            setEditTargetId(null);
          }}
          onBlur={() => setEditTargetId(null)}
          className="text-xs p-1 rounded bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 outline-none text-gray-900 dark:text-gray-100"
          aria-label="Distillation Options"
          title="Distillation Options"
          autoFocus
        >
          <option>Disabled/None</option>
          <option>Local Dataset (JSONL)</option>
        </select>
      ) : (
        <div className="flex items-center gap-2">
          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
            row.allowDistillation
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
          }`}>
            {row.allowDistillation ? 'Local Dataset (JSONL)' : 'Disabled/None'}
          </span>
          <button onClick={() => setEditTargetId(row.id!)} className="text-[10px] underline text-blue-500 hover:text-blue-700">
            Configure
          </button>
        </div>
      );
    }
  }
]}
emptyMessage="No models available."
containerClassName="flex flex-col"
/>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Semantic Edge Routing</h3>
          </div>
          <div className="p-5">
            <label htmlFor="routing-threshold" className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-2">Complexity Routing Threshold: {routingThreshold}</label>
            <input 
              id="routing-threshold"
              type="range" 
              min="1" 
              max="100" 
              value={routingThreshold} 
              onChange={(e) => handleThresholdChange(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            <p className="text-[10px] text-gray-500 mt-2">
              Queries with a complexity score below this threshold will be routed to the fast Primary Core Model. Queries above this threshold will be routed to the Secondary BYOM model (if available).
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Model Foundry & Marketplace (MVP 3.0 Roadmap)</h3>
            <span className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-[10px] font-bold uppercase tracking-wider">
              [ Foundry Locked - Coming in V3 ]
            </span>
          </div>
          <div className="p-5">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
              Future Capability: Distill your local enterprise corpus into specialized Subject Matter Expert (SME) models. Export custom weights or publish your trained agents directly to the Decentralized EA Marketplace.
            </p>
            <div className="flex items-center justify-between mb-2 opacity-50 pointer-events-none">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-400">Enable Opt-In Telemetry Sync</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={telemetryOptIn} readOnly aria-label="Enable telemetry sync" />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              </label>
            </div>
            {telemetryOptIn && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-2 mt-2 opacity-50">
                <p className="text-[10px] text-yellow-800 dark:text-yellow-500">
                  <strong>Warning:</strong> Enabling this feature will send anonymized usage metrics and model performance data to the global EA-NITI marketplace. Ensure this complies with your organization's data privacy policies.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden mb-8">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <FolderUp className="text-blue-500" size={18} />
            Offline Sideload Library (Browser Cache)
          </h3>
        </div>
        <div className="p-5 grid gap-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Securely load GGUF model weights directly from a local folder (e.g., USB drive). This bypasses all network requests and writes directly to OPFS for zero-copy Sovereign Engine access, ensuring 100% air-gapped compliance. You can upload multiple models sequentially.
          </p>
          
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Model Name / Alias</label>
            <input data-testid="sideload-model-name" type="text" value={sideloadModelName} onChange={e => setSideloadModelName(e.target.value)} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm p-2 outline-none focus:border-blue-500" placeholder="e.g. Llama-3-Sideloaded" disabled={isSideloading} />
          </div>

          <details className="mb-4 p-4 bg-[var(--color-surface-hover)] border border-[var(--color-border)] rounded-lg text-sm text-gray-300">
            <summary className="font-medium text-gray-200 cursor-pointer select-none">What file do I need to upload?</summary>
            <ul className="mt-2 list-disc list-inside pl-4 space-y-1 text-xs text-gray-400">
              <li>You only need <strong>one file</strong>: a quantized model weights file ending in <code className="text-blue-400 bg-slate-950 px-1 rounded">.gguf</code>.</li>
              <li>You do NOT need to download an entire HuggingFace repository clone.</li>
              <li>Example model filename: <code>tinyllama-1.1b-chat-v1.0.Q4_0.gguf</code></li>
            </ul>
          </details>

          <div className="mt-2">
            <FileUploadButton
              onFileSelect={handleFileSelect}
              isLoading={isSideloading}
              id="sandbox-sideload-input"
            />
          </div>

          {isSideloading && (
            <div data-testid="sideload-progress" className="mt-4 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex justify-between text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                <span>{sideloadProgress.text}</span>
                <span>{sideloadProgress.percent}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`bg-blue-600 h-2 rounded-full transition-all duration-300 progress-width-${Math.min(100, Math.max(0, Math.round(sideloadProgress.percent / 10) * 10))}`}

                />
              </div>
            </div>
          )}

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">Sideloaded Engines</h4>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
            <DataTable
              data={sideloadedModels}
              keyField="id"
              pagination={true}
              itemsPerPage={5}
              searchable={true}
              searchPlaceholder="Filter sideloaded models..."
              searchFields={['name']}
              exportable={true}
              exportFilename="niti-sideloaded-models.json"
              onImport={async (parsedData) => {
                try {
                  await db.model_registry.bulkPut(parsedData);
                  addNotification('Import successful!', 'success', 3000);
                } catch (_error: any) {
                  Logger.error('Import failed', _error);
                  addNotification('Import failed', 'error', 3000);
                }
              }}
              columns={[
                {
                  key: 'name',
                  label: 'Alias',
                  sortable: true,
                  render: (row) => (
                    <span className="font-mono text-xs text-gray-900 dark:text-gray-100">
                      {row.name}
                    </span>
                  )
                },
                {
                  key: 'modelUrl',
                  label: 'Cache Size',
                  sortable: true,
                  render: () => <span className="text-xs text-gray-500 dark:text-gray-400">Cached</span>
                }
              ]}
              actions={[
                {
                  label: 'Delete',
                  icon: <Trash2 size={12} />,
                  onClick: async (row) => {
                    if (row.id) {
                      const modelId = row.name || 'niti_sovereign';
                      await SideloadService.deleteModel(modelId);
                      await db.model_registry.delete(row.id);
                    }
                  },
                  className: 'text-xs text-red-500 hover:text-red-700'
                }
              ]}
              emptyMessage="No models sideloaded yet."
              containerClassName="flex flex-col"
            />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/40 rounded-xl p-5 flex gap-4 mt-6">
        <Info className="text-blue-500 shrink-0 mt-0.5" size={20} />
        <div>
           <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-1">How Distillation Routing Works</h4>
           <p className="text-xs text-blue-700 dark:text-blue-400/80 leading-relaxed max-w-2xl">
             When <strong>Distillation Target</strong> is enabled on a Secondary BYOM model, all complex architectural evaluation queries will be routed transparently to the Secondary engine. The insights returned will be automatically vectorized by the Transformers.js embedder and synchronized into the local knowledge base, allowing the fast Primary Core Model to leverage them in the future natively.
           </p>
        </div>
      </div>
      
      <EngineDiagnostics />
    </div>
  );
}
