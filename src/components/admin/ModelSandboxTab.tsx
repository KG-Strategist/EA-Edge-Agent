import React, { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { Database, Server, Plus, Info, UploadCloud, FolderUp, TerminalSquare } from 'lucide-react';
import { sideloadModelToCache } from '../../lib/sideloadEngine';
import { getActiveModelId, getActiveModelUrl } from '../../lib/aiEngine';

function EngineDiagnostics() {
  const [logs, setLogs] = useState<string[]>([]);
  const [activeModel, setActiveModel] = useState<string>('Unloaded');
  const [sourceUrl, setSourceUrl] = useState<string>('N/A');

  useEffect(() => {
    // Try to get what would be loaded by default
    getActiveModelId('Core').then(async id => {
       setActiveModel(id);
       const url = await getActiveModelUrl(id);
       setSourceUrl(url);
    });

    const handleProgress = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { text, progress: _progress } = customEvent.detail;
      setLogs(prev => {
        const newLogs = [...prev, `[${new Date().toLocaleTimeString()}] ${text}`];
        return newLogs.slice(-50); // Keep last 50 lines
      });
    };

    window.addEventListener('EA_AI_PROGRESS', handleProgress);
    return () => window.removeEventListener('EA_AI_PROGRESS', handleProgress);
  }, []);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 mt-8 font-mono shadow-inner">
      <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
        <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
          <TerminalSquare className="text-green-500" size={16} />
          Engine Diagnostics Terminal
        </h3>
        <div className="flex items-center gap-2">
           <span className="flex h-2 w-2 relative">
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
  const models = useLiveQuery(() => db.model_registry.toArray());
  const [isAdding, setIsAdding] = useState(false);
  const [newModel, setNewModel] = useState({ name: '', modelUrl: '', allowDistillation: false });
  
  // Sideload state
  const [isSideloading, setIsSideloading] = useState(false);
  const [sideloadProgress, setSideloadProgress] = useState({ text: '', percent: 0 });
  const [sideloadModelName, setSideloadModelName] = useState('');
  const [sideloadModelUrl, setSideloadModelUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModel.name || !newModel.modelUrl) return;

    const payload = {
      name: newModel.name,
      type: 'SECONDARY' as const,
      modelUrl: newModel.modelUrl,
      isLocalhost: newModel.modelUrl.includes('localhost') || newModel.modelUrl.startsWith('/'),
      isActive: true,
      allowDistillation: newModel.allowDistillation
    };

    await db.model_registry.add(payload);
    console.log("DB Write Success", payload);
    
    setNewModel({ name: '', modelUrl: '', allowDistillation: false });
    setIsAdding(false);
  };

  const toggleDistillation = async (id: number, currentVal: boolean) => {
    await db.model_registry.update(id, { allowDistillation: !currentVal });
  };

  const handleSideloadClick = () => {
    if (!sideloadModelName || !sideloadModelUrl) {
      alert("Please enter a Model Name and Configuration URL before selecting a folder.");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsSideloading(true);
    setSideloadProgress({ text: 'Reading files...', percent: 0 });

    try {
      // Robustness check for WebLLM config payload
      let hasConfig = false;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name === 'mlc-chat-config.json' || (file.webkitRelativePath && file.webkitRelativePath.endsWith('mlc-chat-config.json'))) {
          hasConfig = true;
          break;
        }
      }

      if (!hasConfig) {
        throw new Error('Invalid Model Folder: mlc-chat-config.json missing.');
      }

      await sideloadModelToCache(files, sideloadModelName, sideloadModelUrl, (text, percent) => {
        setSideloadProgress({ text, percent });
      });

      // Register the model in Dexie
      await db.model_registry.add({
        name: sideloadModelName,
        type: 'SECONDARY',
        modelUrl: sideloadModelUrl,
        isLocalhost: true, // It's locally cached
        isActive: true,
        allowDistillation: false
      });

      setSideloadProgress({ text: 'Sideload complete! Model is now available offline.', percent: 100 });
      setSideloadModelName('');
      setSideloadModelUrl('');
      
      setTimeout(() => {
        setIsSideloading(false);
        setSideloadProgress({ text: '', percent: 0 });
      }, 3000);

    } catch (error) {
      console.error("Sideload failed:", error);
      setSideloadProgress({ text: `Error: ${error instanceof Error ? error.message : String(error)}`, percent: 0 });
      setTimeout(() => setIsSideloading(false), 5000);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const [editTargetId, setEditTargetId] = useState<number | null>(null);

  return (
    <div className="w-full max-w-5xl">
       <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Database className="text-purple-500" />
          Model Sandbox & Edge Routing
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure WebLLM endpoints. Add secondary models for Bring-Your-Own-Model (BYOM) telemetry processing.</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden mb-8">
         <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Registered Local Models</h3>
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
                 <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Model Configuration URL</label>
                 <input type="url" required value={newModel.modelUrl} onChange={e => setNewModel({...newModel, modelUrl: e.target.value})} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm p-2 outline-none focus:border-blue-500" placeholder="https://huggingface.co/..." />
               </div>
             </div>
             <div className="flex items-center justify-between mt-2">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors">Save Engine</button>
                <button type="button" onClick={() => setIsAdding(false)} className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-white">Cancel</button>
             </div>
          </form>
        )}

        <table className="w-full text-left text-sm">
          <thead className="bg-gray-100 dark:bg-gray-900/50">
            <tr>
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Engine Type</th>
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Model Definition</th>
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Context Source</th>
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Distillation Target</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {models?.map(m => (
              <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-5 py-4">
                  <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${m.type === 'PRIMARY' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                    {m.type}
                  </span>
                </td>
                <td className="px-5 py-4 font-mono font-medium text-xs text-gray-900 dark:text-gray-100 line-clamp-2" title={m.name}>{m.name}</td>
                <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  {m.isLocalhost ? <Server className="w-3 h-3 text-green-500" /> : <div className="w-2 h-2 rounded-full bg-yellow-500" />} 
                  {m.isLocalhost ? 'Localhost (Air-Gapped)' : 'External URI'}
                </td>
                <td className="px-5 py-4">
                   {m.type === 'PRIMARY' ? (
                     <span className="text-xs text-gray-400 italic">Self (Target)</span>
                   ) : editTargetId === m.id ? (
                     <select 
                       value={m.allowDistillation ? 'Local Dataset (JSONL)' : 'Disabled/None'}
                       onChange={async (e) => {
                         await toggleDistillation(m.id!, e.target.value === 'Local Dataset (JSONL)');
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
                         m.allowDistillation 
                           ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                           : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                       }`}>
                         {m.allowDistillation ? 'Local Dataset (JSONL)' : 'Disabled/None'}
                       </span>
                       <button onClick={() => setEditTargetId(m.id!)} className="text-[10px] underline text-blue-500 hover:text-blue-700">
                         Configure
                       </button>
                     </div>
                   )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden mb-8">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <FolderUp className="text-blue-500" size={18} />
            Offline Sideload (Folder Upload)
          </h3>
        </div>
        <div className="p-5 grid gap-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Securely load WebLLM model weights directly from a local folder (e.g., USB drive). This bypasses all network requests and writes directly to the browser's IndexedDB CacheStorage, ensuring 100% air-gapped compliance.
          </p>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Model Name / Alias</label>
              <input type="text" value={sideloadModelName} onChange={e => setSideloadModelName(e.target.value)} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm p-2 outline-none focus:border-blue-500" placeholder="e.g. Llama-3-Sideloaded" disabled={isSideloading} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-400 mb-1">Model Configuration URL (Base URL)</label>
              <input type="url" value={sideloadModelUrl} onChange={e => setSideloadModelUrl(e.target.value)} className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm p-2 outline-none focus:border-blue-500" placeholder="https://huggingface.co/..." disabled={isSideloading} />
            </div>
          </div>

          <div className="mt-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFolderSelect} 
              className="hidden" 
              // @ts-expect-error - webkitdirectory is non-standard but supported in most modern browsers
              webkitdirectory="" 
              multiple 
              aria-label="Select folder to sideload"
              title="Select folder"
              placeholder="Select folder"
            />
            <button 
              onClick={handleSideloadClick} 
              disabled={isSideloading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              <UploadCloud size={16} />
              {isSideloading ? 'Sideloading...' : 'Select Folder & Sideload'}
            </button>
          </div>

          {isSideloading && (
            <div className="mt-4 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="flex justify-between text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                <span>{sideloadProgress.text}</span>
                <span>{sideloadProgress.percent}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${sideloadProgress.percent}%` }}></div>
              </div>
            </div>
          )}
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
