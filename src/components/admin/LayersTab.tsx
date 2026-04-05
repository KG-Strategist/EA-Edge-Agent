import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ArchitectureLayer } from '../../lib/db';
import { Plus, Edit, Trash2, ArrowUpDown, Info, Archive, RotateCcw } from 'lucide-react';
import CreatableDropdown from '../ui/CreatableDropdown';
import ConfirmModal from '../ui/ConfirmModal';
import StatusToggle from '../ui/StatusToggle';
import PageInfoTile from '../ui/PageInfoTile';
import AIRewriteButton from '../ui/AIRewriteButton';
import DataPortabilityButtons from '../ui/DataPortabilityButtons';
import { useMasterData } from '../../hooks/useMasterData';
import { useDataPortability } from '../../hooks/useDataPortability';

export default function LayersTab() {
  const layers = useLiveQuery(() => db.architecture_layers.toArray()) || [];
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ArchitectureLayer | null>(null);
  
  const [selectedCoreLayer, setSelectedCoreLayer] = useState<string>('');
  const [selectedContextLayer, setSelectedContextLayer] = useState<string>('');
  const [selectedAbstractionLevel, setSelectedAbstractionLevel] = useState<string>('');
  const [descriptionValue, setDescriptionValue] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  
  const [sortColumn, setSortColumn] = useState<keyof ArchitectureLayer>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const coreLayersData = useMasterData('Core Layer');
  const contextLayersData = useMasterData('Context Layer');
  const abstractionLevelsData = useMasterData('Abstraction Level');
  const { handleExport, handleImport } = useDataPortability({ tableName: 'architecture_layers', filename: 'architecture_layers' });

  const handleSort = (column: keyof ArchitectureLayer) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Layers now use standard status column
  const filteredLayers = showArchived
    ? layers.filter(l => l.status === 'Deprecated')
    : layers.filter(l => l.status !== 'Deprecated');

  const sortedLayers = [...filteredLayers].sort((a, b) => {
    const aVal = String(a[sortColumn] || '');
    const bVal = String(b[sortColumn] || '');
    return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
  });

  const handleStatusChange = async (item: ArchitectureLayer, newStatus: string) => {
    if (item.id) {
       await db.architecture_layers.update(item.id, { status: newStatus as any });
    }
  };

  const handleArchive = async (id: number) => {
    await db.architecture_layers.update(id, { status: 'Deprecated' });
  };

  const handleRestore = async (id: number) => {
    await db.architecture_layers.update(id, { status: 'Active' });
  };

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
    
    if (!selectedCoreLayer) {
      setError("Please select or create a Core Layer.");
      return;
    }

    const existingLayer = layers.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (existingLayer && existingLayer.id !== editingItem?.id) {
      setError(`A layer with the name "${name}" already exists.`);
      return;
    }

    const item: Omit<ArchitectureLayer, 'id'> = {
      name,
      coreLayer: selectedCoreLayer,
      contextLayer: selectedContextLayer,
      description: descriptionValue,
      abstractionLevels: selectedAbstractionLevel,
      status: (formData.get('status') as any) || 'Active',
    };

    if (editingItem?.id) {
      await db.architecture_layers.update(editingItem.id, item);
    } else {
      await db.architecture_layers.add(item);
    }
    
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const openModal = (item: ArchitectureLayer | null = null) => {
    setEditingItem(item);
    setError(null);
    setSelectedCoreLayer(item?.coreLayer || '');
    setSelectedContextLayer(item?.contextLayer || '');
    setSelectedAbstractionLevel(item?.abstractionLevels || '');
    setDescriptionValue(item?.description || '');
    setIsModalOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      <PageInfoTile 
        title="Strategic Traceability"
        description="This layered structure ensures that IT implementation (bottom) is directly traceable to business strategy (top), allowing for a high degree of traceability, interoperability, and standard-based design."
      />

      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Architecture Layers</h3>
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
      </div>

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
                <button onClick={() => handleSort('coreLayer')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Core Layer <ArrowUpDown size={14} className={sortColumn === 'coreLayer' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="px-4 py-3 font-medium hidden lg:table-cell">
                <button onClick={() => handleSort('contextLayer')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Context <ArrowUpDown size={14} className={sortColumn === 'contextLayer' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="px-4 py-3 font-medium hidden xl:table-cell">Abstraction</th>
              <th className="px-4 py-3 font-medium hidden lg:table-cell">Description</th>
              <th className="px-4 py-3 font-medium">
                <button onClick={() => handleSort('status' as any)} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Status <ArrowUpDown size={14} className={sortColumn === 'status' as any ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedLayers.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400 text-sm">{showArchived ? 'No archived layers.' : 'No layers found. Click "Add New" to create one.'}</td></tr>
            )}
            {sortedLayers.map(l => (
              <tr key={l.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className="px-4 py-4 text-gray-900 dark:text-gray-200 font-medium">{l.name}</td>
                <td className="px-4 py-4 text-gray-600 dark:text-gray-300 text-sm">
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-md text-xs border border-gray-200 dark:border-gray-700">
                    {l.coreLayer || 'None'}
                  </span>
                </td>
                <td className="px-4 py-4 text-gray-600 dark:text-gray-300 text-sm hidden lg:table-cell">{l.contextLayer || '-'}</td>
                <td className="px-4 py-4 text-gray-600 dark:text-gray-300 text-sm hidden xl:table-cell">{l.abstractionLevels || '-'}</td>
                <td className="px-4 py-4 text-gray-600 dark:text-gray-300 text-sm max-w-[200px] truncate hidden lg:table-cell" title={l.description}>{l.description || '-'}</td>
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
                      currentStatus={l.status || 'Active'} 
                      statusOptions={['Draft', 'Active', 'Needs Review', 'Deprecated']} 
                      onChange={(s) => handleStatusChange(l, s)} 
                    />
                  )}
                </td>
                <td className="px-4 py-4 text-right whitespace-nowrap">
                  {showArchived ? (
                    <>
                      <button onClick={() => handleRestore(l.id!)} title="Restore" className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"><RotateCcw size={16} /></button>
                      <button onClick={() => setItemToDelete(l.id!)} title="Delete Permanently" className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"><Trash2 size={16} /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => openModal(l)} className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"><Edit size={16} /></button>
                      <button onClick={() => handleArchive(l.id!)} title="Archive" className="p-1.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"><Archive size={16} /></button>
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
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{editingItem ? 'Edit Layer' : 'Add Layer'}</h3>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Layer Name</label>
                <input name="name" defaultValue={editingItem?.name} onChange={() => setError(null)} required className={`w-full bg-white dark:bg-gray-800 border ${error && error.includes('layer') ? 'border-red-500 focus:border-red-500' : 'border-gray-300 dark:border-gray-700 focus:border-blue-500'} rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none min-h-[42px]`} placeholder="e.g., Business Architecture" />
                {error && error.includes('layer') && <p className="text-sm text-red-500 mt-1">{error}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Core Layer</label>
                  <CreatableDropdown
                    value={selectedCoreLayer || null}
                    onChange={(val) => { setSelectedCoreLayer(val); setError(null); }}
                    options={coreLayersData.map(c => ({ label: c.name, value: c.name }))}
                    categoryType="Core Layer"
                    placeholder="Select or type..."
                  />
                  {error && error.includes('Core Layer') && <p className="text-sm text-red-500 mt-1">{error}</p>}
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Context Layer (Optional)</label>
                  <CreatableDropdown
                    value={selectedContextLayer || null}
                    onChange={(val) => setSelectedContextLayer(val)}
                    options={contextLayersData.map(c => ({ label: c.name, value: c.name }))}
                    categoryType="Context Layer"
                    placeholder="Select or type..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Abstraction Levels</label>
                <CreatableDropdown
                  value={selectedAbstractionLevel || null}
                  onChange={(val) => setSelectedAbstractionLevel(val)}
                  options={abstractionLevelsData.map(c => ({ label: c.name, value: c.name }))}
                  categoryType="Abstraction Level"
                  placeholder="e.g., Conceptual, Logical, Physical..."
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm text-gray-600 dark:text-gray-400">Description</label>
                  <AIRewriteButton
                    context={descriptionValue}
                    onResult={(text) => setDescriptionValue(text)}
                  />
                </div>
                <textarea 
                  name="description" 
                  value={descriptionValue}
                  onChange={(e) => setDescriptionValue(e.target.value)}
                  required 
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 min-h-[80px]" 
                  placeholder="What is the purpose of this layer?"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Status</label>
                <select name="status" defaultValue={editingItem?.status || 'Active'} className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500">
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
        title="Delete Layer Permanently"
        message="Are you sure you want to permanently delete this architecture layer? This action cannot be undone."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
}
