import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, NetworkIntegration } from '../../lib/db';
import { Plus, Edit, Trash2, Eye, EyeOff, ShieldAlert, Save } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

export default function NetworkIntegrationTab() {
  const providers = useLiveQuery(() => db.network_integrations.toArray()) || [];
  const appSettings = useLiveQuery(() => db.app_settings.toArray()) || [];

  const enableNetworkIntegrations =
    appSettings.find(s => s.key === 'enableNetworkIntegrations')?.value === true;

  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<NetworkIntegration | null>(null);
  const [formData, setFormData] = useState({
    displayName: '',
    endpointUrl: '',
    apiKey: '',
    providerType: 'WebSearchAPI' as 'WebSearchAPI' | 'CloudLLMAPI' | 'CustomEnterprise',
    isDefault: false,
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const setting = await db.app_settings.get('enableNetworkIntegrations');
      if (!setting) {
        await db.app_settings.put({ key: 'enableNetworkIntegrations', value: false });
      }
    };
    loadSettings();
  }, []);

  const resetForm = () => {
    setFormData({
      displayName: '',
      endpointUrl: '',
      apiKey: '',
      providerType: 'WebSearchAPI',
      isDefault: false,
    });
    setError(null);
    setShowApiKey(false);
  };

  const handleAddProvider = () => {
    setFormMode('add');
    setSelectedProvider(null);
    resetForm();
  };

  const handleEditProvider = (provider: NetworkIntegration) => {
    setFormMode('edit');
    setSelectedProvider(provider);
    setFormData({
      displayName: provider.displayName,
      endpointUrl: provider.endpointUrl,
      apiKey: provider.apiKey,
      providerType: provider.providerType,
      isDefault: provider.isDefault,
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
    if (!formData.apiKey.trim()) {
      setError('API key is required');
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
      const providerData: NetworkIntegration = {
        ...formData,
        createdAt: selectedProvider?.createdAt || new Date(),
      };

      if (formMode === 'add') {
        await db.network_integrations.add(providerData);
        setSaveMessage({ type: 'success', text: 'Provider added successfully!' });
      } else if (formMode === 'edit' && selectedProvider?.id) {
        await db.network_integrations.update(selectedProvider.id, providerData);
        setSaveMessage({ type: 'success', text: 'Provider updated successfully!' });
      }

      resetForm();
      setFormMode(null);
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Failed to save provider';
      setSaveMessage({ type: 'error', text: errorText });
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

  const handleToggleNetworkIntegrations = async (enabled: boolean) => {
    try {
      await db.app_settings.put({ key: 'enableNetworkIntegrations', value: enabled });
      setSaveMessage({ type: 'success', text: enabled ? 'Network integrations enabled' : 'Network integrations disabled' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setSaveMessage({ type: 'error', text: 'Failed to update setting' });
    }
  };

  return (
    <div className="flex flex-col h-full max-w-4xl">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Network Integrations</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Configure external data providers for trends and analysis.</p>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">Enable Network Integrations</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Allow the app to connect to external endpoints.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={enableNetworkIntegrations}
              onChange={(e) => handleToggleNetworkIntegrations(e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
          </label>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg shrink-0">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h4 className="text-base font-medium text-gray-900 dark:text-white mb-1">Privacy Guarantee</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              When enabled, this app will connect to external endpoints to fetch data. Your local architecture data, principles, tags, and database context will <strong>NEVER</strong> be sent to external APIs. Only the generic query is transmitted.
            </p>
          </div>
        </div>
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
              <select value={formData.providerType} onChange={(e) => setFormData(prev => ({ ...prev, providerType: e.target.value as any }))} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Key</label>
              <div className="relative">
                <input type={showApiKey ? 'text' : 'password'} value={formData.apiKey} onChange={(e) => setFormData(prev => ({ ...prev, apiKey: e.target.value }))} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-white outline-none focus:border-blue-500 pr-10" />
                <button type="button" onClick={() => setShowApiKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                  {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Stored locally securely in IndexedDB.</p>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" checked={formData.isDefault} onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))} id="defaultProvider" className="rounded" />
              <label htmlFor="defaultProvider" className="text-sm text-gray-700 dark:text-gray-300">Set as default provider</label>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={() => { setFormMode(null); resetForm(); }} className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">Cancel</button>
              <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"> <Save size={16} /> {formMode === 'add' ? 'Add Provider' : 'Update Provider'}</button>
            </div>
          </form>
        </div>
      )}

      {!formMode && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden mb-6">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h4 className="font-medium text-gray-900 dark:text-white">Configured Providers</h4>
            <button onClick={handleAddProvider} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"><Plus size={16} /> Add Provider</button>
          </div>

          {providers.length === 0 ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">No providers configured. Add your first provider.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 font-medium text-gray-700 dark:text-gray-300">Display Name</th>
                    <th className="px-6 py-3 font-medium text-gray-700 dark:text-gray-300">Type</th>
                    <th className="px-6 py-3 font-medium text-gray-700 dark:text-gray-300">Endpoint</th>
                    <th className="px-6 py-3 font-medium text-gray-700 dark:text-gray-300">Default</th>
                    <th className="px-6 py-3 font-medium text-gray-700 dark:text-gray-300">Created</th>
                    <th className="px-6 py-3 text-right font-medium text-gray-700 dark:text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map(provider => (
                    <tr key={provider.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-200">{provider.displayName}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{provider.providerType}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400 text-xs truncate max-w-xs">{provider.endpointUrl}</td>
                      <td className="px-6 py-4">{provider.isDefault ? <span className="inline-block px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs">Default</span> : <button onClick={() => provider.id && handleSetDefault(provider.id)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">Set default</button>}</td>
                      <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{new Date(provider.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => handleEditProvider(provider)} className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"><Edit size={16} /></button>
                        <button onClick={() => setItemToDelete(provider.id || null)} className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {saveMessage && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium ${
          saveMessage.type === 'success' ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800' : 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
        }`}>
          {saveMessage.text}
        </div>
      )}

      <ConfirmModal isOpen={!!itemToDelete} title="Delete Provider" message="Are you sure you want to delete this provider? This action cannot be undone." onConfirm={handleDeleteProvider} onCancel={() => setItemToDelete(null)} />
    </div>
  );
}
