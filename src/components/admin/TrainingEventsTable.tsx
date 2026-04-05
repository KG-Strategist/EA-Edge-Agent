import React, { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { initiateTrainingJob } from '../../lib/knowledgeIngestionEngine';
import { Database, Plus, RefreshCcw, CheckCircle2, XCircle, Clock, Loader2, Link2 } from 'lucide-react';

export default function TrainingEventsTable() {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const jobs = useLiveQuery(() => db.training_jobs.orderBy('startedAt').reverse().toArray()) || [];
  const knowledgeCount = useLiveQuery(() => db.enterprise_knowledge.count()) || 0;

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await initiateTrainingJob(file, (progress) => {
        // the knowledgeIngestionEngine takes care of writing to the DB
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Completed': return <CheckCircle2 size={16} className="text-green-500" />;
      case 'Failed': return <XCircle size={16} className="text-red-500" />;
      case 'Processing': return <Loader2 size={16} className="text-blue-500 animate-spin" />;
      case 'Pending': return <Clock size={16} className="text-gray-400" />;
      default: return null;
    }
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Completed': return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400';
      case 'Failed': return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
      case 'Processing': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400';
      case 'Pending': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Database className="text-indigo-500" />
            Enterprise Knowledge Ingestion
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Train EA-NITI on your proprietary architecture standards via Local Offline RAG.
            <span className="ml-2 inline-flex items-center gap-1 font-mono text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full">
              <Link2 size={12} /> {knowledgeCount} semantic chunks indexed
            </span>
          </p>
        </div>
        <div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept=".md,.txt,.pdf,.csv" 
            className="hidden" 
            disabled={isUploading}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors shadow-md shadow-indigo-500/20"
          >
            {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            Train EA-NITI on Enterprise Context
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 uppercase text-xs">
            <tr>
              <th className="px-6 py-3 font-semibold tracking-wider">Timestamp</th>
              <th className="px-6 py-3 font-semibold tracking-wider">Data Source</th>
              <th className="px-6 py-3 font-semibold tracking-wider">Status</th>
              <th className="px-6 py-3 font-semibold tracking-wider">Latest Log</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                  <RefreshCcw className="mx-auto mb-3 text-gray-400 dark:text-gray-600" size={32} />
                  No training jobs submitted yet. Provide PDFs or Markdown files to begin.
                </td>
              </tr>
            ) : (
              jobs.map(job => (
                <tr key={job.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600 dark:text-gray-400 font-mono text-xs">
                    {new Date(job.startedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white font-medium">
                    {job.filename}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusStyle(job.status)}`}>
                      {getStatusIcon(job.status)}
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400 truncate max-w-xs xl:max-w-md font-mono text-xs" title={job.logs[job.logs.length - 1]}>
                    {job.logs[job.logs.length - 1]}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
