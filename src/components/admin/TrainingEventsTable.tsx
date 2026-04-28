import React, { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { useArchive } from '../../hooks/useArchive';
import { initiateTrainingJob } from '../../lib/knowledgeIngestionEngine';
import { Database, Plus, CheckCircle2, XCircle, Clock, Loader2, Link2, Calendar, Download, Trash2, FileText, Type, Archive, BookOpen } from 'lucide-react';
import PageHeader from '../ui/PageHeader';
import DataTable, { DataTableColumn, DataTableAction } from '../ui/DataTable';

export default function TrainingEventsTable() {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const jobs = useLiveQuery(() => db.training_jobs.orderBy('startedAt').reverse().toArray()) || [];
  const knowledgeChunks = useLiveQuery(() => db.enterprise_knowledge.toArray()) || [];
  const knowledgeCount = knowledgeChunks.length;

  const { archiveItem: purgeDocument } = useArchive({
    tableName: 'training_jobs',
    statusField: 'status',
    archivedValue: 'PURGED',
    activeValue: 'Completed',
    isRagEntity: true
  });

  const [isFreeTextModalOpen, setIsFreeTextModalOpen] = useState(false);
  const [freeTextName, setFreeTextName] = useState('');
  const [freeTextContent, setFreeTextContent] = useState('');

  const [showArchived, setShowArchived] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredJobs = jobs.filter(job => {
      if (showArchived) {
         if (job.status !== 'PURGED') return false;
      } else {
         if (job.status === 'PURGED') return false;
      }

      const jobDate = new Date(job.startedAt);
      if (startDate && jobDate < new Date(startDate)) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (jobDate > end) return false;
      }
      return true;
  });

  // Adding formatted fields to jobs for searchability in DataTable
  const jobsWithSearchFields = filteredJobs.map(job => ({
    ...job,
    latestLog: job.logs[job.logs.length - 1] || '',
  }));

  const handleExportCSV = () => {
    const headers = ['Timestamp,Data Source,Status,Latest Log'];
    const rows = filteredJobs.map(job => {
      const logString = (job.logs[job.logs.length - 1] || '').replace(/"/g, '""');
      return `"${new Date(job.startedAt).toISOString()}","${job.filename}","${job.status}","${logString}"`;
    });
    const csvContent = headers.concat(rows).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'niti_knowledge_ingestion_log.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const registryMap = new Map<string, { filename: string, type: string, chunks: number }>();
  knowledgeChunks.forEach(doc => {
      const type = doc.sourceType || 'MD'; 
      if (!registryMap.has(doc.sourceFile)) {
         registryMap.set(doc.sourceFile, { filename: doc.sourceFile, type: type, chunks: 0 });
      }
      registryMap.get(doc.sourceFile)!.chunks++;
  });
  
  const displayRegistryItems = showArchived 
     ? Array.from(new Set(jobs.filter(j => j.status === 'PURGED').map(j => j.filename))).map(filename => {
         const type = filename.split('.').pop()?.toUpperCase() || 'UNKNOWN';
         return { filename, type: type, chunks: 0 };
       })
     : Array.from(registryMap.values());

  const handlePurgeDocument = async (filename: string) => {
    if (!confirm(`Are you sure you want to purge all indexed chunks for "${filename}"? This will remove it from the vector database.`)) return;
    try {
        await purgeDocument(filename);
    } catch (e) {
        alert("Failed to purge document: " + e);
    }
  };

  const handleFreeTextSubmit = async () => {
    if (!freeTextName || !freeTextContent) return;
    const blob = new Blob([freeTextContent], { type: 'text/plain' });
    const file = new File([blob], `${freeTextName}.txt`, { type: 'text/plain' });
    
    setIsFreeTextModalOpen(false);
    setIsUploading(true);
    try {
      await initiateTrainingJob(file, () => {});
    } catch (e) {
      console.error(e);
    } finally {
      setIsUploading(false);
      setFreeTextName('');
      setFreeTextContent('');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // QA Audit - Strict File Extension Validation
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['pdf', 'md', 'txt', 'csv', 'docx'].includes(ext)) {
      alert("Unsupported binary format. Please convert to .docx or .csv.");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsUploading(true);
    try {
      await initiateTrainingJob(file, () => {
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

  // --- Data Table Configurations ---
  
  const jobsColumns: DataTableColumn<any>[] = [
    {
      key: 'startedAt',
      label: 'Timestamp',
      sortable: true,
      render: (row) => <span className="text-gray-600 dark:text-gray-400 font-mono text-xs">{new Date(row.startedAt).toLocaleString()}</span>
    },
    {
      key: 'filename',
      label: 'Data Source',
      sortable: true,
      render: (row) => <span className="text-gray-900 dark:text-white font-medium">{row.filename}</span>
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusStyle(row.status)}`}>
          {getStatusIcon(row.status)}
          {row.status}
        </span>
      )
    },
    {
      key: 'latestLog',
      label: 'Latest Log',
      sortable: true,
      className: 'truncate max-w-xs xl:max-w-md',
      render: (row) => <span className="text-gray-600 dark:text-gray-400 font-mono text-xs" title={row.latestLog}>{row.latestLog}</span>
    }
  ];

  const registryColumns: DataTableColumn<any>[] = [
    {
      key: 'filename',
      label: 'Document Name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2 text-gray-900 dark:text-white font-medium">
          <FileText size={16} className="text-gray-400" />
          {row.filename}
        </div>
      )
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      render: (row) => (
        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
          {row.type}
        </span>
      )
    },
    {
      key: 'chunks',
      label: 'Chunks Indexed',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
          {showArchived ? <span className="text-gray-400 line-through">0 Chunks (Purged)</span> : `${row.chunks} Chunks`}
        </span>
      )
    }
  ];

  const registryActions: DataTableAction<any>[] = showArchived ? [] : [
    {
      label: 'Purge',
      icon: <div className="flex items-center gap-1"><Trash2 size={14} /> Purge</div>,
      onClick: (row) => handlePurgeDocument(row.filename),
      className: 'text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs font-semibold transition-colors',
      title: () => 'Purge document'
    }
  ];

  return (
    <div className="space-y-8">
      <PageHeader 
        icon={<BookOpen className="text-indigo-500" />}
        title="Enterprise Knowledge Ingestion"
        description="Train EA-NITI on your proprietary architecture standards via Local Offline RAG."
        action={
          <div className="flex items-center gap-1 font-mono text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full">
            <Link2 size={12} /> {knowledgeCount} semantic chunks indexed
          </div>
        }
      />

      {/* Task 1: Training Jobs Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Database className="text-indigo-500" />
              Ingestion Controls
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Upload documents or paste text to seed the local vector store.
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 mb-1 justify-end">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".pdf,.md,.txt,.csv,.docx" 
                className="hidden" 
                disabled={isUploading}
                aria-label="Upload Training File"
                title="Upload File"
              />
              <button 
                onClick={() => setIsFreeTextModalOpen(true)}
                disabled={isUploading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 disabled:opacity-50 rounded-lg font-medium transition-colors border border-gray-300 dark:border-gray-700"
              >
                <Type size={16} />
                Paste Free Text
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors shadow-md shadow-indigo-500/20"
              >
                {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                Train EA-NITI
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mr-1 mt-2 tracking-wide font-medium bg-gray-100 dark:bg-gray-800/80 inline-block px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">Supported: .PDF, .MD, .TXT, .CSV, .DOCX</p>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
           <div className="flex flex-wrap items-center gap-3">
             <div className="flex items-center gap-2 relative">
               <Calendar size={14} className="absolute left-2.5 top-2 text-gray-400" />
               <input 
                 type="date"
                 value={startDate}
                 onChange={e => setStartDate(e.target.value)}
                 className="pl-8 pr-2 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md outline-none text-gray-800 dark:text-gray-200"
                 aria-label="Start date"
                 title="Start date"
                 placeholder="Start date"
               />
               <span className="text-gray-400 text-xs">-</span>
               <input 
                 type="date"
                 value={endDate}
                 onChange={e => setEndDate(e.target.value)}
                 className="px-2 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md outline-none text-gray-800 dark:text-gray-200"
                 aria-label="End date"
                 title="End date"
                 placeholder="End date"
               />
             </div>
             <button 
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-xs font-semibold transition-colors shadow-sm"
             >
               <Download size={14} />
               Export CSV
             </button>
           </div>
        </div>

        <DataTable
          exportable={true}
          exportFilename="niti-training-events.json"
          data={jobsWithSearchFields}
          columns={jobsColumns}
          keyField="id"
          pagination={true}
          searchable={true}
          searchFields={['filename', 'status', 'latestLog']}
          emptyMessage="No training jobs submitted or found in this date range."
        />
      </div>

      {/* Task 2: Indexed Document Registry */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm mt-8">
        <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="text-blue-500" size={18} />
            Indexed Document Registry
          </h3>
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
        </div>
        
        <DataTable
          exportable={true}
          exportFilename="niti-knowledge-registry.json"
          data={displayRegistryItems}
          columns={registryColumns}
          actions={registryActions}
          keyField="filename"
          pagination={true}
          searchable={true}
          searchFields={['filename', 'type']}
          emptyMessage={showArchived ? "No purged documents found." : "Vector database is empty."}
        />
      </div>

      {isFreeTextModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-2xl w-full flex flex-col overflow-hidden border border-gray-200 dark:border-gray-800 shadow-2xl">
            <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <h3 className="font-bold flex items-center gap-2 dark:text-white">
                <Type size={18} className="text-indigo-500" />
                Ingest Free Text Snippet
              </h3>
              <button onClick={() => setIsFreeTextModalOpen(false)} className="text-gray-400 hover:text-gray-700 dark:hover:text-white" aria-label="Close free text modal" title="Close"><XCircle size={20} /></button>
            </div>
            <div className="p-5 flex-1 overflow-y-auto">
              <div className="mb-4">
                 <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Snippet Name</label>
                 <input type="text" placeholder="e.g. Q3 Architecture Memo" value={freeTextName} onChange={e => setFreeTextName(e.target.value)} className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md py-2 px-3 focus:outline-none focus:border-indigo-500 dark:text-white text-sm" />
              </div>
              <div>
                 <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Raw Content</label>
                 <textarea rows={10} placeholder="Paste raw unstructured text here... It will automatically be chunked and vectorized." value={freeTextContent} onChange={e => setFreeTextContent(e.target.value)} className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md py-2 px-3 focus:outline-none focus:border-indigo-500 dark:text-white text-sm custom-scrollbar" />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30 flex justify-end gap-3">
              <button onClick={() => setIsFreeTextModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg">Cancel</button>
              <button 
                onClick={handleFreeTextSubmit} 
                disabled={!freeTextName || !freeTextContent || isUploading}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2"
              >
                {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Vectorize snippet
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
