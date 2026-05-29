import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ShieldAlert, ExternalLink, Settings, X } from 'lucide-react';
import { db } from '../../lib/db';

export default function NetworkGatekeeperModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [alertData, setAlertData] = useState({ title: '', message: '', targetModel: '' });

  const networkSettings = useLiveQuery(
    () => db.app_settings.where('key').equals('enableNetworkIntegrations').toArray(),
    [],
  );
  const networkEnabled = networkSettings?.[0]?.value !== false;

  useEffect(() => {
    const handleBlockEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      setAlertData({
        title: customEvent.detail.title || 'Network Access Blocked',
        message: customEvent.detail.message || 'External network features are disabled.',
        targetModel: customEvent.detail.targetModel || ''
      });
      setIsOpen(true);
    };

    window.addEventListener('EA_NETWORK_BLOCK_ALERT', handleBlockEvent);
    return () => window.removeEventListener('EA_NETWORK_BLOCK_ALERT', handleBlockEvent);
  }, []);

  if (!isOpen) return null;

  const displayMessage = alertData.targetModel
    ? `${alertData.message} (${alertData.targetModel})`
    : alertData.message;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] px-4">
      <div className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900/30 rounded-2xl p-6 w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in duration-200">
        <button 
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="p-4 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full mb-4">
            <ShieldAlert size={40} />
          </div>
          
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {alertData.title}
          </h3>
          
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
            {displayMessage}
          </p>

          <div className="flex flex-col w-full gap-3">
            <button
              onClick={() => {
                setIsOpen(false);
                window.dispatchEvent(new CustomEvent('EA_NAVIGATE', {
                  detail: networkEnabled
                    ? { view: 'agent-config', subView: 'configs' }
                    : { view: 'system-pref', subView: 'network' }
                }));
              }}
              className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all active:scale-[0.98] shadow-lg shadow-blue-500/20"
            >
              {networkEnabled ? <Settings size={18} /> : <ExternalLink size={18} />}
              {networkEnabled ? 'Go to Agent Config' : 'Go to Network Settings'}
            </button>
            
            <button 
              onClick={() => setIsOpen(false)}
              className="w-full py-3 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
