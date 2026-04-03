import React, { useState, useMemo } from 'react';
import { db, BianDomain } from '../../lib/db';
import { Download, Upload, Plus, Edit, Trash2, ArrowUpDown, Search, Info, Sparkles, Loader2 } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import { useBianDomains } from '../../hooks/useBianDomains';
import { useMasterData } from '../../hooks/useMasterData';
import { initAIEngine, generateReview } from '../../lib/aiEngine';
import CreatableDropdown from '../ui/CreatableDropdown';

type SortableColumn = keyof BianDomain;

export default function BianTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const { domains, isLoading } = useBianDomains(searchTerm);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BianDomain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Form State
  const [formState, setFormState] = useState<Partial<BianDomain>>({ status: 'Active' });

  const [sortColumn, setSortColumn] = useState<SortableColumn>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Master Category Providers
  const businessAreas = useMasterData('bian_business_area');
  const businessDomains = useMasterData('bian_business_domain');
  const controlRecords = useMasterData('bian_control_record');
  const functionalPatterns = useMasterData('bian_functional_pattern');

  const handleSort = (column: SortableColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedDomains = useMemo(() => {
    return [...domains].sort((a, b) => {
      const aVal = String(a[sortColumn] || '');
      const bVal = String(b[sortColumn] || '');
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [domains, sortColumn, sortDirection]);

  const openModal = (item: BianDomain | null = null) => {
    setEditingItem(item);
    setFormState(item ? { ...item } : { status: 'Active' });
    setError(null);
    setIsModalOpen(true);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormState(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAutoGenerate = async () => {
    const { name, businessArea, businessDomain } = formState;
    
    if (!name || !businessArea || !businessDomain) {
      setError("Please fill out Service Domain Name, Business Area, and Business Domain first to generate a targeted description.");
      return;
    }

    setError(null);
    setIsGenerating(true);
    setFormState(prev => ({ ...prev, description: '' }));
    
    const prompt = `Write a concise, one-sentence functional description for the BIAN Service Domain '${name}' which belongs to the Business Area '${businessArea}' and Business Domain '${businessDomain}'. Do NOT include introductory text, quotes, or markdown. Output exactly one sentence.`;
    
    try {
      await initAIEngine((progress) => {
        console.log("AI Loading:", progress.text);
      });

      await generateReview(prompt, (currentTextDelta) => {
        setFormState(prev => ({ ...prev, description: currentTextDelta }));
      });
    } catch (err) {
      console.error("AI Generation Error", err);
      setError("Failed to generate description. Ensure AI Engine is cached or check network if first time download.");
    } finally {
      setIsGenerating(false);
    }
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
    if (!formState.name) return;
    const name = formState.name.trim();

    const existing = domains.find(d => d.name.toLowerCase() === name.toLowerCase());
    if (existing && existing.id !== editingItem?.id) {
      setError(`A domain with the name "${name}" already exists.`);
      return;
    }

    const item: Omit<BianDomain, 'id'> = {
      name,
      businessArea: formState.businessArea || '',
      businessDomain: formState.businessDomain || '',
      controlRecord: formState.controlRecord || '',
      functionalPattern: formState.functionalPattern || '',
      description: formState.description || '',
      status: (formState.status as 'Active' | 'Draft' | 'Deprecated') || 'Active',
    };
    
    if (editingItem?.id) {
      await db.bian_domains.update(editingItem.id, item);
    } else {
      await db.bian_domains.add(item);
    }
    setIsModalOpen(false);
    setEditingItem(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active': return 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400';
      case 'Draft': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400';
      case 'Deprecated': return 'bg-gray-100 text-gray-700 dark:bg-gray-500/10 dark:text-gray-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  const SortHeader = ({ column, label }: { column: SortableColumn; label: string }) => (
    <th className="px-4 py-3 font-medium min-w-[150px]">
      <button onClick={() => handleSort(column)} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
        {label} <ArrowUpDown size={14} className={sortColumn === column ? 'text-blue-500' : 'opacity-50'} />
      </button>
    </th>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">BIAN Service Domains</h3>
        
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Search Area, Domain..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 text-gray-900 dark:text-white"
            />
          </div>

          <label className="flex items-center justify-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg cursor-pointer transition-colors text-sm border border-gray-200 dark:border-transparent flex-1 sm:flex-none">
            <Upload size={16} />
            <span className="hidden sm:inline">Import</span>
            <input type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
          <button onClick={handleExport} className="flex items-center justify-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors text-sm border border-gray-200 dark:border-transparent flex-1 sm:flex-none">
            <Download size={16} />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button onClick={() => openModal(null)} className="flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm flex-1 sm:flex-none">
            <Plus size={16} />
            <span className="hidden sm:inline">Add New</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900/50">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-[0_1px_0_0_theme(colors.gray.200)] dark:shadow-[0_1px_0_0_theme(colors.gray.700)]">
            <tr className="text-gray-500 dark:text-gray-400 text-sm">
              <SortHeader column="name" label="Service Domain" />
              <th className="px-4 py-3 font-medium">Business Hierarchy Map</th>
              <th className="px-4 py-3 font-medium">Metamodel Details</th>
              <SortHeader column="status" label="Status" />
              <th className="px-4 py-3 font-medium text-right w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-500 text-sm">Loading domains...</td></tr>
            ) : sortedDomains.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-500 text-sm">No domains found.</td></tr>
            ) : (
              sortedDomains.map(d => (
                <tr key={d.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 group">
                  <td className="px-4 py-4 min-w-[200px]">
                    <div className="font-semibold text-gray-900 dark:text-white mb-1">{d.name}</div>
                    <div className="text-xs text-gray-500 line-clamp-2" title={d.description}>{d.description}</div>
                  </td>
                  <td className="px-4 py-4 min-w-[250px]">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex space-x-1 items-center">
                        <span className="text-[10px] uppercase font-semibold text-gray-400 w-12 text-right">Area</span>
                        <span className="px-2 py-0.5 rounded-sm bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900 text-xs truncate max-w-[200px]" title={d.businessArea}>{d.businessArea}</span>
                      </div>
                      <div className="flex space-x-1 items-center">
                        <span className="text-[10px] uppercase font-semibold text-gray-400 w-12 text-right">Domain</span>
                        <span className="px-2 py-0.5 rounded-sm bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900 text-xs truncate max-w-[200px]" title={d.businessDomain}>{d.businessDomain}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 min-w-[250px]">
                    <div className="flex flex-col gap-1 text-sm">
                      <div className="flex items-center">
                        <span className="text-gray-500 dark:text-gray-400 w-16 text-xs flex items-center">
                          CR: <span title="Control Record"><Info size={14} className="inline ml-1 text-gray-400 cursor-help" /></span>
                        </span>
                        <span className="text-gray-900 dark:text-gray-200 text-xs truncate pr-2 font-medium" title={d.controlRecord}>{d.controlRecord}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="text-gray-500 dark:text-gray-400 w-16 text-xs flex items-center">
                          FP: <span title="Functional Pattern"><Info size={14} className="inline ml-1 text-gray-400 cursor-help" /></span>
                        </span>
                        <span className="text-gray-600 dark:text-gray-300 text-xs italic truncate pr-2" title={d.functionalPattern}>{d.functionalPattern}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getStatusBadge(d.status)}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openModal(d)} className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700"><Edit size={14} /></button>
                      <button onClick={() => setItemToDelete(d.id!)} className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-700"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 border-b border-gray-100 dark:border-gray-800 pb-3">{editingItem ? 'Edit BIAN Domain' : 'Add BIAN Domain'}</h3>
            <form onSubmit={handleSave} className="flex flex-col gap-5">
              
              {error && <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm border border-red-100 dark:border-red-900/30">{error}</div>}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Service Domain Name</label>
                  <input name="name" value={formState.name || ''} onChange={handleFormChange} required className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none transition-all" placeholder="e.g., Customer Offer" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Business Area</label>
                  <CreatableDropdown
                    value={formState.businessArea || null}
                    onChange={(val) => setFormState(prev => ({ ...prev, businessArea: val }))}
                    options={businessAreas.map(a => ({ label: a.name, value: a.name }))}
                    categoryType="bian_business_area"
                    placeholder="Select or type Area..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Business Domain</label>
                  <CreatableDropdown
                    value={formState.businessDomain || null}
                    onChange={(val) => setFormState(prev => ({ ...prev, businessDomain: val }))}
                    options={businessDomains.map(d => ({ label: d.name, value: d.name }))}
                    categoryType="bian_business_domain"
                    placeholder="Select or type Domain..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Control Record</label>
                  <CreatableDropdown
                    value={formState.controlRecord || null}
                    onChange={(val) => setFormState(prev => ({ ...prev, controlRecord: val }))}
                    options={controlRecords.map(c => ({ label: c.name, value: c.name }))}
                    categoryType="bian_control_record"
                    placeholder="Select or type Control Record..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Functional Pattern</label>
                  <CreatableDropdown
                    value={formState.functionalPattern || null}
                    onChange={(val) => setFormState(prev => ({ ...prev, functionalPattern: val }))}
                    options={functionalPatterns.map(f => ({ label: f.name, value: f.name }))}
                    categoryType="bian_functional_pattern"
                    placeholder="Select or type Pattern..."
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-end mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                  <button 
                    type="button" 
                    onClick={handleAutoGenerate} 
                    disabled={isGenerating}
                    className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded border transition-colors ${isGenerating ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-400 border-purple-200 dark:border-purple-800 cursor-not-allowed' : 'bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/30'}`}
                  >
                    {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    {isGenerating ? 'Generating...' : 'Auto-Generate'}
                  </button>
                </div>
                <textarea name="description" value={formState.description || ''} onChange={handleFormChange} required disabled={isGenerating} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none h-24 resize-none transition-all disabled:opacity-75" placeholder={isGenerating ? 'AI is drafting description...' : 'Atomic capability description...'} />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select name="status" value={formState.status || 'Active'} onChange={handleFormChange} className="w-full sm:w-1/2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none transition-all">
                  <option value="Active">Active</option>
                  <option value="Draft">Draft</option>
                  <option value="Deprecated">Deprecated</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors font-medium">Cancel</button>
                <button type="submit" disabled={isGenerating} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">Save Domain</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!itemToDelete}
        title="Delete Domain"
        message="Are you sure you want to delete this BIAN domain? Flow mappings attached to this domain might be orphaned."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
}
