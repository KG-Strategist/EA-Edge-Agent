import React, { useState, useEffect } from 'react';
import { db } from '../../lib/db';
import { Save, ShieldAlert, Eye, EyeOff } from 'lucide-react';

export default function SettingsTab() {
  const [enableNetwork, setEnableNetwork] = useState(false);
  const [searchApiKey, setSearchApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const networkSetting = await db.app_settings.get('enableExternalNetwork');
      if (networkSetting) {
        setEnableNetwork(networkSetting.value);
      }
      
      const apiKeySetting = await db.app_settings.get('searchApiKey');
      if (apiKeySetting) {
        setSearchApiKey(apiKeySetting.value);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await db.app_settings.put({ key: 'enableExternalNetwork', value: enableNetwork });
      await db.app_settings.put({ key: 'searchApiKey', value: searchApiKey });
      setSaveMessage({ type: 'success', text: 'Settings saved successfully.' });
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-3xl">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Settings & Privacy</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage external integrations and privacy controls.</p>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg shrink-0">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h4 className="text-base font-medium text-gray-900 dark:text-white mb-1">Privacy Guarantee</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              When enabled, this app will temporarily connect to the internet to fetch data. Your local architecture data, tags, and database context will <strong>NEVER</strong> leave this device. Only generic search strings are transmitted.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-6">
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-white">Enable External Network Features</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Allow the app to fetch external market trends and data.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={enableNetwork}
                onChange={(e) => setEnableNetwork(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className={`transition-opacity ${enableNetwork ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-2">Search API Key (Tavily/Brave)</label>
            <div className="relative">
              <input 
                type={showApiKey ? "text" : "password"} 
                value={searchApiKey}
                onChange={(e) => setSearchApiKey(e.target.value)}
                placeholder="Enter your API key"
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white outline-none focus:border-blue-500 pr-10"
              />
              <button 
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Stored securely in your local browser database.</p>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between">
          <div>
            {saveMessage && (
              <span className={`text-sm ${saveMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {saveMessage.text}
              </span>
            )}
          </div>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
          >
            <Save size={18} />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
