import React, { useState, useEffect } from 'react';
import { db } from '../../lib/db';
import { Settings, Download, Upload, Cpu, Save, Loader2, RefreshCcw, Activity, TerminalSquare } from 'lucide-react';
import { DEFAULT_PRIMARY_MODEL_ID, DEFAULT_TINY_MODEL_ID, unloadAIEngine, getActiveModelId, getActiveModelUrl } from '../../lib/aiEngine';

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
      const { text, progress } = customEvent.detail;
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

export default function SystemTab() {
  // Core Model
  const [coreModel, setCoreModel] = useState(DEFAULT_PRIMARY_MODEL_ID);
  const [coreUrl, setCoreUrl] = useState("https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Phi-3-mini-4k-instruct-q4f16_1-MLC");
  const [coreLib, setCoreLib] = useState("https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Phi-3-mini-4k-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm");
  
  // Tiny Model
  const [tinyModel, setTinyModel] = useState(DEFAULT_TINY_MODEL_ID);
  const [tinyUrl, setTinyUrl] = useState("https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/gemma-2b-it-q4f16_1-MLC");
  const [tinyLib, setTinyLib] = useState("https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/gemma-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm");

  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const settings = await db.app_settings.toArray();
      const st = (key: string) => settings.find(s => s.key === key)?.value;
      
      if (st('customCoreModelId')) setCoreModel(st('customCoreModelId'));
      if (st('customCoreModelUrl')) setCoreUrl(st('customCoreModelUrl'));
      if (st('customCoreModelLibUrl')) setCoreLib(st('customCoreModelLibUrl'));
      
      if (st('customTinyModelId')) setTinyModel(st('customTinyModelId'));
      if (st('customTinyModelUrl')) setTinyUrl(st('customTinyModelUrl'));
      if (st('customTinyModelLibUrl')) setTinyLib(st('customTinyModelLibUrl'));
    };
    fetchSettings();
  }, []);

  const handleSaveModels = async () => {
    setIsSaving(true);
    await db.app_settings.put({ key: 'customCoreModelId', value: coreModel });
    await db.app_settings.put({ key: 'customCoreModelUrl', value: coreUrl });
    await db.app_settings.put({ key: 'customCoreModelLibUrl', value: coreLib });
    
    await db.app_settings.put({ key: 'customTinyModelId', value: tinyModel });
    await db.app_settings.put({ key: 'customTinyModelUrl', value: tinyUrl });
    await db.app_settings.put({ key: 'customTinyModelLibUrl', value: tinyLib });
    
    await unloadAIEngine(); // Unload from VRAM when user switches models
    setTimeout(() => setIsSaving(false), 500);
  };

  const handleExportBrain = async () => {
    setIsExporting(true);
    try {
      const dump = {
        architecture_categories: await db.architecture_categories.toArray(),
        master_categories: await db.master_categories.toArray(),
        content_metamodel: await db.content_metamodel.toArray(),
        architecture_layers: await db.architecture_layers.toArray(),
        architecture_principles: await db.architecture_principles.toArray(),
        bian_domains: await db.bian_domains.toArray(),
        bespoke_tags: await db.bespoke_tags.toArray(),
        prompt_templates: await db.prompt_templates.toArray(),
        report_templates: await db.report_templates.toArray(),
        review_workflows: await db.review_workflows.toArray(),
        app_settings: await db.app_settings.toArray(),
        threat_models: await db.threat_models.toArray()
      };
      
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `niti_brain_export_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Failed to export database: " + e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportBrain = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!confirm("WARNING: Importing a NITI Brain state will overwrite duplicate keys. Continue?")) {
        event.target.value = '';
        return;
    }

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const dump = JSON.parse(text);
        
        await db.transaction('rw', 
          [db.architecture_categories, db.master_categories, db.content_metamodel,
          db.architecture_layers, db.architecture_principles, db.bian_domains,
          db.bespoke_tags, db.prompt_templates, db.report_templates,
          db.review_workflows, db.app_settings, db.threat_models], 
        async () => {
          if (dump.architecture_categories) await db.architecture_categories.bulkPut(dump.architecture_categories);
          if (dump.master_categories) await db.master_categories.bulkPut(dump.master_categories);
          if (dump.content_metamodel) await db.content_metamodel.bulkPut(dump.content_metamodel);
          if (dump.architecture_layers) await db.architecture_layers.bulkPut(dump.architecture_layers);
          if (dump.architecture_principles) await db.architecture_principles.bulkPut(dump.architecture_principles);
          if (dump.bian_domains) await db.bian_domains.bulkPut(dump.bian_domains);
          if (dump.bespoke_tags) await db.bespoke_tags.bulkPut(dump.bespoke_tags);
          if (dump.prompt_templates) await db.prompt_templates.bulkPut(dump.prompt_templates);
          if (dump.report_templates) await db.report_templates.bulkPut(dump.report_templates);
          if (dump.review_workflows) await db.review_workflows.bulkPut(dump.review_workflows);
          if (dump.app_settings) await db.app_settings.bulkPut(dump.app_settings);
          if (dump.threat_models) await db.threat_models.bulkPut(dump.threat_models);
        });
        
        alert("NITI Brain state successfully restored! The agent interface will reload to apply changes.");
        window.location.reload();
      } catch (err) {
        alert("Failed to import brain state: " + err);
      } finally {
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
          <Cpu className="text-blue-500" />
          AI Engine Configurations
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Override the native WebGPU Local Inference models. Models must match HuggingFace MLC registry IDs to be cached via CacheStorage.
          Note: Very large model configs may trigger browser memory quota constraints.
        </p>
        
        <div className="space-y-6">
           {/* Core Model Section */}
           <div className="bg-white dark:bg-gray-800/50 p-4 border border-gray-200 dark:border-gray-700/50 rounded-lg shadow-sm">
             <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-800 pb-2">Core Capability Model (Domain SME)</h4>
             <div className="space-y-3">
               <div>
                 <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Model Name / HuggingFace ID</label>
                 <input type="text" value={coreModel} onChange={(e) => setCoreModel(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-mono" placeholder="EA-NITI-Core" />
               </div>
               <div>
                 <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Model Weights URL (Folder containing config.json & shards)</label>
                 <input type="text" value={coreUrl} onChange={(e) => setCoreUrl(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-mono" />
               </div>
               <div>
                 <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">WASM Library URL (.wasm binary)</label>
                 <input type="text" value={coreLib} onChange={(e) => setCoreLib(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-mono" />
               </div>
             </div>
           </div>

           {/* Tiny Model Section */}
           <div className="bg-white dark:bg-gray-800/50 p-4 border border-gray-200 dark:border-gray-700/50 rounded-lg shadow-sm">
             <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 border-b border-gray-100 dark:border-gray-800 pb-2">Fast Triage Model (Constraints/MoE)</h4>
             <div className="space-y-3">
               <div>
                 <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Model Name / HuggingFace ID</label>
                 <input type="text" value={tinyModel} onChange={(e) => setTinyModel(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-mono" placeholder="EA-NITI-Alt" />
               </div>
               <div>
                 <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Model Weights URL (Folder containing config.json & shards)</label>
                 <input type="text" value={tinyUrl} onChange={(e) => setTinyUrl(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-mono" />
               </div>
               <div>
                 <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">WASM Library URL (.wasm binary)</label>
                 <input type="text" value={tinyLib} onChange={(e) => setTinyLib(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-mono" />
               </div>
             </div>
           </div>
           
           <button 
             onClick={handleSaveModels}
             disabled={isSaving}
             className="mt-4 flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors text-sm shadow-sm"
           >
             {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
             {isSaving ? 'Binding to Local DB...' : 'Apply Model Overrides'}
           </button>
        </div>
        <EngineDiagnostics />
      </div>
      
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800/50 p-6">
         <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
           <RefreshCcw className="text-indigo-500" />
           State Portability (NITI Brain Transfer)
         </h3>
         <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
           Export your agent's entirely localized knowledge base (Categories, Domains, Taxonomies, Templates, Workflow Pipelines, Principles) into a raw JSON struct. Use this to seed new NITI installations without re-training standard metadata manually. (Note: Review Sessions and Vector Embeddings are deliberately excluded from brain dumps for privacy isolation layer.)
         </p>
         
         <div className="flex gap-4 items-center">
            <button 
               onClick={handleExportBrain}
               disabled={isExporting}
               className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors shadow-md disabled:opacity-50"
            >
               {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
               Export Knowledge Base
            </button>
            <div className="relative">
               <input 
                  type="file" 
                  accept=".json"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleImportBrain}
                  disabled={isImporting}
               />
               <button 
                  className={`flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-800 border-2 border-indigo-200 dark:border-indigo-700 hover:border-indigo-500 dark:hover:border-indigo-400 text-indigo-700 dark:text-indigo-300 rounded-lg font-medium transition-colors ${isImporting ? 'opacity-50' : ''}`}
               >
                  {isImporting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                  Import & Merge State
               </button>
            </div>
         </div>
      </div>
    </div>
  );
}
