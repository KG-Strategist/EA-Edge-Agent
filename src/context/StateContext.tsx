import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ServiceDomain, BespokeTag } from '../lib/db';

export type ConsentModalType = 'network_upgrade' | 'save_sso' | 'save_ldap' | 'save_oauth';

export interface UserIdentity {
  mode: 'Hybrid' | 'AirGapped';
  provider?: string;
  username: string;
  role: 'System Admin' | 'Lead EA' | 'Viewer';
}

export interface GlobalDownloadState {
  isActive: boolean;
  isMinimized: boolean;
  progressPercentage: number;
  progressText: string;
  message?: string;
  modelId?: string;
  status: 'Downloading' | 'Complete' | 'Error' | 'Idle';
}

export type AuthStatus = 'anonymous' | 'locked' | 'unlocked';

interface StateContextType {
  pendingReviews: number;
  setPendingReviews: (count: number) => void;
  selectedDomains: string[];
  setSelectedDomains: (domains: string[]) => void;
  systemHealth: {
    webGpuSupported: boolean | null;
    dbStatus: 'Pending' | 'Connected (IndexedDB)' | 'Error';
    aiModelsStatus: string;
  };
  setSystemHealth: (health: any) => void;
  activeBianDomains: ServiceDomain[];
  activeTags: BespokeTag[];
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  identity: UserIdentity | null;
  setIdentity: (identity: UserIdentity | null) => void;
  downloadState: GlobalDownloadState;
  setDownloadState: React.Dispatch<React.SetStateAction<GlobalDownloadState>>;
  executionMode: string;
  setExecutionMode: (mode: string) => void;
  showConsentModal?: boolean;
  setShowConsentModal?: (show: boolean) => void;
  consentModalType?: ConsentModalType;
  setConsentModalType?: (type: ConsentModalType) => void;
  pendingConsentAction?: (() => Promise<void>) | null;
  setPendingConsentAction?: React.Dispatch<React.SetStateAction<(() => Promise<void>) | null>>;
  // MITRA Swarm Context — workflow-aware persona resolution for AgentChat
  activeWorkflowId: number | null;
  setActiveWorkflowId: (id: number | null) => void;
  activeStageId: string | null;
  setActiveStageId: (id: string | null) => void;
  authStatus: AuthStatus;
  setAuthStatus: (status: AuthStatus) => void;
}
const StateContext = createContext<StateContextType | undefined>(undefined);
const EXECUTION_MODE_STORAGE_KEY = 'ea-execution-mode';
const DEFAULT_EXECUTION_MODE = 'Tiny Triage Agent (Epistemic)';

export function StateProvider({ children, initialIdentity = null }: { children: ReactNode, initialIdentity?: UserIdentity | null }) {
  const [identity, setIdentity] = useState<UserIdentity | null>(initialIdentity);
  const [pendingReviews, setPendingReviews] = useState(0);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [systemHealth, setSystemHealth] = useState<{
    webGpuSupported: boolean | null;
    dbStatus: 'Pending' | 'Connected (IndexedDB)' | 'Error';
    aiModelsStatus: string;
  }>({
    webGpuSupported: null,
    dbStatus: 'Pending',
    aiModelsStatus: 'Unloaded',
  });
  
  const [downloadState, setDownloadState] = useState<GlobalDownloadState>({
    isActive: false,
    isMinimized: false,
    progressPercentage: 0,
    progressText: '',
    status: 'Idle'
  });

  // Global download state sync — all download state changes flow through this one listener
  useEffect(() => {
    const handleDownloadStateUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setDownloadState(prev => ({
        ...prev,
        ...detail
      }));
    };
    window.addEventListener('EA_DOWNLOAD_STATE_UPDATE', handleDownloadStateUpdate);
    return () => window.removeEventListener('EA_DOWNLOAD_STATE_UPDATE', handleDownloadStateUpdate);
  }, []);
  
  const [executionModeState, setExecutionModeState] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_EXECUTION_MODE;
    return localStorage.getItem(EXECUTION_MODE_STORAGE_KEY) || DEFAULT_EXECUTION_MODE;
  });

  const setExecutionMode = useCallback((mode: string) => {
    setExecutionModeState(mode);
    localStorage.setItem(EXECUTION_MODE_STORAGE_KEY, mode);
    window.dispatchEvent(new CustomEvent('EA_EXECUTION_MODE_CHANGED', { detail: { mode } }));
  }, []);

  // MITRA Swarm Context — workflow-aware persona resolution for AgentChat
  const [activeWorkflowId, setActiveWorkflowId] = useState<number | null>(null);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>('anonymous');
  
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('ea-theme') as 'light' | 'dark' | null;
    if (savedTheme) return savedTheme;
    return 'dark'; // Default to dark theme on first load
  });

  useEffect(() => {
    const hasWebGPU = !!(navigator as any).gpu;
    setSystemHealth((prev) => ({ ...prev, webGpuSupported: hasWebGPU }));

    // Listen for Dexie DB ready state
    db.on('ready', () => {
      setSystemHealth((prev) => ({ ...prev, dbStatus: 'Connected (IndexedDB)' }));
    });

    // Check if it's already open
    if (db.isOpen()) {
      setSystemHealth((prev) => ({ ...prev, dbStatus: 'Connected (IndexedDB)' }));
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('ea-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  const activeBianDomainsRaw = useLiveQuery(() => db.service_domains.where('status').equals('Active').toArray());
  const activeTagsRaw = useLiveQuery(() => db.bespoke_tags.filter(t => t.status !== 'Deprecated').toArray());

  const memoizedActiveBianDomains = useMemo(() => activeBianDomainsRaw || [], [activeBianDomainsRaw]);
  const memoizedActiveTags = useMemo(() => activeTagsRaw || [], [activeTagsRaw]);

  const contextValue = useMemo(() => ({
        pendingReviews,
        setPendingReviews,
        selectedDomains,
        setSelectedDomains,
        systemHealth,
        setSystemHealth,
        activeBianDomains: memoizedActiveBianDomains,
        activeTags: memoizedActiveTags,
        theme,
        toggleTheme,
        identity,
        setIdentity,
        downloadState,
        setDownloadState,
        executionMode: executionModeState,
        setExecutionMode,
        activeWorkflowId,
        setActiveWorkflowId,
        activeStageId,
        setActiveStageId,
        authStatus,
        setAuthStatus,
  }), [
        pendingReviews,
        setPendingReviews,
        selectedDomains,
        setSelectedDomains,
        systemHealth,
        setSystemHealth,
        memoizedActiveBianDomains,
        memoizedActiveTags,
        theme,
        toggleTheme,
        identity,
        setIdentity,
        downloadState,
        setDownloadState,
        executionModeState,
        setExecutionMode,
        activeWorkflowId,
        setActiveWorkflowId,
        activeStageId,
        setActiveStageId,
        authStatus,
        setAuthStatus,
  ]);

  return (
    <StateContext.Provider value={contextValue}>
      {children}
    </StateContext.Provider>
  );
}

export function useStateContext() {
  const context = useContext(StateContext);
  if (context === undefined) {
    throw new Error('useStateContext must be used within a StateProvider');
  }
  return context;
}
