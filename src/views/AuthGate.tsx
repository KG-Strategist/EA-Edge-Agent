import React, { useState, useEffect, useCallback } from 'react';
import { Shield, KeyRound, AlertTriangle, Fingerprint, Lock, Loader2, Wifi, Globe, ServerOff, Info, CheckCircle2, Moon, Sun, ArrowLeft, Server, UserPlus, FolderKey, Zap, Eye, EyeOff, Plane, Network } from 'lucide-react';
import { registerLocalUser, registerHybridUser, loginWith2FA, loginWithSSO, getCurrentUser, generatePseudonym, initiateOAuthLogin, handleOAuthCallback, isOAuthCallback } from '../lib/authEngine';
import Logo from '../components/ui/Logo';
import { db, GlobalSetting } from '../lib/db';
import { UserIdentity, useStateContext } from '../context/StateContext';
import { useLiveQuery } from 'dexie-react-hooks';

type Particle = { id: number; x: number; y: number; size: number };

// Reusable back button component for navigation consistency
const BackButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button onClick={onClick} className="flex items-center gap-1 text-xs sm:text-sm font-bold text-gray-500 dark:text-blue-300/70 hover:text-blue-600 dark:hover:text-blue-300 transition-colors">
    <ArrowLeft size={12} /> {label}
  </button>
);

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
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
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

type AuthView = 'LOADING' | 'LOGIN' | 'MODE_SELECT' | 'CONFIG_HYBRID' | 'HYBRID_AUTH_OPTIONS' | 'AIR_GAP_OPTIONS' | 'CONFIG_ENTERPRISE' | 'CONFIG_LDAP' | 'OAUTH_INIT' | 'LOCAL_BINDING' | 'RECOVERY' | 'RECOVERY_SUCCESS' | 'HYBRID_CONSENT' | 'AIRGAP_CONSENT' | 'PIN_SETUP';

const getPasswordStrength = (pass: string) => {
  let score = 0;
  if (!pass) return { score: 0, label: '', color: 'bg-gray-200 dark:bg-gray-700' };
  if (pass.length >= 8) score += 1;
  if (pass.length >= 12) score += 1;
  if (/[A-Z]/.test(pass)) score += 1;
  if (/[0-9]/.test(pass)) score += 1;
  if (/[^A-Za-z0-9]/.test(pass)) score += 1;

  let level = 1;
  if (score >= 4) level = 4;
  else if (score >= 3) level = 3;
  else if (score >= 2) level = 2;

  if (level === 1) return { score: 1, label: 'Weak', color: 'bg-red-500' };
  if (level === 2) return { score: 2, label: 'Fair', color: 'bg-amber-500' };
  if (level === 3) return { score: 3, label: 'Good', color: 'bg-blue-500' };
  return { score: 4, label: 'Strong', color: 'bg-emerald-500' };
};

