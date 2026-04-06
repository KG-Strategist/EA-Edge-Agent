import React from 'react';
import { ShieldAlert } from 'lucide-react';

export default function DpdpTab() {
  return (
    <div className="w-full max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ShieldAlert className="text-emerald-500" />
          DPDP & Privacy Controls
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure global privacy mappings and anonymization policies.</p>
      </div>

      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-6">
        <h3 className="text-sm font-bold text-emerald-800 dark:text-emerald-400 mb-2">Zero-PII Mode Active</h3>
        <p className="text-sm text-emerald-700 dark:text-emerald-500/80 mb-4">
          All architectural artifacts and review sessions are sanitized locally. External API calls (if any) strip all identifiable metadata automatically via the Zero-PII proxy engine.
        </p>
        <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors cursor-not-allowed opacity-50" disabled>
          Global Data Wipe (Disabled in UI)
        </button>
      </div>

    </div>
  );
}
