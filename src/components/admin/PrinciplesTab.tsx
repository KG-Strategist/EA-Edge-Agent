import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ArchitecturePrinciple, NetworkIntegration } from '../../lib/db';
import { Download, Upload, Plus, Edit, Trash2, ChevronDown, ChevronUp, ArrowUpDown, Globe, Loader2 } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import { fetchFromProvider } from '../../lib/byoeGateway';
import { initAIEngine, analyzeWithHybridProvider } from '../../lib/aiEngine';

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

  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<NetworkIntegration | null>(null);
  const [consentEndpoint, setConsentEndpoint] = useState('');
  const [isFetchingTrends, setIsFetchingTrends] = useState(false);
  const [trendProgress, setTrendProgress] = useState('');

  const handleSort = (column: keyof ArchitecturePrinciple | 'layerName') => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getLayerName = (layerId: number) => layers.find(l => l.id === layerId)?.name || 'Unknown';

  const sortedPrinciples = [...principles].sort((a, b) => {
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
    setIsModalOpen(true);
  };

  const handleExport = () => {
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(principles))}`;
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', 'architecture_principles.json');
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      if (!reader.result) return;
      try {
        const importedData = JSON.parse(reader.result as string);
        await db.architecture_principles.bulkPut(importedData);
      } catch (e) {
        console.error('Error importing data', e);
        alert('Failed to import principles. See console for details.');
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteConfirm = async () => {
    if (itemToDelete) {
      await db.architecture_principles.delete(itemToDelete);
      setItemToDelete(null);
    }
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
      statement: formData.get('statement') as string,
      rationale: formData.get('rationale') as string,
      implications: formData.get('implications') as string,
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

      const query = 'Latest Enterprise Architecture Principles 2026';
      setTrendProgress('Fetching from provider...');
      const externalData = await fetchFromProvider(provider.providerType, provider.endpointUrl, provider.apiKey, query);

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
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Architecture Principles</h3>
        <div className="flex gap-3">
          {enableNetworkIntegrations && (
            <button
              onClick={handleOpenConsentModal}
              disabled={isFetchingTrends || networkProviders.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-800/50 text-indigo-700 dark:text-indigo-400 rounded-lg transition-colors text-sm border border-indigo-200 dark:border-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isFetchingTrends ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />} 
              {isFetchingTrends ? trendProgress : 'Fetch Trends & Discover'}
            </button>
          )}
          <label className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer transition-colors text-sm border border-gray-200 dark:border-transparent">
            <Upload size={16} /> Import
            <input type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
          <button onClick={handleExport} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors text-sm border border-gray-200 dark:border-transparent">
            <Download size={16} /> Export
          </button>
          <button onClick={() => openModal(null)} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm">
            <Plus size={16} /> Add New
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-white dark:bg-gray-800 z-10 shadow-sm">
            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm">
              <th className="pb-3 font-medium w-8"></th>
              <th className="pb-3 font-medium"><button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">Name <ArrowUpDown size={14} className={sortColumn === 'name' ? 'text-blue-500' : 'opacity-50'} /></button></th>
              <th className="pb-3 font-medium"><button onClick={() => handleSort('layerName')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">Layer <ArrowUpDown size={14} className={sortColumn === 'layerName' ? 'text-blue-500' : 'opacity-50'} /></button></th>
              <th className="pb-3 font-medium"><button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">Status <ArrowUpDown size={14} className={sortColumn === 'status' ? 'text-blue-500' : 'opacity-50'} /></button></th>
              <th className="pb-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedPrinciples.map(p => (
              <React.Fragment key={p.id}>
                <tr className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="py-4"><button aria-label={expandedId === p.id ? 'Collapse details' : 'Expand details'} onClick={() => setExpandedId(expandedId === p.id ? null : (p.id || null))} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">{expandedId === p.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button></td>
                  <td className="py-4 text-gray-900 dark:text-gray-200"><div className="font-medium">{p.name}</div><div className="text-xs text-gray-500 truncate max-w-md">{p.statement}</div></td>
                  <td className="py-4 text-gray-600 dark:text-gray-300 text-sm">{getLayerName(p.layerId)}</td>
                  <td className="py-4"><span className={`text-xs px-2 py-1 rounded-full ${p.status === 'Active' ? 'bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400' : p.status === 'Needs Review' ? 'bg-yellow-100 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>{p.status}</span></td>
                  <td className="py-4 text-right"><button aria-label="Edit principle" onClick={() => openModal(p)} className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"><Edit size={16} /></button><button aria-label="Delete principle" onClick={() => setItemToDelete(p.id!)} className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400"><Trash2 size={16} /></button></td>
                </tr>
                {expandedId === p.id && (
                  <tr className="bg-gray-50 dark:bg-gray-800/20 border-b border-gray-100 dark:border-gray-800/50">
                    <td colSpan={5} className="py-4 px-10 text-sm text-gray-600 dark:text-gray-300">
                      <div className="grid grid-cols-1 gap-4">
                        <div><strong className="block text-gray-900 dark:text-white mb-1">Statement:</strong><p>{p.statement}</p></div>
                        <div><strong className="block text-gray-900 dark:text-white mb-1">Rationale:</strong><p>{p.rationale}</p></div>
                        <div><strong className="block text-gray-900 dark:text-white mb-1">Implications:</strong><p>{p.implications}</p></div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{editingItem ? 'Edit Principle' : 'Add Principle'}</h3>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div><label className="block text-sm text-gray-600 dark:text-gray-400 mb-1" htmlFor="principle-name">Name</label><input id="principle-name" name="name" defaultValue={editingItem?.name} placeholder="e.g., Always encrypt data at rest" aria-label="Principle name" required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500" /></div>
              <div><label className="block text-sm text-gray-600 dark:text-gray-400 mb-1" htmlFor="principle-statement">Statement</label><textarea id="principle-statement" name="statement" defaultValue={editingItem?.statement} placeholder="Enter the principle statement" aria-label="Principle statement" required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 h-20" /></div>
              <div><label className="block text-sm text-gray-600 dark:text-gray-400 mb-1" htmlFor="principle-rationale">Rationale</label><textarea id="principle-rationale" name="rationale" defaultValue={editingItem?.rationale} placeholder="Why this principle matters" aria-label="Principle rationale" required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 h-20" /></div>
              <div><label className="block text-sm text-gray-600 dark:text-gray-400 mb-1" htmlFor="principle-implications">Implications</label><textarea id="principle-implications" name="implications" defaultValue={editingItem?.implications} placeholder="Potential impact and effects" aria-label="Principle implications" required className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 h-20" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm text-gray-600 dark:text-gray-400 mb-1" htmlFor="principle-layer">Layer</label><select id="principle-layer" name="layerId" defaultValue={editingItem?.layerId || layers[0]?.id} aria-label="Architecture layer" title="Select architecture layer" className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500">{layers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
                <div><label className="block text-sm text-gray-600 dark:text-gray-400 mb-1" htmlFor="principle-status">Status</label><select id="principle-status" name="status" defaultValue={editingItem?.status || 'Active'} aria-label="Principle status" title="Select principle status" className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500"><option>Active</option><option>Needs Review</option><option>Deprecated</option></select></div>
              </div>
              <div className="flex justify-end gap-3 mt-4"><button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Cancel</button><button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">Save</button></div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal isOpen={!!itemToDelete} title="Delete Principle" message="Are you sure you want to delete this principle? This action cannot be undone." onConfirm={handleDeleteConfirm} onCancel={() => setItemToDelete(null)} />

      <ConfirmModal isOpen={isConsentModalOpen} title="Authorize External Network Request" message={`This action will connect to: ${consentEndpoint}

Only the generic search query will be transmitted. Absolutely ZERO local architecture data, principles, or bespoke tags will leave this device.

Do you authorize this connection?`} onConfirm={handleFetchTrends} onCancel={() => setIsConsentModalOpen(false)} />
    </div>
  );
}
