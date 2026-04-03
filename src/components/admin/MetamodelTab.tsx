import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ContentMetamodel } from '../../lib/db';
import { Plus, Edit, Trash2, ArrowUpDown } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import { useMasterData } from '../../hooks/useMasterData';
import CreatableDropdown, { reactSelectClassNames } from '../ui/CreatableDropdown';
import Select from 'react-select';

type SortableColumn = keyof ContentMetamodel;

export default function MetamodelTab() {
  const metamodels = useLiveQuery(() => db.content_metamodel.toArray()) || [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentMetamodel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [sortColumn, setSortColumn] = useState<SortableColumn>('admPhase');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  const [selectedPhase, setSelectedPhase] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('Active');
  const [selectedOwner, setSelectedOwner] = useState<string>('');
  
  const admPhases = useMasterData('ADM Phase');
  const artifactTypes = useMasterData('Artifact Type');
  const ownerRoles = useMasterData('Owner Role');

  const handleSort = (column: SortableColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedMetamodels = useMemo(() => {
    const phaseOrder = ['Preliminary', 'Phase A', 'Phase B: Business Architecture', 'Phase C: Information Systems', 'Phase D: Technology Architecture', 'Phases E-F', 'Phase G: Implementation Governance', 'Phase H: Architecture Change Management'];
    return [...metamodels].sort((a, b) => {
      if (sortColumn === 'admPhase') {
        let indexA = phaseOrder.indexOf(a.admPhase);
        let indexB = phaseOrder.indexOf(b.admPhase);
        if (indexA === -1) indexA = 99;
        if (indexB === -1) indexB = 99;
        return sortDirection === 'asc' ? indexA - indexB : indexB - indexA;
      }
      
      const aVal = String(a[sortColumn] || '');
      const bVal = String(b[sortColumn] || '');
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [metamodels, sortColumn, sortDirection]);

  const openModal = (item: ContentMetamodel | null = null) => {
    setEditingItem(item);
    setError(null);
    setSelectedPhase(item?.admPhase || '');
    setSelectedType(item?.artifactType || '');
    setSelectedStatus(item?.status || 'Active');
    setSelectedOwner(item?.ownerRole || '');
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

    const item: Omit<ContentMetamodel, 'id'> = {
      name,
      admPhase: formData.get('admPhase') as string,
      artifactType: formData.get('artifactType') as string,
      description: formData.get('description') as string,
      ownerRole: formData.get('ownerRole') as string,
      status: formData.get('status') as 'Active' | 'Deprecated',
    };

    if (editingItem?.id) {
      await db.content_metamodel.update(editingItem.id, item);
    } else {
      await db.content_metamodel.add(item);
    }
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const getArtifactTypeBadge = (type: string) => {
    switch (type) {
      case 'Catalog':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'Matrix':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'Diagram':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active':
        return 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400';
      case 'Deprecated':
        return 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
    }
  };

  const SortHeader = ({ column, label }: { column: SortableColumn; label: string }) => (
    <th className="px-4 py-3 font-medium">
      <button onClick={() => handleSort(column)} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
        {label} <ArrowUpDown size={14} className={sortColumn === column ? 'text-blue-500' : 'opacity-50'} />
      </button>
    </th>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Content Metamodel</h3>
        <button onClick={() => openModal(null)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm">
          <Plus size={16} />
          Add New
        </button>
      </div>

      <div className="flex-1 overflow-auto border border-gray-200 dark:border-gray-700 rounded-md">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-[0_1px_0_0_theme(colors.gray.200)] dark:shadow-[0_1px_0_0_theme(colors.gray.700)]">
            <tr className="text-gray-500 dark:text-gray-400 text-sm">
              <SortHeader column="name" label="Name" />
              <SortHeader column="admPhase" label="ADM Phase" />
              <SortHeader column="artifactType" label="Artifact Type" />
              <SortHeader column="description" label="Description" />
              <SortHeader column="ownerRole" label="Owner Role" />
              <SortHeader column="status" label="Status" />
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedMetamodels.map(m => (
              <tr key={m.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className="px-4 py-4 text-gray-900 dark:text-gray-200 font-medium whitespace-nowrap">{m.name}</td>
                <td className="px-4 py-4 text-gray-600 dark:text-gray-300 text-sm whitespace-nowrap">{m.admPhase}</td>
                <td className="px-4 py-4 text-sm">
                  <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getArtifactTypeBadge(m.artifactType)}`}>
                    {m.artifactType}
                  </span>
                </td>
                <td className="px-4 py-4 text-gray-600 dark:text-gray-300 text-sm max-w-[200px]" title={m.description}>
                  <span className="block truncate">{m.description}</span>
                </td>
                <td className="px-4 py-4 text-gray-600 dark:text-gray-300 text-sm whitespace-nowrap">{m.ownerRole}</td>
                <td className="px-4 py-4 text-sm">
                  <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(m.status || 'Active')}`}>
                    {m.status || 'Active'}
                  </span>
                </td>
                <td className="px-4 py-4 text-right whitespace-nowrap">
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
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4">
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
                  <input type="hidden" name="admPhase" value={selectedPhase} />
                  <CreatableDropdown
                    value={selectedPhase || null}
                    onChange={(val) => setSelectedPhase(val)}
                    options={admPhases.map(p => ({ label: p.name, value: p.name }))}
                    categoryType="ADM Phase"
                    placeholder="Select or type..."
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Artifact Type</label>
                  <input type="hidden" name="artifactType" value={selectedType} />
                  <CreatableDropdown
                    value={selectedType || null}
                    onChange={(val) => setSelectedType(val)}
                    options={artifactTypes.map(t => ({ label: t.name, value: t.name }))}
                    categoryType="Artifact Type"
                    placeholder="Select or type..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Description</label>
                <textarea name="description" defaultValue={editingItem?.description} required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 h-20" placeholder="Brief description of the artifact..." />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Owner Role</label>
                  <input type="hidden" name="ownerRole" value={selectedOwner} />
                  <CreatableDropdown
                    value={selectedOwner || null}
                    onChange={(val) => setSelectedOwner(val)}
                    options={ownerRoles.map(o => ({ label: o.name, value: o.name }))}
                    categoryType="Owner Role"
                    placeholder="Select or create role..."
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Status</label>
                  <input type="hidden" name="status" value={selectedStatus} />
                  <Select
                    unstyled
                    classNames={reactSelectClassNames}
                    options={[
                      { label: 'Active', value: 'Active' },
                      { label: 'Deprecated', value: 'Deprecated' }
                    ]}
                    value={{ label: selectedStatus, value: selectedStatus }}
                    onChange={(v: any) => setSelectedStatus(v ? v.value : 'Active')}
                  />
                </div>
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
