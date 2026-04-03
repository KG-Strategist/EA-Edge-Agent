import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ArchitectureLayer } from '../../lib/db';
import { Plus, Edit, Trash2, ArrowUpDown } from 'lucide-react';
import CreatableSelect from 'react-select/creatable';
import ConfirmModal from '../ui/ConfirmModal';

export default function LayersTab() {
  const layers = useLiveQuery(() => db.architecture_layers.toArray()) || [];
  const categories = useLiveQuery(() => db.architecture_categories.toArray()) || [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ArchitectureLayer | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<{ value: number | string, label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof ArchitectureLayer | 'categoryName'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: keyof ArchitectureLayer | 'categoryName') => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getCategoryName = (categoryId: number) => {
    return categories.find(c => c.id === categoryId)?.name || 'Unknown';
  };

  const sortedLayers = [...layers].sort((a, b) => {
    let aVal = '';
    let bVal = '';
    if (sortColumn === 'categoryName') {
      aVal = getCategoryName(a.categoryId);
      bVal = getCategoryName(b.categoryId);
    } else {
      aVal = (a[sortColumn as keyof ArchitectureLayer] as string) || '';
      bVal = (b[sortColumn as keyof ArchitectureLayer] as string) || '';
    }
    return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
  });

  const handleDeleteConfirm = async () => {
    if (itemToDelete) {
      await db.architecture_layers.delete(itemToDelete);
      setItemToDelete(null);
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    
    if (!selectedCategory) {
      setError("Please select or create a category.");
      return;
    }

    const existingLayer = layers.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (existingLayer && existingLayer.id !== editingItem?.id) {
      setError(`A layer with the name "${name}" already exists.`);
      return;
    }

    let categoryId: number;

    // If it's a new category (value is string), create it first
    if (typeof selectedCategory.value === 'string') {
      const newCatName = selectedCategory.label.trim();
      const existingCat = categories.find(c => c.name.toLowerCase() === newCatName.toLowerCase() && (!c.type || c.type === 'Layer Category'));
      if (existingCat) {
        categoryId = existingCat.id!;
      } else {
        categoryId = await db.architecture_categories.add({
          name: newCatName,
          type: 'Layer Category',
          parentId: null
        });
      }
    } else {
      categoryId = selectedCategory.value;
    }

    const item = {
      name,
      categoryId,
    };

    if (editingItem?.id) {
      await db.architecture_layers.update(editingItem.id, item);
    } else {
      await db.architecture_layers.add(item);
    }
    setIsModalOpen(false);
    setEditingItem(null);
    setSelectedCategory(null);
  };

  const openModal = (item: ArchitectureLayer | null = null) => {
    setEditingItem(item);
    setError(null);
    if (item && item.categoryId) {
      const cat = categories.find(c => c.id === item.categoryId);
      if (cat) {
        setSelectedCategory({ value: cat.id!, label: cat.name });
      } else {
        setSelectedCategory(null);
      }
    } else {
      setSelectedCategory(null);
    }
    setIsModalOpen(true);
  };

  const categoryOptions = categories.map(c => ({
    value: c.id!,
    label: c.name
  }));

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Architecture Layers</h3>
        <button onClick={() => openModal(null)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm">
          <Plus size={16} />
          Add New
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-white dark:bg-gray-800 z-10 shadow-sm">
            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm">
              <th className="pb-3 font-medium">
                <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Name <ArrowUpDown size={14} className={sortColumn === 'name' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="pb-3 font-medium">
                <button onClick={() => handleSort('categoryName')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Category <ArrowUpDown size={14} className={sortColumn === 'categoryName' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="pb-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedLayers.map(l => (
              <tr key={l.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className="py-4 text-gray-900 dark:text-gray-200 font-medium">{l.name}</td>
                <td className="py-4 text-gray-600 dark:text-gray-300 text-sm">{getCategoryName(l.categoryId)}</td>
                <td className="py-4 text-right">
                  <button onClick={() => openModal(l)} className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Edit size={16} /></button>
                  <button onClick={() => setItemToDelete(l.id!)} className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{editingItem ? 'Edit Layer' : 'Add Layer'}</h3>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Name</label>
                <input name="name" defaultValue={editingItem?.name} onChange={() => setError(null)} required className={`w-full bg-white dark:bg-gray-800 border ${error && error.includes('layer') ? 'border-red-500 focus:border-red-500' : 'border-gray-300 dark:border-gray-700 focus:border-blue-500'} rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none`} />
                {error && error.includes('layer') && <p className="text-sm text-red-500 mt-1">{error}</p>}
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Category</label>
                <CreatableSelect
                  isClearable
                  onChange={(newValue: any) => { setSelectedCategory(newValue); setError(null); }}
                  value={selectedCategory}
                  options={categoryOptions}
                  placeholder="Select or type to create..."
                  className="react-select-container"
                  classNamePrefix="react-select"
                  styles={{
                    control: (baseStyles) => ({
                      ...baseStyles,
                      backgroundColor: 'transparent',
                      borderColor: '#d1d5db',
                      borderRadius: '0.5rem',
                      padding: '2px',
                    }),
                    menu: (baseStyles) => ({
                      ...baseStyles,
                      zIndex: 9999,
                    })
                  }}
                />
                {error && error.includes('category') && <p className="text-sm text-red-500 mt-1">{error}</p>}
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
        title="Delete Layer"
        message="Are you sure you want to delete this architecture layer? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
}
