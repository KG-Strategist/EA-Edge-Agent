import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { PlusCircle, Trash2, Edit, ShieldAlert, Shield } from 'lucide-react';
import ThreatEditor from './ThreatEditor';
import ConfirmModal from '../components/ui/ConfirmModal';
import PageHeader from '../components/ui/PageHeader';
import DataTable, { DataTableColumn, DataTableAction } from '../components/ui/DataTable';
import { useNotification } from '../context/NotificationContext';

export default function ThreatModeling() {
  const { addNotification } = useNotification();
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

  const columns: DataTableColumn<any>[] = [
    {
      key: 'projectName',
      label: 'Project Name',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
            <ShieldAlert size={16} />
          </div>
          <div className="font-medium text-gray-900 dark:text-white truncate max-w-xs">{row.projectName}</div>
        </div>
      )
    },
    {
      key: 'sessionId',
      label: 'Session ID Link',
      sortable: true,
      render: (row) => <span className="text-sm text-gray-600 dark:text-gray-300">{row.sessionId ? `Session #${row.sessionId}` : 'Standalone'}</span>
    },
    {
      key: 'components',
      label: 'Components',
      sortable: true,
      render: (row) => <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">{row.componentCount ?? row.components?.length ?? 0}</span>
    },
    {
      key: 'threats',
      label: 'Threats',
      sortable: true,
      render: (row) => <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">{row.threatCount ?? row.threats?.length ?? 0}</span>
    },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (row) => <span className="text-sm text-gray-500 dark:text-gray-400">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '-'}</span>
    }
  ];

  const actions: DataTableAction<any>[] = [
    {
      label: 'Edit',
      icon: <Edit size={18} />,
      onClick: (row) => {
        setEditingId(row.id);
        setShowEditor(true);
      },
      className: 'p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors'
    },
    {
      label: 'Delete',
      icon: <Trash2 size={18} />,
      onClick: (row) => setDeleteId(row.id!),
      className: 'p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors'
    }
  ];

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
        <DataTable 
          searchable={true} 
          searchFields={['projectName']} 
          columns={columns} 
          data={models || []} 
          keyField="id" 
          actions={actions} 
          emptyMessage="No threat models found." 
          containerClassName="flex-1" 
          exportable={true}
          exportFilename="niti-threat-models.json"
          onImport={async (parsedData) => {
            try {
              await db.threat_models.bulkPut(parsedData);
              addNotification('Import successful!', 'success', 3000);
            } catch {
              addNotification('Import failed.', 'error');
            }
          }}
        />
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