import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, MasterCategory } from '../../lib/db';
import { MasterCategorySchema } from '../../lib/validation';
import { Plus, Edit, Trash2, ArrowUpDown, Archive, RotateCcw, ListTree } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import StatusToggle from '../ui/StatusToggle';
import AIRewriteButton from '../ui/AIRewriteButton';
import DataPortabilityButtons from '../ui/DataPortabilityButtons';
import { MASTER_CATEGORY_TYPES } from '../../lib/constants';
import { useDataPortability } from '../../hooks/useDataPortability';
import PageHeader from '../ui/PageHeader';
import DataTable from '../ui/DataTable';

export default function CategoriesTab() {
  const categories = useLiveQuery(() => db.master_categories.toArray()) || [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof MasterCategory>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showArchived, setShowArchived] = useState(false);
  
  const [descriptionValue, setDescriptionValue] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const { handleExport, handleImport } = useDataPortability({ tableName: 'master_categories', filename: 'master_categories' });

  const handleSort = (column: keyof MasterCategory) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const filteredCategories = showArchived
    ? categories.filter(c => c.status === 'Deprecated')
    : categories.filter(c => c.status !== 'Deprecated');

  const sortedCategories = [...filteredCategories].sort((a, b) => {
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

  const handleStatusToggle = async (item: MasterCategory, newStatus: string) => {
    if (item.id) {
      await db.master_categories.update(item.id, { status: newStatus as any });
    }
  };

  const handleArchive = async (id: number) => {
    await db.master_categories.update(id, { status: 'Deprecated' });
  };

  const handleRestore = async (id: number) => {
    await db.master_categories.update(id, { status: 'Active' });
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    const type = formData.get('type') as string;
    const description = descriptionValue;
    const status = formData.get('status') as string;
    
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
      status: status as any,
    };
    const parseResult = MasterCategorySchema.safeParse(item);
    if (!parseResult.success) {
      setError(parseResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(' | '));
      return;
    }
    const validItem = parseResult.data;

    if (editingItem?.id) {
      await db.master_categories.update(editingItem.id, validItem);
    } else {
      await db.master_categories.add(validItem);
    }
    setIsModalOpen(false);
    setEditingItem(null);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader 
        icon={<ListTree className="text-blue-500" />}
        title="Master Categories"
        description="Global taxonomy for classifying agents, engines, and review types."
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

      <DataTable
        data={sortedCategories}
        keyField="id"
        emptyMessage={showArchived ? 'No inactive categories.' : 'No categories found.'}
        searchable={true}
        searchPlaceholder="Search categories..."
        searchFields={['name', 'type', 'description']}
        pagination={true}
        itemsPerPage={10}
        containerClassName="flex-1 border-0 shadow-none"
        columns={[
          {
            key: 'name',
            label: (
              <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                Name <ArrowUpDown size={14} className={sortColumn === 'name' ? 'text-blue-500' : 'opacity-50'} />
              </button>
            ),
            className: "text-gray-900 dark:text-gray-200 font-medium"
          },
          {
            key: 'type',
            label: (
              <button onClick={() => handleSort('type')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                Type <ArrowUpDown size={14} className={sortColumn === 'type' ? 'text-blue-500' : 'opacity-50'} />
              </button>
            ),
            className: "text-gray-600 dark:text-gray-300 text-sm",
            render: (row) => (
              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-md text-xs border border-gray-200 dark:border-gray-700">
                {MASTER_CATEGORY_TYPES[row.type as keyof typeof MASTER_CATEGORY_TYPES] || row.type}
              </span>
            )
          },
          {
            key: 'description',
            label: 'Description',
            className: "text-gray-600 dark:text-gray-300 text-sm max-w-xs truncate hidden lg:table-cell",
            render: (row) => <span title={row.description}>{row.description || '-'}</span>
          },
          {
            key: 'status',
            label: 'Status',
            render: (row) => (
              showArchived ? (
                <StatusToggle
                  currentStatus={row.status || 'Deprecated'}
                  statusOptions={['Draft', 'Active', 'Needs Review', 'Deprecated']}
                  onChange={() => {}}
                  readonly={true}
                />
              ) : (
                <StatusToggle
                  currentStatus={row.status || 'Active'}
                  statusOptions={['Draft', 'Active', 'Needs Review', 'Deprecated']}
                  onChange={(s) => handleStatusToggle(row, s)}
                />
              )
            )
          }
        ]}
        actions={
          showArchived
            ? [
                {
                  label: 'Restore',
                  icon: <RotateCcw size={16} />,
                  onClick: (row) => handleRestore(row.id!),
                  className: 'text-gray-400 hover:text-green-600 dark:hover:text-green-400',
                  title: () => 'Restore'
                },
                {
                  label: 'Delete Permanently',
                  icon: <Trash2 size={16} />,
                  onClick: (row) => setItemToDelete(row.id!),
                  className: 'text-gray-400 hover:text-red-600 dark:hover:text-red-400',
                  title: () => 'Delete Permanently'
                }
              ]
            : [
                {
                  label: 'Edit',
                  icon: <Edit size={16} />,
                  onClick: (row) => openModal(row),
                  className: 'text-gray-400 hover:text-blue-600 dark:hover:text-blue-400',
                  title: () => 'Edit category'
                },
                {
                  label: 'Archive',
                  icon: <Archive size={16} />,
                  onClick: (row) => handleArchive(row.id!),
                  className: 'text-gray-400 hover:text-amber-600 dark:hover:text-amber-400',
                  title: () => 'Archive'
                }
              ]
        }
      />

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{editingItem ? 'Edit Category' : 'Add Category'}</h3>
            <form ref={formRef} onSubmit={handleSave} className="flex flex-col gap-4">
              <div>
                <label htmlFor="category-type" className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Type</label>
                <select id="category-type" name="type" defaultValue={editingItem?.type || ''} onChange={() => setError(null)} required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                  <option value="" disabled>Select Type...</option>
                  {Object.entries(MASTER_CATEGORY_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="category-name" className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Name</label>
                <input id="category-name" name="name" defaultValue={editingItem?.name} onChange={() => setError(null)} required className={`w-full bg-white dark:bg-gray-800 border ${error ? 'border-red-500 focus:border-red-500' : 'border-gray-300 dark:border-gray-700 focus:border-blue-500'} rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none`} />
                {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="category-description" className="block text-sm text-gray-600 dark:text-gray-400">Description (Optional)</label>
                  <AIRewriteButton
                    context={descriptionValue}
                    onResult={(text) => setDescriptionValue(text)}
                    label="Auto Generate"
                  />
                </div>
                <textarea 
                  id="category-description"
                  name="description" 
                  value={descriptionValue}
                  onChange={(e) => setDescriptionValue(e.target.value)}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 h-20" 
                />
              </div>
              <div>
                <label htmlFor="category-status" className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Status</label>
                <select id="category-status" name="status" defaultValue={editingItem?.status || 'Active'} className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                  <option value="Needs Review">Needs Review</option>
                  <option value="Deprecated">Deprecated</option>
                </select>
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
        title="Delete Category Permanently"
        message="Are you sure you want to permanently delete this category? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
}
