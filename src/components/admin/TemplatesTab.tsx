import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ReportTemplate } from '../../lib/db';
import { Plus, Edit2, Trash2, Check, X, FileText } from 'lucide-react';
import CreatableDropdown from '../ui/CreatableDropdown';
import { useMasterData } from '../../hooks/useMasterData';
import StatusToggle from '../ui/StatusToggle';

export default function TemplatesTab() {
  const templates = useLiveQuery(() => db.report_templates.toArray()) || [];
  const reviewTypes = useMasterData('Review Type');
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<ReportTemplate>>({
    name: '',
    category: 'Architecture Assessment',
    markdownStructure: '',
    status: 'Active'
  });
  
  const handleAddNew = () => {
    setEditingId(-1);
    setFormData({
      name: 'New Report Template',
      category: 'New System Implementation',
      markdownStructure: '# {{projectName}} Review\n\n## Vendor Breakdown\n\n{{vendorMatrix}}\n\n## Threat Model\n\n{{aiThreatAnalysis}}',
      version: '1.0.0',
      status: 'Active'
    });
  };

  const handleEdit = (tmpl: ReportTemplate) => {
    setEditingId(tmpl.id!);
    setFormData({ ...tmpl });
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this template?')) {
      await db.report_templates.delete(id);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.markdownStructure) {
       alert("Name and Markdown Structure are required.");
       return;
    }

    const payload = {
      name: formData.name,
      category: formData.category!,
      markdownStructure: formData.markdownStructure,
      version: formData.version || '1.0.0',
      status: formData.status || 'Active',
      updatedAt: new Date(),
      createdAt: formData.createdAt || new Date()
    };

    if (editingId === -1) {
      await db.report_templates.add(payload as ReportTemplate);
    } else {
      await db.report_templates.update(editingId!, payload);
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Output Templates</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Define markdown templates to mandate how AI structures its final output.</p>
        </div>
        <button
          onClick={handleAddNew}
          disabled={editingId !== null}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
        >
          <Plus size={18} />
          Create Template
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map(tmpl => (
          <div key={tmpl.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm dark:shadow-none flex flex-col min-h-[220px]">
            <div className="flex justify-between items-start mb-4">
               <div>
                  <h4 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                     <FileText size={16} className="text-blue-500" />
                     {tmpl.name}
                  </h4>
                  <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-500 font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 inline-block">
                         {tmpl.category}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                         v{tmpl.version || '1.0.0'}
                      </span>
                      <StatusToggle
                          currentStatus={tmpl.status || 'Active'}
                          statusOptions={['Draft', 'Active', 'Needs Review', 'Deprecated']}
                          onChange={async (s) => await db.report_templates.update(tmpl.id!, { status: s as any })}
                      />
                  </div>
               </div>
               <div className="flex items-center gap-2">
                  <button onClick={() => handleEdit(tmpl)} className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(tmpl.id!)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                    <Trash2 size={16} />
                  </button>
               </div>
            </div>
            
            <div className="flex-1 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 p-3 overflow-hidden mt-2 relative">
               <pre className="text-[10px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-hidden h-full">
                  {tmpl.markdownStructure}
               </pre>
               <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-gray-50 dark:from-gray-900 to-transparent pointer-events-none"></div>
            </div>
          </div>
        ))}
      </div>

      {editingId !== null && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingId === -1 ? 'Create Report Template' : 'Edit Template'}
              </h3>
              <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 gap-6">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Template Name</label>
                    <input
                      type="text"
                      className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      value={formData.name || ''}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Category (Review Type Match)</label>
                    <CreatableDropdown
                       value={formData.category || null}
                       onChange={val => setFormData({ ...formData, category: val })}
                       options={reviewTypes.map(rt => ({ label: rt.name, value: rt.name }))}
                       categoryType="Review Type"
                       placeholder="Select trigger type..."
                    />
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
                 
                 <div className="mt-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                    <select name="status" value={formData.status || 'Active'} onChange={e => setFormData({ ...formData, status: e.target.value as any })} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                      <option value="Draft">Draft</option>
                      <option value="Active">Active</option>
                      <option value="Needs Review">Needs Review</option>
                      <option value="Deprecated">Deprecated</option>
                    </select>
                 </div>
              </div>
              
              <div className="h-96 flex flex-col">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Markdown Structure Framework</label>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                   Valid injection tags: <code className="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded">{"{{projectName}}"}</code>, 
                   <code className="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded">{"{{winningVendor}}"}</code>, 
                   <code className="bg-gray-100 dark:bg-gray-900 px-1 py-0.5 rounded">{"{{vendorMatrix}}"}</code>
                </div>
                <textarea
                  className="w-full flex-1 font-mono text-sm bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg p-4 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  value={formData.markdownStructure || ''}
                  onChange={e => setFormData({...formData, markdownStructure: e.target.value})}
                  placeholder="# Architecture Decision Record\n\n## Overview..."
                />
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
                <Check size={18} />
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
