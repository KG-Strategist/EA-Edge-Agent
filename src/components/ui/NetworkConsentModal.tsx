import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle } from 'lucide-react';
import { db } from '../../lib/db';
import { useStateContext } from '../../context/StateContext';

export default function NetworkConsentModal() {
  const { 
    showConsentModal, 
    setShowConsentModal, 
    consentModalType, 
    pendingConsentAction, 
    setPendingConsentAction 
  } = useStateContext();

  const globalConfig = useLiveQuery(() => db.global_settings.get('SSO_CONFIG'));

  if (!showConsentModal) return null;

  const handleAcceptConsent = async () => {
    setShowConsentModal?.(false);
    if (pendingConsentAction) {
      await pendingConsentAction();
      setPendingConsentAction?.(null);
    }
  };

  const handleCancel = () => {
    setShowConsentModal?.(false);
    setPendingConsentAction?.(null);
  };

  const entProviderName = globalConfig?.local_enterprise_sso?.providerName || '';
  const ldapUrl = globalConfig?.local_ldap?.ldapUrl || '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[120] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className={`p-2 rounded-lg shrink-0 ${
            consentModalType === 'network_upgrade' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            : consentModalType === 'save_sso' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
            : consentModalType === 'save_ldap' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
          }`}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {consentModalType === 'network_upgrade' && 'Network Upgrade Consent'}
              {consentModalType === 'save_sso' && 'Enterprise SSO Consent'}
              {consentModalType === 'save_ldap' && 'LDAP Binding Consent'}
              {consentModalType === 'save_oauth' && 'Public OAuth Consent'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {consentModalType === 'network_upgrade' && 'Transitioning from Air-Gapped to Hybrid mode'}
              {consentModalType === 'save_sso' && 'Enabling corporate identity federation'}
              {consentModalType === 'save_ldap' && 'Enabling internal directory querying'}
              {consentModalType === 'save_oauth' && 'Enabling external identity provider'}
            </p>
          </div>
        </div>
        <div className={`p-4 rounded-lg border mb-4 ${
          consentModalType === 'save_sso' ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20'
          : consentModalType === 'save_ldap' ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20'
          : 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20'
        }`}>
          {consentModalType === 'network_upgrade' && (
            <>
              <p className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed">
                You are enabling external network connections, transitioning from <strong>Air-Gapped</strong> to <strong>Hybrid</strong> mode.
              </p>
              <p className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed mt-2">
                By proceeding, I consent to the local storage of cryptographic keys and authorize explicit network egress required for identity federation, LLM caching, and external enterprise integrations.
              </p>
              <p className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed mt-2">
                <strong>This action is reversible</strong> — you can disable network access at any time from this panel.
              </p>
            </>
          )}
          {consentModalType === 'save_sso' && (
            <>
              <p className="text-sm text-purple-900 dark:text-purple-100 leading-relaxed">
                You are enabling <strong>Enterprise SSO</strong>. Authentication metadata will be exchanged with your corporate identity provider ({entProviderName || 'configured provider'}).
              </p>
              <p className="text-sm text-purple-900 dark:text-purple-100 leading-relaxed mt-2">
                Do you consent to <strong>local identity federation</strong>? All AI processing remains local to this device.
              </p>
            </>
          )}
          {consentModalType === 'save_ldap' && (
            <>
              <p className="text-sm text-amber-900 dark:text-amber-100 leading-relaxed">
                You are enabling <strong>LDAP Binding</strong>. The application will query your internal directory server at <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded text-xs">{ldapUrl || 'configured URL'}</code>.
              </p>
              <p className="text-sm text-amber-900 dark:text-amber-100 leading-relaxed mt-2">
                Do you consent to <strong>internal directory querying</strong> for centralized identity resolution?
              </p>
            </>
          )}
          {consentModalType === 'save_oauth' && (
            <>
              <p className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed">
                You are enabling <strong>Public OAuth</strong>. Authentication metadata will be exchanged with <strong>Google</strong> and/or <strong>Microsoft</strong> via OAuth 2.0 PKCE.
              </p>
              <p className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed mt-2">
                Do you consent to <strong>external metadata exchange</strong> with these identity providers?
              </p>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAcceptConsent}
            className={`px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors ${
              consentModalType === 'save_sso' ? 'bg-purple-600 hover:bg-purple-700'
              : consentModalType === 'save_ldap' ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            I Accept & Save
          </button>
        </div>
      </div>
    </div>
  );
}
