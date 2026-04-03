import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, MasterCategory } from '../../lib/db';
import { Plus, Edit, Trash2, ArrowUpDown, BrainCircuit, Loader2 } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import { MASTER_CATEGORY_TYPES } from '../../lib/constants';
import { initAIEngine, generateReview } from '../../lib/aiEngine';

export default function CategoriesTab() {
  const categories = useLiveQuery(() => db.master_categories.toArray()) || [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof MasterCategory>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [descriptionValue, setDescriptionValue] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const handleSort = (column: keyof MasterCategory) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedCategories = [...categories].sort((a, b) => {
    const aVal = a[sortColumn] || '';
    const bVal = b[sortColumn] || '';
    
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
      return sortDirection === 'asc' ? (aVal === bVal ? 0 : aVal ? -1 : 1) : (aVal === bVal ? 0 : aVal ? 1 : -1);
    }
    return 0;
  });

  const openModal = (item: MasterCategory | null = null) => {
    setEditingItem(item);
    setDescriptionValue(item?.description || '');
    setError(null);
    setIsModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (itemToDelete) {
      await db.master_categories.delete(itemToDelete);
      setItemToDelete(null);
    }
  };

  const handleAutoGenerate = async () => {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    const name = (formData.get('name') as string).trim();
    const type = formData.get('type') as string;

    if (!name || !type) {
      setError("Please select a Type and enter a Name before auto-generating a description.");
      return;
    }

    setIsGeneratingDesc(true);
    setError(null);
    setAiProgress(0);

    try {
      await initAIEngine((progress) => {
        setAiProgress(Math.round(progress.progress * 100));
      });

      const prompt = `You are an Enterprise Architecture expert. Write a concise, 1-2 sentence description for a Master Category of type "${type}" named "${name}". Do not include any conversational filler, just the description.`;
      
      setDescriptionValue(''); // Clear before streaming
      await generateReview(prompt, (text) => {
        setDescriptionValue(text);
      });
    } catch (err: any) {
      console.error("AI Generation Error:", err);
      if (err.message?.includes('NetworkError') || err.message?.includes('Cache.add')) {
        setError("Network Error: Failed to download AI model. This can happen if HuggingFace is blocked by a corporate VPN, or if your browser's storage quota is exceeded (e.g., in Incognito/Private mode).");
      } else {
        setError("Failed to generate description. Check console for details.");
      }
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    const type = formData.get('type') as string;
    const description = formData.get('description') as string;
    const isActive = formData.get('isActive') === 'on';
    
    // Duplicate validation using compound index
    const count = await db.master_categories.where({ type, name }).count();
    
    if (count > 0 && (!editingItem || editingItem.name !== name || editingItem.type !== type)) {
      setError(`A category with the name "${name}" already exists for type "${type}".`);
      return;
    }

    const item = {
      name,
      type,
      description,
      isActive,
    };
    
    if (editingItem?.id) {
      await db.master_categories.update(editingItem.id, item);
    } else {
      await db.master_categories.add(item);
    }
    setIsModalOpen(false);
    setEditingItem(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Master Categories</h3>
        <button onClick={() => openModal(null)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm">
          <Plus size={16} />
          Add New
        </button>
      </div>

      <div className="flex-1 overflow-auto border border-gray-200 dark:border-gray-700 rounded-md">
            <table className="w-full text-left border-collapse min-w-full">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-[0_1px_0_0_theme(colors.gray.200)] dark:shadow-[0_1px_0_0_theme(colors.gray.700)]">
            <tr className="text-gray-500 dark:text-gray-400 text-sm">
              <th className="px-4 py-3 font-medium">
                <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Name <ArrowUpDown size={14} className={sortColumn === 'name' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="px-4 py-3 font-medium">
                <button onClick={() => handleSort('type')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Type <ArrowUpDown size={14} className={sortColumn === 'type' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="px-4 py-3 font-medium">
                <button onClick={() => handleSort('description')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Description <ArrowUpDown size={14} className={sortColumn === 'description' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="px-4 py-3 font-medium">
                <button onClick={() => handleSort('isActive')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Status <ArrowUpDown size={14} className={sortColumn === 'isActive' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedCategories.map(c => (
              <tr key={c.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className="py-4 text-gray-900 dark:text-gray-200 font-medium">{c.name}</td>
                <td className="py-4 text-gray-600 dark:text-gray-300 text-sm">
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-md text-xs border border-gray-200 dark:border-gray-700">
                    {MASTER_CATEGORY_TYPES[c.type as keyof typeof MASTER_CATEGORY_TYPES] || c.type}
                  </span>
                </td>
                <td className="py-4 text-gray-600 dark:text-gray-300 text-sm max-w-xs truncate" title={c.description}>{c.description || '-'}</td>
                <td className="py-4 text-gray-600 dark:text-gray-300 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs ${c.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                    {c.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="py-4 text-right">
                  <button onClick={() => openModal(c)} className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Edit size={16} /></button>
                  <button onClick={() => setItemToDelete(c.id!)} className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{editingItem ? 'Edit Category' : 'Add Category'}</h3>
            <form ref={formRef} onSubmit={handleSave} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Type</label>
                <select name="type" defaultValue={editingItem?.type || ''} onChange={() => setError(null)} required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                  <option value="" disabled>Select Type...</option>
                  {Object.entries(MASTER_CATEGORY_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Name</label>
                <input name="name" defaultValue={editingItem?.name} onChange={() => setError(null)} required className={`w-full bg-white dark:bg-gray-800 border ${error ? 'border-red-500 focus:border-red-500' : 'border-gray-300 dark:border-gray-700 focus:border-blue-500'} rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none`} />
                {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm text-gray-600 dark:text-gray-400">Description (Optional)</label>
                  <button
                    type="button"
                    onClick={handleAutoGenerate}
                    disabled={isGeneratingDesc}
                    className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50 transition-colors"
                  >
                    {isGeneratingDesc ? <Loader2 size={12} className="animate-spin" /> : <BrainCircuit size={12} />}
                    {isGeneratingDesc ? (aiProgress > 0 && aiProgress < 100 ? `Loading AI (${aiProgress}%)` : 'Generating...') : 'Auto Generate'}
                  </button>
                </div>
                <textarea 
                  name="description" 
                  value={descriptionValue}
                  onChange={(e) => setDescriptionValue(e.target.value)}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 h-20" 
                />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" name="isActive" id="isActive" defaultChecked={editingItem ? editingItem.isActive : true} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <label htmlFor="isActive" className="text-sm text-gray-700 dark:text-gray-300">Active</label>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!itemToDelete}
        title="Delete Category"
        message="Are you sure you want to delete this category? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
}
