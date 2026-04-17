import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, PromptTemplate } from '../../lib/db';
import { Plus, Edit, ArrowUpDown, Sparkles, Copy, Archive, RotateCcw, MessageSquareCode } from 'lucide-react';
import StatusToggle from '../ui/StatusToggle';
import DataPortabilityButtons from '../ui/DataPortabilityButtons';
import CreatableDropdown from '../ui/CreatableDropdown';
import { useMasterData } from '../../hooks/useMasterData';
import { useDataPortability } from '../../hooks/useDataPortability';
import PageHeader from '../ui/PageHeader';

export default function PromptsTab() {
  const prompts = useLiveQuery(() => db.prompt_templates.toArray()) || [];
  const promptCategories = useMasterData('Prompt Category');

  useEffect(() => {
    const seedPrompts = async () => {
      const count = await db.prompt_templates.count();
      if (count === 0) {
        const now = new Date();
        const defaultPrompts: Omit<PromptTemplate, 'id'>[] = [
          {
            name: "DDQ Evidence Verification",
            category: "Architecture Review",
            executionTarget: "Primary EA Agent",
            promptText: "You are an Enterprise Architecture auditor. Review the following architecture documentation:\n{{documentText}}\nDoes the documentation support the vendor's self-assessment? Identify any discrepancies.",
            version: "1.0.0",
            status: "Active",
            createdAt: now,
            updatedAt: now
          },
          {
            name: "Threat Model Generator (STRIDE)",
            category: "Security & Risk",
            executionTarget: "Auto-Route (MoE)",
            promptText: "Based on the provided system architecture:\n{{systemArchitecture}}\n\nGenerate a comprehensive threat model using the STRIDE methodology.",
            version: "1.0.0",
            status: "Active",
            createdAt: now,
            updatedAt: now
          }
        ];
        await db.prompt_templates.bulkAdd(defaultPrompts);
      }
    };
    seedPrompts();
  }, []);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PromptTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  
  const [sortColumn, setSortColumn] = useState<'name' | 'category' | 'status'>('category');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [showArchived, setShowArchived] = useState(false);

  const { handleExport, handleImport } = useDataPortability({ tableName: 'prompt_templates', filename: 'prompt_templates' });

  const handleSort = (column: 'name' | 'category' | 'status') => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const filteredPrompts = prompts.filter(p => {
    if (showArchived) {
      if (p.status !== 'Deprecated') return false;
    } else {
      if (p.status === 'Deprecated') return false;
    }
    if (filterCategory && p.category !== filterCategory) return false;
    return true;
  });

  const sortedPrompts = [...filteredPrompts].sort((a, b) => {
    const aVal = String(a[sortColumn] || '');
    const bVal = String(b[sortColumn] || '');
    return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
  });

  const openModal = (item: PromptTemplate | null = null) => {
    setEditingItem(item);
    setError(null);
    setSelectedCategory(item?.category || '');
    setIsModalOpen(true);
  };

  const handleStatusChange = async (item: PromptTemplate, newStatus: string) => {
    if (item.id) {
      await db.prompt_templates.update(item.id, {
        status: newStatus as any,
        updatedAt: new Date()
      });
    }
  };

  const handleArchive = async (item: PromptTemplate) => {
    await handleStatusChange(item, 'Deprecated');
  };

  const handleRestore = async (item: PromptTemplate) => {
    await handleStatusChange(item, 'Active');
  };

  const handleCopy = (item: PromptTemplate) => {
    navigator.clipboard.writeText(item.promptText);
    setCopiedId(item.id!);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    const promptText = (formData.get('promptText') as string).trim();
    const executionTarget = formData.get('executionTarget') as 'Primary EA Agent' | 'Tiny Triage Agent' | 'Auto-Route (MoE)';

    if (!name || !promptText) {
      setError('Name and prompt text are required.');
      return;
    }

    if (!selectedCategory) {
      setError('Please select or create a prompt category.');
      return;
    }

    const existing = prompts.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing && existing.id !== editingItem?.id) {
      setError(`A prompt with the name "${name}" already exists.`);
      return;
    }

    const now = new Date();
    const item: Omit<PromptTemplate, 'id'> = {
      name,
      category: selectedCategory,
      executionTarget: executionTarget || 'Tiny Triage Agent',
      promptText,
      version: (formData.get('version') as string).trim() || '1.0.0',
      status: (formData.get('status') as any) || 'Active',
      createdAt: editingItem?.createdAt ?? now,
      updatedAt: now
    };

    if (editingItem?.id) {
      await db.prompt_templates.update(editingItem.id, item);
    } else {
      await db.prompt_templates.add(item);
    }
    setIsModalOpen(false);
    setEditingItem(null);
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader 
        icon={<MessageSquareCode className="text-purple-500" />}
        title="AI Prompt Manager"
        description="Manage and version your AI prompt templates. These prompts are used by the Edge AI engine during DDQ audits, anomaly detection, and threat modeling."
        action={
          <div className="flex items-center gap-3">
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500"
              aria-label="Filter Category"
              title="Filter Category"
            >
              <option value="">All Categories</option>
              {promptCategories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
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
              Add Prompt
            </button>
          </div>
        }
      />

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
                <button onClick={() => handleSort('category')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Category <ArrowUpDown size={14} className={sortColumn === 'category' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="px-4 py-3 font-medium">Prompt Preview</th>
              <th className="px-4 py-3 font-medium">
                <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
                  Status <ArrowUpDown size={14} className={sortColumn === 'status' ? 'text-blue-500' : 'opacity-50'} />
                </button>
              </th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedPrompts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                  No prompt templates found. Click "Add Prompt" to create your first one.
                </td>
              </tr>
            )}
            {sortedPrompts.map(p => (
              <tr key={p.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                <td className="px-4 py-4 text-gray-900 dark:text-gray-200 font-medium whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-purple-500" />
                    {p.name}
                  </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 rounded-md text-xs font-medium border border-purple-200 dark:border-purple-500/30">
                    {p.category}
                  </span>
                  <span className="ml-2 text-[10px] uppercase tracking-wider font-bold text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300 px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                    v{p.version || '1.0.0'}
                  </span>
                </td>
                <td className="px-4 py-4 text-gray-600 dark:text-gray-400 text-sm max-w-[300px] truncate" title={p.promptText}>
                  {p.promptText.substring(0, 80)}{p.promptText.length > 80 ? '...' : ''}
                </td>
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
                      currentStatus={p.status || 'Active'} 
                      statusOptions={['Draft', 'Active', 'Needs Review', 'Deprecated']} 
                      onChange={(s) => handleStatusChange(p, s)} 
                    />
                  )}
                </td>
                <td className="px-4 py-4 text-right whitespace-nowrap">
                  {showArchived ? (
                    <>
                      <button onClick={() => handleRestore(p)} title="Restore" className="p-1.5 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition-colors"><RotateCcw size={16} /></button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={() => handleCopy(p)} 
                        className="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                        title="Copy prompt to clipboard"
                      >
                        <Copy size={16} />
                      </button>
                      {copiedId === p.id && <span className="text-xs text-green-500 mr-1">Copied!</span>}
                      <button onClick={() => openModal(p)} className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" aria-label="Edit Prompt" title="Edit Prompt"><Edit size={16} /></button>
                      <button onClick={() => handleArchive(p)} title="Archive" className="p-1.5 text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"><Archive size={16} /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
              {editingItem ? 'Edit Prompt Template' : 'Add Prompt Template'}
            </h3>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Name</label>
                <input 
                  name="name" 
                  defaultValue={editingItem?.name} 
                  onChange={() => setError(null)} 
                  required 
                  placeholder="e.g., DDQ Score Validation Prompt"
                  className={`w-full bg-white dark:bg-gray-800 border ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-700'} rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 min-h-[42px]`} 
                />
                {error && <p className="text-sm text-red-500 mt-1">{error}</p>}
              </div>

              <div>
                <CreatableDropdown
                  value={selectedCategory || null}
                  onChange={(val) => { setSelectedCategory(val); setError(null); }}
                  options={promptCategories.map(c => ({ label: c.name, value: c.name }))}
                  categoryType="Prompt Category"
                  placeholder="Select or create category..."
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Version</label>
                <input 
                  name="version" 
                  defaultValue={editingItem?.version || '1.0.0'} 
                  placeholder="1.0.0"
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 font-mono text-sm" 
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Execution Target</label>
                <select
                  name="executionTarget"
                  defaultValue={editingItem?.executionTarget || 'Tiny Triage Agent'}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500"
                  aria-label="Execution Target"
                  title="Execution Target"
                >
                  <option value="Auto-Route (MoE)">Auto-Route (MoE) (Dynamically swaps based on Prompt Intent)</option>
                  <option value="Primary EA Agent">Primary EA Agent (Best for strict DDQ/Rule tracking)</option>
                  <option value="Tiny Triage Agent">Tiny Triage Agent (Best for fast categorization/routing)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                  Prompt Text
                  <span className="text-xs text-gray-400 ml-2">
                    Use {'{{variable}}'} syntax for dynamic placeholders (e.g., {'{{projectName}}'}, {'{{vendorScore}}'})
                  </span>
                </label>
                <textarea 
                  name="promptText" 
                  defaultValue={editingItem?.promptText}
                  required 
                  rows={10}
                  placeholder={`Example:\nYou are an Enterprise Architecture auditor. The vendor scored themselves {{vendorScore}}/5 on "{{questionText}}".\n\nReview the following architecture documentation:\n{{documentText}}\n\nDoes the documentation support the vendor's self-assessment? Identify discrepancies.`}
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 font-mono text-sm leading-relaxed" 
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Status</label>
                <select name="status" defaultValue={editingItem?.status || 'Active'} className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500" aria-label="Status" title="Status">
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
    </div>
  );
}

