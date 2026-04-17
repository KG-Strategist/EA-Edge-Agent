import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { PlusCircle, Search, Trash2, FileText, Download, ClipboardCheck } from 'lucide-react';
import IntakeWizard from './IntakeWizard';
import ConfirmModal from '../components/ui/ConfirmModal';
import { downloadAsMarkdown } from '../lib/exportEngine';
import PageHeader from '../components/ui/PageHeader';

export default function ArchitectureReviews({ setCurrentView: _setCurrentView, setCurrentSessionId: _setCurrentSessionId }: { setCurrentView: (v: string) => void, setCurrentSessionId: (id: number) => void }) {
  const [showWizard, setShowWizard] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const sessions = useLiveQuery(() => db.review_sessions.reverse().toArray());

  const handleDelete = async () => {
    if (deleteId) {
       await db.review_sessions.delete(deleteId);
       setDeleteId(null);
    }
  };

  const handleExport = (session: any) => {
    if (session.reportMarkdown) {
      downloadAsMarkdown(session.reportMarkdown, `${session.projectName || 'Review'}_Report.md`);
    } else {
      alert("No report generated for this session yet.");
    }
  };

  if (showWizard) {
    return (
      <div className="relative">
        <button 
          onClick={() => setShowWizard(false)}
          className="absolute -top-12 left-0 text-sm hover:text-blue-600 transition-colors"
        >
          &larr; Back to Reviews
        </button>
        <IntakeWizard onClose={() => setShowWizard(false)} />
      </div>
    );
  }

  return (
    <div className="w-full flex-1 flex flex-col min-h-0">
      <PageHeader 
        icon={<ClipboardCheck className="text-blue-500" />}
        title="Architecture Reviews"
        description="Manage and track local architecture assessment scopes."
        action={
          <button 
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium shadow-sm"
          >
            <PlusCircle size={18} />
            New Review
          </button>
        }
      />

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm flex-1 flex flex-col min-h-0 mb-4">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50 shrink-0">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search reviews..." 
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-shadow text-sm text-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse min-w-full">
            <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-800/80 backdrop-blur-sm shadow-[0_1px_0_0_theme(colors.gray.200)] dark:shadow-[0_1px_0_0_theme(colors.gray.700)]">
              <tr className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="px-6 py-3 font-medium">Project Name</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {sessions?.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        <FileText size={16} />
                      </div>
                      <div className="font-medium text-gray-900 dark:text-white truncate max-w-xs">{s.projectName}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">{s.type || '-'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium border ${
                      s.status === 'Completed' ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20' :
                      s.status === 'Draft' ? 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/20' :
                      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20'
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                       <button onClick={() => handleExport(s)} className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors" title="Export Markdown">
                         <Download size={18} />
                       </button>
                       <button onClick={() => setDeleteId(s.id!)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors" title="Delete">
                         <Trash2 size={18} />
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sessions?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500">
                    No architecture reviews found. Start a new intake process.
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
        title="Delete Review Session"
        message="Are you sure you want to delete this session? All uploaded artifacts and generated reports belonging to this session will be permanently deleted from the local database. This action cannot be undone."
      />
    </div>
  );
}
