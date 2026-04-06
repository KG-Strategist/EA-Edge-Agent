import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { Database, Server, Plus, ToggleLeft, ToggleRight, Info } from 'lucide-react';

export default function ModelSandboxTab() {
  const models = useLiveQuery(() => db.model_registry.toArray());
  const [isAdding, setIsAdding] = useState(false);
  const [newModel, setNewModel] = useState({ name: '', modelUrl: '', allowDistillation: false });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModel.name || !newModel.modelUrl) return;

    await db.model_registry.add({
      name: newModel.name,
      type: 'SECONDARY',
      modelUrl: newModel.modelUrl,
      isLocalhost: newModel.modelUrl.includes('localhost') || newModel.modelUrl.startsWith('/'),
      isActive: true,
      allowDistillation: newModel.allowDistillation
    });
    
    setNewModel({ name: '', modelUrl: '', allowDistillation: false });
    setIsAdding(false);
  };

  const toggleDistillation = async (id: number, currentVal: boolean) => {
    await db.model_registry.update(id, { allowDistillation: !currentVal });
  };

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
                   ) : (
                     <button onClick={() => toggleDistillation(m.id!, !!m.allowDistillation)} className="flex items-center gap-2 group outline-none">
                       {m.allowDistillation ? (
                          <ToggleRight className="text-blue-500 w-8 h-8 transition-colors group-hover:text-blue-400" />
                       ) : (
                          <ToggleLeft className="text-gray-400 w-8 h-8 transition-colors group-hover:text-gray-300" />
                       )}
                       <span className={`text-xs font-semibold ${m.allowDistillation ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}>
                         {m.allowDistillation ? 'Enabled' : 'Disabled'}
                       </span>
                     </button>
                   )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
    </div>
  );
}
