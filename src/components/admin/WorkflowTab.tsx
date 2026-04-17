import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ReviewWorkflow } from '../../lib/db';
import { Plus, Edit2, Trash2, X, GitMerge, Save, PlayCircle, Settings2 } from 'lucide-react';
import CreatableDropdown from '../ui/CreatableDropdown';
import { useMasterData } from '../../hooks/useMasterData';
import StatusToggle from '../ui/StatusToggle';
import PageHeader from '../ui/PageHeader';

export default function WorkflowTab() {
  const workflows = useLiveQuery(() => db.review_workflows.toArray()) || [];
  const promptTemplates = useLiveQuery(() => db.prompt_templates.where('status').equals('Active').toArray()) || [];
  const reportTemplates = useLiveQuery(() => db.report_templates.where('status').equals('Active').toArray()) || [];
  const reviewTypes = useMasterData('Review Type');
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<ReviewWorkflow>>({
    name: '',
    description: '',
    triggerReviewType: 'New System Implementation',
    stages: [],
    status: 'Active'
  });
  
  const handleAddNew = () => {
    setEditingId(-1);
    setFormData({
      name: 'Standard NSI Workflow',
      description: 'Default Two-Stage NSI Process (ABR -> AIA)',
      version: '1.0.0',
      triggerReviewType: 'New System Implementation',
      stages: [
         {
            id: crypto.randomUUID(),
            name: 'Architecture Board Review (ABR)',
            type: 'AI_EVALUATION',
            orderIndex: 0,
            requiresManualSignoff: true
         },
         {
            id: crypto.randomUUID(),
            name: 'Architecture Impact Assessment',
            type: 'AI_EVALUATION',
            orderIndex: 1,
            requiresManualSignoff: true
         }
      ],
      status: 'Active'
    });
  };

  const handleEdit = (wf: ReviewWorkflow) => {
    setEditingId(wf.id!);
    setFormData({ ...wf });
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this workflow pipeline?')) {
      await db.review_workflows.delete(id);
    }
  };

  const handleSave = async () => {
    if (!formData.name || formData.stages?.length === 0) {
       alert("Name and at least one stage are required.");
       return;
    }

    const payload = {
      name: formData.name,
      description: formData.description || '',
      version: formData.version || '1.0.0',
      triggerReviewType: formData.triggerReviewType!,
      stages: formData.stages!,
      status: formData.status || 'Active'
    };

    if (editingId === -1) {
      await db.review_workflows.add(payload as ReviewWorkflow);
    } else {
      await db.review_workflows.update(editingId!, payload);
    }
    setEditingId(null);
  };
  
  const addStage = () => {
      setFormData(prev => ({
          ...prev,
          stages: [...(prev.stages || []), {
              id: crypto.randomUUID(),
              name: 'New Stage',
              type: 'AI_EVALUATION',
              orderIndex: prev.stages?.length || 0,
              requiresManualSignoff: false
          }]
      }));
  };
  
  const removeStage = (index: number) => {
      setFormData(prev => ({
          ...prev,
          stages: prev.stages?.filter((_, i) => i !== index).map((s, idx) => ({ ...s, orderIndex: idx }))
      }));
  };
  
  const updateStage = (index: number, updates: any) => {
      setFormData(prev => ({
          ...prev,
          stages: prev.stages?.map((s, i) => i === index ? { ...s, ...updates } : s)
      }));
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        icon={<GitMerge className="text-purple-500" />}
        title="State Machine Builder"
        description="Define multi-stage governance pipelines bound to specific Review Intakes."
        action={
          <button
            onClick={handleAddNew}
            disabled={editingId !== null}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
          >
            <Plus size={18} />
            Create Pipeline
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {workflows.map(wf => (
          <div key={wf.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm dark:shadow-none flex flex-col">
            <div className="flex justify-between items-start mb-4">
               <div>
                  <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                     <GitMerge size={18} className="text-purple-500" />
                     {wf.name}
                  </h4>
                  <p className="text-sm text-gray-500 mt-1">{wf.description}</p>
               <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                     <PlayCircle size={10} /> Trigger: {wf.triggerReviewType}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                     v{wf.version || '1.0.0'}
                  </span>
                  <StatusToggle
                      currentStatus={wf.status || 'Active'}
                      statusOptions={['Draft', 'Active', 'Needs Review', 'Deprecated']}
                      onChange={async (s) => await db.review_workflows.update(wf.id!, { status: s as any })}
                  />
               </div>
               </div>
               <div className="flex items-center gap-2">
                  <button onClick={() => handleEdit(wf)} className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(wf.id!)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Trash2 size={16} />
                  </button>
               </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700/50">
               <h5 className="text-xs uppercase tracking-wider text-gray-400 font-semibold mb-3">Pipeline Stages</h5>
               <div className="space-y-2 relative">
                   {wf.stages.map((stage, idx) => (
                       <div key={stage.id} className="flex flex-col relative z-10">
                           <div className="flex items-center gap-3">
                               <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex items-center justify-center text-xs font-bold border border-gray-200 dark:border-gray-600">
                                   {idx + 1}
                               </div>
                               <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 border border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                   <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{stage.name}</span>
                                   {stage.requiresManualSignoff && (
                                       <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/50 font-semibold tracking-wide">
                                           HUMAN GATE
                                       </span>
                                   )}
                               </div>
                           </div>
                           {idx < wf.stages.length - 1 && (
                               <div className="absolute left-[11px] top-6 bottom-[-8px] w-0.5 bg-gray-200 dark:bg-gray-700 -z-10"></div>
                           )}
                       </div>
                   ))}
               </div>
            </div>
          </div>
        ))}
      </div>

      {editingId !== null && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Settings2 className="text-blue-500" />
                {editingId === -1 ? 'Build Governance Pipeline' : 'Edit Pipeline'}
              </h3>
              <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto w-full flex flex-col md:flex-row gap-8">
               {/* Left Column: Metadata */}
               <div className="w-full md:w-1/3 space-y-5">
                   <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pipeline Name</label>
                      <input
                        type="text"
                        className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                        value={formData.name || ''}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                      />
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Internal Description</label>
                      <textarea
                        className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                        value={formData.description || ''}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                      />
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Bind to Review Intake Type</label>
                      <CreatableDropdown
                         value={formData.triggerReviewType || null}
                         onChange={val => setFormData({ ...formData, triggerReviewType: val })}
                         options={reviewTypes.map(rt => ({ label: rt.name, value: rt.name }))}
                         categoryType="Review Type"
                         placeholder="Select target review type..."
                      />
                      <p className="text-xs text-gray-500 mt-2">When a user submits this review type, this exact state machine will govern their execution session.</p>
                   </div>
                   
                   <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Version String</label>
                      <input
                        type="text"
                        className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                        value={formData.version || ''}
                        onChange={e => setFormData({...formData, version: e.target.value})}
                        placeholder="1.0.0"
                      />
                   </div>
                   
                   <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                      <select name="status" value={formData.status || 'Active'} onChange={e => setFormData({ ...formData, status: e.target.value as any })} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                        <option value="Draft">Draft</option>
                        <option value="Active">Active</option>
                        <option value="Needs Review">Needs Review</option>
                        <option value="Deprecated">Deprecated</option>
                      </select>
                   </div>
               </div>

               {/* Right Column: Stage Builder */}
               <div className="w-full md:w-2/3 bg-gray-50 dark:bg-gray-900/50 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                   <div className="flex justify-between items-center mb-6">
                       <h4 className="font-semibold text-gray-900 dark:text-white">Execution Stages</h4>
                       <button onClick={addStage} className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 bg-blue-100 hover:bg-blue-200 dark:bg-blue-500/20 dark:text-blue-400 font-medium px-3 py-1.5 rounded-lg transition-colors">
                           <Plus size={14} /> Add Stage
                       </button>
                   </div>
                   
                   <div className="space-y-4 relative">
                       {formData.stages?.map((stage, idx) => (
                           <div key={stage.id} className="relative z-10 flex gap-4">
                               <div className="flex flex-col items-center">
                                   <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center justify-center font-bold shadow-inner">
                                       {idx + 1}
                                   </div>
                                   {idx < formData.stages!.length - 1 && (
                                       <div className="w-1 flex-1 bg-gray-200 dark:bg-gray-700 mt-2 mb-[-16px]"></div>
                                   )}
                               </div>
                               <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
                                   <div className="flex justify-between items-start gap-4 mb-4">
                                       <input 
                                           type="text" 
                                           value={stage.name} 
                                           onChange={e => updateStage(idx, { name: e.target.value })}
                                           className="font-semibold text-gray-900 dark:text-white bg-transparent outline-none border-b border-transparent focus:border-blue-500 w-full"
                                           placeholder="Stage Name (e.g., ABR)"
                                       />
                                       <button onClick={() => removeStage(idx)} className="text-gray-400 hover:text-red-500">
                                           <X size={16} />
                                       </button>
                                   </div>
                                   
                                   <div className="grid grid-cols-2 gap-4">
                                       <div>
                                           <label className="block text-[10px] uppercase tracking-wide font-semibold text-gray-500 mb-1">AI Prompt Instruction (Optional)</label>
                                           <select 
                                               value={stage.linkedPromptTemplateId || ''}
                                               onChange={e => updateStage(idx, { linkedPromptTemplateId: e.target.value ? parseInt(e.target.value) : undefined })}
                                               className="w-full text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none text-gray-800 dark:text-gray-200"
                                           >
                                               <option value="">-- No specific prompt --</option>
                                               {promptTemplates.map(pt => (
                                                   <option key={pt.id} value={pt.id}>{pt.name}</option>
                                               ))}
                                           </select>
                                       </div>
                                       <div>
                                           <label className="block text-[10px] uppercase tracking-wide font-semibold text-gray-500 mb-1">Output Templating (Optional)</label>
                                           <select 
                                               value={stage.linkedReportTemplateId || ''}
                                               onChange={e => updateStage(idx, { linkedReportTemplateId: e.target.value ? parseInt(e.target.value) : undefined })}
                                               className="w-full text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none text-gray-800 dark:text-gray-200"
                                           >
                                               <option value="">-- Render natural Output --</option>
                                               {reportTemplates.map(rt => (
                                                   <option key={rt.id} value={rt.id}>{rt.name}</option>
                                               ))}
                                           </select>
                                       </div>
                                   </div>
                                   
                                   <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
                                      <label className="flex items-center gap-2 cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            checked={stage.requiresManualSignoff}
                                            onChange={e => updateStage(idx, { requiresManualSignoff: e.target.checked })}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-white dark:bg-gray-900"
                                        />
                                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Require Human Approval (ABR Board Gate)</span>
                                      </label>
                                   </div>
                               </div>
                           </div>
                       ))}
                   </div>
               </div>
            </div>
            
            <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 rounded-b-xl bg-gray-50 dark:bg-gray-900/50">
              <button
                onClick={() => setEditingId(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors font-medium shadow-sm"
              >
                <Save size={18} />
                Save Pipeline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
