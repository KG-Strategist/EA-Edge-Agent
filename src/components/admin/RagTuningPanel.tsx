import { useState, useEffect, useCallback } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { getRagSetting, setRagSetting, RAG_SETTING_LIMITS, RagSettingKey } from '../../lib/ragSettings';
import { useNotification } from '../../context/NotificationContext';
import { Logger } from '../../lib/logger';

const FIELDS: { key: RagSettingKey; label: string; hint: string }[] = [
  {
    key: 'maxPromptChars',
    label: 'Max prompt chars',
    hint: `Prompt throttle for chat input (${RAG_SETTING_LIMITS.maxPromptChars.min}–${RAG_SETTING_LIMITS.maxPromptChars.max}).`,
  },
  {
    key: 'ragContextChars',
    label: 'RAG context chars',
    hint: `Stored context window per ingested record (${RAG_SETTING_LIMITS.ragContextChars.min}–${RAG_SETTING_LIMITS.ragContextChars.max}).`,
  },
];

/**
 * RagTuningPanel — Layer 1 admin editor for Stage 1.3 config-driven
 * intelligence. Reads via the ragSettings engine (compiled fallbacks when
 * keys are absent); writes are clamped engine-side. Values apply to new
 * prompts and new ingestions; AgentChat picks up maxPromptChars live.
 */
export default function RagTuningPanel() {
  const { addNotification } = useNotification();
  const [values, setValues] = useState<Record<RagSettingKey, string>>({
    maxPromptChars: String(RAG_SETTING_LIMITS.maxPromptChars.default),
    ragContextChars: String(RAG_SETTING_LIMITS.ragContextChars.default),
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [maxPromptChars, ragContextChars] = await Promise.all([
          getRagSetting('maxPromptChars'),
          getRagSetting('ragContextChars'),
        ]);
        if (!cancelled) {
          setValues({ maxPromptChars: String(maxPromptChars), ragContextChars: String(ragContextChars) });
        }
      } catch (e) {
        Logger.warn('[RagTuningPanel] failed to load tuning values', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(async () => {
    setError(null);
    const parsed = {} as Record<RagSettingKey, number>;
    for (const { key } of FIELDS) {
      const text = values[key].trim();
      const raw = Number(text);
      if (text === '' || !Number.isFinite(raw)) {
        setError('Enter a valid number for every field.');
        return;
      }
      parsed[key] = raw;
    }
    setSaving(true);
    try {
      await Promise.all(
        (Object.keys(parsed) as RagSettingKey[]).map((key) => setRagSetting(key, parsed[key]))
      );
      const refreshed = await Promise.all(
        (Object.keys(parsed) as RagSettingKey[]).map((key) => getRagSetting(key))
      );
      setValues({ maxPromptChars: String(refreshed[0]), ragContextChars: String(refreshed[1]) });
      addNotification('RAG tuning saved.', 'success', 4000);
    } catch (e) {
      Logger.warn('[RagTuningPanel] save failed', e);
      addNotification('Could not save tuning values.', 'error', 5000);
    } finally {
      setSaving(false);
    }
  }, [values, addNotification]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm shrink-0">
      <div className="flex items-center gap-3 mb-4">
        <SlidersHorizontal className="text-teal-500" size={20} />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">RAG Tuning</h3>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Hardware-agnostic throttling: tune prompt and ingestion budgets to match the device, from 8GB laptops to high-memory workstations.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key}>
            <label htmlFor={`rag-${key}`} className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              {label}
            </label>
            <input
              id={`rag-${key}`}
              aria-label={label}
              type="number"
              value={values[key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
              className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm"
              title={label}
            />
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{hint}</p>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-3">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save tuning'}
      </button>
    </div>
  );
}
