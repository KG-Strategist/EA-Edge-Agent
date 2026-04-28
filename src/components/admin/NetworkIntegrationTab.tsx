import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { ShieldAlert, Save, Globe, KeyRound, ExternalLink, CheckCircle2, Network, Server, FolderKey, AlertTriangle } from 'lucide-react';
import { OAUTH_PROVIDERS, getRedirectUri } from '../../lib/oauthConfig';
import { getCurrentUser } from '../../lib/authEngine';
import PageHeader from '../ui/PageHeader';
import { useNotification } from '../../context/NotificationContext';

export default function NetworkIntegrationTab() {
  const appSettings = useLiveQuery(() => db.app_settings.toArray()) || [];
  const { addNotification } = useNotification();

  const enableNetworkIntegrations =
    appSettings.find(s => s.key === 'enableNetworkIntegrations')?.value === true;

  // SSO Provider Config State
  const [googleClientId, setGoogleClientId] = useState('');
  const [microsoftClientId, setMicrosoftClientId] = useState('');
  const [ssoSaveMessage, setSsoSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Enterprise SSO Config State
  const [entProviderName, setEntProviderName] = useState('');
  const [entAuthUrl, setEntAuthUrl] = useState('');
  const [entClientId, setEntClientId] = useState('');

  // LDAP Config State
  const [ldapUrl, setLdapUrl] = useState('');
  const [ldapBaseDn, setLdapBaseDn] = useState('');

  // Consent Interceptor Modal
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [consentModalType, setConsentModalType] = useState<'network_upgrade' | 'save_sso' | 'save_ldap' | 'save_oauth'>('network_upgrade');
  const [pendingConsentAction, setPendingConsentAction] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      const setting = await db.app_settings.get('enableNetworkIntegrations');
      if (!setting) {
        await db.app_settings.put({ key: 'enableNetworkIntegrations', value: false });
      }
      // Load SSO client IDs
      const gId = await db.app_settings.get('SSO_GOOGLE_CLIENT_ID');
      const mId = await db.app_settings.get('SSO_MICROSOFT_CLIENT_ID');
      if (gId?.value) setGoogleClientId(gId.value);
      if (mId?.value) setMicrosoftClientId(mId.value);

      // Load Enterprise SSO / LDAP from global_settings
      const globalCfg = await db.global_settings.get('SSO_CONFIG');
      if (globalCfg?.local_enterprise_sso) {
        setEntProviderName(globalCfg.local_enterprise_sso.providerName || '');
        setEntAuthUrl(globalCfg.local_enterprise_sso.authUrl || '');
        setEntClientId(globalCfg.local_enterprise_sso.clientId || '');
      }
      if (globalCfg?.local_ldap) {
        setLdapUrl(globalCfg.local_ldap.ldapUrl || '');
        setLdapBaseDn(globalCfg.local_ldap.baseDn || '');
      }
    };
    loadSettings();
  }, []);

  const requiresHybridNetworkConsent = async (): Promise<boolean> => {
    const pseudokey = getCurrentUser();
    if (!pseudokey) return true;
    const user = await db.users.where('pseudokey').equals(pseudokey).first();
    if (!user?.consentHistory) return true;
    return !user.consentHistory.some(
      (c: any) => c.type === 'HYBRID_NETWORK' || c.type === 'HYBRID_LIMITED'
    );
  };

  const appendHybridNetworkConsent = async () => {
    const pseudokey = getCurrentUser();
    if (!pseudokey) return;
    const user = await db.users.where('pseudokey').equals(pseudokey).first();
    if (!user?.id) return;
    await db.users.update(user.id, {
      consentHistory: [
        ...(user.consentHistory || []),
        { type: 'HYBRID_NETWORK' as const, grantedAt: new Date(), version: '1.0' }
      ]
    });
  };

  const handleToggleNetworkIntegrations = async (enabled: boolean) => {
    // If enabling, check for HYBRID_NETWORK consent first
    if (enabled) {
      const needsConsent = await requiresHybridNetworkConsent();
      if (needsConsent) {
        setConsentModalType('network_upgrade');
        setPendingConsentAction(() => async () => {
          await appendHybridNetworkConsent();
          await db.app_settings.put({ key: 'enableNetworkIntegrations', value: true });
          addNotification('Network access enabled with consent.', 'success', 3000);
        });
        setShowConsentModal(true);
        return;
      }
    }
    try {
      await db.app_settings.put({ key: 'enableNetworkIntegrations', value: enabled });
      // If toggling OFF, instantly fire the Kill Switch to stop active downloads
      if (!enabled) {
        window.dispatchEvent(new CustomEvent('APP_NETWORK_FORCE_KILLED'));
      }
      addNotification(enabled ? 'Network access enabled.' : 'Network access disabled. Active background processes terminated.', 'success', 3000);
    } catch (err) {
      console.error("Toggle error:", err);
      addNotification('Failed to update network settings.', 'error');
    }
  };

  // ── Granular Consent Helpers ────────────────────────────────────────────────
  const appendConsentRecord = async (consentType: string) => {
    const pseudokey = getCurrentUser();
    if (!pseudokey) return;
    const user = await db.users.where('pseudokey').equals(pseudokey).first();
    if (!user?.id) return;
    await db.users.update(user.id, {
      consentHistory: [
        ...(user.consentHistory || []),
        { type: consentType as any, grantedAt: new Date(), version: '1.0' }
      ]
    });
  };

  const handleAcceptConsent = async () => {
    setShowConsentModal(false);
    if (pendingConsentAction) {
      await pendingConsentAction();
      setPendingConsentAction(null);
    }
  };

  // ── Public OAuth Save Handler ──────────────────────────────────────────────
  const handleSaveSsoConfig = async () => {
    setConsentModalType('save_oauth');
    setPendingConsentAction(() => async () => {
      try {
        await appendConsentRecord('EXTERNAL_IDENTITY');
        if (googleClientId.trim()) {
          await db.app_settings.put({ key: 'SSO_GOOGLE_CLIENT_ID', value: googleClientId.trim() });
        } else {
          await db.app_settings.delete('SSO_GOOGLE_CLIENT_ID');
        }
        if (microsoftClientId.trim()) {
          await db.app_settings.put({ key: 'SSO_MICROSOFT_CLIENT_ID', value: microsoftClientId.trim() });
        } else {
          await db.app_settings.delete('SSO_MICROSOFT_CLIENT_ID');
        }
        const existing = await db.global_settings.get('SSO_CONFIG');
        await db.global_settings.put({
          ...(existing || { id: 'SSO_CONFIG', connection_mode: null, public_sso_enabled: false }),
          id: 'SSO_CONFIG',
          authType: 'OAUTH'
        });
        setSsoSaveMessage({ type: 'success', text: 'Public OAuth configuration saved.' });
        setTimeout(() => setSsoSaveMessage(null), 3000);
      } catch {
        setSsoSaveMessage({ type: 'error', text: 'Failed to save OAuth configuration.' });
        setTimeout(() => setSsoSaveMessage(null), 3000);
      }
    });
    setShowConsentModal(true);
  };

  // ── Enterprise SSO Save Handler ────────────────────────────────────────────
  const handleSaveEnterpriseSso = async () => {
    setConsentModalType('save_sso');
    setPendingConsentAction(() => async () => {
      try {
        await appendConsentRecord('EXTERNAL_IDENTITY');
        const existing = await db.global_settings.get('SSO_CONFIG');
        await db.global_settings.put({
          ...(existing || { id: 'SSO_CONFIG', connection_mode: null, public_sso_enabled: false }),
          id: 'SSO_CONFIG',
          authType: 'SSO',
          local_enterprise_sso: {
            providerName: entProviderName.trim(),
            authUrl: entAuthUrl.trim(),
            clientId: entClientId.trim(),
          }
        });
        addNotification('Enterprise SSO configuration saved.', 'success', 3000);
      } catch {
        addNotification('Failed to save Enterprise SSO config.', 'error');
      }
    });
    setShowConsentModal(true);
  };

  // ── LDAP Save Handler ─────────────────────────────────────────────────────
  const handleSaveLdapConfig = async () => {
    setConsentModalType('save_ldap');
    setPendingConsentAction(() => async () => {
      try {
        await appendConsentRecord('EXTERNAL_IDENTITY');
        const existing = await db.global_settings.get('SSO_CONFIG');
        await db.global_settings.put({
          ...(existing || { id: 'SSO_CONFIG', connection_mode: null, public_sso_enabled: false }),
          id: 'SSO_CONFIG',
          authType: 'LDAP',
          local_ldap: {
            ldapUrl: ldapUrl.trim(),
            baseDn: ldapBaseDn.trim(),
          },
          local_enterprise_sso: {
            providerName: `LDAP (${ldapBaseDn.trim()})`,
            authUrl: ldapUrl.trim(),
            clientId: ldapBaseDn.trim(),
            tokenUrl: ''
          }
        });
        addNotification('LDAP configuration saved.', 'success', 3000);
      } catch {
        addNotification('Failed to save LDAP config.', 'error');
      }
    });
    setShowConsentModal(true);
  };

  const redirectUri = getRedirectUri();

  return (
    <div className="flex flex-col max-w-4xl">
      <PageHeader
        icon={<Network className="text-indigo-500" />}
        title="Network & Privacy"
        description="Configure SSO identity providers and manage global privacy controls."
      />

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">Enable External Network Features</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Allow the app to connect to external endpoints for market trends and analysis.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={enableNetworkIntegrations}
              onChange={(e) => handleToggleNetworkIntegrations(e.target.checked)}
              aria-label="Enable External Network Features"
              title="Enable External Network Features"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600 dark:peer-checked:bg-blue-500 transition-all duration-200 ease-in-out"></div>
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

      {/* ─── Public OAuth Settings (External Network Required) ─── */}
      {enableNetworkIntegrations && (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
            <KeyRound size={20} />
          </div>
          <div>
            <h4 className="text-base font-medium text-gray-900 dark:text-white">Public OAuth</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">OAuth 2.0 PKCE Client IDs for Hybrid SSO — no secrets required (public SPA clients).</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Google */}
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Globe size={16} className="text-red-500" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Google</span>
              </div>
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline">
                <ExternalLink size={10} /> Console
              </a>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">Client ID</label>
              <input
                type="text"
                value={googleClientId}
                onChange={e => setGoogleClientId(e.target.value)}
                placeholder={OAUTH_PROVIDERS.google.defaultClientId}
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
            <div className="flex gap-4 text-[10px] text-gray-500 dark:text-gray-400 mt-1.5">
              <span><strong>Auth:</strong> {OAUTH_PROVIDERS.google.authEndpoint}</span>
            </div>
          </div>

          {/* Microsoft */}
          <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Globe size={16} className="text-blue-600" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Microsoft</span>
              </div>
              <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline">
                <ExternalLink size={10} /> Azure AD
              </a>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5">Client ID</label>
              <input
                type="text"
                value={microsoftClientId}
                onChange={e => setMicrosoftClientId(e.target.value)}
                placeholder={OAUTH_PROVIDERS.microsoft.defaultClientId}
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
            <div className="flex gap-4 text-[10px] text-gray-500 dark:text-gray-400 mt-1.5">
              <span><strong>Auth:</strong> {OAUTH_PROVIDERS.microsoft.authEndpoint}</span>
            </div>
          </div>

          {/* Redirect URI (readonly) */}
          <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg border border-emerald-200 dark:border-emerald-500/20">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
              <p className="text-[10px] text-emerald-800 dark:text-emerald-200">
                <strong>Redirect URI:</strong> <code className="bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded font-mono">{redirectUri}</code>
                <span className="text-emerald-600 dark:text-emerald-400 ml-2">— Register this in both provider consoles.</span>
              </p>
            </div>
          </div>

          {/* Save + Status */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveSsoConfig}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Save size={14} /> Save SSO Configuration
            </button>
            {ssoSaveMessage && (
              <span className={`text-xs font-medium ${ssoSaveMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {ssoSaveMessage.text}
              </span>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ─── Enterprise SSO Configuration (Always Visible — Intranet) ─── */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
              <Server size={20} />
            </div>
            <div>
              <h4 className="text-base font-medium text-gray-900 dark:text-white">Enterprise SSO</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">OIDC / SAML identity provider for corporate authentication (Keycloak, ADFS, Okta).</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Provider Name</label>
              <input type="text" value={entProviderName} onChange={e => setEntProviderName(e.target.value)} placeholder="Corporate Keycloak" className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-purple-500 text-xs" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Auth URL (Intranet)</label>
              <input type="text" value={entAuthUrl} onChange={e => setEntAuthUrl(e.target.value)} placeholder="https://sso.corp.local/auth" className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-purple-500 font-mono text-xs" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Client ID</label>
              <input type="text" value={entClientId} onChange={e => setEntClientId(e.target.value)} placeholder="ea-edge-agent" className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-purple-500 font-mono text-xs" />
            </div>
            <button onClick={handleSaveEnterpriseSso} disabled={!entProviderName.trim() || !entAuthUrl.trim()} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Save size={14} /> Save Enterprise SSO
            </button>
          </div>
        </div>

      {/* ─── LDAP / Active Directory (Always Visible — Intranet) ─── */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
              <FolderKey size={20} />
            </div>
            <div>
              <h4 className="text-base font-medium text-gray-900 dark:text-white">LDAP / Active Directory</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Bind against a corporate directory service for centralized identity.</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">LDAP URL</label>
              <input type="text" value={ldapUrl} onChange={e => setLdapUrl(e.target.value)} placeholder="ldap://dc.corp.local:389" className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-amber-500 font-mono text-xs" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Base DN</label>
              <input type="text" value={ldapBaseDn} onChange={e => setLdapBaseDn(e.target.value)} placeholder="dc=corp,dc=local" className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-amber-500 font-mono text-xs" />
            </div>
            <button onClick={handleSaveLdapConfig} disabled={!ldapUrl.trim() || !ldapBaseDn.trim()} className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Save size={14} /> Save LDAP Configuration
            </button>
          </div>
        </div>

      {/* ─── Granular Consent Interceptor Modal ─── */}
      {showConsentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
                onClick={() => { setShowConsentModal(false); setPendingConsentAction(null); }}
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
      )}
    </div>
  );
}
