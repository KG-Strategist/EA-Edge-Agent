import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, BianDomain } from '../../lib/db';
import { Download, Upload, Plus, Edit, Trash2, ArrowUpDown } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

export default function BianTab() {
  const domains = useLiveQuery(() => db.bian_domains.toArray()) || [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BianDomain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof BianDomain>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: keyof BianDomain) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedDomains = [...domains].sort((a, b) => {
    const aVal = a[sortColumn] || '';
    const bVal = b[sortColumn] || '';
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return 0;
  });

  const openModal = (item: BianDomain | null = null) => {
    setEditingItem(item);
    setError(null);
    setIsModalOpen(true);
  };

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(domains));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "bian_domains.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string);
        await db.bian_domains.bulkPut(importedData);
      } catch (error) {
        console.error("Error importing data", error);
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteConfirm = async () => {
    if (itemToDelete) {
      await db.bian_domains.delete(itemToDelete);
      setItemToDelete(null);
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();

    const existing = domains.find(d => d.name.toLowerCase() === name.toLowerCase());
    if (existing && existing.id !== editingItem?.id) {
      setError(`A domain with the name "${name}" already exists.`);
      return;
    }

    const item = {
      name,
      description: formData.get('description') as string,
      status: formData.get('status') as any,
    };
    if (editingItem?.id) {
      await db.bian_domains.update(editingItem.id, item);
    } else {
      await db.bian_domains.add(item);
    }
    setIsModalOpen(false);
    setEditingItem(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">BIAN Domains</h3>
        <div className="flex gap-3">
          <label className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer transition-colors text-sm border border-gray-200 dark:border-transparent">
            <Upload size={16} />
            Import
            <input type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors text-sm border border-gray-200 dark:border-transparent">
            <Download size={16} />
            Export
          </button>
          <button onClick={() => openModal(null)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm">
            <Plus size={16} />
            Add New
          </button>
        </div>
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
                <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Status <ArrowUpDown size={14} className={sortColumn === 'status' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="pb-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedDomains.map(d => (
              <tr key={d.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className="py-4 text-gray-900 dark:text-gray-200">
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-gray-500 truncate max-w-md">{d.description}</div>
                </td>
                <td className="py-4">
                  <span className={`text-xs px-2 py-1 rounded-full ${d.status === 'Active' ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                    {d.status}
                  </span>
                </td>
                <td className="py-4 text-right">
                  <button onClick={() => openModal(d)} className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Edit size={16} /></button>
                  <button onClick={() => setItemToDelete(d.id!)} className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{editingItem ? 'Edit Domain' : 'Add Domain'}</h3>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Name</label>
                <input name="name" defaultValue={editingItem?.name} onChange={() => setError(null)} required className={`w-full bg-white dark:bg-gray-800 border ${error ? 'border-red-500 focus:border-red-500' : 'border-gray-300 dark:border-gray-700 focus:border-blue-500'} rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none`} />
                {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Description</label>
                <textarea name="description" defaultValue={editingItem?.description} required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 h-24" />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Status</label>
                <select name="status" defaultValue={editingItem?.status || 'Active'} className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                  <option>Active</option>
                  <option>Deprecated</option>
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
        title="Delete Domain"
        message="Are you sure you want to delete this BIAN domain? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
}
