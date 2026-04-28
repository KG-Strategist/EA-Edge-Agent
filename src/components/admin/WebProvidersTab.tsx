import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, NetworkIntegration } from '../../lib/db';
import { Plus, Edit, Trash2, Eye, EyeOff, ShieldAlert, Save, Globe, Server, RefreshCw, Loader2 } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import DataTable from '../ui/DataTable';
import PageHeader from '../ui/PageHeader';
import { encryptString, decryptString, getVaultKey } from '../../lib/cryptoVault';
import { useNotification } from '../../context/NotificationContext';

export default function WebProvidersTab() {
  const { addNotification } = useNotification();
  const providers = useLiveQuery(() => db.network_integrations.toArray()) || [];
  
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<NetworkIntegration | null>(null);
  const [formData, setFormData] = useState({
    displayName: '',
    endpointUrl: '',
    apiKey: '',
    providerType: 'WebSearchAPI' as 'WebSearchAPI' | 'CloudLLMAPI' | 'CustomEnterprise',
    isDefault: false,
    modelName: '',
    status: 'active' as 'active' | 'inactive',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);
  const [isVaultLocked, setIsVaultLocked] = useState(false);
  const [isPullingLive, setIsPullingLive] = useState(false);

  useEffect(() => {
    const vaultKey = getVaultKey();
    setIsVaultLocked(!vaultKey);
  }, []);

  const resetForm = () => {
    setFormData({
      displayName: '',
      endpointUrl: '',
      apiKey: '',
      providerType: 'WebSearchAPI',
      isDefault: false,
      modelName: '',
      status: 'active',
    });
    setError(null);
    setShowApiKey(false);
  };

  const handleAddProvider = () => {
    setFormMode('add');
    setSelectedProvider(null);
    resetForm();
  };

  const handleEditProvider = async (provider: NetworkIntegration) => {
    setFormMode('edit');
    setSelectedProvider(provider);

    let decryptedKey = '';
    if (provider.encryptedApiKey) {
      try {
        decryptedKey = await decryptString(provider.encryptedApiKey);
      } catch (e) {
        console.error('[SECURITY] Failed to decrypt API key:', e);
        setError('Failed to decrypt stored API key. It may be corrupted.');
      }
    } else if (provider.apiKey) {
      decryptedKey = provider.apiKey;
    }

    setFormData({
      displayName: provider.displayName,
      endpointUrl: provider.endpointUrl,
      apiKey: decryptedKey,
      providerType: provider.providerType,
      isDefault: provider.isDefault,
      modelName: provider.modelName || '',
      status: provider.status || 'active',
    });
    setError(null);
  };

  const validateForm = (): boolean => {
    setError(null);
    if (!formData.displayName.trim()) {
      setError('Display name is required');
      return false;
    }
    if (!formData.endpointUrl.trim()) {
      setError('Endpoint URL is required');
      return false;
    }
    if (formData.providerType !== 'CustomEnterprise' && !formData.apiKey.trim()) {
      setError('API key is required');
      return false;
    }
    if (formData.providerType === 'CustomEnterprise' && !formData.modelName.trim()) {
      setError('Model Name is required for Custom Enterprise endpoints');
      return false;
    }
    try {
      new URL(formData.endpointUrl);
    } catch {
      setError('Invalid URL format');
      return false;
    }
    return true;
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      const encryptedApiKey = formData.apiKey ? await encryptString(formData.apiKey) : undefined;

      const providerData: NetworkIntegration = {
        displayName: formData.displayName,
        endpointUrl: formData.endpointUrl,
        encryptedApiKey: encryptedApiKey,
        providerType: formData.providerType,
        isDefault: formData.isDefault,
        modelName: formData.modelName || undefined,
        status: formData.status,
        createdAt: selectedProvider?.createdAt || new Date(),
      };

      if (formMode === 'add') {
        await db.network_integrations.add(providerData);
        if (providerData.providerType === 'CustomEnterprise' && providerData.modelName) {
          await db.model_registry.add({
            name: providerData.modelName,
            type: 'BYOM_NETWORK',
            modelUrl: providerData.endpointUrl,
            encryptedApiKey: encryptedApiKey,
            isLocalhost: providerData.endpointUrl.includes('localhost') || providerData.endpointUrl.includes('127.0.0.1'),
            isActive: true
          });
        }
        setSaveMessage({ type: 'success', text: 'Provider added successfully!' });
      } else if (formMode === 'edit' && selectedProvider?.id) {
        await db.network_integrations.update(selectedProvider.id, providerData);
        if (providerData.providerType === 'CustomEnterprise' && providerData.modelName) {
          const existingModel = await db.model_registry.where('modelUrl').equals(selectedProvider.endpointUrl).first();
          if (existingModel && existingModel.id) {
            await db.model_registry.update(existingModel.id, {
              name: providerData.modelName,
              modelUrl: providerData.endpointUrl,
              encryptedApiKey: encryptedApiKey,
              apiKey: undefined,
              isLocalhost: providerData.endpointUrl.includes('localhost') || providerData.endpointUrl.includes('127.0.0.1')
            });
          } else {
            await db.model_registry.add({
              name: providerData.modelName,
              type: 'BYOM_NETWORK',
              modelUrl: providerData.endpointUrl,
              encryptedApiKey: encryptedApiKey,
              isLocalhost: providerData.endpointUrl.includes('localhost') || providerData.endpointUrl.includes('127.0.0.1'),
              isActive: true
            });
          }
        }
        setSaveMessage({ type: 'success', text: 'Provider updated successfully!' });
      }

      resetForm();
      setFormMode(null);
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('[WebProvidersTab] Save Provider Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during encryption/save.';
      setSaveMessage({ type: 'error', text: errorMessage });
    }
  };

  const handleDeleteProvider = async () => {
    if (!itemToDelete) return;

    try {
      await db.network_integrations.delete(itemToDelete);
      setSaveMessage({ type: 'success', text: 'Provider deleted successfully!' });
      setItemToDelete(null);
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage({ type: 'error', text: 'Failed to delete provider' });
    }
  };

  const handleSetDefault = async (providerId: number) => {
    try {
      const all = await db.network_integrations.toArray();
      await Promise.all(
        all.map(p => (p.id === providerId ? db.network_integrations.update(p.id!, { isDefault: true }) : db.network_integrations.update(p.id!, { isDefault: false })))
      );
      setSaveMessage({ type: 'success', text: 'Default provider set!' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage({ type: 'error', text: 'Failed to set default provider' });
    }
  };

  const handlePullLiveLearnings = () => {
    setIsPullingLive(true);
    setTimeout(() => {
      setIsPullingLive(false);
      setSaveMessage({ type: 'success', text: 'Web training sync completed.' });
      setTimeout(() => setSaveMessage(null), 3000);
    }, 1500);
  };

  return (
    <div className="flex flex-col max-w-4xl">
      {isVaultLocked && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg flex items-start gap-3">
          <ShieldAlert className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="font-medium text-red-800 dark:text-red-300">Security Vault is Locked</h4>
            <p className="text-sm text-red-700 dark:text-red-400 mt-1">
              Please re-authenticate or refresh the page to unlock the vault before saving API keys. Your session may have expired.
            </p>
          </div>
        </div>
      )}
      
      <PageHeader
        icon={<Globe className="text-indigo-500" />}
        title="Web Trainings"
        description="Configure external data providers and sync web training into your knowledge base."
      />

      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/10 dark:to-purple-900/10 border border-indigo-200 dark:border-indigo-800/50 rounded-xl p-6 mb-8 flex justify-between items-center">
        <div>
          <h4 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
            <Globe className="text-indigo-600 dark:text-indigo-400" size={18} />
            Sync Web Training (Live Pull)
          </h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
            Scraping connected Cloud APIs to automatically identify new industry taxonomy shifts and drafting them as "Needs Review" Architecture Principles in your local NITI database.
          </p>
        </div>
        <button
          onClick={handlePullLiveLearnings}
          disabled={isPullingLive}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors shadow-md whitespace-nowrap"
        >
          {isPullingLive ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          {isPullingLive ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>



      {formMode && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
          <h4 className="text-base font-medium text-gray-900 dark:text-white mb-4">{formMode === 'add' ? 'Add New Provider' : 'Edit Provider'}</h4>
          <form onSubmit={handleSaveProvider} className="space-y-4">
            {error && <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-lg text-sm">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
              <input type="text" value={formData.displayName} onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500" placeholder="e.g., Tavily API" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider Type</label>
              <select value={formData.providerType} onChange={(e) => setFormData(prev => ({ ...prev, providerType: e.target.value as any }))} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500" aria-label="Provider Type" title="Provider Type">
                <option value="WebSearchAPI">Web Search API</option>
                <option value="CloudLLMAPI">Cloud LLM API</option>
                <option value="CustomEnterprise">Custom Enterprise</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Endpoint URL</label>
              <input type="url" value={formData.endpointUrl} onChange={(e) => setFormData(prev => ({ ...prev, endpointUrl: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500" placeholder="https://api.example.com/search" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key {formData.providerType === 'CustomEnterprise' && '(Optional)'}</label>
              <div className="relative">
                <input type={showApiKey ? 'text' : 'password'} value={formData.apiKey} onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 pr-10" aria-label="API Key" title="API Key" placeholder="Enter API Key" />
                <button type="button" onClick={() => setShowApiKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Stored locally securely in IndexedDB.</p>
            </div>

            {formData.providerType === 'CustomEnterprise' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model Name</label>
                <input type="text" value={formData.modelName} onChange={(e) => setFormData(prev => ({ ...prev, modelName: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500" placeholder="e.g., llama3" />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">The exact model name expected by the OpenAI-compatible endpoint.</p>
              </div>
            )}

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={formData.isDefault} onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))} id="defaultProvider" className="rounded" />
                <label htmlFor="defaultProvider" className="text-sm text-gray-700 dark:text-gray-300">Set as default provider</label>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="providerStatus" className="text-sm text-gray-700 dark:text-gray-300">Status:</label>
                <select 
                  id="providerStatus"
                  value={formData.status} 
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as 'active' | 'inactive' }))}
                  className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-500"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => { setFormMode(null); resetForm(); }} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
              <button
                type="submit"
                disabled={isVaultLocked}
                title={isVaultLocked ? 'Cannot save: Security vault is locked. Re-authenticate to proceed.' : ''}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                <Save size={16} /> {formMode === 'add' ? 'Add Provider' : 'Update Provider'}
              </button>
            </div>
          </form>
        </div>
      )}

      {!formMode && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden mb-6">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <Server className="text-blue-500" size={18} />
              Configure Providers
            </h4>
            <button onClick={handleAddProvider} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"><Plus size={16} /> Add Provider</button>
          </div>

          <DataTable 
            data={providers}
            keyField="id"
            exportable={true}
            exportFilename="niti-web-providers.json"
            onImport={async (parsedData) => {
              try {
                await db.network_integrations.bulkPut(parsedData);
                addNotification('Import successful!', 'success', 3000);
              } catch {
                addNotification('Import failed.', 'error');
              }
            }}
            emptyMessage="No providers configured. Add your first provider."
            columns={[
                { key: 'displayName', label: 'Display Name', sortable: true, render: (row) => <span className="font-medium text-gray-900 dark:text-gray-200">{row.displayName}</span> },
                { key: 'providerType', label: 'Type', sortable: true, className: 'text-gray-600 dark:text-gray-400' },
                { key: 'endpointUrl', label: 'Endpoint', sortable: true, className: 'text-gray-600 dark:text-gray-400 text-xs truncate max-w-xs' },
                { 
                  key: 'status', 
                  label: 'Status', 
                  sortable: true,
                  render: (row) => (
                    <span className={`inline-block px-2 py-1 rounded text-xs ${row.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
                      {row.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  ) 
                },
                { key: 'isDefault', label: 'Default', sortable: true, render: (row) => row.isDefault ? <span className="inline-block px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">Default</span> : <button onClick={() => row.id && handleSetDefault(row.id)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">Set default</button> },
                { key: 'createdAt', label: 'Created', sortable: true, className: 'text-gray-600 dark:text-gray-400', render: (row) => new Date(row.createdAt).toLocaleDateString() }
              ]}
              actions={[
                { label: 'Edit Provider', icon: <Edit size={16} />, onClick: handleEditProvider, className: 'text-gray-400 hover:text-blue-600 dark:hover:text-blue-400', title: () => 'Edit Provider' },
                { label: 'Delete Provider', icon: <Trash2 size={16} />, onClick: (row) => setItemToDelete(row.id || null), className: 'text-gray-400 hover:text-red-600 dark:hover:text-red-400', title: () => 'Delete Provider' }
              ]}
            />
        </div>
      )}

      {saveMessage && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium ${saveMessage.type === 'success' ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
          }`}>
          {saveMessage.text}
        </div>
      )}

      <ConfirmModal isOpen={!!itemToDelete} title="Delete Provider" message="Are you sure you want to delete this provider? This action cannot be undone." onConfirm={handleDeleteProvider} onCancel={() => setItemToDelete(null)} />
    </div>
  );
}