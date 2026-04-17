import { useState, useCallback, useEffect } from 'react';
import { ShieldAlert, Trash2, AlertTriangle, Plus, ToggleLeft, ToggleRight, Shield, X, Archive, RefreshCw } from 'lucide-react';
import { db, PrivacyGuardrail, logForensicAudit } from '../../lib/db';
import { logoutUser } from '../../lib/authEngine';
import { useStateContext } from '../../context/StateContext';
import { useArchive } from '../../hooks/useArchive';

const WIPE_CONFIRMATION_PHRASE = 'DELETE';

export default function ComplianceGuardrailsTab() {
  const { setIdentity } = useStateContext();

  // ── Guardrails CRUD State ──────────────────────────────────────────
  const [guardrails, setGuardrails] = useState<PrivacyGuardrail[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newRuleText, setNewRuleText] = useState('');

  // ── Archive Hook ───────────────────────────────────────────────────
  const { showArchived, setShowArchived, archiveItem, restoreItem, permanentDeleteItem, filterByArchiveStatus } = useArchive({
    tableName: 'privacy_guardrails',
    statusField: 'isActive',
    archivedValue: false,
    activeValue: true
  });

  // ── Global Wipe State ──────────────────────────────────────────────
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [isWiping, setIsWiping] = useState(false);
  const [wipeError, setWipeError] = useState('');

  const isConfirmValid = confirmInput === WIPE_CONFIRMATION_PHRASE;

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
  const handleAddGuardrail = async () => {
    const trimTitle = newTitle.trim();
    const trimRule = newRuleText.trim();
    if (!trimTitle || !trimRule) return;

    const newObj = {
      title: trimTitle,
      ruleText: trimRule,
      isDefault: false,
      isActive: true,
    };
    const newId = await db.privacy_guardrails.add(newObj);
    await logForensicAudit('CREATE', 'privacy_guardrails', newId, null, { ...newObj, id: newId });
    setNewTitle('');
    setNewRuleText('');
    setShowAddModal(false);
    loadGuardrails();
  };

  const handleToggle = async (id: number, currentState: boolean) => {
    if (currentState) {
      await archiveItem(id);
    } else {
      await restoreItem(id);
    }
    loadGuardrails();
  };

  const handleDelete = async (id: number) => {
    await permanentDeleteItem(id);
    loadGuardrails();
  };

  // ── Global Wipe Handler ────────────────────────────────────────────
  const handleGlobalWipe = useCallback(async () => {
    if (!isConfirmValid) return;
    setIsWiping(true);
    setWipeError('');

    try {
      const tables = db.tables;
      await db.transaction('rw', tables, async () => {
        for (const table of tables) {
          await table.clear();
        }
      });

      sessionStorage.clear();
      localStorage.clear();

      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      } catch (cacheErr) {
        console.warn('[DpdpTab] CacheStorage wipe partial:', cacheErr);
      }

      logoutUser();
      setIdentity(null);
    } catch (err) {
      console.error('[DpdpTab] Global Data Wipe failed:', err);
      setWipeError(err instanceof Error ? err.message : 'Wipe failed. Check console for details.');
      setIsWiping(false);
    }
  }, [isConfirmValid, setIdentity]);

  const handleCloseWipeModal = () => {
    setShowWipeModal(false);
    setConfirmInput('');
    setWipeError('');
  };

  const activeCount = guardrails.filter(g => g.isActive).length;
  const filteredGuardrails = guardrails.filter(filterByArchiveStatus);

  return (
    <div className="w-full max-w-4xl">
      {/* Page Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ShieldAlert className="text-emerald-500" />
          Compliance & Guardrails
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure global privacy mappings, guardrails, and anonymization policies.</p>
      </div>

      {/* Zero-PII Status Banner */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-400 mb-1">Zero-PII Mode Active</h3>
        <p className="text-sm text-emerald-700 dark:text-emerald-500/80">
          All architectural artifacts and review sessions are sanitized locally. External API calls (if any) strip all identifiable metadata automatically via the Zero-PII proxy engine.
        </p>
      </div>

      {/* ── Active Privacy Guardrails Section ───────────────────────── */}
      <div className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Shield size={16} className="text-blue-500" />
              Privacy Guardrails
              <span className="ml-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-[10px] font-bold">
                {activeCount} active
              </span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Rules injected into the AI system prompt before every inference call.
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            {!showArchived && (
              <button
                id="add-guardrail-btn"
                onClick={() => setShowAddModal(true)}
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
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredGuardrails.map(g => (
              <div key={g.id} className={`flex items-start gap-3 py-3 ${!g.isActive ? 'opacity-50' : ''}`}>
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(g.id!, g.isActive)}
                  className="mt-0.5 shrink-0 text-gray-400 hover:text-blue-500 transition-colors"
                  title={g.isActive ? 'Archive guardrail' : 'Restore guardrail'}
                >
                  {g.isActive
                    ? <ToggleRight size={22} className="text-blue-500" />
                    : <RefreshCw size={18} className="text-amber-500" />
                  }
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{g.title}</span>
                    {g.isDefault && (
                      <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded text-[10px] font-bold uppercase shrink-0">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{g.ruleText}</p>
                </div>

                {/* Delete (disabled for defaults) */}
                <button
                  onClick={() => handleDelete(g.id!)}
                  disabled={g.isDefault}
                  className={`mt-0.5 shrink-0 transition-colors ${
                    g.isDefault
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                      : 'text-gray-400 hover:text-red-500'
                  }`}
                  title={g.isDefault ? 'Default policies cannot be deleted' : 'Delete permanently'}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Danger Zone ─────────────────────────────────────────────── */}
      <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-red-800 dark:text-red-400 mb-1">Danger Zone — Global Data Wipe</h3>
            <p className="text-sm text-red-700 dark:text-red-500/80 mb-4">
              Irreversibly destroy <strong>all</strong> local data: IndexedDB tables, cached AI model weights (OPFS/CacheStorage), session tokens, and local preferences.
            </p>
            <button
              id="global-data-wipe-trigger"
              onClick={() => setShowWipeModal(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Trash2 size={14} />
              Initiate Global Data Wipe
            </button>
          </div>
        </div>
      </div>

      {/* ── Add Guardrail Modal ─────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setShowAddModal(false)}>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 w-[95%] max-w-lg mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">New Privacy Guardrail</h3>
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

            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors">Cancel</button>
              <button
                id="save-guardrail-btn"
                onClick={handleAddGuardrail}
                disabled={!newTitle.trim() || !newRuleText.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                Save Guardrail
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Wipe Confirmation Modal ────────────────────────────────── */}
      {showWipeModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]" onClick={handleCloseWipeModal}>
          <div className="bg-white dark:bg-gray-900 border border-red-300 dark:border-red-800 rounded-xl p-6 w-[95%] max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Confirm Global Data Wipe</h3>
                <p className="text-xs text-red-600 dark:text-red-400 font-medium">This action is permanent and irreversible.</p>
              </div>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">This will destroy all data stored by EA-NITI in this browser:</p>
            <ul className="text-xs text-gray-500 dark:text-gray-500 mb-5 space-y-1 list-disc pl-4">
              <li>All IndexedDB tables (reviews, principles, domains, threat models, guardrails…)</li>
              <li>Cached AI model weights (OPFS / CacheStorage)</li>
              <li>Session tokens, preferences, and audit logs</li>
              <li>Enterprise knowledge embeddings</li>
            </ul>

            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Type <code className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded text-xs font-bold">DELETE</code> to confirm:
            </label>
            <input
              id="global-wipe-confirm-input"
              type="text"
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              placeholder="Type DELETE here"
              autoFocus
              autoComplete="off"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none mb-2"
            />

            {wipeError && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{wipeError}</p>}

            <div className="flex justify-end gap-3 mt-4">
              <button onClick={handleCloseWipeModal} disabled={isWiping} className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors text-sm">Cancel</button>
              <button
                id="global-wipe-execute-btn"
                onClick={handleGlobalWipe}
                disabled={!isConfirmValid || isWiping}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {isWiping ? (
                  <>
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Wiping…
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    Wipe All Data
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