export default function AuthGate({ onAuthenticated }: { onAuthenticated: (identity: UserIdentity | null) => void }) {
  const [view, setView] = useState<AuthView>('LOADING');
  const [globalConfig, setGlobalConfig] = useState<GlobalSetting | null>(null);
  const [isInSetupWorkflow, setIsInSetupWorkflow] = useState(false); // Prevents checkState from interrupting setup
  
  const [pseudokey, setPseudokey] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pendingProviderId, setPendingProviderId] = useState<string>('');

  const { theme, toggleTheme } = useStateContext();
  const isDark = theme === 'dark';

  const appSettings = useLiveQuery(() => db.app_settings.toArray()) || [];
  const enableNetworkIntegrations = appSettings.find((s: any) => s.key === 'enableNetworkIntegrations')?.value === true;
  const isAirGapped = !enableNetworkIntegrations;
  
  const [entProviderName, setEntProviderName] = useState('Corporate Keycloak');
  const [entAuthUrl, setEntAuthUrl] = useState('https://sso.corp.local/auth');
  const [entClientId, setEntClientId] = useState('ea-edge-agent');
  const [entTokenUrl] = useState('');

  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTempLoginMode, setIsTempLoginMode] = useState(false);
  const [isRecoveryContext, setIsRecoveryContext] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showIntent, setShowIntent] = useState(false);
  const [flowOrigin, setFlowOrigin] = useState<'hybrid' | 'airgap' | ''>('');
  const [oauthStatus, setOauthStatus] = useState<string>('');
  const [telemetryConsent, setTelemetryConsent] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [entLdapUrl, setEntLdapUrl] = useState('ldap://dc.corp.local:389');
  const [entLdapBaseDn, setEntLdapBaseDn] = useState('dc=corp,dc=local');
  const [showAgentId, setShowAgentId] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  
  // Security Questions State
  const [q1Id, setQ1Id] = useState('q1');
  const [q1Answer, setQ1Answer] = useState('');
  const [q2Id, setQ2Id] = useState('q2');
  const [q2Answer, setQ2Answer] = useState('');
  const [recoveredPassword, setRecoveredPassword] = useState<string | null>(null);
  const [showRecoveredPassword, setShowRecoveredPassword] = useState(false);
  const [showRecoveredAgentId, setShowRecoveredAgentId] = useState(false);
  const [showRecoveredPin, setShowRecoveredPin] = useState(false);

  const securityQuestionOptions = [
    { id: 'q1', text: 'What was the name of your first pet?' },
    { id: 'q2', text: 'What is your mother\'s maiden name?' },
    { id: 'q3', text: 'What city were you born in?' },
    { id: 'q4', text: 'What was the make of your first car?' },
    { id: 'q5', text: 'What is your favorite book?' },
  ];

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

  const dispatchAuthSuccess = useCallback(async (uname?: string) => {
    const finalUname = uname || getCurrentUser() || pseudokey || 'Unknown';
    
    let role: 'System Admin' | 'Lead EA' | 'Viewer' = 'Viewer';
    try {
      const user = await db.users.where('pseudokey').equals(finalUname).first();
      if (user?.demographics?.roleToken) {
        const token = user.demographics.roleToken;
        if (token === 'System Admin' || token === 'Lead EA' || token === 'Viewer') {
          role = token as 'System Admin' | 'Lead EA' | 'Viewer';
        }
      }
    } catch (e) {
      console.error("Failed to fetch user role", e);
    }

    onAuthenticated({
      mode: globalConfig?.connection_mode === 'AIR_GAPPED' ? 'AirGapped' : 'Hybrid',
      username: finalUname,
      role
    });
  }, [globalConfig?.connection_mode, onAuthenticated, pseudokey]);

  useEffect(() => {
    const checkState = async () => {
      // 1. Check for OAuth callback return (?code=&state= in URL)
      if (isOAuthCallback()) {
        setIsInSetupWorkflow(true); // Mark as in setup to prevent interruption
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
            setIsInSetupWorkflow(false); // Exit setup workflow
            await dispatchAuthSuccess(existingUser.pseudokey);
            return;
          }
          // New user — proceed to local identity binding
          setFlowOrigin('hybrid');
          setView('LOCAL_BINDING');
          return;
        } else {
          setError(result.error || 'OAuth authentication failed.');
          setIsProcessing(false);
          setOauthStatus('');
          setIsInSetupWorkflow(false); // Exit on error
          // Fall through to normal state check
        }
      }

      // 2. Normal state check - SKIP if user is in setup workflow
      if (isInSetupWorkflow) {
        return; // Don't interrupt setup with state checks
      }

      const curr = getCurrentUser();
      if (curr) {
        await dispatchAuthSuccess(curr);
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
  }, [globalConfig?.connection_mode, isInSetupWorkflow, dispatchAuthSuccess]);

  const saveHybridConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInSetupWorkflow(true); // Enter setup workflow
    setIsProcessing(true);
    const cfg: GlobalSetting = {
      id: 'SSO_CONFIG',
      connection_mode: 'HYBRID',
      public_sso_enabled: true
    };
    await db.global_settings.put(cfg);
    setGlobalConfig(cfg);
    setFlowOrigin('hybrid');
    setView('HYBRID_AUTH_OPTIONS');
    setIsProcessing(false);
  };

  const saveEnterpriseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInSetupWorkflow(true); // Enter setup workflow
    setIsProcessing(true);
    // Context-aware: preserve HYBRID mode if user came from hybrid flow
    const mode = flowOrigin === 'hybrid' ? 'HYBRID' : 'AIR_GAPPED';
    const cfg: GlobalSetting = {
      id: 'SSO_CONFIG',
      connection_mode: mode,
      public_sso_enabled: flowOrigin === 'hybrid',
      authType: 'SSO',
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
    setIsInSetupWorkflow(true); // Enter setup workflow
    setIsProcessing(true);
    // Context-aware: preserve HYBRID mode if user came from hybrid flow
    const mode = flowOrigin === 'hybrid' ? 'HYBRID' : 'AIR_GAPPED';
    const cfg: GlobalSetting = {
      id: 'SSO_CONFIG',
      connection_mode: mode,
      public_sso_enabled: flowOrigin === 'hybrid',
      authType: 'LDAP',
      local_ldap: {
        ldapUrl: entLdapUrl,
        baseDn: entLdapBaseDn
      },
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

  /** Trigger real OAuth redirect */
  const triggerOAuth = async (provider: 'google' | 'microsoft') => {
    setError('');
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
  };

  /** Trigger Hybrid Limited flow (bypasses OAuth) */
  const triggerHybridLimited = () => {
    setError('');
    setView('HYBRID_CONSENT');
  };

  const acceptHybridConsent = () => {
    if (isTempLoginMode) {
      setView('PIN_SETUP');
      return;
    }
    const mockProviderId = `hybrid-limited|${Math.random().toString(36).substring(2, 15)}`;
    setPendingProviderId(mockProviderId);
    setPseudokey(generatePseudonym());
    setFlowOrigin('hybrid');
    setView('LOCAL_BINDING');
  };

  const [airgapConsentType, setAirgapConsentType] = useState<'standalone' | 'enterprise' | 'ldap'>('standalone');

  /** Enterprise SSO trigger (uses existing mock for air-gapped on-prem) */
  const triggerEnterpriseSso = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const mockId = `enterprise-oauth2|${Date.now()}`;
      setPendingProviderId(mockId);
      setPseudokey(generatePseudonym());
      setFlowOrigin('airgap');
      setView('LOCAL_BINDING');
      setIsProcessing(false);
    }, 1500);
  };

  /** Standalone local identity — no SSO provider required */
  const handleStandaloneSetup = () => {
    setIsInSetupWorkflow(true); // Enter setup workflow
    const cfg: GlobalSetting = {
      id: 'SSO_CONFIG',
      connection_mode: 'AIR_GAPPED',
      public_sso_enabled: false
    };
    db.global_settings.put(cfg);
    setGlobalConfig(cfg);
    setPendingProviderId(''); // Clear — no SSO link
    setPseudokey(generatePseudonym());
    setFlowOrigin('airgap');
    setAirgapConsentType('standalone');
    setView('AIRGAP_CONSENT');
  };

  const handleLocalBinding = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!pseudokey || pseudokey.length < 5) return setError('Pseudonym must be at least 5 characters');
    if (password.length < 8) return setError('Passphrase must be at least 8 characters');
    if (getPasswordStrength(password).score < 2) return setError('Passphrase is too weak. Please include numbers or uppercase letters.');
    if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) return setError('PIN must be 4-6 digits');
    if (pin !== confirmPin) return setError('PINs do not match');
    if (q1Id === q2Id) return setError('Please select two different security questions');
    if (!q1Answer.trim() || !q2Answer.trim()) return setError('Please answer both security questions');

    setIsProcessing(true);
    try {
      const securityQuestions = [
        { questionId: q1Id, answer: q1Answer },
        { questionId: q2Id, answer: q2Answer }
      ];

      const baseConsentHistory = [];
      if (globalConfig?.connection_mode === 'HYBRID') {
        if (flowOrigin === 'hybrid' && !pendingProviderId.includes('oauth2')) {
          baseConsentHistory.push({
            type: 'HYBRID_LIMITED',
            grantedAt: new Date(),
            version: '1.0'
          });
        } else if (telemetryConsent) {
          baseConsentHistory.push({
            type: 'TELEMETRY',
            grantedAt: new Date(),
            version: '1.0'
          });
        }
      }
      if (globalConfig?.connection_mode === 'AIR_GAPPED') {
        if (airgapConsentType === 'standalone') {
          baseConsentHistory.push({
            type: 'OFFLINE_LIMITS',
            grantedAt: new Date(),
            version: '1.0'
          });
        } else {
          baseConsentHistory.push({
            type: 'PAM_PIM',
            grantedAt: new Date(),
            version: '1.0'
          });
        }
      }

      // Genesis Admin: First user always gets System Admin role
      const userCount = await db.users.count();
      const computedRoleToken = userCount === 0 ? 'System Admin' : 'Viewer';

      const demographics = {
        regionToken: 'UNKNOWN', // To be populated later if needed
        roleToken: computedRoleToken
      };

      if (globalConfig?.connection_mode === 'AIR_GAPPED') {
        // Technically enterprise SSO could act as hybrid identity context, but per instructions Air Gapped uses standalone identity binding for now, or links to the providerId. Let's link it to pendingProviderId if it exists.
        if (pendingProviderId) {
          await registerHybridUser(pendingProviderId, pseudokey, password, pin, securityQuestions, baseConsentHistory, demographics);
          await loginWithSSO(pendingProviderId);
        } else {
          await registerLocalUser(pseudokey, password, pin, securityQuestions, baseConsentHistory, demographics);
          await loginWith2FA(pseudokey, password, pin);
        }
      } else {
        // Hybrid mode (Public SSO)
        await registerHybridUser(pendingProviderId, pseudokey, password, pin, securityQuestions, baseConsentHistory, demographics);
        await loginWithSSO(pendingProviderId);
      }
      setIsInSetupWorkflow(false); // Exit setup workflow on success
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
      if (pseudokey && password) {
        if (isTempLoginMode) {
          const { verifyTempPassword } = await import('../lib/authEngine');
          const isTemp = await verifyTempPassword(pseudokey, password);
          if (isTemp) {
            const user = await db.users.where('pseudokey').equals(pseudokey).first();
            const hasConsented = user?.consentHistory && user.consentHistory.length > 0;
            
            setPin('');
            
            if (hasConsented) {
              setIsRecoveryContext(true);
              setView('PIN_SETUP');
            } else {
              setIsRecoveryContext(false);
              const currentMode = globalConfig?.connection_mode || 'AIR_GAPPED';
              setView(currentMode === 'HYBRID' ? 'HYBRID_CONSENT' : 'AIRGAP_CONSENT');
            }
            setIsProcessing(false);
            return;
          } else {
            setError('Invalid Temporary Credentials');
            setIsProcessing(false);
            return;
          }
        }

        if (!pin) {
          setError('Please provide PIN');
          setIsProcessing(false);
          return;
        }

        const success = await loginWith2FA(pseudokey, password, pin);
        if (success) await dispatchAuthSuccess(pseudokey);
        else setError('Invalid Credentials');
      } else {
        setError('Please provide Agent ID and Passphrase');
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

  const handleLDAPLogin = async () => {
    setError('');
    setIsProcessing(true);
    try {
      // MVP 1.1: LDAP auth routes through the same local identity resolution as SSO
      const ldapProviderId = `ldap-bind|${globalConfig?.local_ldap?.ldapUrl || 'local'}`;
      console.info('[AUDIT] LDAP Authentication Attempted:', ldapProviderId);
      const successPseudonym = await loginWithSSO(ldapProviderId);
      if (successPseudonym) dispatchAuthSuccess(successPseudonym);
      else setError('No local identity linked to this LDAP directory.');
    } catch (err: any) {
      setError(err.message || 'LDAP Authentication error');
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
    <>
      <MouseSparkles />
      <div className="min-h-screen w-full flex items-center justify-center relative bg-zinc-50 dark:bg-zinc-950 text-xs sm:text-sm transition-colors duration-300 px-4 py-2 overflow-hidden">
        
        {/* Minimalist Architect Grid Background */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none opacity-40 dark:opacity-20 transition-opacity"
        style={{
           backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
           backgroundSize: '24px 24px',
           color: 'rgb(148, 163, 184)' 
        }}
      />

      {/* Top Toggles */}
      <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
        <button
          onClick={() => {}}
          disabled={true}
          className="p-2 sm:p-2.5 border rounded-full shadow-sm transition-all backdrop-blur-md bg-gray-200/50 dark:bg-white/5 border-gray-300 dark:border-white/5 text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"
          title="Network configuration unavailable during Genesis setup."
          aria-label="Toggle Network Isolation"
        >
          {isAirGapped ? <Plane size={18} className="text-gray-400" /> : <Network size={18} className="text-gray-400" />}
        </button>

        <button
          onClick={toggleTheme}
          className="p-2 sm:p-2.5 bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 border border-gray-200 dark:border-white/10 rounded-full shadow-sm text-gray-700 dark:text-blue-100 transition-all backdrop-blur-md"
          title="Toggle Theme"
          aria-label="Toggle between light and dark theme"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
      {/* Inner Content Wrapper Safe-Area Layout (my-auto provides safe centering without top-clipping) */}
      <div className="flex flex-col items-center w-full max-w-md gap-2 sm:gap-3 z-10 relative">
        
        {/* Enhanced Hero Section - Full-width centered layout with breathing room */}
        <div className="text-center space-y-2 mb-0 w-full">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 relative z-20 drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]">
             <Logo className="w-full h-full" animated={true} context={view} />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight transition-colors duration-300">EA NITI</h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-blue-200/90 max-w-lg mx-auto leading-snug font-medium">
              Enterprise Architecture network-isolated triage and inference
            </p>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-blue-300/70 max-w-md mx-auto leading-snug">
              Secure, offline architecture analysis for regulated teams.
            </p>
          </div>
        </div>

        {/* Enhanced Main Container Card - Deeper shadows, stronger borders, increased padding */}
        <div className="w-full bg-white/95 dark:bg-white/[0.09] backdrop-blur-2xl rounded-3xl shadow-xl dark:shadow-[0_25px_100px_-20px_rgba(59,130,246,0.25)] border border-gray-300/80 dark:border-white/20 p-4 sm:p-5 transform transition-all duration-500 relative overflow-hidden">
          {/* Subtle inner top glow */}
          {isDark && <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent" />}
          
          <div className="flex flex-wrap justify-center gap-1.5 mb-3">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200 rounded border border-amber-200 dark:border-amber-500/20 text-[10px] font-bold tracking-wider">
              <Shield className="w-3 h-3 shrink-0" /> DPDP
            </div>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-800 dark:text-blue-200 rounded border border-blue-200 dark:border-blue-500/20 text-[10px] font-bold tracking-wider">
              <Shield className="w-3 h-3 shrink-0" /> GDPR
            </div>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 rounded border border-emerald-200 dark:border-emerald-500/20 text-[10px] font-bold tracking-wider">
              <Shield className="w-3 h-3 shrink-0" /> ISO27001
            </div>
            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 dark:bg-purple-500/10 text-purple-800 dark:text-purple-200 rounded border border-purple-200 dark:border-purple-500/20 text-[10px] font-bold tracking-wider">
              <Shield className="w-3 h-3 shrink-0" /> SOC2
            </div>
          </div>
          <div className="text-center mb-4">
            <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium">
              Enterprise-grade security. Identity data is sanitized locally.
            </p>
          </div>

          {view === 'LOGIN' && (() => {
            const hasEnterpriseSSO = !!globalConfig?.local_enterprise_sso?.clientId;
            const hasLDAP = !!globalConfig?.local_ldap?.ldapUrl;
            const hasPublicSSO = isInternetEnabled && globalConfig?.public_sso_enabled === true;

            return (
              <div className="space-y-5">
                <div className="text-center mb-4">
                  <h2 className="text-2xl font-bold tracking-tight text-white">Secure Login</h2>
                  <p className="text-sm text-gray-400 mt-1">Authenticate to access the workspace</p>
                </div>

                {/* Clean Air-Gap Informational Banner */}
                {!isInternetEnabled && (
                  <div className="bg-yellow-900/20 border border-yellow-700/50 text-yellow-500 text-xs px-3 py-2 rounded-md flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                    <span>Air-Gapped Mode: Public SSO Disabled</span>
                  </div>
                )}

                {/* ONLY render this block if there is an ACTIVE external provider */}
                {((isInternetEnabled && hasPublicSSO) || hasEnterpriseSSO || hasLDAP) && (
                  <div className="space-y-3">
                    {isInternetEnabled && hasPublicSSO && (
                      <>
                        <button onClick={() => handleSSOLogin('google-oauth2|mock')} className="w-full flex items-center justify-center py-2 px-4 border border-gray-600 rounded-md shadow-sm bg-gray-800 text-sm font-medium text-white hover:bg-gray-700">Sign in with Google</button>
                        <button onClick={() => handleSSOLogin('microsoft-oauth2|mock')} className="w-full flex items-center justify-center py-2 px-4 border border-gray-600 rounded-md shadow-sm bg-gray-800 text-sm font-medium text-white hover:bg-gray-700">Sign in with Microsoft</button>
                      </>
                    )}
                    {hasEnterpriseSSO && (
                      <button onClick={() => handleSSOLogin('enterprise-oauth2|mock')} className="w-full flex items-center justify-center py-2 px-4 border border-blue-500 rounded-md shadow-sm bg-blue-600 text-sm font-medium text-white hover:bg-blue-700">Sign in with Enterprise SSO</button>
                    )}
                    {hasLDAP && (
                      <button onClick={() => handleLDAPLogin()} className="w-full flex items-center justify-center py-2 px-4 border border-purple-500 rounded-md shadow-sm bg-purple-600 text-sm font-medium text-white hover:bg-purple-700">Sign in with LDAP</button>
                    )}
                  </div>
                )}

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-700" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-[#111827] text-gray-400 text-xs uppercase tracking-wider">Local Credentials</span>
                  </div>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-blue-100/90 mb-1">Agent ID (Pseudonym)</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Fingerprint className="h-4 w-4 text-gray-400 dark:text-blue-400/60" />
                        </div>
                        <input type={showAgentId ? "text" : "password"} value={pseudokey} onChange={e => setPseudokey(e.target.value)} required aria-label="Agent ID" title="Agent ID (Pseudonym)" placeholder="Enter Agent ID" className="pl-11 pr-10 w-full px-4 py-2.5 rounded-lg border-2 border-gray-200 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] dark:focus:shadow-[0_0_0_3px_rgba(59,130,246,0.2)] bg-white dark:bg-black/30 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 transition-all duration-200 text-sm" />
                        <button type="button" onClick={() => setShowAgentId(!showAgentId)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          {showAgentId ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className={isTempLoginMode ? "grid grid-cols-1" : "grid grid-cols-2 gap-3"}>
                      <div>
                        <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-blue-100/90 mb-1">Passphrase</label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <KeyRound className="h-4 w-4 text-gray-400 dark:text-blue-400/60" />
                          </div>
                          <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required aria-label="Passphrase" title="Passphrase" placeholder="Enter passphrase" className="pl-11 pr-10 w-full px-4 py-2.5 rounded-lg border-2 border-gray-200 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] dark:focus:shadow-[0_0_0_3px_rgba(59,130,246,0.2)] bg-white dark:bg-black/30 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 transition-all duration-200 text-sm" />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      {!isTempLoginMode && (
                        <div>
                          <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-blue-100/90 mb-1">PIN</label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                              <Lock className="h-4 w-4 text-gray-400 dark:text-blue-400/60" />
                            </div>
                            <input type={showPin ? "text" : "password"} value={pin} maxLength={6} onChange={e => setPin(e.target.value)} aria-label="2FA PIN" title="2FA PIN" placeholder="PIN" className="pl-11 pr-10 w-full px-4 py-2.5 rounded-lg border-2 border-gray-200 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] dark:focus:shadow-[0_0_0_3px_rgba(59,130,246,0.2)] bg-white dark:bg-black/30 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-white/30 transition-all duration-200 text-sm tracking-widest" />
                            <button type="button" onClick={() => setShowPin(!showPin)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                              {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setView('RECOVERY')} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">Forgot Credentials?</button>
                  </div>
                  
                  {error && <p className="text-red-500 dark:text-red-400 text-xs font-bold text-center bg-red-50 dark:bg-red-500/10 py-2 rounded-lg border border-red-200 dark:border-red-500/20">{error}</p>}
                  
                  <button type="submit" disabled={isProcessing} className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-gradient-to-r dark:from-blue-600 dark:to-blue-500 dark:hover:from-blue-500 dark:hover:to-blue-400 text-white font-bold rounded-lg px-6 py-3 text-sm transition-all hover:scale-[1.01] dark:shadow-[0_0_25px_-5px_rgba(59,130,246,0.5)] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" aria-label="Decrypt vault and login to EA NITI">
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />} Decrypt Vault & Login
                  </button>
                  <div className="pt-2 text-center">
                    <button type="button" onClick={() => setIsTempLoginMode(!isTempLoginMode)} className="text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
                      {isTempLoginMode ? "Back to Standard Login" : "First time logging in or forgot PIN? Use a Temporary Password"}
                    </button>
                  </div>

                  {(!hasEnterpriseSSO || !hasLDAP) && (
                    <div className="pt-4 mt-6 border-t border-gray-800 flex flex-col items-center justify-center gap-2">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider">Available Enterprise Integrations</span>
                      <div className="flex gap-2">
                        {!hasEnterpriseSSO && <span className="px-2 py-1 bg-gray-800/30 border border-gray-700/50 text-gray-500 text-[10px] rounded-full">Enterprise SSO (Unconfigured)</span>}
                        {!hasLDAP && <span className="px-2 py-1 bg-gray-800/30 border border-gray-700/50 text-gray-500 text-[10px] rounded-full">LDAP (Unconfigured)</span>}
                      </div>
                    </div>
                  )}
                </form>
              </div>
            );
          })()}

          {view === 'PIN_SETUP' && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-wide">Set Private Credentials</h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-blue-200/60 mt-1">Set your permanent password and 2FA PIN</p>
              </div>
              
              {isRecoveryContext && (
                <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg text-xs text-red-900 dark:text-red-200 text-left">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 mt-0.5 text-red-600 dark:text-red-400 shrink-0" />
                    <p>
                      <strong>CRYPTOGRAPHIC RESET:</strong> You are recovering your account via an Admin temporary password. Because your original private PIN is lost, your previous encrypted local vault cannot be decrypted. Setting a new PIN will permanently wipe your old encrypted records and initialize a fresh, secure vault.
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={async (e) => {
                e.preventDefault();
                setError('');
                if (newPassword.length < 8) return setError('Passphrase must be at least 8 characters');
                if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) return setError('PIN must be 4-6 digits');
                if (pin !== confirmPin) return setError('PINs do not match');
                
                setIsProcessing(true);
                try {
                  const { setupPermanentCredentials } = await import('../lib/authEngine');
                  const success = await setupPermanentCredentials(pseudokey, newPassword, pin);
                  if (success) {
                    await loginWith2FA(pseudokey, newPassword, pin);
                    await dispatchAuthSuccess(pseudokey);
                  } else {
                    setError('Failed to setup credentials');
                  }
                } catch (err: any) {
                  setError(err.message || 'Setup failed');
                } finally {
                  setIsProcessing(false);
                }
              }} className="space-y-3">
                <div>
                  <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-blue-100/90 mb-1">New Permanent Passphrase</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required aria-label="New Permanent Passphrase" title="New Permanent Passphrase" placeholder="Min 8 characters" className="w-full px-4 py-2.5 rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/30 text-gray-900 dark:text-white outline-none focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-blue-100/90 mb-1">New 2FA PIN</label>
                    <input type="password" value={pin} maxLength={6} onChange={e => setPin(e.target.value)} required aria-label="New 2FA PIN" title="New 2FA PIN" placeholder="4-6 digits" className="w-full px-4 py-2.5 rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/30 text-gray-900 dark:text-white text-center tracking-widest outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-blue-100/90 mb-1">Confirm PIN</label>
                    <input type="password" value={confirmPin} maxLength={6} onChange={e => setConfirmPin(e.target.value)} required aria-label="Confirm PIN" title="Confirm PIN" placeholder="Repeat PIN" className="w-full px-4 py-2.5 rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/30 text-gray-900 dark:text-white text-center tracking-widest outline-none focus:border-blue-500" />
                  </div>
                </div>
                {error && <p className="text-red-500 dark:text-red-400 text-xs font-bold text-center">{error}</p>}
                <button type="submit" disabled={isProcessing} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg px-6 py-3 text-sm transition-all flex items-center justify-center gap-2">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />} Save & Login
                </button>
              </form>
            </div>
          )}

          {view === 'MODE_SELECT' && (
             <div className="space-y-4">
               <div className="text-center">
                 <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-wide">Select Configuration Mode</h3>
                 <p className="text-xs sm:text-sm text-gray-500 dark:text-blue-200/60 mt-1">Define your enterprise threat boundary</p>
               </div>

               <div className="grid grid-cols-1 gap-3">
                 <button onClick={() => setView('CONFIG_HYBRID')} className="flex flex-row items-center text-left gap-3 p-2.5 border border-gray-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-blue-400/50 bg-gray-50 dark:bg-white/5 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transform transition-all duration-300 shadow-sm dark:hover:shadow-[0_10px_40px_-10px_rgba(59,130,246,0.3)] group relative overflow-hidden">
                    {isDark && <div className="absolute -inset-24 bg-blue-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}
                    
                    <div className="p-3 bg-blue-100 dark:bg-gradient-to-br dark:from-blue-500 dark:to-cyan-400 text-blue-600 dark:text-white rounded-lg shadow-sm dark:shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 relative z-10 shrink-0">
                      <Wifi size={18} />
                    </div>
                    <div className="relative z-10 flex-1">
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm">Hybrid (Internet)</h4>
                      <p className="text-xs text-gray-500 dark:text-blue-100/70 mt-1 leading-snug font-medium">
                        Public SSO (Google, Microsoft). Best for prototyping.
                      </p>
                    </div>
                 </button>

                 <button onClick={() => setView('AIR_GAP_OPTIONS')} className="flex flex-row items-center text-left gap-3 p-2.5 border border-gray-200 dark:border-white/10 hover:border-purple-400 dark:hover:border-purple-400/50 bg-gray-50 dark:bg-white/5 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transform transition-all duration-300 shadow-sm dark:hover:shadow-[0_10px_40px_-10px_rgba(168,85,247,0.3)] group relative overflow-hidden">
                    {isDark && <div className="absolute -inset-24 bg-purple-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}

                    <div className="p-3 bg-purple-100 dark:bg-gradient-to-br dark:from-purple-500 dark:to-pink-500 text-purple-600 dark:text-white rounded-lg shadow-sm dark:shadow-lg group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300 relative z-10 shrink-0">
                      <ServerOff size={18} />
                    </div>
                    <div className="relative z-10 flex-1">
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm">Air-Gapped (Isolated)</h4>
                      <p className="text-xs text-gray-500 dark:text-purple-100/70 mt-1 leading-snug font-medium">
                        Never reaches the internet. 3 auth methods.
                      </p>
                    </div>
                 </button>
               </div>
             </div>
          )}

          {view === 'CONFIG_HYBRID' && (
             <div className="space-y-4">
               <BackButton label="Back to Mode Selection" onClick={() => { setIsInSetupWorkflow(false); setView('MODE_SELECT'); }} />
               <form onSubmit={saveHybridConfig} className="space-y-4">
                 <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white text-center">Hybrid Internet Mode</h3>
                 <p className="text-xs sm:text-sm text-gray-500 dark:text-blue-200/60 text-center -mt-2">OAuth 2.0 with PKCE — zero secrets stored</p>
                 <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-200 dark:border-blue-500/30 text-xs">
                    <div className="flex items-start gap-3">
                      <Zap className="w-4 h-4 text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-blue-800 dark:text-blue-100/90 leading-snug font-semibold text-xs">Google & Microsoft SSO via Authorization Code + PKCE.</p>
                        <p className="text-blue-700/70 dark:text-blue-200/60 leading-snug mt-2 text-xs">No client secrets are stored. Your identity is verified, PII is scrubbed, and only a cryptographic pseudonym is retained locally.</p>
                      </div>
                    </div>
                 </div>
                 <button type="submit" disabled={isProcessing} className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold rounded-lg p-3 text-sm transition-all hover:scale-[1.02] shadow-[0_0_20px_-5px_rgba(59,130,246,0.5)] flex items-center justify-center gap-2">
                   <CheckCircle2 className="w-4 h-4" /> Enable Hybrid Mode & Continue
                 </button>
               </form>
             </div>
          )}

          {/* ─── HYBRID AUTH OPTIONS: Unified Identity Methods ─── */}
          {view === 'HYBRID_AUTH_OPTIONS' && (
             <div className="space-y-4">
               <BackButton label="Back to Mode Selection" onClick={() => { setIsInSetupWorkflow(false); setView('MODE_SELECT'); }} />
               <div className="text-center">
                 <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-wide">Choose Identity Method</h3>
                 <p className="text-xs sm:text-sm text-gray-500 dark:text-blue-200/60 mt-1">Select your authentication provider for Hybrid mode</p>
               </div>

               <div className="grid grid-cols-1 gap-3">
                 {/* Option 1: Public OAuth (Google/Microsoft) */}
                 <button onClick={() => setView('OAUTH_INIT')} className="flex flex-row items-center text-left gap-3 p-2.5 border border-gray-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-blue-400/50 bg-gray-50 dark:bg-white/5 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-all duration-300 shadow-sm group relative overflow-hidden">
                   {isDark && <div className="absolute -inset-24 bg-blue-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}
                   <div className="p-2 bg-blue-100 dark:bg-gradient-to-br dark:from-blue-500 dark:to-cyan-400 text-blue-600 dark:text-white rounded-lg shadow-sm dark:shadow-lg shrink-0 group-hover:scale-110 transition-transform relative z-10">
                     <Globe size={16} />
                   </div>
                   <div className="relative z-10 flex-1 min-w-0">
                     <h4 className="font-bold text-gray-900 dark:text-white text-sm">Public OAuth (SSO)</h4>
                     <p className="text-xs text-gray-500 dark:text-blue-100/70 leading-tight font-medium mt-1 truncate">Google, Microsoft via PKCE</p>
                   </div>
                 </button>

                 {/* Option 2: Enterprise SSO */}
                 <button onClick={() => { setAirgapConsentType('enterprise'); setFlowOrigin('hybrid'); setView('AIRGAP_CONSENT'); }} className="flex flex-row items-center text-left gap-3 p-2.5 border border-gray-200 dark:border-white/10 hover:border-purple-400 dark:hover:border-purple-400/50 bg-gray-50 dark:bg-white/5 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-all duration-300 shadow-sm group relative overflow-hidden">
                   {isDark && <div className="absolute -inset-24 bg-purple-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}
                   <div className="p-2 bg-purple-100 dark:bg-gradient-to-br dark:from-purple-500 dark:to-pink-500 text-purple-600 dark:text-white rounded-lg shadow-sm dark:shadow-lg shrink-0 group-hover:scale-110 transition-transform relative z-10">
                     <Server size={16} />
                   </div>
                   <div className="relative z-10 flex-1 min-w-0">
                     <h4 className="font-bold text-gray-900 dark:text-white text-sm">Enterprise SSO</h4>
                     <p className="text-xs text-gray-500 dark:text-purple-100/70 leading-tight font-medium mt-1 truncate">Keycloak, ADFS, Okta</p>
                   </div>
                 </button>

                 {/* Option 3: LDAP Binding */}
                 <button onClick={() => { setAirgapConsentType('ldap'); setFlowOrigin('hybrid'); setView('AIRGAP_CONSENT'); }} className="flex flex-row items-center text-left gap-3 p-2.5 border border-gray-200 dark:border-white/10 hover:border-amber-400 dark:hover:border-amber-400/50 bg-gray-50 dark:bg-white/5 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-all duration-300 shadow-sm group relative overflow-hidden">
                   {isDark && <div className="absolute -inset-24 bg-amber-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}
                   <div className="p-2 bg-amber-100 dark:bg-gradient-to-br dark:from-amber-500 dark:to-orange-400 text-amber-600 dark:text-white rounded-lg shadow-sm dark:shadow-lg shrink-0 group-hover:scale-110 transition-transform relative z-10">
                     <FolderKey size={16} />
                   </div>
                   <div className="relative z-10 flex-1 min-w-0">
                     <h4 className="font-bold text-gray-900 dark:text-white text-sm">LDAP Binding</h4>
                     <p className="text-xs text-gray-500 dark:text-amber-100/70 leading-tight font-medium mt-1 truncate">Corporate directory</p>
                   </div>
                 </button>

                 {/* Option 4: Hybrid Limited */}
                 <button onClick={triggerHybridLimited} className="flex flex-row items-center text-left gap-3 p-2.5 border border-gray-200 dark:border-white/10 hover:border-emerald-400 dark:hover:border-emerald-400/50 bg-gray-50 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-all duration-300 shadow-sm group relative overflow-hidden">
                   {isDark && <div className="absolute -inset-24 bg-emerald-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}
                   <div className="p-2 bg-emerald-100 dark:bg-gradient-to-br dark:from-emerald-500 dark:to-teal-400 text-emerald-600 dark:text-white rounded-lg shadow-sm dark:shadow-lg shrink-0 group-hover:scale-110 transition-transform relative z-10">
                     <Shield size={16} />
                   </div>
                   <div className="relative z-10 flex-1 min-w-0">
                     <h4 className="font-bold text-gray-900 dark:text-white text-sm">Hybrid Limited</h4>
                     <p className="text-xs text-gray-500 dark:text-emerald-100/70 leading-tight font-medium mt-1 truncate">No SSO — local caching only</p>
                   </div>
                 </button>
               </div>
             </div>
          )}

          {/* ─── AIR-GAPPED OPTIONS: 3 Identity Methods ─── */}
          {view === 'AIR_GAP_OPTIONS' && (
             <div className="space-y-4">
               <BackButton label="Back to Mode Selection" onClick={() => { setIsInSetupWorkflow(false); setView('MODE_SELECT'); }} />
               <div className="text-center">
                 <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-wide">Air-Gapped Identity Setup</h3>
                 <p className="text-xs sm:text-sm text-gray-500 dark:text-purple-200/60 mt-1">Choose how to establish your local zero-PII identity</p>
               </div>

               <div className="grid grid-cols-1 gap-3">
                 {/* Option 1: Standalone Local 2FA */}
                 <button onClick={handleStandaloneSetup} className="flex flex-row items-center text-left gap-3 p-2.5 border border-gray-200 dark:border-white/10 hover:border-emerald-400 dark:hover:border-emerald-400/50 bg-gray-50 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-all duration-300 shadow-sm group relative overflow-hidden">
                    {isDark && <div className="absolute -inset-24 bg-emerald-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}
                    <div className="p-2 bg-emerald-100 dark:bg-gradient-to-br dark:from-emerald-500 dark:to-teal-400 text-emerald-600 dark:text-white rounded-lg shadow-sm dark:shadow-lg shrink-0 group-hover:scale-110 transition-transform relative z-10">
                      <UserPlus size={16} />
                    </div>
                    <div className="relative z-10 flex-1 min-w-0">
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm">Standalone 2FA</h4>
                      <p className="text-xs text-gray-500 dark:text-emerald-100/70 leading-tight font-medium mt-1 truncate">
                        Offline identity in vault
                      </p>
                    </div>
                 </button>

                 {/* Option 2: Enterprise SSO */}
                 <button onClick={() => { setAirgapConsentType('enterprise'); setView('AIRGAP_CONSENT'); }} className="flex flex-row items-center text-left gap-3 p-2.5 border border-gray-200 dark:border-white/10 hover:border-purple-400 dark:hover:border-purple-400/50 bg-gray-50 dark:bg-white/5 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-all duration-300 shadow-sm group relative overflow-hidden">
                    {isDark && <div className="absolute -inset-24 bg-purple-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}
                    <div className="p-2 bg-purple-100 dark:bg-gradient-to-br dark:from-purple-500 dark:to-pink-500 text-purple-600 dark:text-white rounded-lg shadow-sm dark:shadow-lg shrink-0 group-hover:scale-110 transition-transform relative z-10">
                      <Server size={16} />
                    </div>
                    <div className="relative z-10 flex-1 min-w-0">
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm">Enterprise SSO</h4>
                      <p className="text-xs text-gray-500 dark:text-purple-100/70 leading-tight font-medium mt-1 truncate">
                        Keycloak, ADFS, Okta
                      </p>
                    </div>
                 </button>

                 {/* Option 3: LDAP / Active Directory */}
                 <button onClick={() => { setAirgapConsentType('ldap'); setView('AIRGAP_CONSENT'); }} className="flex flex-row items-center text-left gap-3 p-2.5 border border-gray-200 dark:border-white/10 hover:border-amber-400 dark:hover:border-amber-400/50 bg-gray-50 dark:bg-white/5 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-all duration-300 shadow-sm group relative overflow-hidden">
                    {isDark && <div className="absolute -inset-24 bg-amber-500/20 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />}
                    <div className="p-2 bg-amber-100 dark:bg-gradient-to-br dark:from-amber-500 dark:to-orange-400 text-amber-600 dark:text-white rounded-lg shadow-sm dark:shadow-lg shrink-0 group-hover:scale-110 transition-transform relative z-10">
                      <FolderKey size={16} />
                    </div>
                    <div className="relative z-10 flex-1 min-w-0">
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm">LDAP Binding</h4>
                      <p className="text-xs text-gray-500 dark:text-amber-100/70 leading-tight font-medium mt-1 truncate">
                        Corporate directory
                      </p>
                    </div>
                 </button>
               </div>
             </div>
          )}

          {/* ─── Enterprise SSO Config Form ─── */}
          {view === 'CONFIG_ENTERPRISE' && (
             <div className="space-y-3">
               <BackButton label="Back to Auth Methods" onClick={() => setView(flowOrigin === 'hybrid' ? 'HYBRID_AUTH_OPTIONS' : 'AIR_GAP_OPTIONS')} />
               <form onSubmit={saveEnterpriseConfig} className="space-y-3">
                 <h3 className="text-base sm:text-lg font-bold text-center text-gray-900 dark:text-white">Enterprise SSO Configuration</h3>
                 <p className="text-xs sm:text-sm text-gray-500 dark:text-purple-200/60 text-center -mt-2">OIDC / SAML identity provider</p>
                 
                 <div className="space-y-3">
                   <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-600 dark:text-purple-200/80 mb-1">Auth URL (Intranet)</label>
                      <input type="text" value={entAuthUrl} onChange={e => setEntAuthUrl(e.target.value)} required className="w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 px-3 outline-none focus:border-purple-500/50 shadow-inner placeholder-gray-400 dark:placeholder-white/20 text-xs" placeholder="https://sso.internal.corp" />
                   </div>
                   <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-600 dark:text-purple-200/80 mb-1">Provider Name</label>
                      <input type="text" value={entProviderName} onChange={e => setEntProviderName(e.target.value)} required className="w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 px-3 outline-none focus:border-purple-500/50 shadow-inner placeholder-gray-400 dark:placeholder-white/20 text-xs" placeholder="Corporate Keycloak" />
                   </div>
                   <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-600 dark:text-purple-200/80 mb-1">Client ID</label>
                      <input type="text" value={entClientId} onChange={e => setEntClientId(e.target.value)} required className="w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 px-3 outline-none focus:border-purple-500/50 shadow-inner placeholder-gray-400 dark:placeholder-white/20 text-xs" placeholder="ea-edge-agent" />
                   </div>
                 </div>

                 <button type="submit" disabled={isProcessing} className="w-full bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white font-bold rounded-lg p-2.5 text-sm transition-all shadow-[0_0_20px_-5px_rgba(168,85,247,0.5)] hover:scale-[1.02]">
                   Save & Authenticate via SSO
                 </button>
               </form>
             </div>
          )}

          {/* ─── LDAP / Active Directory Config ─── */}
          {view === 'CONFIG_LDAP' && (
             <div className="space-y-3">
               <BackButton label="Back to Auth Methods" onClick={() => setView(flowOrigin === 'hybrid' ? 'HYBRID_AUTH_OPTIONS' : 'AIR_GAP_OPTIONS')} />
               <form onSubmit={saveLdapConfig} className="space-y-3">
                 <h3 className="text-base sm:text-lg font-bold text-center text-gray-900 dark:text-white">LDAP / Active Directory</h3>
                 <p className="text-xs sm:text-sm text-gray-500 dark:text-amber-200/60 text-center -mt-2">Bind against corporate directory service</p>
                 
                 <div className="space-y-3">
                   <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-600 dark:text-amber-200/80 mb-1">LDAP URL</label>
                      <input type="text" value={entLdapUrl} onChange={e => setEntLdapUrl(e.target.value)} required className="w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 px-3 outline-none focus:border-amber-500/50 shadow-inner placeholder-gray-400 dark:placeholder-white/20 text-xs" placeholder="ldap://dc.corp.local:389" />
                   </div>
                   <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-600 dark:text-amber-200/80 mb-1">Base DN</label>
                      <input type="text" value={entLdapBaseDn} onChange={e => setEntLdapBaseDn(e.target.value)} required className="w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 px-3 outline-none focus:border-amber-500/50 shadow-inner placeholder-gray-400 dark:placeholder-white/20 text-xs" placeholder="dc=corp,dc=local" />
                   </div>
                 </div>

                 <div className="py-2 px-3 bg-amber-50 dark:bg-amber-500/10 rounded-lg border border-amber-200 dark:border-amber-500/20 text-xs text-amber-700 dark:text-amber-200/80 leading-snug">
                   <Info className="w-4 h-4 inline mr-2" />LDAP binding is mocked locally for development.
                 </div>
                 <button type="submit" disabled={isProcessing} className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold rounded-lg p-2.5 text-sm transition-all shadow-[0_0_20px_-5px_rgba(217,119,6,0.5)] hover:scale-[1.02]">
                   Bind & Continue
                 </button>
               </form>
             </div>
          )}

          {view === 'OAUTH_INIT' && (
             <div className="space-y-3">
               <BackButton label="Back" onClick={() => setView(globalConfig?.connection_mode === 'AIR_GAPPED' ? 'AIR_GAP_OPTIONS' : 'CONFIG_HYBRID')} />
               <div className="text-center">
                 <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Authenticate to Edge</h3>
                 <p className="text-xs sm:text-sm text-gray-500 dark:text-blue-200/60 mt-1">Verify your identity via OAuth 2.0 PKCE</p>
               </div>
               
               {isProcessing ? (
                 <div className="flex flex-col items-center p-3 bg-gray-50 dark:bg-black/20 rounded-lg shadow-inner">
                   <Loader2 className="w-5 h-5 animate-spin text-blue-500 dark:text-blue-400 mb-1" />
                   <p className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-300">{oauthStatus || 'Verifying Identity & Scrubbing PII...'}</p>
                 </div>
               ) : (
                 <div className="space-y-2">
                   {error && <p className="text-red-500 dark:text-red-400 text-xs sm:text-sm font-bold text-center bg-red-50 dark:bg-red-500/10 py-2 px-2 rounded-lg border border-red-200 dark:border-red-500/20">{error}</p>}

                   {globalConfig?.connection_mode === 'HYBRID' && isOnline ? (
                     <>
                       <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-3 mb-3">
                         <label className="flex items-start gap-2 cursor-pointer">
                           <input 
                             type="checkbox" 
                             checked={telemetryConsent} 
                             onChange={(e) => setTelemetryConsent(e.target.checked)}
                             aria-label="Telemetry and Analytics Consent"
                             title="Telemetry and Analytics Consent"
                             className="mt-1 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                           />
                           <div className="text-xs text-blue-900 dark:text-blue-100">
                             <p className="font-semibold mb-1">Telemetry & Analytics Consent (DPDP/GDPR)</p>
                             <p className="opacity-80">I consent to sending anonymized OTEL metrics, traces, and logs to eaniti.org for internet analytics. Data is tokenized and minimized.</p>
                           </div>
                         </label>
                       </div>

                       <div className="text-[10px] text-gray-500 dark:text-gray-400 px-2 mb-3 text-center">
                         <strong>Legal Disclosure:</strong> We reserve the right to de-tokenize and share OAuth data with law enforcement if criminal activity occurs, subject to valid warrants per DPDP/GDPR.
                       </div>

                       <button disabled={!telemetryConsent} onClick={() => triggerOAuth('google')} className="w-full flex items-center justify-center gap-2 py-2 sm:py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:border-red-400 dark:hover:border-red-500/50 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-800 dark:text-white rounded-lg text-xs sm:text-sm font-bold transition-all hover:shadow-[0_0_20px_-5px_rgba(239,68,68,0.4)] hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none">
                         <Globe className="w-3.5 h-3.5 text-red-500 dark:text-red-400" /> Continue with Google
                       </button>
                       <button disabled={!telemetryConsent} onClick={() => triggerOAuth('microsoft')} className="w-full flex items-center justify-center gap-2 py-2 sm:py-2.5 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:border-blue-400 dark:hover:border-blue-500/50 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-800 dark:text-white rounded-lg text-xs sm:text-sm font-bold transition-all hover:shadow-[0_0_20px_-5px_rgba(59,130,246,0.4)] hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none">
                         <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Continue with Microsoft
                       </button>

                       {/* Hybrid Limited Toggle */}
                       <div className="flex items-center justify-center gap-2 pt-2">
                         <button
                           onClick={triggerHybridLimited}
                           className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                         >
                           <Shield className="w-3 h-3" />
                           Use Hybrid with Limited web features with OAuth
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

          {view === 'HYBRID_CONSENT' && (
             <div className="space-y-4">
               <BackButton label="Back" onClick={() => setView('OAUTH_INIT')} />
               <div className="text-center">
                 <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">Network Consent Required</h3>
                 <p className="text-xs sm:text-sm text-gray-500 dark:text-blue-200/60 mt-1">Unauthenticated Hybrid Mode</p>
               </div>
               
               <div className="p-4 bg-amber-50 dark:bg-amber-500/10 rounded-lg border border-amber-200 dark:border-amber-500/30 text-xs">
                 <div className="flex items-start gap-3">
                   <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                   <div className="space-y-2 text-amber-900 dark:text-amber-100/90">
                     <p className="font-bold text-sm">Restricted Network Access</p>
                     <p>
                       You are proceeding without an OAuth/Public Sign-in. In this "Unauthenticated" status, Hybrid mode is <strong>strictly restricted to local LLM downloads and caching only</strong>.
                     </p>
                     <p>
                       No other external network features (like global agents or marketplace) will be available until you authenticate.
                     </p>
                   </div>
                 </div>
               </div>

               <button onClick={acceptHybridConsent} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg p-2.5 text-sm transition-all shadow-md">
                 I Understand & Consent
               </button>
             </div>
          )}

          {view === 'AIRGAP_CONSENT' && (
             <div className="space-y-4">
               <BackButton label="Back" onClick={() => setView(flowOrigin === 'hybrid' ? 'HYBRID_AUTH_OPTIONS' : 'AIR_GAP_OPTIONS')} />
               <div className="text-center">
                 <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">{flowOrigin === 'hybrid' ? 'Hybrid Operations Consent' : 'Air-Gap Operations Consent'}</h3>
                 <p className="text-xs sm:text-sm text-gray-500 dark:text-purple-200/60 mt-1">{flowOrigin === 'hybrid' ? 'Review network exposure and data handling' : 'Review offline limitations and data handling'}</p>
               </div>
               
               <div className={`p-4 rounded-lg border text-xs ${flowOrigin === 'hybrid' ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30' : 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30'}`}>
                 <div className="flex items-start gap-3">
                   {flowOrigin === 'hybrid' ? <Wifi className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" /> : <ServerOff className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />}
                   <div className={`space-y-2 ${flowOrigin === 'hybrid' ? 'text-blue-900 dark:text-blue-100/90' : 'text-purple-900 dark:text-purple-100/90'}`}>
                     <p className="font-bold text-sm">{flowOrigin === 'hybrid' ? 'Hybrid Network Consent' : 'Offline Mode Acknowledgment'}</p>
                     {flowOrigin === 'hybrid' ? (
                       <>
                         <p>
                           I acknowledge that EA-NITI is operating in <strong>Hybrid Mode</strong>. By proceeding, I consent to the local storage of cryptographic keys and authorize explicit network egress required for identity federation, LLM caching, and external enterprise integrations.
                         </p>
                         {airgapConsentType !== 'standalone' && (
                           <p>
                             <strong>Impact:</strong> Authentication metadata will be exchanged with your configured {airgapConsentType === 'enterprise' ? 'Enterprise SSO provider' : 'LDAP directory server'}. All AI inference remains local.
                           </p>
                         )}
                       </>
                     ) : airgapConsentType === 'standalone' ? (
                       <>
                         <p>
                           I acknowledge that EA-NITI operates in strict <strong>Zero-Trust mode</strong>. By proceeding, I accept the local storage of cryptographic keys and confirm that <strong>NO data leaves my machine</strong> unless I manually enable external integrations.
                         </p>
                         <p>
                           <strong>Important:</strong> A temporary internet connection (via Settings) is required for the initial local LLM model caching.
                         </p>
                         <p>
                           <strong>Omitted Features:</strong> Web search grounding, live market analysis, global agent chat, and web-based model training are permanently disabled in this mode.
                         </p>
                       </>
                     ) : (
                       <>
                         <p>
                           You are configuring an <strong>{airgapConsentType === 'enterprise' ? 'Enterprise SSO' : 'LDAP Binding'}</strong> identity in Air-Gapped mode.
                         </p>
                         <p>
                           <strong>Impact:</strong> This integrates with your organization's Multi-UAM or Centralized PAM/PIM systems. Your local actions may be audited by your enterprise administrators according to internal policies.
                         </p>
                         <p>
                           All AI processing remains local to this device, but authentication telemetry may be sent to your corporate identity provider.
                         </p>
                       </>
                     )}
                   </div>
                 </div>
               </div>

               <button onClick={() => {
                 if (isTempLoginMode) {
                   setView('PIN_SETUP');
                   return;
                 }
                 if (airgapConsentType === 'standalone') {
                   setView('LOCAL_BINDING');
                 } else if (airgapConsentType === 'enterprise') {
                   setView('CONFIG_ENTERPRISE');
                 } else if (airgapConsentType === 'ldap') {
                   setView('CONFIG_LDAP');
                 }
               }} className={`w-full font-bold rounded-lg p-2.5 text-sm transition-all shadow-md text-white ${flowOrigin === 'hybrid' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700'}`}>
                 I Understand & Consent
               </button>
             </div>
          )}

          {view === 'LOCAL_BINDING' && (
             <div className="space-y-3">
               <BackButton label="Back to Auth Methods" onClick={() => {
                 if (flowOrigin === 'hybrid') {
                   setView('OAUTH_INIT');
                 } else {
                   setView('AIR_GAP_OPTIONS');
                 }
               }} />
               <form onSubmit={handleLocalBinding} className="space-y-3">
                 <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl text-emerald-900 dark:text-emerald-100 shadow-inner">
                   <div className="flex flex-col gap-1">
                     <div className="flex items-center gap-2 text-sm font-semibold">
                       <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                       <span>{pendingProviderId ? 'SSO Validated.' : 'Air-Gapped Identity.'}</span>
                     </div>
                     <div className="flex items-center gap-2 text-xs sm:text-sm text-emerald-700 dark:text-emerald-100/80">
                       <span>Local Encrypted Binding</span>
                       <Info className="w-4 h-4 cursor-pointer hover:text-emerald-900 dark:hover:text-white transition-colors" onClick={() => setShowIntent(!showIntent)} />
                     </div>
                     {showIntent && (
                       <p className="mt-1 text-xs sm:text-sm text-emerald-600/80 dark:text-emerald-100/70 leading-snug">Pseudonym = device key. WebCrypto encrypted locally.</p>
                     )}
                   </div>
                 </div>

                 <div className="space-y-3">
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-blue-100/90 mb-1">Pseudonym</label>
                      <input type="text" value={pseudokey} onChange={e => setPseudokey(e.target.value)} required aria-label="Pseudonym" title="Pseudonym" placeholder="Your pseudonym" className="w-full rounded-xl border-2 border-emerald-400/50 dark:border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/5 text-gray-900 dark:text-white py-2 px-3 outline-none font-semibold shadow-inner text-xs" />
                    </div>
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-blue-100/90 mb-1">Local Passphrase</label>
                      <div className="relative">
                        <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required className="w-full rounded-xl border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 pl-3 pr-10 outline-none focus:border-blue-500/50 shadow-inner placeholder-gray-400 dark:placeholder-white/20 text-xs" placeholder="Min 8 chars" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {password && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 flex gap-1 h-1.5">
                            {[1, 2, 3, 4].map((level) => (
                              <div key={level} className={`flex-1 rounded-full ${getPasswordStrength(password).score >= level ? getPasswordStrength(password).color : 'bg-gray-200 dark:bg-gray-700'}`} />
                            ))}
                          </div>
                          <span className={`text-[10px] font-bold w-10 text-right ${getPasswordStrength(password).score <= 1 ? 'text-red-500' : getPasswordStrength(password).score === 2 ? 'text-amber-500' : getPasswordStrength(password).score === 3 ? 'text-blue-500' : 'text-emerald-500'}`}>
                            {getPasswordStrength(password).label}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-blue-100/90 mb-1">2FA PIN</label>
                        <div className="relative">
                          <input type={showPin ? "text" : "password"} value={pin} maxLength={6} onChange={e => setPin(e.target.value)} required className="w-full rounded-xl border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 pl-3 pr-10 outline-none focus:border-blue-500/50 tracking-widest text-center shadow-inner placeholder-gray-400 dark:placeholder-white/20 text-xs" placeholder="4-6" />
                          <button type="button" onClick={() => setShowPin(!showPin)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                            {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-blue-100/90 mb-1">Confirm PIN</label>
                        <div className="relative">
                          <input type={showPin ? "text" : "password"} value={confirmPin} maxLength={6} onChange={e => setConfirmPin(e.target.value)} required className="w-full rounded-xl border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 pl-3 pr-10 outline-none focus:border-blue-500/50 tracking-widest text-center shadow-inner placeholder-gray-400 dark:placeholder-white/20 text-xs" placeholder="4-6" />
                          <button type="button" onClick={() => setShowPin(!showPin)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                            {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t border-gray-200 dark:border-white/10 mt-2">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Security Questions (Required for Recovery)</p>
                      <div className="space-y-3">
                        <div>
                          <select value={q1Id} onChange={e => setQ1Id(e.target.value)} aria-label="Security Question 1" title="Security Question 1" className="w-full rounded-xl border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 px-3 outline-none focus:border-blue-500/50 shadow-inner text-xs mb-1">
                            {securityQuestionOptions.map(q => <option key={q.id} value={q.id}>{q.text}</option>)}
                          </select>
                          <input type="text" value={q1Answer} onChange={e => setQ1Answer(e.target.value)} required className="w-full rounded-xl border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 px-3 outline-none focus:border-blue-500/50 shadow-inner placeholder-gray-400 dark:placeholder-white/20 text-xs" placeholder="Answer 1" />
                        </div>
                        <div>
                          <select value={q2Id} onChange={e => setQ2Id(e.target.value)} aria-label="Security Question 2" title="Security Question 2" className="w-full rounded-xl border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 px-3 outline-none focus:border-blue-500/50 shadow-inner text-xs mb-1">
                            {securityQuestionOptions.map(q => <option key={q.id} value={q.id}>{q.text}</option>)}
                          </select>
                          <input type="text" value={q2Answer} onChange={e => setQ2Answer(e.target.value)} required className="w-full rounded-xl border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 px-3 outline-none focus:border-blue-500/50 shadow-inner placeholder-gray-400 dark:placeholder-white/20 text-xs" placeholder="Answer 2" />
                        </div>
                      </div>
                    </div>
                  </div>
                 
                 {error && <p className="text-red-500 dark:text-red-400 text-xs font-bold text-center bg-red-50 dark:bg-red-500/10 py-2 px-3 rounded-xl border border-red-200 dark:border-red-500/20">{error}</p>}
                 
                 <button type="submit" disabled={isProcessing} className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold rounded-xl py-2.5 text-sm transition-all hover:scale-[1.01] shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)] flex items-center justify-center gap-2">
                   {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-4 h-4" />} Create Identity & Vault
                 </button>
               </form>
             </div>
          )}
          {view === 'RECOVERY' && (
            <div className="space-y-4">
              <BackButton label="Back to Login" onClick={() => { setView('LOGIN'); setError(''); }} />
              <div className="text-center">
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-wide">Recover Credentials</h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-blue-200/60 mt-1">Answer security questions to view passphrase</p>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                setError('');
                setIsProcessing(true);
                try {
                  const { verifyRecovery } = await import('../lib/authEngine');
                  const password = await verifyRecovery(pseudokey, pin, [
                    { questionId: q1Id, answer: q1Answer },
                    { questionId: q2Id, answer: q2Answer }
                  ]);
                  if (password) {
                    setRecoveredPassword(password);
                    setView('RECOVERY_SUCCESS');
                  } else {
                    setError('Invalid PIN or security question answers.');
                  }
                } catch (err: any) {
                  setError(err.message || 'Recovery failed.');
                } finally {
                  setIsProcessing(false);
                }
              }} className="space-y-3">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-blue-100/90 mb-1">Agent ID (Pseudonym)</label>
                    <input type="text" value={pseudokey} onChange={e => setPseudokey(e.target.value)} required aria-label="Agent ID for recovery" title="Agent ID (Pseudonym)" placeholder="Enter Agent ID" className="w-full px-4 py-2.5 rounded-lg border-2 border-gray-200 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-500 bg-white dark:bg-black/30 text-gray-900 dark:text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-semibold text-gray-700 dark:text-blue-100/90 mb-1">2FA PIN</label>
                    <div className="relative">
                      <input type={showPin ? "text" : "password"} value={pin} maxLength={6} onChange={e => setPin(e.target.value)} required aria-label="Recovery 2FA PIN" title="Recovery 2FA PIN" placeholder="PIN" className="w-full pl-4 pr-10 py-2.5 rounded-lg border-2 border-gray-200 dark:border-white/10 focus:border-blue-500 dark:focus:border-blue-500 bg-white dark:bg-black/30 text-gray-900 dark:text-white text-sm tracking-widest" />
                      <button type="button" onClick={() => setShowPin(!showPin)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-200 dark:border-white/10">
                    <div className="space-y-3">
                      <div>
                        <select value={q1Id} onChange={e => setQ1Id(e.target.value)} aria-label="Recovery Security Question 1" title="Recovery Security Question 1" className="w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 px-3 outline-none focus:border-blue-500/50 text-xs mb-1">
                          {securityQuestionOptions.map(q => <option key={q.id} value={q.id}>{q.text}</option>)}
                        </select>
                        <input type="text" value={q1Answer} onChange={e => setQ1Answer(e.target.value)} required className="w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 px-3 outline-none focus:border-blue-500/50 text-xs" placeholder="Answer 1" />
                      </div>
                      <div>
                        <select value={q2Id} onChange={e => setQ2Id(e.target.value)} aria-label="Recovery Security Question 2" title="Recovery Security Question 2" className="w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 px-3 outline-none focus:border-blue-500/50 text-xs mb-1">
                          {securityQuestionOptions.map(q => <option key={q.id} value={q.id}>{q.text}</option>)}
                        </select>
                        <input type="text" value={q2Answer} onChange={e => setQ2Answer(e.target.value)} required className="w-full rounded-lg border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-gray-900 dark:text-white py-2 px-3 outline-none focus:border-blue-500/50 text-xs" placeholder="Answer 2" />
                      </div>
                    </div>
                  </div>
                </div>
                
                {error && (
                  <div className="space-y-2">
                    <p className="text-red-500 dark:text-red-400 text-xs font-bold text-center bg-red-50 dark:bg-red-500/10 py-2 rounded-lg border border-red-200 dark:border-red-500/20">{error}</p>
                    {error.includes('Invalid PIN or security question answers') && (
                      <button type="button" onClick={() => setShowResetConfirm(true)} className="w-full text-xs text-red-600 dark:text-red-400 hover:underline font-semibold mt-2">
                        Lost access? Hard Reset Application
                      </button>
                    )}
                  </div>
                )}
                
                <button type="submit" disabled={isProcessing} className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-gradient-to-r dark:from-blue-600 dark:to-blue-500 text-white font-bold rounded-lg px-6 py-3 text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />} Recover Passphrase
                </button>
              </form>
            </div>
          )}

          {view === 'RECOVERY_SUCCESS' && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 mb-2">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white tracking-wide">Recovery Successful</h3>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-blue-200/60 mt-1">Your credentials have been recovered.</p>
              </div>

              <div className="space-y-3 bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-200 dark:border-white/10">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1">Agent ID</p>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-sm text-gray-900 dark:text-white">
                      {showRecoveredAgentId ? pseudokey : `${pseudokey.substring(0, 3)}***${pseudokey.substring(pseudokey.length - 3)}`}
                    </p>
                    <button 
                      onClick={() => setShowRecoveredAgentId(!showRecoveredAgentId)}
                      className="text-xs bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 px-2 py-1 rounded font-bold hover:bg-blue-200 dark:hover:bg-blue-500/30 transition-colors"
                    >
                      {showRecoveredAgentId ? 'Hide' : 'View'}
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1">PIN</p>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-sm text-gray-900 dark:text-white">
                      {showRecoveredPin ? pin : `***${pin.substring(pin.length - 1)}`}
                    </p>
                    <button 
                      onClick={() => setShowRecoveredPin(!showRecoveredPin)}
                      className="text-xs bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 px-2 py-1 rounded font-bold hover:bg-blue-200 dark:hover:bg-blue-500/30 transition-colors"
                    >
                      {showRecoveredPin ? 'Hide' : 'View'}
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1">Passphrase</p>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-sm text-gray-900 dark:text-white">
                      {showRecoveredPassword ? recoveredPassword : '••••••••••••'}
                    </p>
                    <button 
                      onClick={() => setShowRecoveredPassword(!showRecoveredPassword)}
                      className="text-xs bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 px-2 py-1 rounded font-bold hover:bg-blue-200 dark:hover:bg-blue-500/30 transition-colors"
                    >
                      {showRecoveredPassword ? 'Hide' : 'View'}
                    </button>
                  </div>
                </div>
              </div>

              <button onClick={() => { setView('LOGIN'); setRecoveredPassword(null); setShowRecoveredPassword(false); setShowRecoveredAgentId(false); setShowRecoveredPin(false); setPassword(''); }} className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-gradient-to-r dark:from-blue-600 dark:to-blue-500 text-white font-bold rounded-lg px-6 py-3 text-sm transition-all flex items-center justify-center gap-2">
                Return to Login
              </button>
            </div>
          )}
        </div>
        
        {/* Footer shrink-blocked to maintain presence at bounds layer */}
        <div className="mt-0.5 text-center text-[10px] sm:text-xs text-gray-400 dark:text-gray-600 flex flex-col gap-0.5 w-full shrink-0">
          <p className="flex items-center justify-center gap-1"><AlertTriangle className="w-2 h-2" /> Immutable Data Minimization.</p>
          <p>Local Storage DB is natively encrypted with these keys.</p>
        </div>
      </div>

      {showResetConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900/50 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-500 mb-4">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Hard Reset Application</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
              This will permanently delete all local data, including your identity, vault, and configurations. This action cannot be undone. Are you sure you want to proceed?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  const { hardResetApp } = await import('../lib/authEngine');
                  await hardResetApp();
                }}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
              >
                Yes, Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
