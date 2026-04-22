import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ArchitecturePrinciple, NetworkIntegration } from '../../lib/db';
import { Plus, Edit, Trash2, ChevronDown, ChevronUp, ArrowUpDown, Globe, Loader2, Archive, RotateCcw, Scale } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import StatusToggle from '../ui/StatusToggle';
import AIRewriteButton from '../ui/AIRewriteButton';
import DataPortabilityButtons from '../ui/DataPortabilityButtons';
import Select from 'react-select';
import { reactSelectClassNames } from '../ui/CreatableDropdown';
import { fetchFromProvider } from '../../lib/byoeGateway';
import { decryptString } from '../../lib/cryptoVault';
import { initAIEngine, analyzeWithHybridProvider } from '../../lib/aiEngine';
import { useDataPortability } from '../../hooks/useDataPortability';
import StatusSelect from '../ui/StatusSelect';
import PageHeader from '../ui/PageHeader';
import DataTable from '../ui/DataTable';

export default function PrinciplesTab() {
  const principles = useLiveQuery(() => db.architecture_principles.toArray()) || [];
  const layers = useLiveQuery(() => db.architecture_layers.toArray()) || [];
  const appSettings = useLiveQuery(() => db.app_settings.toArray()) || [];
  const networkProviders = useLiveQuery(() => db.network_integrations.toArray()) || [];

  const enableNetworkIntegrations = appSettings.find(s => s.key === 'enableNetworkIntegrations')?.value === true;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ArchitecturePrinciple | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof ArchitecturePrinciple | 'layerName'>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showArchived, setShowArchived] = useState(false);
  
  const [selectedLayerId, setSelectedLayerId] = useState<number | ''>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('Active');
  const [statementValue, setStatementValue] = useState('');
  const [rationaleValue, setRationaleValue] = useState('');
  const [implicationsValue, setImplicationsValue] = useState('');

  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<NetworkIntegration | null>(null);
  const [consentEndpoint, setConsentEndpoint] = useState('');
  const [isFetchingTrends, setIsFetchingTrends] = useState(false);
  const [trendProgress, setTrendProgress] = useState('');

  const { handleExport, handleImport } = useDataPortability({ tableName: 'architecture_principles', filename: 'architecture_principles' });

  const handleSort = (column: keyof ArchitecturePrinciple | 'layerName') => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getLayerName = (layerId: number) => layers.find(l => l.id === layerId)?.name || 'Unknown';

  const filteredPrinciples = showArchived
    ? principles.filter(p => p.status === 'Deprecated')
    : principles.filter(p => p.status !== 'Deprecated');

  const sortedPrinciples = [...filteredPrinciples].sort((a, b) => {
    let aVal = '';
    let bVal = '';
    if (sortColumn === 'layerName') {
      aVal = getLayerName(a.layerId);
      bVal = getLayerName(b.layerId);
    } else {
      aVal = String(a[sortColumn as keyof ArchitecturePrinciple] || '');
      bVal = String(b[sortColumn as keyof ArchitecturePrinciple] || '');
    }
    return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
  });

  const openModal = (item: ArchitecturePrinciple | null = null) => {
    setEditingItem(item);
    setError(null);
    setSelectedLayerId(item?.layerId || layers[0]?.id || '');
    setSelectedStatus(item?.status || 'Active');
    setStatementValue(item?.statement || '');
    setRationaleValue(item?.rationale || '');
    setImplicationsValue(item?.implications || '');
    setIsModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (itemToDelete) {
      await db.architecture_principles.delete(itemToDelete);
      setItemToDelete(null);
    }
  };

  const handleStatusChange = async (item: ArchitecturePrinciple, newStatus: string) => {
    if (item.id) {
      await db.architecture_principles.update(item.id, { status: newStatus as any });
    }
  };

  const handleRestore = async (id: number) => {
    await db.architecture_principles.update(id, { status: 'Needs Review' as any });
  };

  const handleArchive = async (id: number) => {
    await db.architecture_principles.update(id, { status: 'Deprecated' as any });
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    const existing = principles.find(p => p.name.toLowerCase() === name.toLowerCase());

    if (existing && existing.id !== editingItem?.id) {
      setError(`A principle with the name "${name}" already exists.`);
      return;
    }

    const item = {
      name,
      statement: statementValue,
      rationale: rationaleValue,
      implications: implicationsValue,
      layerId: parseInt(formData.get('layerId') as string, 10),
      status: formData.get('status') as any,
    };

    if (editingItem?.id) {
      await db.architecture_principles.update(editingItem.id, item);
    } else {
      await db.architecture_principles.add(item);
    }

    setIsModalOpen(false);
    setEditingItem(null);
  };

  const handleOpenConsentModal = () => {
    const defaultProv = networkProviders.find(p => p.isDefault);
    if (!defaultProv) {
      alert('Please configure a default provider in Network Integration settings.');
      return;
    }
    setSelectedProvider(defaultProv);
    setConsentEndpoint(defaultProv.endpointUrl);
    setIsConsentModalOpen(true);
  };

  const handleFetchTrends = async () => {
    setIsConsentModalOpen(false);
    setIsFetchingTrends(true);
    setTrendProgress('Starting trend fetch...');

    try {
      const provider = selectedProvider || networkProviders.find(p => p.isDefault);
      if (!provider) throw new Error('No default provider found.');

      // Decrypt API key if encrypted version exists
      let decryptedApiKey = '';
      if (provider.encryptedApiKey) {
        try {
          decryptedApiKey = await decryptString(provider.encryptedApiKey);
        } catch (e) {
          throw new Error(`Failed to decrypt API key: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else if (provider.apiKey) {
        // Fallback for legacy plaintext API keys
        decryptedApiKey = provider.apiKey;
      } else {
        throw new Error('No API key found for provider');
      }

      const query = 'Latest Enterprise Architecture Principles 2026';
      setTrendProgress('Fetching from provider...');
      const externalData = await fetchFromProvider(provider.providerType, provider.endpointUrl, decryptedApiKey, query);

      let analyzed = externalData;
      if (provider.providerType === 'WebSearchAPI' || provider.providerType === 'CustomEnterprise') {
        setTrendProgress('Analyzing with local WebLLM...');
        await initAIEngine(progress => setTrendProgress(`Loading AI: ${Math.round(progress.progress * 100)}%`));
        analyzed = await analyzeWithHybridProvider(externalData, provider.providerType, (text) => setTrendProgress(`Analyzing: ${text.substring(0, 64)}...`));
      } else {
        setTrendProgress('Parsing cloud LLM response...');
        analyzed = await analyzeWithHybridProvider(externalData, provider.providerType, (text) => setTrendProgress(`Parsing: ${text.substring(0, 64)}...`));
      }

      let results: any[] = [];
      try {
        const jsonMatch = analyzed.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          results = JSON.parse(jsonMatch[0]);
        } else {
          results = JSON.parse(analyzed);
        }
      } catch (e) {
        console.error('Failed parsing analyzed output', e, analyzed);
        throw new Error('Unable to parse produced principles JSON from provider response.');
      }

      if (!Array.isArray(results)) {
        throw new Error('Expected JSON array of principles from analysis output.');
      }

      const defaultLayerId = layers[0]?.id || 1;
      const toInsert = results.map((p: any) => ({
        name: p.name || 'Untitled Principle',
        statement: p.statement || '',
        rationale: p.rationale || '',
        implications: p.implications || '',
        layerId: p.layerId || defaultLayerId,
        status: 'Needs Review' as const,
      }));

      await db.architecture_principles.bulkAdd(toInsert);
      alert(`Added ${toInsert.length} new principle(s) to Needs Review.`);
    } catch (err: any) {
      console.error('Trend Fetch Error', err);
      alert(err?.message || 'Unable to fetch or analyze trends.');
    } finally {
      setIsFetchingTrends(false);
      setTrendProgress('');
      setSelectedProvider(null);
      setConsentEndpoint('');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader 
        icon={<Scale className="text-blue-500" />}
        title="Architecture Principles"
        description="Architecture Principles are the foundational rules and guidelines that inform and restrict enterprise architecture decisions and designs. They align IT strategies with business objectives."
        action={
          <div className="flex flex-wrap items-center gap-2">
            {enableNetworkIntegrations && (
              <button
                onClick={handleOpenConsentModal}
                disabled={isFetchingTrends || networkProviders.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-800/50 text-indigo-700 dark:text-indigo-400 rounded-lg transition-colors text-sm border border-indigo-200 dark:border-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFetchingTrends ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />} 
                {isFetchingTrends ? trendProgress : 'Fetch Trends'}
              </button>
            )}
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
        data={sortedPrinciples}
        keyField="id"
        emptyMessage={showArchived ? 'No deprecated principles.' : 'No principles found.'}
        searchable={true}
        searchPlaceholder="Search principles..."
        searchFields={['name', 'statement', 'rationale', 'implications']}
        pagination={true}
        itemsPerPage={10}
        containerClassName="flex-1 border-0 shadow-none"
        columns={[
          {
            key: 'expand',
            label: '',
            width: '8',
            render: (row) => (
              <button 
                aria-label={expandedId === row.id ? 'Collapse details' : 'Expand details'} 
                onClick={() => setExpandedId(expandedId === row.id ? null : (row.id || null))} 
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {expandedId === row.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            )
          },
          {
            key: 'name',
            label: (
              <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                Name <ArrowUpDown size={14} className={sortColumn === 'name' ? 'text-blue-500' : 'opacity-50'} />
              </button>
            ),
            render: (row) => (
              <div className="py-1">
                <div className="font-medium text-gray-900 dark:text-gray-200">{row.name}</div>
                <div className="text-xs text-gray-500 truncate max-w-xs">{row.statement}</div>
              </div>
            )
          },
          {
            key: 'layerId',
            label: (
              <button onClick={() => handleSort('layerName')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                Layer <ArrowUpDown size={14} className={sortColumn === 'layerName' ? 'text-blue-500' : 'opacity-50'} />
              </button>
            ),
            className: "hidden md:table-cell",
            render: (row) => getLayerName(row.layerId)
          },
          {
            key: 'status',
            label: (
              <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                Status <ArrowUpDown size={14} className={sortColumn === 'status' ? 'text-blue-500' : 'opacity-50'} />
              </button>
            ),
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
                  currentStatus={row.status}
                  statusOptions={['Draft', 'Active', 'Needs Review', 'Deprecated']}
                  onChange={(s) => handleStatusChange(row, s)}
                />
              )
            )
          }
        ]}
        renderExpandedRow={(row) => expandedId === row.id && (
          <div className="py-4 px-10 text-sm text-gray-600 dark:text-gray-300">
            <div className="grid grid-cols-1 gap-4">
              <div><strong className="block text-gray-900 dark:text-white mb-1">Statement:</strong><p>{row.statement}</p></div>
              <div><strong className="block text-gray-900 dark:text-white mb-1">Rationale:</strong><p>{row.rationale}</p></div>
              <div><strong className="block text-gray-900 dark:text-white mb-1">Implications:</strong><p>{row.implications}</p></div>
            </div>
          </div>
        )}
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
                  title: () => 'Edit'
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
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-[95%] max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{editingItem ? 'Edit Principle' : 'Add Principle'}</h3>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div><label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Name</label><input name="name" defaultValue={editingItem?.name} placeholder="e.g., Always encrypt data at rest" required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500" />{error && <p className="text-sm text-red-500 mt-1">{error}</p>}</div>
              <div>
                <div className="flex justify-between items-center mb-1"><label className="text-sm text-gray-600 dark:text-gray-400">Statement</label><AIRewriteButton context={statementValue} onResult={setStatementValue} /></div>
                <textarea name="statement" value={statementValue} onChange={e => setStatementValue(e.target.value)} placeholder="Enter the principle statement" required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 h-20" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1"><label className="text-sm text-gray-600 dark:text-gray-400">Rationale</label><AIRewriteButton context={rationaleValue} onResult={setRationaleValue} /></div>
                <textarea name="rationale" value={rationaleValue} onChange={e => setRationaleValue(e.target.value)} placeholder="Why this principle matters" required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 h-20" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1"><label className="text-sm text-gray-600 dark:text-gray-400">Implications</label><AIRewriteButton context={implicationsValue} onResult={setImplicationsValue} /></div>
                <textarea name="implications" value={implicationsValue} onChange={e => setImplicationsValue(e.target.value)} placeholder="Potential impact and effects" required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 h-20" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Layer</label>
                  <input type="hidden" name="layerId" value={selectedLayerId} />
                  <Select inputId="principle-layer" unstyled classNames={reactSelectClassNames} options={layers.map(l => ({ label: l.name, value: l.id }))} value={selectedLayerId ? { label: layers.find(l => l.id === selectedLayerId)?.name || '', value: selectedLayerId } : null} onChange={(v: any) => setSelectedLayerId(v ? v.value : '')} />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Status</label>
                  <StatusSelect value={selectedStatus} onChange={setSelectedStatus} name="status" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-4"><button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Cancel</button><button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Save</button></div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal isOpen={!!itemToDelete} title="Delete Principle Permanently" message="Are you sure? This action cannot be undone." onConfirm={handleDeleteConfirm} onCancel={() => setItemToDelete(null)} />
      <ConfirmModal isOpen={isConsentModalOpen} title="Authorize External Network Request" message={`This action will connect to: ${consentEndpoint}\n\nOnly the generic search query will be transmitted. Absolutely ZERO local architecture data will leave this device.\n\nDo you authorize this connection?`} onConfirm={handleFetchTrends} onCancel={() => setIsConsentModalOpen(false)} />
    </div>
  );
}
