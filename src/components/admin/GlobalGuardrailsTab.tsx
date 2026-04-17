import { useState, useCallback, useEffect, useMemo } from 'react';
import { Trash2, AlertTriangle, Plus, ToggleLeft, ToggleRight, Shield, X, Archive, RefreshCw, Lock, Download, Upload, ChevronLeft, ChevronRight, Edit2, Check } from 'lucide-react';
import { db, PrivacyGuardrail, logForensicAudit } from '../../lib/db';
import { useArchive } from '../../hooks/useArchive';
import { generateReview, isModelCached, getActiveModelId } from '../../lib/aiEngine';
import PageHeader from '../ui/PageHeader';
import CreatableDropdown from '../ui/CreatableDropdown';
import { useLiveQuery } from 'dexie-react-hooks';

export default function GlobalGuardrailsTab() {
  // ── Guardrails CRUD State ──────────────────────────────────────────
  const [guardrails, setGuardrails] = useState<PrivacyGuardrail[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newRuleText, setNewRuleText] = useState('');
  const [newFrameworkTags, setNewFrameworkTags] = useState<string[]>([]);
  const [newEnforcementScope, setNewEnforcementScope] = useState<string[]>([]);
  const [editingPolicyId, setEditingPolicyId] = useState<number | null>(null);
  const [isAutoTagging, setIsAutoTagging] = useState(false);
  const [reviewTags, setReviewTags] = useState<string[] | null>(null);
  const [skipAutoTagging, setSkipAutoTagging] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // ── Dirty State Tracking ───────────────────────────────────────────
  const isDirty = useMemo(() => {
    if (!editingPolicyId) return true; // Always dirty if creating new
    const original = guardrails.find(g => g.id === editingPolicyId);
    if (!original) return true;

    const arraysEqual = (a: string[], b: string[]) => {
      if (a.length !== b.length) return false;
      const sortedA = [...a].sort();
      const sortedB = [...b].sort();
      return sortedA.every((val, index) => val === sortedB[index]);
    };

    const originalTags = original.frameworkTags || [];
    const originalScope = original.enforcementScope || [];

    return (
      newTitle.trim() !== original.title ||
      newRuleText.trim() !== original.ruleText ||
      !arraysEqual(newFrameworkTags, originalTags) ||
      !arraysEqual(newEnforcementScope, originalScope)
    );
  }, [editingPolicyId, guardrails, newTitle, newRuleText, newFrameworkTags, newEnforcementScope]);

  // ── Pagination State ───────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // ── Data Fetching ──────────────────────────────────────────────────
  const masterCategories = useLiveQuery(() => db.master_categories.where('type').equals('FrameworkTag').toArray()) || [];
  const workflows = useLiveQuery(() => db.review_workflows.toArray()) || [];

  const frameworkOptions = masterCategories.map(c => ({ label: c.name, value: c.name }));
  const scopeOptions = [
    { label: 'Global Context', value: 'GLOBAL' },
    { label: 'Chat Interface', value: 'CHAT' },
    ...workflows.map(w => ({ label: `Workflow: ${w.name}`, value: `workflow-${w.id}` }))
  ];

  // ── Archive Hook ───────────────────────────────────────────────────
  const { showArchived, setShowArchived, archiveItem, restoreItem, permanentDeleteItem, filterByArchiveStatus } = useArchive({
    tableName: 'privacy_guardrails',
    statusField: 'isArchived',
    archivedValue: true,
    activeValue: false
  });

  // ── Filter State ───────────────────────────────────────────────────
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('ALL');

  // ── Load guardrails from Dexie ─────────────────────────────────────
  const loadGuardrails = useCallback(async () => {
    try {
      const data = await db.privacy_guardrails.toArray();
      setGuardrails(data);
    } catch (e) {
      console.error('[DpdpTab] Failed to load guardrails:', e);
    }
  }, []);

  useEffect(() => { loadGuardrails(); }, [loadGuardrails]);

  // ── CRUD Handlers ──────────────────────────────────────────────────
  const executeSave = async (tagsToSave: string[]) => {
    const trimTitle = newTitle.trim();
    const trimRule = newRuleText.trim();
    if (!trimTitle || !trimRule) return;

    for (const tag of tagsToSave) {
      const existingTag = await db.master_categories.where('name').equals(tag).first();
      if (!existingTag) {
        await db.master_categories.add({
          name: tag,
          type: 'FrameworkTag',
          status: 'Active'
        });
      }
    }

    if (editingPolicyId) {
      const existing = await db.privacy_guardrails.get(editingPolicyId);
      if (existing) {
        const updated = {
          ...existing,
          title: trimTitle,
          ruleText: trimRule,
          frameworkTags: tagsToSave,
          enforcementScope: newEnforcementScope.length > 0 ? newEnforcementScope : ['GLOBAL']
        };
        await db.privacy_guardrails.put(updated);
        await logForensicAudit('UPDATE', 'privacy_guardrails', editingPolicyId, existing, updated);
      }
    } else {
      const newObj = {
        title: trimTitle,
        ruleText: trimRule,
        isDefault: false,
        isActive: true,
        isArchived: false,
        frameworkTags: tagsToSave,
        enforcementScope: newEnforcementScope.length > 0 ? newEnforcementScope : ['GLOBAL']
      };
      const newId = await db.privacy_guardrails.add(newObj);
      await logForensicAudit('CREATE', 'privacy_guardrails', newId, null, { ...newObj, id: newId });
    }
    
    setNewTitle('');
    setNewRuleText('');
    setNewFrameworkTags([]);
    setNewEnforcementScope([]);
    setEditingPolicyId(null);
    setShowAddModal(false);
    setReviewTags(null);
    setSkipAutoTagging(false);
    loadGuardrails();
  };

  const handleInitiateSave = async () => {
    const trimTitle = newTitle.trim();
    const trimRule = newRuleText.trim();
    if (!trimTitle || !trimRule) return;

    let finalTags = [...newFrameworkTags];

    if (finalTags.length === 0 && !skipAutoTagging) {
      setIsAutoTagging(true);
      let generatedTags: string[] = [];
      let aiFailed = false;

      try {
        // TASK 1: PRE-CHECK LLM CACHE
        const tinyModelId = await getActiveModelId('Tiny');
        const isCached = await isModelCached(tinyModelId);

        if (!isCached || !navigator.onLine) {
          console.warn('AI Model not cached or offline. Bypassing AI auto-tagging.');
          aiFailed = true;
        } else {
          const promptTemplate = await db.prompt_templates.where('name').equals('System Auto-Tagging Classifier').first();
          if (promptTemplate) {
            const prompt = promptTemplate.promptText.replace('{{ruleText}}', trimRule);
            const response = await generateReview(prompt, () => {}, 'Tiny Triage Agent');
            
            if (response) {
              generatedTags = response.split(',').map(t => t.trim()).filter(t => t);
            }
          }
        }
      } catch (e) {
        console.error('Auto-tagging failed, falling back to heuristic:', e);
        aiFailed = true;
      } finally {
        setIsAutoTagging(false);
      }

      if (generatedTags.length === 0) {
        console.log("[EA-NITI Fallback] AI Offline or yielded no tags. Initiating local Regex scan...");
        const existingFrameworkTags = await db.master_categories.where('type').equals('FrameworkTag').toArray();
        console.log("[EA-NITI Fallback] Scanning against " + existingFrameworkTags.length + " master categories...");
        
        const combinedTextLower = `${trimTitle} ${trimRule}`.toLowerCase();
        
        generatedTags = existingFrameworkTags
          .filter(cat => combinedTextLower.includes(cat.name.toLowerCase()))
          .map(cat => cat.name);
          
        console.log("[EA-NITI Fallback] Regex matches found:", generatedTags);
      }

      if (generatedTags.length > 0) {
        setReviewTags(generatedTags);
        return;
      } else {
        await executeSave([]);
        if (aiFailed) {
          setToastMessage("Policy saved. Auto-tagging unavailable (AI offline and no keyword matches).");
          setTimeout(() => setToastMessage(null), 5000);
        }
        return;
      }
    }

    await executeSave(finalTags);
  };

  const handleEditGuardrail = (guardrail: PrivacyGuardrail) => {
    setEditingPolicyId(guardrail.id!);
    setNewTitle(guardrail.title);
    setNewRuleText(guardrail.ruleText);
    setNewFrameworkTags(guardrail.frameworkTags || []);
    setNewEnforcementScope(guardrail.enforcementScope || []);
    setReviewTags(null);
    setSkipAutoTagging(false);
    setShowAddModal(true);
  };

  const handleToggle = async (id: number, currentState: boolean) => {
    const existing = await db.privacy_guardrails.get(id);
    if (existing) {
      const updated = { ...existing, isActive: !currentState };
      await db.privacy_guardrails.update(id, { isActive: !currentState });
      await logForensicAudit('UPDATE', 'privacy_guardrails', id, existing, updated);
    }
    loadGuardrails();
  };

  const handleArchive = async (id: number) => {
    await archiveItem(id);
    loadGuardrails();
  };

  const handleDelete = async (id: number) => {
    await permanentDeleteItem(id);
    loadGuardrails();
  };

  const activeCount = guardrails.filter(g => g.isActive).length;
  
  // Extract unique tags for the filter dropdown
  const uniqueTags = Array.from(new Set(guardrails.flatMap(g => g.frameworkTags || []))).sort();
  
  const filteredGuardrails = guardrails
    .filter(filterByArchiveStatus)
    .filter(g => selectedTagFilter === 'ALL' || (g.frameworkTags && g.frameworkTags.includes(selectedTagFilter)));
    
  const totalPages = Math.ceil(filteredGuardrails.length / itemsPerPage) || 1;
  const paginatedGuardrails = filteredGuardrails.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleExport = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Title,Rule Text,Framework Tags,Enforcement Scope,Is Active\n"
      + filteredGuardrails.map(g => 
          `"${g.title.replace(/"/g, '""')}","${g.ruleText.replace(/"/g, '""')}","${(g.frameworkTags || []).join(', ')}","${(g.enforcementScope || []).join(', ')}",${g.isActive}`
        ).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "privacy_guardrails_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-4xl">
      <PageHeader 
        icon={<Lock className="text-emerald-500" />}
        title="Global Guardrails"
        description="Configure universal policies, privacy mappings, and architectural guardrails."
      />

      {/* Zero-PII Status Banner */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-400 mb-1">Zero-PII Mode Active</h3>
        <p className="text-sm text-emerald-700 dark:text-emerald-500/80">
          All architectural artifacts and review sessions are sanitized locally. External API calls (if any) strip all identifiable metadata automatically via the Zero-PII proxy engine.
        </p>
      </div>

      {/* ── Active Guardrails Section ───────────────────────── */}
      <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Shield size={16} className="text-blue-500" />
              Active Guardrails
              <span className="ml-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-[10px] font-bold">
                {activeCount} active
              </span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Rules injected into the AI system prompt before every inference call.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedTagFilter}
              onChange={(e) => setSelectedTagFilter(e.target.value)}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Tags</option>
              {uniqueTags.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                showArchived 
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              <Archive size={14} />
              {showArchived ? 'View Active' : 'View Archived'}
            </button>
            <button 
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium transition-colors"
            >
              <Download size={14} />
              Export CSV
            </button>
            <button 
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-medium transition-colors opacity-50 cursor-not-allowed"
              title="Import coming soon"
            >
              <Upload size={14} />
              Import
            </button>
            {!showArchived && (
              <button
                id="add-guardrail-btn"
                onClick={() => {
                  setEditingPolicyId(null);
                  setNewTitle('');
                  setNewRuleText('');
                  setNewFrameworkTags([]);
                  setNewEnforcementScope([]);
                  setReviewTags(null);
                  setSkipAutoTagging(false);
                  setShowAddModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
              >
                <Plus size={14} />
                Add Policy
              </button>
            )}
          </div>
        </div>

        {filteredGuardrails.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">
            {showArchived ? 'No archived guardrails.' : 'No guardrails configured. Add one to enforce compliance boundaries on AI output.'}
          </p>
        ) : (
          <>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {paginatedGuardrails.map(g => (
                <div key={g.id} className={`flex items-start gap-3 py-3 ${!g.isActive ? 'opacity-50' : ''}`}>
                  {/* Toggle */}
                  <button
                    onClick={() => handleToggle(g.id!, g.isActive)}
                    className="mt-0.5 shrink-0 text-gray-400 hover:text-blue-500 transition-colors"
                    title={g.isActive ? 'Disable guardrail' : 'Enable guardrail'}
                  >
                    {g.isActive
                      ? <ToggleRight size={22} className="text-blue-500" />
                      : <ToggleLeft size={22} className="text-gray-400" />
                    }
                  </button>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{g.title}</span>
                      {g.frameworkTags && g.frameworkTags.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-[10px] font-bold uppercase shrink-0">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{g.ruleText}</p>
                    {g.enforcementScope && g.enforcementScope.length > 0 && (
                      <div className="mt-2 flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Scope:</span>
                        {g.enforcementScope.map(scope => (
                          <span key={scope} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-[10px] font-medium">
                            {scope}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Archive / Restore / Delete */}
                  {showArchived ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => restoreItem(g.id!)}
                      className="mt-0.5 shrink-0 text-gray-400 hover:text-amber-500 transition-colors"
                      title="Restore guardrail"
                    >
                      <RefreshCw size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(g.id!)}
                      className="mt-0.5 shrink-0 text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete permanently"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEditGuardrail(g)}
                      className="mt-0.5 shrink-0 text-gray-400 hover:text-blue-500 transition-colors"
                      title="Edit guardrail"
                    >
                      <Edit2 size={15} />
                    </button>
                    <button
                      onClick={() => handleArchive(g.id!)}
                      disabled={g.isDefault}
                      className={`mt-0.5 shrink-0 transition-colors ${
                        g.isDefault
                          ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                          : 'text-gray-400 hover:text-red-500'
                      }`}
                      title={g.isDefault ? 'Default policies cannot be archived' : 'Archive guardrail'}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Pagination UI */}
          <div className="mt-4 px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex items-center justify-between rounded-b-xl -mx-6 -mb-6">
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Previous
              </button>
              <button 
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
        )}
      </div>

      {/* ── Add Guardrail Modal ─────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setShowAddModal(false)}>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-[95%] max-w-lg mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingPolicyId ? 'Edit Guardrail Policy' : 'New Guardrail Policy'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Close Modal" title="Close Modal">
                <X size={18} />
              </button>
            </div>

            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Policy Title</label>
            <input
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="e.g., No External Vendor Naming"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-4"
            />

            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Rule Text</label>
            <textarea
              value={newRuleText}
              onChange={e => setNewRuleText(e.target.value)}
              placeholder="The constraint that will be injected into the AI system prompt…"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-4 resize-none"
            />

            {reviewTags !== null && (
              <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 mb-2">Review Suggested Tags</h4>
                <p className="text-xs text-blue-700 dark:text-blue-400 mb-3">
                  The AI (or fallback heuristic) suggested the following tags based on your rule text. Do you want to apply them?
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {reviewTags.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded text-xs font-semibold">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setNewFrameworkTags(reviewTags);
                      setReviewTags(null);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Check size={16} />
                    Accept
                  </button>
                  <button
                    onClick={() => {
                      setReviewTags(null);
                      setSkipAutoTagging(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <X size={16} />
                    Reject
                  </button>
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Framework Tags</label>
              <CreatableDropdown
                value={newFrameworkTags}
                onChange={setNewFrameworkTags}
                options={frameworkOptions}
                categoryType="FrameworkTag"
                placeholder="Select or create tags (e.g., DPDP, SOC2)..."
                isMulti={true}
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Enforcement Scope</label>
              <CreatableDropdown
                value={newEnforcementScope}
                onChange={setNewEnforcementScope}
                options={scopeOptions}
                categoryType="EnforcementScope"
                placeholder="Where does this rule apply? (Default: GLOBAL)"
                isMulti={true}
              />
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => { setShowAddModal(false); setReviewTags(null); setSkipAutoTagging(false); }} className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors">Cancel</button>
              <button
                id="save-guardrail-btn"
                onClick={handleInitiateSave}
                disabled={!newTitle.trim() || !newRuleText.trim() || isAutoTagging || !isDirty || reviewTags !== null}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {isAutoTagging ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    AI Auto-Tagging...
                  </>
                ) : (
                  editingPolicyId ? 'Update Guardrail' : 'Save Guardrail'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-3 rounded-lg shadow-lg z-[100] flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
          <AlertTriangle size={16} className="text-amber-400 shrink-0" />
          <span className="text-sm font-medium">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-gray-400 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
