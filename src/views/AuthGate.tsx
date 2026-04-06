import React, { useState, useEffect } from 'react';
import { Shield, KeyRound, AlertTriangle, Fingerprint, Lock, Loader2, Wifi, WifiOff, Globe, ServerOff, Info, CheckCircle2, Moon, Sun, ArrowLeft, Server, UserPlus, FolderKey, Zap, FlaskConical } from 'lucide-react';
import { registerLocalUser, registerHybridUser, loginWith2FA, loginWithSSO, getCurrentUser, generatePseudonym, initiateOAuthLogin, handleOAuthCallback, isOAuthCallback, triggerDemoLogin } from '../lib/authEngine';
import Logo from '../components/ui/Logo';
import { db, GlobalSetting } from '../lib/db';
import { UserIdentity } from '../context/StateContext';

type Particle = { id: number; x: number; y: number; size: number };

const MouseSparkles = () => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    let id = 0;
    const handleMouse = (e: MouseEvent) => {
      if (Math.random() > 0.3) return;
      const particle = { id: id++, x: e.clientX, y: e.clientY, size: Math.random() * 6 + 2 };
      setParticles(prev => [...prev.slice(-20), particle]);
      setTimeout(() => setParticles(prev => prev.filter(p => p.id !== particle.id)), 800);
    };
    window.addEventListener('mousemove', handleMouse);
    return () => window.removeEventListener('mousemove', handleMouse);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden mix-blend-screen">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full bg-blue-400 opacity-80 shadow-[0_0_8px_2px_rgba(96,165,250,0.8)]"
          style={{
            left: p.x - p.size / 2,
            top: p.y - p.size / 2,
            width: p.size,
            height: p.size,
            animation: `sparkle-float 0.8s ease-out forwards`
          }}
        />
      ))}
      <style>{`
        @keyframes sparkle-float {
          0% { transform: scale(1) translateY(0); opacity: 0.8; }
          100% { transform: scale(0) translateY(-40px); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

type AuthView = 'LOADING' | 'LOGIN' | 'MODE_SELECT' | 'CONFIG_HYBRID' | 'AIR_GAP_OPTIONS' | 'CONFIG_ENTERPRISE' | 'CONFIG_LDAP' | 'OAUTH_INIT' | 'LOCAL_BINDING';

export default function AuthGate({ onAuthenticated }: { onAuthenticated: (identity: UserIdentity) => void }) {
  const [view, setView] = useState<AuthView>('LOADING');
  const [globalConfig, setGlobalConfig] = useState<GlobalSetting | null>(null);
  
  const [pseudokey, setPseudokey] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pendingProviderId, setPendingProviderId] = useState<string>('');

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark') || localStorage.getItem('theme') !== 'light');
  const toggleTheme = () => {
    setIsDark(!isDark);
    if (!isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };
  
  const [entProviderName, setEntProviderName] = useState('Corporate Keycloak');
  const [entAuthUrl, setEntAuthUrl] = useState('https://sso.corp.local/auth');
  const [entClientId, setEntClientId] = useState('ea-edge-agent');
  const [entTokenUrl, setEntTokenUrl] = useState('');

  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showIntent, setShowIntent] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<string>('');
  const [entLdapUrl, setEntLdapUrl] = useState('ldap://dc.corp.local:389');
  const [entLdapBaseDn, setEntLdapBaseDn] = useState('dc=corp,dc=local');

  // Derived: is internet connectivity logically enabled based on config?
  const isInternetEnabled = globalConfig?.connection_mode === 'HYBRID' && globalConfig?.public_sso_enabled !== false;

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
      document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
    };
    window.addEventListener('mousemove', handleGlobalMouseMove);
    return () => window.removeEventListener('mousemove', handleGlobalMouseMove);
  }, []);

  const dispatchAuthSuccess = (uname?: string) => {
    const finalUname = uname || getCurrentUser() || pseudokey || 'Unknown';
    let role: 'Lead EA' | 'Architect' | 'Viewer' = 'Lead EA';
    if (finalUname.toLowerCase().includes('viewer')) role = 'Viewer';
    if (finalUname.toLowerCase().includes('architect')) role = 'Architect';

    onAuthenticated({
      mode: globalConfig?.connection_mode === 'AIR_GAPPED' ? 'AirGapped' : 'Hybrid',
      username: finalUname,
      role
    });
  };

  useEffect(() => {
    const checkState = async () => {
      // 1. Check for OAuth callback return (?code=&state= in URL)
      if (isOAuthCallback()) {
        setView('OAUTH_INIT');
        setIsProcessing(true);
        setOauthStatus('Processing OAuth callback...');

        const result = await handleOAuthCallback();
        
        if (result.success && result.providerId) {
          // Load any existing config
          const ssoConfig = await db.global_settings.get('SSO_CONFIG');
          if (ssoConfig) setGlobalConfig(ssoConfig);
          
          setPendingProviderId(result.providerId);
          setPseudokey(generatePseudonym());
          setIsProcessing(false);
          setOauthStatus('');
          
          // Check if this provider already has an identity bound
          const existingUser = await db.users.where('providerId').equals(result.providerId).first();
          if (existingUser) {
            // Returning user — auto-login via SSO
            await loginWithSSO(result.providerId);
            dispatchAuthSuccess(existingUser.pseudokey);
            return;
          }
          // New user — proceed to local identity binding
          setView('LOCAL_BINDING');
          return;
        } else {
          setError(result.error || 'OAuth authentication failed.');
          setIsProcessing(false);
          setOauthStatus('');
          // Fall through to normal state check
        }
      }

      // 2. Normal state check
      const curr = getCurrentUser();
      if (curr) {
        dispatchAuthSuccess(curr);
        return;
      }
      
      const count = await db.users.count();
      const ssoConfig = await db.global_settings.get('SSO_CONFIG');
      
      if (count === 0) {
        // Always start from MODE_SELECT when no users exist.
        if (ssoConfig) setGlobalConfig(ssoConfig);
        setView('MODE_SELECT');
      } else {
        setGlobalConfig(ssoConfig || null);
        setView('LOGIN');
      }
    };
    checkState();
  }, [globalConfig?.connection_mode]);

  const saveHybridConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    const cfg: GlobalSetting = {
      id: 'SSO_CONFIG',
      connection_mode: 'HYBRID',
      public_sso_enabled: true
    };
    await db.global_settings.put(cfg);
    setGlobalConfig(cfg);
    setView('OAUTH_INIT');
    setIsProcessing(false);
  };

  const saveEnterpriseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    const cfg: GlobalSetting = {
      id: 'SSO_CONFIG',
      connection_mode: 'AIR_GAPPED',
      public_sso_enabled: false,
      local_enterprise_sso: {
        providerName: entProviderName,
        authUrl: entAuthUrl,
        clientId: entClientId,
        tokenUrl: entTokenUrl
      }
    };
    await db.global_settings.put(cfg);
    setGlobalConfig(cfg);
    setView('OAUTH_INIT');
    setIsProcessing(false);
  };

  const saveLdapConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    const cfg: GlobalSetting = {
      id: 'SSO_CONFIG',
      connection_mode: 'AIR_GAPPED',
      public_sso_enabled: false,
      local_enterprise_sso: {
        providerName: `LDAP (${entLdapBaseDn})`,
        authUrl: entLdapUrl,
        clientId: entLdapBaseDn,
        tokenUrl: ''
      }
    };
    await db.global_settings.put(cfg);
    setGlobalConfig(cfg);
    setView('OAUTH_INIT');
    setIsProcessing(false);
  };

  /** Trigger real OAuth redirect or demo mode mock */
  const triggerOAuth = async (provider: 'google' | 'microsoft') => {
    setError('');
    if (demoMode) {
      // Demo mode: simulate OAuth without real redirect
      setIsProcessing(true);
      setOauthStatus(`Simulating ${provider} authentication...`);
      const result = await triggerDemoLogin(provider);
      if (result.success && result.providerId) {
        setPendingProviderId(result.providerId);
        setPseudokey(generatePseudonym());
        setView('LOCAL_BINDING');
      }
      setIsProcessing(false);
      setOauthStatus('');
    } else {
      // Production: real OAuth redirect
      setIsProcessing(true);
      setOauthStatus(`Redirecting to ${provider === 'google' ? 'Google' : 'Microsoft'}...`);
      try {
        await initiateOAuthLogin(provider);
        // Page will redirect — execution stops here
      } catch (err: any) {
        setError(`Failed to initiate OAuth: ${err.message}`);
        setIsProcessing(false);
        setOauthStatus('');
      }
    }
  };

  /** Enterprise SSO trigger (uses existing mock for air-gapped on-prem) */
  const triggerEnterpriseSso = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const mockId = `enterprise-oauth2|${Date.now()}`;
      setPendingProviderId(mockId);
      setPseudokey(generatePseudonym());
      setView('LOCAL_BINDING');
      setIsProcessing(false);
    }, 1500);
  };

  /** Standalone local identity — no SSO provider required */
  const handleStandaloneSetup = () => {
    const cfg: GlobalSetting = {
      id: 'SSO_CONFIG',
      connection_mode: 'AIR_GAPPED',
      public_sso_enabled: false
    };
    db.global_settings.put(cfg);
    setGlobalConfig(cfg);
    setPendingProviderId(''); // Clear — no SSO link
    setPseudokey(generatePseudonym());
    setView('LOCAL_BINDING');
  };

  const handleLocalBinding = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!pseudokey || pseudokey.length < 5) return setError('Pseudonym must be at least 5 characters');
    if (password.length < 8) return setError('Passphrase must be at least 8 characters');
    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) return setError('PIN must be 4-6 digits');
    if (pin !== confirmPin) return setError('PINs do not match');

    setIsProcessing(true);
    try {
      if (globalConfig?.connection_mode === 'AIR_GAPPED') {
        // Technically enterprise SSO could act as hybrid identity context, but per instructions Air Gapped uses standalone identity binding for now, or links to the providerId. Let's link it to pendingProviderId if it exists.
        if (pendingProviderId) {
          await registerHybridUser(pendingProviderId, pseudokey, password, pin);
          await loginWithSSO(pendingProviderId);
        } else {
          await registerLocalUser(pseudokey, password, pin);
          await loginWith2FA(pseudokey, password, pin);
        }
      } else {
        // Hybrid mode (Public SSO)
        await registerHybridUser(pendingProviderId, pseudokey, password, pin);
        await loginWithSSO(pendingProviderId);
      }
      dispatchAuthSuccess(pseudokey);
    } catch (err: any) {
      setError(err.message || 'Identity binding failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setIsProcessing(true);
    try {
      if (pseudokey && password && pin) {
        const success = await loginWith2FA(pseudokey, password, pin);
        if (success) dispatchAuthSuccess(pseudokey);
        else setError('Invalid 2FA Credentials');
      } else {
        setError('Please provide Agent ID, Passphrase, and PIN');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSSOLogin = async (providerIdMock: string) => {
    setError('');
    setIsProcessing(true);
    try {
      const successPseudonym = await loginWithSSO(providerIdMock);
      if (successPseudonym) dispatchAuthSuccess(successPseudonym);
      else setError('No local identity linked to this SSO provider.');
    } catch (err: any) {
      setError(err.message || 'SSO Authentication error');
    } finally {
      setIsProcessing(false);
    }
  };

  if (view === 'LOADING') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex justify-center items-center">
         <Loader2 className="w-10 h-10 animate-spin text-blue-600 dark:text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center relative bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm transition-colors duration-300 p-2 sm:p-4 pt-12 sm:pt-16 pb-4 overflow-y-auto overflow-x-hidden">
      
      {/* Minimalist Architect Grid Background */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none opacity-40 dark:opacity-20 transition-opacity"
        style={{
           backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
           backgroundSize: '24px 24px',
           color: 'rgb(148, 163, 184)' 
        }}
      />

      {/* Theme Toggle Button */}
      <div className="absolute top-4 right-4 z-50">
        <button 
          onClick={toggleTheme} 
          className="p-2 sm:p-2.5 bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 border border-gray-200 dark:border-white/10 rounded-full shadow-sm text-gray-700 dark:text-blue-100 transition-all backdrop-blur-md"
          title="Toggle Theme"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <MouseSparkles />
      
      {/* Inner Content Wrapper Safe-Area Layout (my-auto provides safe centering without top-clipping) */}
      <div className="flex flex-col items-center w-full max-w-3xl gap-2 z-10 relative my-auto mt-6 sm:mt-8">
        
        {/* Logo block shifted to horizontal flex to save massive vertical space (keeps speech bubble bounds safe) */}
        <div className="flex flex-row items-center justify-center gap-3 sm:gap-4 mt-2 w-full shrink-0">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 relative drop-shadow-[0_0_10px_rgba(56,189,248,0.4)]">
             <Logo className="w-full h-full" />
          </div>
          <div className="text-left flex flex-col justify-center">
            <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white mt-0 tracking-tight transition-colors duration-300">EA NITI</h2>
            <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-blue-200/80 mt-0 max-w-xs sm:max-w-md font-medium tracking-wide">
              Enterprise Architecture Network-isolated In-browser Triage & Inference
            </p>
          </div>
        </div>

        {/* The Main Container Card (Uses h-auto & overflow-visible to natively expand instead of squishing inner content) */}
        <div className="w-full bg-white/80 dark:bg-white/5 backdrop-blur-xl rounded-2xl shadow-[0_0_40px_-10px_rgba(0,0,0,0.1)] dark:shadow-[0_0_60px_-15px_rgba(56,189,248,0.3)] border border-gray-200/80 dark:border-white/10 p-3 sm:p-4 transform transition-all duration-500 relative h-auto overflow-visible">
          {/* Subtle inner top glow */}
          {isDark && <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent" />}
          
          <div className="flex justify-center mb-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 rounded-full border border-amber-200 dark:border-amber-500/20">
              <Shield className="w-3 h-3 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-[10px] sm:text-[11px] font-semibold leading-snug">
                DPDP Compliance Mode. All identity and architectural telemetry is sanitized locally.
              </p>
            </div>
          </div>

          {view === 'LOGIN' && (
            <div className="space-y-3">
              {/* Login SSO Visibility Rules */}
              {isInternetEnabled && (
                <div className="space-y-2 mb-4">
                  <button onClick={() => handleSSOLogin('google-oauth2|mock')} className="w-full flex items-center justify-center gap-3 py-2.5 sm:py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-red-500/50 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-800 dark:text-white rounded-xl text-sm font-semibold sm:font-bold transition-all dark:hover:shadow-[0_0_20px_-5px_rgba(239,68,68,0.4)] hover:scale-[1.01]">
                    <Globe className="w-4 h-4 text-red-500 dark:text-red-400" /> Login with Google
                  </button>
                  <button onClick={() => handleSSOLogin('microsoft-oauth2|mock')} className="w-full flex items-center justify-center gap-3 py-2.5 sm:py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-blue-500/50 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-800 dark:text-white rounded-xl text-sm font-semibold sm:font-bold transition-all dark:hover:shadow-[0_0_20px_-5px_rgba(59,130,246,0.4)] hover:scale-[1.01]">
                    <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Login with Microsoft
                  </button>
                  {globalConfig?.local_enterprise_sso && (
                    <button onClick={() => handleSSOLogin('enterprise-oauth2|mock')} className="w-full flex items-center justify-center gap-3 py-2.5 sm:py-3 bg-purple-50 dark:bg-purple-500/20 border border-purple-200 dark:border-purple-500/30 hover:border-purple-300 dark:hover:border-purple-500/50 hover:bg-purple-100 dark:hover:bg-purple-500/30 text-purple-900 dark:text-white rounded-xl text-sm font-semibold sm:font-bold transition-all dark:hover:shadow-[0_0_20px_-5px_rgba(168,85,247,0.4)] hover:scale-[1.01]">
                      <Lock className="w-4 h-4 text-purple-600 dark:text-purple-400" /> {globalConfig.local_enterprise_sso.providerName}
                    </button>
                  )}
                  <div className="flex items-center gap-3 py-2">
                    <div className="h-px bg-gray-200 dark:bg-white/10 flex-1"></div>
                    <span className="text-gray-400 dark:text-gray-500 font-medium text-[10px] uppercase tracking-widest">Or Local Key</span>
                    <div className="h-px bg-gray-200 dark:bg-white/10 flex-1"></div>
                  </div>
                </div>
              )}

              {(!isInternetEnabled) && (
                <div className="mb-6 space-y-3">
                  <div className="flex items-center justify-center gap-2 p-2.5 bg-gray-100 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 text-xs font-semibold text-gray-500 dark:text-blue-200/70 shadow-inner">
                    <WifiOff size={16} className="text-gray-400 dark:text-blue-400/80" /> Public SSO Hidden (Air-Gapped Active).
                  </div>
                  {globalConfig?.local_enterprise_sso && (
                    <button onClick={() => handleSSOLogin('enterprise-oauth2|mock')} className="w-full flex items-center justify-center gap-3 py-2.5 sm:py-3 bg-purple-50 dark:bg-purple-500/20 border border-purple-200 dark:border-purple-500/30 hover:border-purple-300 dark:hover:border-purple-500/50 hover:bg-purple-100 dark:hover:bg-purple-500/30 text-purple-900 dark:text-white rounded-xl text-sm font-semibold sm:font-bold transition-all dark:hover:shadow-[0_0_20px_-5px_rgba(168,85,247,0.4)] hover:scale-[1.01]">
                      <Lock className="w-4 h-4 text-purple-600 dark:text-purple-400" /> {globalConfig.local_enterprise_sso.providerName}
                    </button>
                  )}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] sm:text-xs font-bold text-gray-700 dark:text-blue-100/90 mb-1">Agent ID (Pseudonym)</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Fingerprint className="h-4 w-4 text-gray-400 dark:text-blue-400/60" />
                      </div>
                      <input type="text" value={pseudokey} onChange={e => setPseudokey(e.target.value)} required className="pl-10 w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-1.5 px-2.5 text-xs outline-none focus:border-blue-500 dark:focus:border-blue-500/50 focus:bg-gray-50 dark:focus:bg-white/5 transition-all shadow-sm dark:shadow-inner placeholder-gray-400 dark:placeholder-white/20" placeholder="e.g. Cyber-Node-42" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] sm:text-xs font-bold text-gray-700 dark:text-blue-100/90 mb-1">Passphrase</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <KeyRound className="h-4 w-4 text-gray-400 dark:text-blue-400/60" />
                      </div>
                      <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="pl-10 w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-1.5 px-2.5 text-xs outline-none focus:border-blue-500 dark:focus:border-blue-500/50 focus:bg-gray-50 dark:focus:bg-white/5 transition-all shadow-sm dark:shadow-inner placeholder-gray-400 dark:placeholder-white/20" placeholder="Passphrase" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] sm:text-xs font-bold text-gray-700 dark:text-blue-100/90 mb-1">PIN</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Lock className="h-4 w-4 text-gray-400 dark:text-blue-400/60" />
                      </div>
                      <input type="password" value={pin} maxLength={6} onChange={e => setPin(e.target.value)} required className="pl-10 w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-1.5 px-2.5 text-xs outline-none focus:border-blue-500 dark:focus:border-blue-500/50 focus:bg-gray-50 dark:focus:bg-white/5 transition-all shadow-sm dark:shadow-inner tracking-widest placeholder-gray-400 dark:placeholder-white/20" placeholder="4-6 Digits" />
                    </div>
                  </div>
                </div>
                
                {error && <p className="text-red-500 dark:text-red-400 text-xs font-bold text-center bg-red-50 dark:bg-red-500/10 py-2 rounded-lg border border-red-200 dark:border-red-500/20">{error}</p>}
                
                <button type="submit" disabled={isProcessing} className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-gradient-to-r dark:from-blue-600 dark:to-blue-500 dark:hover:from-blue-500 dark:hover:to-blue-400 text-white font-bold rounded-lg p-2 sm:p-2.5 text-xs sm:text-sm transition-all hover:scale-[1.01] dark:shadow-[0_0_20px_-5px_rgba(59,130,246,0.5)] flex items-center justify-center gap-2 mt-1">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />} Decrypt Vault & Login
                </button>
              </form>
            </div>
          )}

          {view === 'MODE_SELECT' && (
             <div className="space-y-3">
               <div className="text-center">
                 <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-wide">Select Configuration Mode</h3>
                 <p className="text-[9px] sm:text-[11px] text-gray-500 dark:text-blue-200/60 mt-0.5">Define your enterprise threat boundary</p>
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                 <button onClick={() => setView('CONFIG_HYBRID')} className="flex flex-row items-center text-left gap-3 p-3 sm:p-3.5 border border-gray-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-blue-400/50 bg-gray-50 dark:bg-white/5 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transform transition-all duration-300 sm:hover:-translate-y-1 shadow-sm dark:hover:shadow-[0_10px_40px_-10px_rgba(59,130,246,0.3)] group relative overflow-hidden">
                    {isDark && <div className="absolute -inset-24 bg-blue-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}
                    
                    <div className="p-2 sm:p-2.5 bg-blue-100 dark:bg-gradient-to-br dark:from-blue-500 dark:to-cyan-400 text-blue-600 dark:text-white rounded-xl shadow-sm dark:shadow-lg sm:group-hover:scale-110 sm:group-hover:rotate-3 transition-transform duration-300 relative z-10 shrink-0">
                      <Wifi size={18} />
                    </div>
                    <div className="relative z-10 flex-1">
                      <h4 className="font-bold text-gray-900 dark:text-white text-xs sm:text-sm">Hybrid (Internet)</h4>
                      <p className="text-[9px] sm:text-[10px] text-gray-500 dark:text-blue-100/70 mt-0.5 leading-snug font-medium">
                        Public SSO (Google, Microsoft). Best for prototyping.
                      </p>
                    </div>
                 </button>

                 <button onClick={() => setView('AIR_GAP_OPTIONS')} className="flex flex-row items-center text-left gap-3 p-3 sm:p-3.5 border border-gray-200 dark:border-white/10 hover:border-purple-400 dark:hover:border-purple-400/50 bg-gray-50 dark:bg-white/5 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-xl transform transition-all duration-300 sm:hover:-translate-y-1 shadow-sm dark:hover:shadow-[0_10px_40px_-10px_rgba(168,85,247,0.3)] group relative overflow-hidden">
                    {isDark && <div className="absolute -inset-24 bg-purple-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}

                    <div className="p-2 sm:p-2.5 bg-purple-100 dark:bg-gradient-to-br dark:from-purple-500 dark:to-pink-500 text-purple-600 dark:text-white rounded-xl shadow-sm dark:shadow-lg sm:group-hover:scale-110 sm:group-hover:-rotate-3 transition-transform duration-300 relative z-10 shrink-0">
                      <ServerOff size={18} />
                    </div>
                    <div className="relative z-10 flex-1">
                      <h4 className="font-bold text-gray-900 dark:text-white text-xs sm:text-sm">Air-Gapped (Isolated)</h4>
                      <p className="text-[9px] sm:text-[10px] text-gray-500 dark:text-purple-100/70 mt-0.5 leading-snug font-medium">
                        Never reaches the internet. 3 auth methods.
                      </p>
                    </div>
                 </button>
               </div>
             </div>
          )}

          {view === 'CONFIG_HYBRID' && (
             <div className="space-y-3">
               <button onClick={() => setView('MODE_SELECT')} className="flex items-center gap-1 text-[10px] font-bold text-gray-500 dark:text-blue-300/70 hover:text-blue-600 dark:hover:text-blue-300 transition-colors">
                 <ArrowLeft size={12} /> Back to Mode Selection
               </button>
               <form onSubmit={saveHybridConfig} className="space-y-3">
                 <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white text-center">Hybrid Internet Mode</h3>
                 <p className="text-[9px] sm:text-[11px] text-gray-500 dark:text-blue-200/60 text-center -mt-2">OAuth 2.0 with PKCE — zero secrets stored</p>
                 <div className="p-2.5 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-200 dark:border-blue-500/30 text-[10px]">
                    <div className="flex items-start gap-2">
                      <Zap className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-blue-800 dark:text-blue-100/90 leading-snug font-semibold">Google & Microsoft SSO via Authorization Code + PKCE.</p>
                        <p className="text-blue-700/70 dark:text-blue-200/60 leading-snug mt-1">No client secrets are stored. Your identity is verified, PII is scrubbed, and only a cryptographic pseudonym is retained locally.</p>
                      </div>
                    </div>
                 </div>
                 <button type="submit" disabled={isProcessing} className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold rounded-lg p-2.5 text-xs transition-all hover:scale-[1.02] shadow-[0_0_20px_-5px_rgba(59,130,246,0.5)] flex items-center justify-center gap-2">
                   <CheckCircle2 className="w-4 h-4" /> Enable Hybrid Mode & Continue
                 </button>
               </form>
             </div>
          )}

          {/* ─── AIR-GAPPED OPTIONS: 3 Identity Methods ─── */}
          {view === 'AIR_GAP_OPTIONS' && (
             <div className="space-y-2">
               <button onClick={() => setView('MODE_SELECT')} className="flex items-center gap-1 text-[11px] sm:text-xs font-bold text-gray-500 dark:text-blue-300/70 hover:text-blue-600 dark:hover:text-blue-300 transition-colors">
                 <ArrowLeft size={12} /> Back to Mode Selection
               </button>
               <div className="text-center">
                 <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white tracking-wide">Air-Gapped Identity Setup</h3>
                 <p className="text-[9px] sm:text-[11px] text-gray-500 dark:text-purple-200/60 mt-0">Choose how to establish your local zero-PII identity</p>
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                 {/* Option 1: Standalone Local 2FA */}
                 <button onClick={handleStandaloneSetup} className="flex flex-col text-left gap-2 p-3 border border-gray-200 dark:border-white/10 hover:border-emerald-400 dark:hover:border-emerald-400/50 bg-gray-50 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-xl transition-all duration-300 shadow-sm group relative overflow-hidden items-start">
                    {isDark && <div className="absolute -inset-24 bg-emerald-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}
                    <div className="flex items-center justify-between w-full relative z-10">
                      <div className="p-2 bg-emerald-100 dark:bg-gradient-to-br dark:from-emerald-500 dark:to-teal-400 text-emerald-600 dark:text-white rounded-lg shadow-sm dark:shadow-lg shrink-0 group-hover:scale-110 transition-transform">
                        <UserPlus size={16} />
                      </div>
                      <span className="text-[8px] font-bold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-full border border-emerald-200/50 dark:border-emerald-500/30">Recommended</span>
                    </div>
                    <div className="relative z-10 flex-1 w-full mt-1">
                      <h4 className="font-bold text-gray-900 dark:text-white text-[11px] sm:text-xs">Standalone 2FA</h4>
                      <p className="text-[9.5px] text-gray-500 dark:text-emerald-100/70 mt-1 leading-snug font-medium">
                        Fully offline identity natively inside your browser vault.
                      </p>
                    </div>
                 </button>

                 {/* Option 2: Enterprise SSO */}
                 <button onClick={() => setView('CONFIG_ENTERPRISE')} className="flex flex-col text-left gap-2 p-3 border border-gray-200 dark:border-white/10 hover:border-purple-400 dark:hover:border-purple-400/50 bg-gray-50 dark:bg-white/5 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-xl transition-all duration-300 shadow-sm group relative overflow-hidden items-start">
                    {isDark && <div className="absolute -inset-24 bg-purple-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}
                    <div className="p-2 bg-purple-100 dark:bg-gradient-to-br dark:from-purple-500 dark:to-pink-500 text-purple-600 dark:text-white rounded-lg shadow-sm dark:shadow-lg relative z-10 shrink-0 group-hover:scale-110 transition-transform">
                      <Server size={16} />
                    </div>
                    <div className="relative z-10 flex-1 w-full mt-1">
                      <h4 className="font-bold text-gray-900 dark:text-white text-[11px] sm:text-xs">Enterprise SSO</h4>
                      <p className="text-[9.5px] text-gray-500 dark:text-purple-100/70 mt-1 leading-snug font-medium">
                        Connect to on-prem Keycloak, ADFS, or Okta (OIDC/SAML).
                      </p>
                    </div>
                 </button>

                 {/* Option 3: LDAP / Active Directory */}
                 <button onClick={() => setView('CONFIG_LDAP')} className="flex flex-col text-left gap-2 p-3 border border-gray-200 dark:border-white/10 hover:border-amber-400 dark:hover:border-amber-400/50 bg-gray-50 dark:bg-white/5 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-xl transition-all duration-300 shadow-sm group relative overflow-hidden items-start">
                    {isDark && <div className="absolute -inset-24 bg-amber-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}
                    <div className="p-2 bg-amber-100 dark:bg-gradient-to-br dark:from-amber-500 dark:to-orange-400 text-amber-600 dark:text-white rounded-lg shadow-sm dark:shadow-lg relative z-10 shrink-0 group-hover:scale-110 transition-transform">
                      <FolderKey size={16} />
                    </div>
                    <div className="relative z-10 flex-1 w-full mt-1">
                      <h4 className="font-bold text-gray-900 dark:text-white text-[11px] sm:text-xs">LDAP Binding</h4>
                      <p className="text-[9.5px] text-gray-500 dark:text-amber-100/70 mt-1 leading-snug font-medium">
                        Bind securely against your corporate directory service.
                      </p>
                    </div>
                 </button>
               </div>
             </div>
          )}

          {/* ─── Enterprise SSO Config Form ─── */}
          {view === 'CONFIG_ENTERPRISE' && (
             <div className="space-y-2">
               <button onClick={() => setView('AIR_GAP_OPTIONS')} className="flex items-center gap-1 text-[11px] sm:text-xs font-bold text-gray-500 dark:text-blue-300/70 hover:text-blue-600 dark:hover:text-blue-300 transition-colors">
                 <ArrowLeft size={12} /> Back to Auth Methods
               </button>
               <form onSubmit={saveEnterpriseConfig} className="space-y-2.5">
                 <h3 className="text-base sm:text-lg font-bold text-center text-gray-900 dark:text-white">Enterprise SSO Configuration</h3>
                 <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-purple-200/60 text-center -mt-1.5">OIDC / SAML identity provider</p>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                   <div className="sm:col-span-2">
                      <label className="block text-xs sm:text-[13px] font-semibold text-gray-600 dark:text-purple-200/80 mb-1">Auth URL (Intranet)</label>
                      <input type="text" value={entAuthUrl} onChange={e => setEntAuthUrl(e.target.value)} required className="w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-1.5 px-2.5 outline-none focus:border-purple-500/50 shadow-inner placeholder-gray-400 dark:placeholder-white/20" placeholder="https://sso.internal.corp" />
                   </div>
                   <div>
                      <label className="block text-xs sm:text-[13px] font-semibold text-gray-600 dark:text-purple-200/80 mb-1">Provider Name</label>
                      <input type="text" value={entProviderName} onChange={e => setEntProviderName(e.target.value)} required className="w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-1.5 px-2.5 outline-none focus:border-purple-500/50 shadow-inner placeholder-gray-400 dark:placeholder-white/20" placeholder="Corporate Keycloak" />
                   </div>
                   <div>
                      <label className="block text-xs sm:text-[13px] font-semibold text-gray-600 dark:text-purple-200/80 mb-1">Client ID</label>
                      <input type="text" value={entClientId} onChange={e => setEntClientId(e.target.value)} required className="w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-1.5 px-2.5 outline-none focus:border-purple-500/50 shadow-inner placeholder-gray-400 dark:placeholder-white/20" placeholder="ea-edge-agent" />
                   </div>
                 </div>

                 <button type="submit" disabled={isProcessing} className="w-full bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-bold rounded-lg p-2.5 transition-all shadow-[0_0_20px_-5px_rgba(168,85,247,0.5)] mt-2 hover:scale-[1.01]">
                   Save & Authenticate via SSO
                 </button>
               </form>
             </div>
          )}

          {/* ─── LDAP / Active Directory Config ─── */}
          {view === 'CONFIG_LDAP' && (
             <div className="space-y-2">
               <button onClick={() => setView('AIR_GAP_OPTIONS')} className="flex items-center gap-1 text-[11px] sm:text-xs font-bold text-gray-500 dark:text-blue-300/70 hover:text-blue-600 dark:hover:text-blue-300 transition-colors">
                 <ArrowLeft size={12} /> Back to Auth Methods
               </button>
               <form onSubmit={saveLdapConfig} className="space-y-2.5">
                 <h3 className="text-base sm:text-lg font-bold text-center text-gray-900 dark:text-white">LDAP / Active Directory</h3>
                 <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-amber-200/60 text-center -mt-1.5">Bind against corporate directory service</p>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                   <div>
                      <label className="block text-xs sm:text-[13px] font-semibold text-gray-600 dark:text-amber-200/80 mb-1">LDAP URL</label>
                      <input type="text" value={entLdapUrl} onChange={e => setEntLdapUrl(e.target.value)} required className="w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-1.5 px-2.5 outline-none focus:border-amber-500/50 shadow-inner placeholder-gray-400 dark:placeholder-white/20" placeholder="ldap://dc.corp.local:389" />
                   </div>
                   <div>
                      <label className="block text-xs sm:text-[13px] font-semibold text-gray-600 dark:text-amber-200/80 mb-1">Base DN</label>
                      <input type="text" value={entLdapBaseDn} onChange={e => setEntLdapBaseDn(e.target.value)} required className="w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-1.5 px-2.5 outline-none focus:border-amber-500/50 shadow-inner placeholder-gray-400 dark:placeholder-white/20" placeholder="dc=corp,dc=local" />
                   </div>
                 </div>

                 <div className="py-2 px-3 bg-amber-50 dark:bg-amber-500/10 rounded-lg border border-amber-200 dark:border-amber-500/20 text-[10px] text-amber-700 dark:text-amber-200/80 leading-snug">
                   <Info className="w-3 h-3 inline mr-1" />LDAP binding is mocked locally for development.
                 </div>
                 <button type="submit" disabled={isProcessing} className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold rounded-lg p-2.5 transition-all shadow-[0_0_20px_-5px_rgba(217,119,6,0.5)] mt-2 hover:scale-[1.01]">
                   Bind & Continue
                 </button>
               </form>
             </div>
          )}

          {view === 'OAUTH_INIT' && (
             <div className="space-y-3">
               <button onClick={() => setView(globalConfig?.connection_mode === 'AIR_GAPPED' ? 'AIR_GAP_OPTIONS' : 'CONFIG_HYBRID')} className="flex items-center gap-1 text-[10px] font-bold text-gray-500 dark:text-blue-300/70 hover:text-blue-600 dark:hover:text-blue-300 transition-colors">
                 <ArrowLeft size={12} /> Back
               </button>
               <div className="text-center">
                 <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Authenticate to Edge</h3>
                 <p className="text-[10px] sm:text-xs text-gray-500 dark:text-blue-200/60 mt-0.5">Verify your identity via OAuth 2.0 PKCE</p>
               </div>
               
               {isProcessing ? (
                 <div className="flex flex-col items-center p-4 bg-gray-50 dark:bg-black/20 rounded-xl shadow-inner">
                   <Loader2 className="w-6 h-6 animate-spin text-blue-500 dark:text-blue-400 mb-2" />
                   <p className="text-xs font-bold text-blue-600 dark:text-blue-300">{oauthStatus || 'Verifying Identity & Scrubbing PII...'}</p>
                 </div>
               ) : (
                 <div className="space-y-2">
                   {error && <p className="text-red-500 dark:text-red-400 text-[10px] font-bold text-center bg-red-50 dark:bg-red-500/10 py-1.5 rounded-lg border border-red-200 dark:border-red-500/20">{error}</p>}

                   {globalConfig?.connection_mode === 'HYBRID' && isOnline ? (
                     <>
                       <button onClick={() => triggerOAuth('google')} className="w-full flex items-center justify-center gap-2 py-2 sm:py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:border-red-400 dark:hover:border-red-500/50 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-800 dark:text-white rounded-lg text-xs font-bold transition-all hover:shadow-[0_0_20px_-5px_rgba(239,68,68,0.4)] hover:scale-[1.01]">
                         <Globe className="w-3.5 h-3.5 text-red-500 dark:text-red-400" /> {demoMode ? '🧪 Demo: ' : ''}Continue with Google
                       </button>
                       <button onClick={() => triggerOAuth('microsoft')} className="w-full flex items-center justify-center gap-2 py-2 sm:py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-blue-500/50 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-800 dark:text-white rounded-lg text-xs font-bold transition-all hover:shadow-[0_0_20px_-5px_rgba(59,130,246,0.4)] hover:scale-[1.01]">
                         <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> {demoMode ? '🧪 Demo: ' : ''}Continue with Microsoft
                       </button>

                       {/* Demo Mode Toggle */}
                       <div className="flex items-center justify-center gap-2 pt-1">
                         <button
                           onClick={() => { setDemoMode(!demoMode); setError(''); }}
                           className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-bold transition-all border ${
                             demoMode
                               ? 'bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-300'
                               : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400'
                           }`}
                         >
                           <FlaskConical className="w-3 h-3" />
                           {demoMode ? 'Demo Mode Active' : 'No OAuth keys? Use Demo Mode'}
                         </button>
                       </div>
                     </>
                   ) : (
                     <button onClick={triggerEnterpriseSso} className="w-full flex items-center justify-center gap-2 py-2 sm:py-2.5 bg-purple-50 dark:bg-purple-500/20 border border-purple-200 dark:border-purple-500/30 hover:bg-purple-100 dark:hover:bg-purple-500/30 text-purple-900 dark:text-white rounded-lg text-xs font-bold transition-all hover:shadow-[0_0_20px_-5px_rgba(168,85,247,0.4)] hover:scale-[1.01]">
                       <Lock className="w-4 h-4 text-purple-600 dark:text-purple-400" /> {globalConfig?.local_enterprise_sso?.providerName || 'Local Enterprise SSO'}
                     </button>
                   )}
                 </div>
               )}
             </div>
          )}

          {view === 'LOCAL_BINDING' && (
              <div className="space-y-1.5">
               <button onClick={() => setView(globalConfig?.connection_mode === 'AIR_GAPPED' ? 'AIR_GAP_OPTIONS' : 'MODE_SELECT')} className="flex items-center gap-1 text-[11px] sm:text-xs font-bold text-gray-500 dark:text-blue-300/70 hover:text-blue-600 dark:hover:text-blue-300 transition-colors">
                 <ArrowLeft size={12} /> Back
               </button>
               <form onSubmit={handleLocalBinding} className="space-y-1.5">
                 <div className="p-1.5 sm:p-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg text-emerald-800 dark:text-emerald-100 text-[10px] sm:text-[11px] shadow-inner mb-1">
                   <CheckCircle2 className="w-3.5 h-3.5 inline-block text-emerald-500 dark:text-emerald-400 mr-1" />
                   <span className="font-bold">{pendingProviderId ? 'SSO Validated.' : 'Air-Gapped Identity.'}</span>
                   <strong className="flex items-center text-emerald-600 dark:text-emerald-300 text-[10px] sm:text-[11px]">
                     <span className="ml-1">Local Encrypted Binding</span>
                     <Info className="w-3 h-3 ml-1 cursor-pointer hover:text-emerald-900 dark:hover:text-white transition-colors" onClick={() => setShowIntent(!showIntent)} />
                   </strong>
                   {showIntent && (
                     <p className="mt-1 text-emerald-600/80 dark:text-emerald-100/70 leading-snug text-[9px] sm:text-[10px]">Pseudonym acts as deterministic primary key mapping to this device. All interactions log locally via encrypted WebCrypto hashes.</p>
                   )}
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                   <div className="sm:col-span-2">
                     <label className="block text-[10px] sm:text-[11px] font-semibold text-gray-700 dark:text-blue-100/90 mb-0.5">Pseudonym</label>
                     <input type="text" value={pseudokey} onChange={e => setPseudokey(e.target.value)} required className="w-full rounded border-2 border-emerald-400/50 dark:border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/5 text-gray-900 dark:text-white py-1 px-2 outline-none font-bold tracking-wide shadow-inner" />
                   </div>
                   <div>
                     <label className="block text-[10px] sm:text-[11px] font-semibold text-gray-700 dark:text-blue-100/90 mb-0.5">Create 2FA PIN</label>
                     <input type="password" value={pin} maxLength={6} onChange={e => setPin(e.target.value)} required className="w-full rounded border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-1 px-2 outline-none focus:border-blue-500/50 tracking-widest text-center shadow-inner placeholder-gray-400 dark:placeholder-white/20" placeholder="4-6 Digits" />
                   </div>
                   <div>
                     <label className="block text-[10px] sm:text-[11px] font-semibold text-gray-700 dark:text-blue-100/90 mb-0.5">Confirm PIN</label>
                     <input type="password" value={confirmPin} maxLength={6} onChange={e => setConfirmPin(e.target.value)} required className="w-full rounded border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-1 px-2 outline-none focus:border-blue-500/50 tracking-widest text-center shadow-inner placeholder-gray-400 dark:placeholder-white/20" placeholder="Verify PIN" />
                   </div>
                   <div className="sm:col-span-2">
                     <label className="block text-[10px] sm:text-[11px] font-semibold text-gray-700 dark:text-blue-100/90 mb-0.5">Local Passphrase</label>
                     <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full rounded border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-1 px-2 outline-none focus:border-blue-500/50 shadow-inner placeholder-gray-400 dark:placeholder-white/20" placeholder="Minimum 8 characters" />
                   </div>
                 </div>
                 
                 {error && <p className="text-red-500 dark:text-red-400 text-[9px] font-bold text-center bg-red-50 dark:bg-red-500/10 py-1 rounded border border-red-200 dark:border-red-500/20">{error}</p>}
                 
                 <button type="submit" disabled={isProcessing} className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold rounded p-2 text-xs transition-all hover:scale-[1.01] shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)] flex items-center justify-center gap-2 mt-1">
                   {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-3.5 h-3.5" />} Create Identity & Vault
                 </button>
               </form>
             </div>
          )}
        </div>
        
        {/* Footer shrink-blocked to maintain presence at bounds layer */}
        <div className="mt-1 text-center text-[9px] sm:text-[10px] text-gray-400 dark:text-gray-600 flex flex-col gap-0.5 w-full shrink-0">
          <p className="flex items-center justify-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> Immutable Data Minimization.</p>
          <p>Local Storage DB is natively encrypted with these keys.</p>
        </div>
      </div>
    </div>
  );
}
