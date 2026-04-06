import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { Shield } from 'lucide-react';

export default function UserAccessTab() {
  const users = useLiveQuery(() => db.users.toArray());

  return (
    <div className="w-full max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Shield className="text-blue-500" />
          User Access Management
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage local offline identities (Zero-PII architecture).</p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Registered Local Identities</h3>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-100 dark:bg-gray-900/50">
            <tr>
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Pseudonym</th>
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Created At</th>
              <th className="px-5 py-3 font-medium text-gray-500 dark:text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {users?.map(u => (
              <tr key={u.pseudokey} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-5 py-4 font-mono font-medium text-gray-900 dark:text-white">{u.pseudokey}</td>
                <td className="px-5 py-4 text-gray-500 dark:text-gray-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-5 py-4 text-green-600 dark:text-green-400 text-xs font-bold uppercase tracking-wider">Active</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
