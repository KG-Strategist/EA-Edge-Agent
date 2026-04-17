import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { PlusCircle, Search, Trash2, Edit, ShieldAlert, Shield } from 'lucide-react';
import ThreatEditor from './ThreatEditor';
import ConfirmModal from '../components/ui/ConfirmModal';
import PageHeader from '../components/ui/PageHeader';

export default function ThreatModeling() {
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<number | undefined>();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const models = useLiveQuery(() => db.threat_models.reverse().toArray());

  const handleDelete = async () => {
    if (deleteId) {
       await db.threat_models.delete(deleteId);
       setDeleteId(null);
    }
  };

  if (showEditor) {
    return (
      <div className="relative">
        <button 
          onClick={() => {
            setShowEditor(false);
            setEditingId(undefined);
          }}
          className="absolute -top-12 left-0 text-sm hover:text-blue-600 transition-colors"
        >
          &larr; Back to Threat Models
        </button>
        <ThreatEditor onClose={() => {
          setShowEditor(false);
          setEditingId(undefined);
        }} modelId={editingId} />
      </div>
    );
  }

  return (
    <div className="w-full flex-1 flex flex-col min-h-0">
      <PageHeader 
        icon={<Shield className="text-red-500" />}
        title="Threat Modeling"
        description="Manage and track STRIDE threat models."
        action={
          <button 
            onClick={() => {
              setEditingId(undefined);
              setShowEditor(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-sm"
          >
            <PlusCircle size={18} />
            New Threat Model
          </button>
        }
      />

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm flex-1 flex flex-col min-h-0 mb-4">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50 shrink-0">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search threat models..." 
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-shadow text-sm text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse min-w-full">
            <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800/80 backdrop-blur-sm shadow-[0_1px_0_0_theme(colors.gray.200)] dark:shadow-[0_1px_0_0_theme(colors.gray.700)]">
              <tr className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-6 py-3 font-medium">Project Name</th>
                <th className="px-6 py-3 font-medium">Session ID Link</th>
                <th className="px-6 py-3 font-medium">Components</th>
                <th className="px-6 py-3 font-medium">Threats</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {models?.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                        <ShieldAlert size={16} />
                      </div>
                      <div className="font-medium text-gray-900 dark:text-white truncate max-w-xs">{m.projectName}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{m.sessionId ? `Session #${m.sessionId}` : 'Standalone'}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">{m.componentCount ?? m.components?.length ?? 0}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-600 dark:text-gray-300">{m.threatCount ?? m.threats?.length ?? 0}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                       <button onClick={() => {
                         setEditingId(m.id);
                         setShowEditor(true);
                       }} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors" title="Edit Model">
                         <Edit size={18} />
                       </button>
                       <button onClick={() => setDeleteId(m.id!)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors" title="Delete">
                         <Trash2 size={18} />
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
              {models?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500">
                    No threat models found. Start a new threat modeling session.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!deleteId}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Threat Model"
        message="Are you sure you want to delete this threat model?"
      />
    </div>
  );
}
