import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ContentMetamodel } from '../../lib/db';
import { Plus, Edit, Trash2, ArrowUpDown } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import { useMasterData } from '../../hooks/useMasterData';

export default function MetamodelTab() {
  const metamodels = useLiveQuery(() => db.content_metamodel.toArray()) || [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentMetamodel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof ContentMetamodel>('admPhase');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  const admPhases = useMasterData('ADM Phase');
  const artifactTypes = useMasterData('Artifact Type');

  const handleSort = (column: keyof ContentMetamodel) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedMetamodels = useMemo(() => {
    const phaseOrder = ['Preliminary', 'Phase A', 'Phase B: Business Architecture', 'Phase C: Information Systems', 'Phase D: Technology Architecture', 'Phases E-F'];
    return [...metamodels].sort((a, b) => {
      if (sortColumn === 'admPhase') {
        let indexA = phaseOrder.indexOf(a.admPhase);
        let indexB = phaseOrder.indexOf(b.admPhase);
        if (indexA === -1) indexA = 99;
        if (indexB === -1) indexB = 99;
        return sortDirection === 'asc' ? indexA - indexB : indexB - indexA;
      }
      
      const aVal = a[sortColumn] || '';
      const bVal = b[sortColumn] || '';
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return 0;
    });
  }, [metamodels, sortColumn, sortDirection]);

  const openModal = (item: ContentMetamodel | null = null) => {
    setEditingItem(item);
    setError(null);
    setIsModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (itemToDelete) {
      await db.content_metamodel.delete(itemToDelete);
      setItemToDelete(null);
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    
    // Duplicate validation
    const existing = metamodels.find(m => m.name.toLowerCase() === name.toLowerCase());
    if (existing && existing.id !== editingItem?.id) {
      setError(`An artifact with the name "${name}" already exists.`);
      return;
    }

    const item = {
      name,
      admPhase: formData.get('admPhase') as string,
      artifactType: formData.get('artifactType') as string,
      description: formData.get('description') as string,
      ownerRole: formData.get('ownerRole') as string,
    };

    if (editingItem?.id) {
      await db.content_metamodel.update(editingItem.id, item);
    } else {
      await db.content_metamodel.add(item);
    }
    setIsModalOpen(false);
    setEditingItem(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Content Metamodel</h3>
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
                <button onClick={() => handleSort('admPhase')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  ADM Phase <ArrowUpDown size={14} className={sortColumn === 'admPhase' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="pb-3 font-medium">
                <button onClick={() => handleSort('artifactType')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Artifact Type <ArrowUpDown size={14} className={sortColumn === 'artifactType' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="pb-3 font-medium">
                <button onClick={() => handleSort('description')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Description <ArrowUpDown size={14} className={sortColumn === 'description' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="pb-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedMetamodels.map(m => (
              <tr key={m.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className="py-4 text-gray-900 dark:text-gray-200 font-medium">{m.name}</td>
                <td className="py-4 text-gray-600 dark:text-gray-300 text-sm">{m.admPhase}</td>
                <td className="py-4 text-gray-600 dark:text-gray-300 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    m.artifactType === 'Catalog' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                    m.artifactType === 'Matrix' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' :
                    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  }`}>
                    {m.artifactType}
                  </span>
                </td>
                <td className="py-4 text-gray-600 dark:text-gray-300 text-sm max-w-xs truncate" title={m.description}>{m.description}</td>
                <td className="py-4 text-right">
                  <button onClick={() => openModal(m)} className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Edit size={16} /></button>
                  <button onClick={() => setItemToDelete(m.id!)} className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{editingItem ? 'Edit Artifact' : 'Add Artifact'}</h3>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Name</label>
                <input name="name" defaultValue={editingItem?.name} onChange={() => setError(null)} required className={`w-full bg-white dark:bg-gray-800 border ${error ? 'border-red-500 focus:border-red-500' : 'border-gray-300 dark:border-gray-700 focus:border-blue-500'} rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none`} placeholder="e.g., Application Portfolio Catalog" />
                {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">ADM Phase</label>
                  <select name="admPhase" defaultValue={editingItem?.admPhase || ''} className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                    <option value="">Select Phase...</option>
                    {admPhases.map(phase => (
                      <option key={phase.id} value={phase.name}>{phase.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Artifact Type</label>
                  <select name="artifactType" defaultValue={editingItem?.artifactType || ''} className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                    <option value="">Select Type...</option>
                    {artifactTypes.map(type => (
                      <option key={type.id} value={type.name}>{type.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Description</label>
                <textarea name="description" defaultValue={editingItem?.description} required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 h-20" placeholder="Brief description of the artifact..." />
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Owner Role</label>
                <input name="ownerRole" defaultValue={editingItem?.ownerRole} required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500" placeholder="e.g., Lead Enterprise Architect" />
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
        title="Delete Artifact"
        message="Are you sure you want to delete this artifact? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
}
