import { useState, useCallback, useEffect, useMemo } from 'react';
import { Trash2, Plus, ToggleLeft, ToggleRight, Shield, X, Archive, Lock, Edit2, Check } from 'lucide-react';
import { db, PrivacyGuardrail, logForensicAudit } from '../../lib/db';
import { useArchive } from '../../hooks/useArchive';
import { generateReview, isModelCached, getActiveModelId } from '../../lib/aiEngine';
import PageHeader from '../ui/PageHeader';
import { Logger } from '../../lib/logger';
import DataTable, { DataTableColumn, DataTableAction } from '../ui/DataTable';
import { useNotification } from '../../context/NotificationContext';

export default function GlobalGuardrailsTab() {
  const { addNotification } = useNotification();
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

  // ── Table Columns & Actions ───────────────────────────────────────
  const columns: DataTableColumn<PrivacyGuardrail>[] = [
    {
      key: 'title',
      label: 'Title',
      sortable: true,
      render: (row) => <span className="font-medium">{row.title}</span>,
    },
    {
      key: 'frameworkTags',
      label: 'Tags',
      sortable: true,
      render: (row) => (
        <>
          {row.frameworkTags?.map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-bold mr-1">{tag}</span>
          ))}
        </>
      ),
    },
    {
      key: 'ruleText',
      label: 'Rule',
      render: (row) => <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{row.ruleText}</p>,
    },
    {
      key: 'enforcementScope',
      label: 'Scope',
      sortable: true,
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.enforcementScope?.map(scope => (
            <span key={scope} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded text-xs">{scope}</span>
          ))}
        </div>
      ),
    },
    {
      key: 'isActive',
      label: 'Active',
      sortable: true,
      render: (row) => (
        <button
          onClick={() => handleToggle(row.id!, row.isActive)}
          className="text-gray-400 hover:text-blue-500"
          title={row.isActive ? 'Disable' : 'Enable'}
        >
          {row.isActive ? <ToggleRight size={22} className="text-blue-500" /> : <ToggleLeft size={22} className="text-gray-400" />}
        </button>
      ),
    },
  ];

  const actions: DataTableAction<PrivacyGuardrail>[] = [
    {
      label: 'Edit',
      icon: <Edit2 size={16} />, // Edit2 imported above
      onClick: (row) => handleEditGuardrail(row),
    },
    {
      label: 'Archive',
      icon: <Archive size={16} />, // Archive imported above
      onClick: (row) => handleArchive(row.id!),
      disabled: (row) => row.isDefault,
      title: (row) => row.isDefault ? 'Default policies cannot be archived' : 'Archive guardrail',
    },
    {
      label: 'Delete',
      icon: <Trash2 size={16} className="text-red-500" />, // Trash2 imported above
      onClick: (row) => handleDelete(row.id!),
      disabled: (row) => row.isDefault,
      title: (row) => row.isDefault ? 'Cannot delete default' : 'Delete permanently',
    },
  ];

  // ── Archive Hook ───────────────────────────────────────────────────
  const { showArchived, setShowArchived, archiveItem, permanentDeleteItem, filterByArchiveStatus } = useArchive({
    tableName: 'privacy_guardrails',
    statusField: 'isArchived',
    archivedValue: true,
    activeValue: false,
  });

  // ── Filter State ───────────────────────────────────────────────────
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('ALL');

  // ── Load guardrails from Dexie ─────────────────────────────────────
  const loadGuardrails = useCallback(async () => {
    try {
      const data = await db.privacy_guardrails.toArray();
      setGuardrails(data);
    } catch (e) {
      Logger.info('[GlobalGuardrailsTab] Failed to load guardrails:', e);
    }
  }, []);

  useEffect(() => { loadGuardrails(); }, [loadGuardrails]);

  // ── CRUD Handlers ──────────────────────────────────────────────────
  const executeSave = async (tagsToSave: string[]) => {
    const trimTitle = newTitle.trim();
    const trimRule = newRuleText.trim();
    if (!trimTitle || !trimRule) return;

    // Ensure tags exist in master categories
    for (const tag of tagsToSave) {
      const existingTag = await db.master_categories.where('name').equals(tag).first();
      if (!existingTag) {
        await db.master_categories.add({ name: tag, type: 'FrameworkTag', status: 'Active' });
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
          enforcementScope: newEnforcementScope.length > 0 ? newEnforcementScope : ['GLOBAL'],
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
        enforcementScope: newEnforcementScope.length > 0 ? newEnforcementScope : ['GLOBAL'],
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
        const tinyModelId = await getActiveModelId('Tiny');
        const isCached = await isModelCached(tinyModelId);
        if (!isCached || !navigator.onLine) {
          Logger.info('AI Model not cached or offline. Bypassing AI auto-tagging.');
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
        Logger.info('Auto-tagging failed, falling back to heuristic:', e);
        aiFailed = true;
      } finally {
        setIsAutoTagging(false);
      }

      if (generatedTags.length === 0) {
        const existingFrameworkTags = await db.master_categories.where('type').equals('FrameworkTag').toArray();
        const combinedTextLower = `${trimTitle} ${trimRule}`.toLowerCase();
        generatedTags = existingFrameworkTags
          .filter(cat => combinedTextLower.includes(cat.name.toLowerCase()))
          .map(cat => cat.name);
      }

      if (generatedTags.length > 0) {
        setReviewTags(generatedTags);
        return;
      } else {
        await executeSave([]);
        if (aiFailed) {
          setToastMessage('Policy saved. Auto-tagging unavailable (AI offline and no keyword matches).');
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

  // ── Filtered data (no manual pagination) ────────────────────────
  const filteredGuardrails = guardrails
    .filter(filterByArchiveStatus)
    .filter(g => selectedTagFilter === 'ALL' || (g.frameworkTags && g.frameworkTags.includes(selectedTagFilter)));

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

      {/* Active Guardrails Section */}
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
              onChange={e => setSelectedTagFilter(e.target.value)}
              aria-label="Filter guardrails by tag"
              title="Filter guardrails by tag"
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Tags</option>
              {Array.from(new Set(guardrails.flatMap(g => g.frameworkTags || []))).sort().map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${showArchived
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}
            >
              <Archive size={14} />
              {showArchived ? 'View Active' : 'View Archived'}
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
                <Plus size={14} /> Add Policy
              </button>
            )}
          </div>
        </div>

        {/* DataTable displaying guardrails */}
        <DataTable
          data={filteredGuardrails}
          keyField="id"
          columns={columns}
          actions={actions}
          searchable={true}
          searchFields={['title', 'ruleText', 'frameworkTags', 'enforcementScope']}
          pagination={true}
          itemsPerPage={5}
          exportable={true}
          exportFilename="niti-guardrails.json"
          onImport={async (parsedData) => {
            try {
              await db.privacy_guardrails.bulkPut(parsedData);
              addNotification('Import successful!', 'success', 3000);
            } catch {
              addNotification('Import failed.', 'error');
            }
          }}
          emptyMessage={showArchived ? 'No archived guardrails.' : 'No guardrails configured. Add one to enforce compliance boundaries on AI output.'}
        />
      </div>

      {/* Add Guardrail Modal */}
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
                    <span key={tag} className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded text-xs font-semibold">{tag}</span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setNewFrameworkTags(reviewTags); setReviewTags(null); }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Check size={16} /> Accept
                  </button>
                  <button
                    onClick={() => { setReviewTags(null); setSkipAutoTagging(true); }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded-lg text-sm font-medium transition-colors"
                  >
                    <X size={16} /> Decline
                  </button>
                </div>
              </div>
            )}

            {/* Tag and Scope selectors could be added here */}

            <div className="flex justify-end gap-2">
              <button
                onClick={handleInitiateSave}
                disabled={isAutoTagging || !isDirty}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAutoTagging ? 'Tagging...' : editingPolicyId ? 'Update Guardrail' : 'Create Guardrail'}
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Message */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg">
          {toastMessage}
        </div>
      )}
    </div>
  );
}