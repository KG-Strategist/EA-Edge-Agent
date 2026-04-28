import React, { useState, useMemo } from 'react';
import { db, ServiceDomain } from '../../lib/db';
import { ServiceDomainSchema } from '../../lib/validation';
import { Plus, Edit, Trash2, ArrowUpDown, Archive, RotateCcw, Layers } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import StatusToggle from '../ui/StatusToggle';
import AIRewriteButton from '../ui/AIRewriteButton';
import { useServiceDomains } from '../../hooks/useServiceDomains';
import { useMasterData } from '../../hooks/useMasterData';
import CreatableDropdown from '../ui/CreatableDropdown';
import StatusSelect from '../ui/StatusSelect';
import PageHeader from '../ui/PageHeader';
import DataTable from '../ui/DataTable';
import { useNotification } from '../../context/NotificationContext';

type SortableColumn = keyof ServiceDomain;

export default function ServiceDomainsTab() {
  const { addNotification } = useNotification();
  const { domains } = useServiceDomains();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ServiceDomain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  
  const [formState, setFormState] = useState<Partial<ServiceDomain>>({ status: 'Active', frameworkTag: 'BIAN' });
  const [sortColumn, setSortColumn] = useState<SortableColumn>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const businessAreas = useMasterData('service_business_area');
  const businessDomains = useMasterData('service_business_domain');
  const controlRecords = useMasterData('service_control_record');
  const functionalPatterns = useMasterData('service_functional_pattern');
  const frameworkTags = useMasterData('framework_tag');

  const handleSort = (column: SortableColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const filteredDomains = showArchived
    ? domains.filter(d => d.status === 'Deprecated')
    : domains.filter(d => d.status !== 'Deprecated');

  const sortedDomains = useMemo(() => {
    return [...filteredDomains].sort((a, b) => {
      const aVal = String(a[sortColumn] || '');
      const bVal = String(b[sortColumn] || '');
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [filteredDomains, sortColumn, sortDirection]);

  const openModal = (item: ServiceDomain | null = null) => {
    setEditingItem(item);
    setFormState(item ? { ...item } : { status: 'Active', frameworkTag: 'BIAN' });
    setError(null);
    setIsModalOpen(true);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormState(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleStatusChange = async (item: ServiceDomain, newStatus: string) => {
    if (item.id) {
      await db.service_domains.update(item.id, { status: newStatus as any });
    }
  };

  const handleArchive = async (id: number) => {
    await db.service_domains.update(id, { status: 'Deprecated' as any });
  };

  const handleRestore = async (id: number) => {
    await db.service_domains.update(id, { status: 'Active' as any });
  };

  const handleDeleteConfirm = async () => {
    if (itemToDelete) {
      await db.service_domains.delete(itemToDelete);
      setItemToDelete(null);
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formState.name) return;
    const name = formState.name.trim();

    const existing = domains.find(d => d.name.toLowerCase() === name.toLowerCase() && d.frameworkTag === formState.frameworkTag);
    if (existing && existing.id !== editingItem?.id) {
      setError(`A domain with the name "${name}" already exists for the "${formState.frameworkTag}" framework.`);
      return;
    }

    const item: Omit<ServiceDomain, 'id'> = {
      name,
      businessArea: formState.businessArea || '',
      businessDomain: formState.businessDomain || '',
      controlRecord: formState.controlRecord || '',
      functionalPattern: formState.functionalPattern || '',
      description: formState.description || '',
      frameworkTag: formState.frameworkTag || 'BIAN',
      status: (formState.status as 'Active' | 'Draft' | 'Deprecated') || 'Active',
    };
    const parseResult = ServiceDomainSchema.safeParse(item);
    if (!parseResult.success) {
      setError(parseResult.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(' | '));
      return;
    }
    const validItem = parseResult.data;

    if (editingItem?.id) {
      await db.service_domains.update(editingItem.id, validItem);
    } else {
      await db.service_domains.add(validItem);
    }
    setIsModalOpen(false);
    setEditingItem(null);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader 
        icon={<Layers className="text-blue-500" />}
        title="Service Domains"
        description="Industry-agnostic service domains define standard business capabilities. Use this to formally align your application capabilities with standardized taxonomy across any industry framework (e.g., BIAN, custom)."
        action={
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">

            <button onClick={() => setShowArchived(!showArchived)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${showArchived ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-transparent hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
              <Archive size={14} />{showArchived ? 'Exit Archive' : 'Archive'}
            </button>
            <button onClick={() => openModal(null)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm">
              <Plus size={16} /><span className="hidden sm:inline">Add New</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto">
        <DataTable<ServiceDomain>
          data={sortedDomains}
          keyField="id"
          exportable={true}
          exportFilename="niti-service-domains-export.json"
          onImport={async (parsedData) => {
            try {
              await db.service_domains.bulkPut(parsedData);
              addNotification('Import successful!', 'success', 3000);
            } catch {
              addNotification('Failed to import data.', 'error');
            }
          }}
          pagination={true}
          searchable={true}
          searchPlaceholder="Filter domains by name, area, or framework..."
          searchFields={['name', 'businessArea', 'businessDomain', 'frameworkTag']}
          columns={[
            {
              key: 'name',
              label: <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                Service Domain <ArrowUpDown size={14} className={sortColumn === 'name' ? 'text-blue-500' : 'opacity-50'} />
              </button>,
              render: (row) => (
                <div className="min-w-[160px]">
                  <div className="font-semibold text-gray-900 dark:text-white mb-1">{row.name}</div>
                  <div className="text-xs text-gray-500 line-clamp-2" title={row.description}>{row.description}</div>
                </div>
              )
            },
            {
              key: 'frameworkTag',
              label: <button onClick={() => handleSort('frameworkTag')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                Framework <ArrowUpDown size={14} className={sortColumn === 'frameworkTag' ? 'text-blue-500' : 'opacity-50'} />
              </button>,
              render: (row) => (
                <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 text-[10px] font-bold uppercase tracking-wider">
                  {row.frameworkTag}
                </span>
              )
            },
            {
              key: 'businessArea',
              label: 'Business Hierarchy',
              className: 'hidden lg:table-cell',
              headerClassName: 'hidden lg:table-cell',
              render: (row) => (
                <div className="flex flex-col gap-1.5">
                  <div className="flex space-x-1 items-center">
                    <span className="text-[10px] uppercase font-semibold text-gray-400 w-12 text-right">Area</span>
                    <span className="px-2 py-0.5 rounded-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900 text-xs truncate max-w-[180px]" title={row.businessArea}>{row.businessArea}</span>
                  </div>
                  <div className="flex space-x-1 items-center">
                    <span className="text-[10px] uppercase font-semibold text-gray-400 w-12 text-right">Domain</span>
                    <span className="px-2 py-0.5 rounded-sm bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900 text-xs truncate max-w-[180px]" title={row.businessDomain}>{row.businessDomain}</span>
                  </div>
                </div>
              )
            },
            {
              key: 'controlRecord',
              label: 'Metamodel',
              className: 'hidden xl:table-cell',
              headerClassName: 'hidden xl:table-cell',
              render: (row) => (
                <div className="flex flex-col gap-1 text-sm">
                  <div className="flex items-center">
                    <span className="text-gray-500 dark:text-gray-400 w-10 text-xs">CR:</span>
                    <span className="text-gray-900 dark:text-gray-200 text-xs truncate max-w-[140px] font-medium" title={row.controlRecord}>{row.controlRecord}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-500 dark:text-gray-400 w-10 text-xs">FP:</span>
                    <span className="text-gray-600 dark:text-gray-300 text-xs italic truncate max-w-[140px]" title={row.functionalPattern}>{row.functionalPattern}</span>
                  </div>
                </div>
              )
            },
            {
              key: 'status',
              label: <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                Status <ArrowUpDown size={14} className={sortColumn === 'status' ? 'text-blue-500' : 'opacity-50'} />
              </button>,
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
                    onChange={(s) => handleStatusChange(row, s)} 
                  />
                )
              )
            }
          ]}
          actions={[
            {
              label: showArchived ? 'Restore' : 'Edit',
              icon: showArchived ? <RotateCcw size={14} /> : <Edit size={14} />,
              onClick: (row) => showArchived ? handleRestore(row.id!) : openModal(row),
              className: showArchived ? 'text-gray-400 hover:text-green-600 dark:hover:text-green-400' : 'text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
            },
            {
              label: showArchived ? 'Delete' : 'Archive',
              icon: showArchived ? <Trash2 size={14} /> : <Archive size={14} />,
              onClick: (row) => showArchived ? setItemToDelete(row.id!) : handleArchive(row.id!),
              className: showArchived ? 'text-gray-400 hover:text-red-600 dark:hover:text-red-400' : 'text-gray-400 hover:text-amber-600 dark:hover:text-amber-400'
            }
          ]}
          emptyMessage={showArchived ? 'No deprecated domains.' : 'No domains found.'}
          containerClassName="flex flex-col"
        />
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 border-b border-gray-100 dark:border-gray-800 pb-3">{editingItem ? 'Edit Service Domain' : 'Add Service Domain'}</h3>
            <form onSubmit={handleSave} className="flex flex-col gap-5">
              {error && <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm border border-red-100 dark:border-red-900/30">{error}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service Domain Name</label>
                  <input name="name" value={formState.name || ''} onChange={handleFormChange} required className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none transition-all" placeholder="e.g., Customer Offer" />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Framework Tag</label>
                  <CreatableDropdown value={formState.frameworkTag || 'BIAN'} onChange={(val) => setFormState(prev => ({ ...prev, frameworkTag: val }))} options={frameworkTags.map(f => ({ label: f.name, value: f.name }))} categoryType="framework_tag" placeholder="e.g., BIAN, TOGAF, Custom..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Business Area</label>
                  <CreatableDropdown value={formState.businessArea || null} onChange={(val) => setFormState(prev => ({ ...prev, businessArea: val }))} options={businessAreas.map(a => ({ label: a.name, value: a.name }))} categoryType="service_business_area" placeholder="Select or type Area..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Business Domain</label>
                  <CreatableDropdown value={formState.businessDomain || null} onChange={(val) => setFormState(prev => ({ ...prev, businessDomain: val }))} options={businessDomains.map(d => ({ label: d.name, value: d.name }))} categoryType="service_business_domain" placeholder="Select or type Domain..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Control Record</label>
                  <CreatableDropdown value={formState.controlRecord || null} onChange={(val) => setFormState(prev => ({ ...prev, controlRecord: val }))} options={controlRecords.map(c => ({ label: c.name, value: c.name }))} categoryType="service_control_record" placeholder="Select or type Control Record..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Functional Pattern</label>
                  <CreatableDropdown value={formState.functionalPattern || null} onChange={(val) => setFormState(prev => ({ ...prev, functionalPattern: val }))} options={functionalPatterns.map(f => ({ label: f.name, value: f.name }))} categoryType="service_functional_pattern" placeholder="Select or type Pattern..." />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-end mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                  <AIRewriteButton context={formState.description || ''} onResult={(text) => setFormState(prev => ({ ...prev, description: text }))} />
                </div>
                <textarea name="description" value={formState.description || ''} onChange={handleFormChange} required className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none h-24 resize-none transition-all" placeholder="Atomic capability description..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <div className="w-full sm:w-1/2">
                  <StatusSelect 
                    value={formState.status || 'Active'} 
                    onChange={(val) => handleFormChange({ target: { name: 'status', value: val } } as any)} 
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors font-medium">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-sm">Save Domain</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal isOpen={!!itemToDelete} title="Delete Domain Permanently" message="Are you sure? Flow mappings attached to this domain might be orphaned." onConfirm={handleDeleteConfirm} onCancel={() => setItemToDelete(null)} />
    </div>
  );
}
