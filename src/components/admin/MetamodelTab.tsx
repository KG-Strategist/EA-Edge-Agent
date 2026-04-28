import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ContentMetamodel } from '../../lib/db';
import { Plus, Edit, Trash2, Archive, RotateCcw, Box } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import StatusToggle from '../ui/StatusToggle';
import AIRewriteButton from '../ui/AIRewriteButton';
import { useMasterData } from '../../hooks/useMasterData';
import StatusSelect from '../ui/StatusSelect';
import CreatableDropdown from '../ui/CreatableDropdown';
import PageHeader from '../ui/PageHeader';
import DataTable, { DataTableColumn, DataTableAction } from '../ui/DataTable';
import { useNotification } from '../../context/NotificationContext';

export default function MetamodelTab() {
  const { addNotification } = useNotification();
  const metamodels = useLiveQuery(() => db.content_metamodel.toArray()) || [];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentMetamodel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  
  const [selectedPhase, setSelectedPhase] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('Active');
  const [selectedOwner, setSelectedOwner] = useState<string>('');
  
  const admPhases = useMasterData('ADM Phase');
  const artifactTypes = useMasterData('Artifact Type');
  const ownerRoles = useMasterData('Owner Role');
  const [showArchived, setShowArchived] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');

  const filteredMetamodels = showArchived
    ? metamodels.filter(m => m.status === 'Deprecated')
    : metamodels.filter(m => m.status !== 'Deprecated');

  const openModal = (item: ContentMetamodel | null = null) => {
    setEditingItem(item);
    setError(null);
    setSelectedPhase(item?.admPhase || '');
    setSelectedType(item?.artifactType || '');
    setSelectedStatus(item?.status || 'Active');
    setSelectedOwner(item?.ownerRole || '');
    setDescriptionValue(item?.description || '');
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

  const columns: DataTableColumn<ContentMetamodel>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (row) => <span className="font-medium text-gray-900 dark:text-gray-200">{row.name}</span>,
    },
    {
      key: 'admPhase',
      label: 'ADM Phase',
      sortable: true,
      render: (row) => <span className="text-gray-600 dark:text-gray-300 text-sm">{row.admPhase}</span>,
    },
    {
      key: 'artifactType',
      label: 'Artifact Type',
      sortable: true,
      render: (row) => (
        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getArtifactTypeBadge(row.artifactType)}`}>
          {row.artifactType}
        </span>
      ),
    },
    {
      key: 'description',
      label: 'Description',
      sortable: true,
      className: 'hidden lg:table-cell max-w-[200px]',
      headerClassName: 'hidden lg:table-cell',
      render: (row) => (
        <span className="block truncate text-gray-600 dark:text-gray-300 text-sm" title={row.description}>
          {row.description}
        </span>
      ),
    },
    {
      key: 'ownerRole',
      label: 'Owner',
      sortable: true,
      className: 'hidden xl:table-cell',
      headerClassName: 'hidden xl:table-cell',
      render: (row) => <span className="text-gray-600 dark:text-gray-300 text-sm">{row.ownerRole}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        showArchived ? (
          <StatusToggle 
            currentStatus="Deprecated" 
            statusOptions={['Draft', 'Active', 'Needs Review', 'Deprecated']} 
            onChange={() => {}} 
            readonly={true} 
          />
        ) : (
          <StatusToggle 
            currentStatus={row.status || 'Active'} 
            statusOptions={['Draft', 'Active', 'Needs Review', 'Deprecated']} 
            onChange={async (s) => { if (row.id) await db.content_metamodel.update(row.id, { status: s as any }); }} 
          />
        )
      ),
    },
  ];

  const actions: DataTableAction<ContentMetamodel>[] = showArchived ? [
    {
      label: 'Restore',
      icon: <RotateCcw size={16} />,
      onClick: async (row) => { if (row.id) await db.content_metamodel.update(row.id, { status: 'Active' }); },
      className: 'text-gray-400 hover:text-green-600 dark:hover:text-green-400',
      title: () => 'Restore',
    },
    {
      label: 'Delete Permanently',
      icon: <Trash2 size={16} />,
      onClick: (row) => setItemToDelete(row.id!),
      className: 'text-gray-400 hover:text-red-600 dark:hover:text-red-400',
      title: () => 'Delete Permanently',
    }
  ] : [
    {
      label: 'Edit',
      icon: <Edit size={16} />,
      onClick: (row) => openModal(row),
      className: 'text-gray-400 hover:text-blue-600 dark:hover:text-blue-400',
      title: () => 'Edit',
    },
    {
      label: 'Archive',
      icon: <Archive size={16} />,
      onClick: async (row) => { if (row.id) await db.content_metamodel.update(row.id, { status: 'Deprecated' }); },
      className: 'text-gray-400 hover:text-amber-600 dark:hover:text-amber-400',
      title: () => 'Archive',
    }
  ];

  return (
    <div className="flex flex-col h-full">
      <PageHeader 
        icon={<Box className="text-blue-500" />}
        title="Content Metamodel"
        description="The TOGAF Content Metamodel defines the standardized taxonomy of architectural artifacts produced across each ADM phase."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowArchived(!showArchived)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${showArchived ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
              <Archive size={14} />{showArchived ? 'Exit Archive' : 'Archive'}
            </button>
            <button onClick={() => openModal(null)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm">
              <Plus size={16} /> Add New
            </button>
          </div>
        }
      />

      <DataTable
        data={filteredMetamodels}
        columns={columns}
        actions={actions}
        keyField="id"
        pagination={true}
        searchable={true}
        searchFields={['name', 'admPhase', 'artifactType', 'description', 'ownerRole']}
        exportable={true}
        exportFilename="niti-metamodel.json"
        onImport={async (parsedData) => {
          try {
            await db.content_metamodel.bulkPut(parsedData);
            addNotification('Import successful!', 'success', 3000);
          } catch {
            addNotification('Import failed.', 'error');
          }
        }}
      />

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
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm text-gray-600 dark:text-gray-400">Description</label>
                  <AIRewriteButton context={descriptionValue} onResult={(text) => setDescriptionValue(text)} />
                </div>
                <textarea name="description" value={descriptionValue} onChange={(e) => setDescriptionValue(e.target.value)} required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 h-20" placeholder="Brief description of the artifact..." />
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
                  <StatusSelect value={selectedStatus} onChange={setSelectedStatus} name="status" />
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