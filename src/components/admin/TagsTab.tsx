import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, BespokeTag } from '../../lib/db';
import { Plus, Edit, Trash2, ArrowUpDown, Archive, RotateCcw, Tag } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import StatusToggle from '../ui/StatusToggle';
import DataPortabilityButtons from '../ui/DataPortabilityButtons';
import StatusSelect from '../ui/StatusSelect';
import CreatableDropdown from '../ui/CreatableDropdown';
import { useDataPortability } from '../../hooks/useDataPortability';
import PageHeader from '../ui/PageHeader';

const TAILWIND_COLORS = [
  { name: 'Red', value: 'bg-red-500/20 text-red-700 dark:text-red-400', bgClass: 'bg-red-500' },
  { name: 'Orange', value: 'bg-orange-500/20 text-orange-700 dark:text-orange-400', bgClass: 'bg-orange-500' },
  { name: 'Amber', value: 'bg-amber-500/20 text-amber-700 dark:text-amber-400', bgClass: 'bg-amber-500' },
  { name: 'Yellow', value: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400', bgClass: 'bg-yellow-500' },
  { name: 'Lime', value: 'bg-lime-500/20 text-lime-700 dark:text-lime-400', bgClass: 'bg-lime-500' },
  { name: 'Green', value: 'bg-green-500/20 text-green-700 dark:text-green-400', bgClass: 'bg-green-500' },
  { name: 'Emerald', value: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400', bgClass: 'bg-emerald-500' },
  { name: 'Teal', value: 'bg-teal-500/20 text-teal-700 dark:text-teal-400', bgClass: 'bg-teal-500' },
  { name: 'Cyan', value: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-400', bgClass: 'bg-cyan-500' },
  { name: 'Sky', value: 'bg-sky-500/20 text-sky-700 dark:text-sky-400', bgClass: 'bg-sky-500' },
  { name: 'Blue', value: 'bg-blue-500/20 text-blue-700 dark:text-blue-400', bgClass: 'bg-blue-500' },
  { name: 'Indigo', value: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-400', bgClass: 'bg-indigo-500' },
  { name: 'Violet', value: 'bg-violet-500/20 text-violet-700 dark:text-violet-400', bgClass: 'bg-violet-500' },
  { name: 'Purple', value: 'bg-purple-500/20 text-purple-700 dark:text-purple-400', bgClass: 'bg-purple-500' },
  { name: 'Fuchsia', value: 'bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-400', bgClass: 'bg-fuchsia-500' },
  { name: 'Pink', value: 'bg-pink-500/20 text-pink-700 dark:text-pink-400', bgClass: 'bg-pink-500' },
  { name: 'Rose', value: 'bg-rose-500/20 text-rose-700 dark:text-rose-400', bgClass: 'bg-rose-500' },
  { name: 'Gray', value: 'bg-gray-500/20 text-gray-700 dark:text-gray-400', bgClass: 'bg-gray-500' },
];


export default function TagsTab() {
  const tags = useLiveQuery(() => db.bespoke_tags.toArray()) || [];
  const tagCategories = useLiveQuery(() => db.master_categories.where('type').equals('Tag Category').toArray()) || [];
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BespokeTag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof BespokeTag>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showArchived, setShowArchived] = useState(false);
  
  const [selectedColor, setSelectedColor] = useState(TAILWIND_COLORS[10].value);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const { handleExport, handleImport } = useDataPortability({ tableName: 'bespoke_tags', filename: 'bespoke_tags' });

  const handleSort = (column: keyof BespokeTag) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const filteredTags = showArchived
    ? tags.filter(t => t.status === 'Deprecated')
    : tags.filter(t => t.status !== 'Deprecated');

  const sortedTags = [...filteredTags].sort((a, b) => {
    const aVal = a[sortColumn] || '';
    const bVal = b[sortColumn] || '';
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return 0;
  });

  const openModal = (item: BespokeTag | null = null) => {
    setEditingItem(item);
    setError(null);
    setSelectedCategory(item?.category || '');
    setSelectedColor(item?.colorCode || TAILWIND_COLORS[10].value);
    setIsModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (itemToDelete) {
      await db.bespoke_tags.delete(itemToDelete);
      setItemToDelete(null);
    }
  };

  const handleStatusChange = async (item: BespokeTag, newStatus: string) => {
    if (item.id) {
       await db.bespoke_tags.update(item.id, { status: newStatus as any });
    }
  };

  const handleArchive = async (id: number) => {
    await db.bespoke_tags.update(id, { status: 'Deprecated' });
  };

  const handleRestore = async (id: number) => {
    await db.bespoke_tags.update(id, { status: 'Active' });
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    const category = formData.get('category') as string;

    if (!category) {
      setError("Please select a category.");
      return;
    }

    const existing = tags.find(t => t.name.toLowerCase() === name.toLowerCase() && t.category === category);
    if (existing && existing.id !== editingItem?.id) {
      setError(`A tag with the name "${name}" already exists in this category.`);
      return;
    }

    const item = {
      name,
      category,
      colorCode: selectedColor,
      status: (formData.get('status') as any) || 'Active',
    };
    if (editingItem?.id) {
      await db.bespoke_tags.update(editingItem.id, item);
    } else {
      await db.bespoke_tags.add(item);
    }
    setIsModalOpen(false);
    setEditingItem(null);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader 
        icon={<Tag className="text-blue-500" />}
        title="Bespoke Tags"
        description="Bespoke Tags allow you to assign arbitrary, custom metadata to architectural artifacts that don't fit into standard BIAN domains or metamodels."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                showArchived
                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <Archive size={14} />
              {showArchived ? 'Exit Archive' : 'Archive'}
            </button>
            <DataPortabilityButtons onExport={handleExport} onImport={handleImport} />
            <button onClick={() => openModal(null)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm">
              <Plus size={16} />
              Add New
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto border border-gray-200 dark:border-gray-700 rounded-md">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-[0_1px_0_0_theme(colors.gray.200)] dark:shadow-[0_1px_0_0_theme(colors.gray.700)]">
            <tr className="text-gray-500 dark:text-gray-400 text-sm">
              <th className="px-4 py-3 font-medium">
                <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Name <ArrowUpDown size={14} className={sortColumn === 'name' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="px-4 py-3 font-medium">
                <button onClick={() => handleSort('category')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Category <ArrowUpDown size={14} className={sortColumn === 'category' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="px-4 py-3 font-medium">
                <button onClick={() => handleSort('status' as any)} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Status <ArrowUpDown size={14} className={sortColumn === 'status' as any ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedTags.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400 text-sm">
                {showArchived ? 'No archived tags.' : 'No tags found.'}
              </td></tr>
            )}
            {sortedTags.map(t => (
              <tr key={t.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className="px-4 py-4">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${t.colorCode}`}>
                    {t.name}
                  </span>
                </td>
                <td className="px-4 py-4 text-gray-600 dark:text-gray-300 text-sm">
                  {t.category}
                </td>
                <td className="px-4 py-4">
                  {showArchived ? (
                    <StatusToggle 
                      currentStatus="Deprecated" 
                      statusOptions={['Draft', 'Active', 'Needs Review', 'Deprecated']} 
                      onChange={() => {}} 
                      readonly={true} 
                    />
                  ) : (
                    <StatusToggle 
                      currentStatus={t.status || 'Active'} 
                      statusOptions={['Draft', 'Active', 'Needs Review', 'Deprecated']} 
                      onChange={(s) => handleStatusChange(t, s)} 
                    />
                  )}
                </td>
                <td className="px-4 py-4 text-right whitespace-nowrap">
                  {showArchived ? (
                    <>
                      <button onClick={() => handleRestore(t.id!)} title="Restore" className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"><RotateCcw size={16} /></button>
                      <button onClick={() => setItemToDelete(t.id!)} title="Delete Permanently" className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => openModal(t)} className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Edit size={16} /></button>
                      <button onClick={() => handleArchive(t.id!)} title="Archive" className="p-1.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"><Archive size={16} /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{editingItem ? 'Edit Tag' : 'Add Tag'}</h3>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Name</label>
                <input name="name" defaultValue={editingItem?.name} onChange={() => setError(null)} required className={`w-full bg-white dark:bg-gray-800 border ${error ? 'border-red-500 focus:border-red-500' : 'border-gray-300 dark:border-gray-700 focus:border-blue-500'} rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none`} />
                {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Category</label>
                <input type="hidden" name="category" value={selectedCategory} />
                <CreatableDropdown
                  value={selectedCategory || null}
                  onChange={(val) => setSelectedCategory(val)}
                  options={tagCategories.map(c => ({ label: c.name, value: c.name }))}
                  categoryType="Tag Category"
                  placeholder="Select or type Category..."
                />
                {!selectedCategory && tagCategories.length === 0 && (
                  <p className="text-xs text-amber-500 mt-1">No Tag Categories found in Master Categories. Please add some first.</p>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Color</label>
                <div className="grid grid-cols-6 gap-2 mb-3">
                  {TAILWIND_COLORS.map(color => (
                    <button
                      key={color.name}
                      type="button"
                      onClick={() => setSelectedColor(color.value)}
                      title={color.name}
                      className={`w-8 h-8 rounded-full ${color.bgClass} flex items-center justify-center transition-transform hover:scale-110 ${selectedColor === color.value ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-900' : ''}`}
                    />
                  ))}
                </div>
                <div className="mb-3">
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Or enter custom Tailwind classes:</label>
                  <input 
                    name="colorCode" 
                    value={selectedColor} 
                    onChange={(e) => setSelectedColor(e.target.value)}
                    required 
                    placeholder="e.g., bg-[#ff0000]/20 text-[#ff0000]" 
                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 text-sm" 
                  />
                </div>
                <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-800/50">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${selectedColor}`}>
                    Preview Tag
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Status</label>
                <StatusSelect value={editingItem?.status || 'Active'} name="status" />
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
        title="Delete Tag Permanently"
        message="Are you sure you want to permanently delete this tag? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
}
