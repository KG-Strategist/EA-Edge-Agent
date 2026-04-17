import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, ServiceDomain, BespokeTag } from '../lib/db';

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
}

const StateContext = createContext<StateContextType | undefined>(undefined);

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
  
  const [executionMode, setExecutionMode] = useState<string>('Auto-Route (MoE)');
  
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

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const activeBianDomains = useLiveQuery(() => db.service_domains.where('status').equals('Active').toArray()) || [];
  const activeTags = useLiveQuery(() => db.bespoke_tags.filter(t => t.status !== 'Deprecated').toArray()) || [];

  return (
    <StateContext.Provider
      value={{
        pendingReviews,
        setPendingReviews,
        selectedDomains,
        setSelectedDomains,
        systemHealth,
        setSystemHealth,
        activeBianDomains,
        activeTags,
        theme,
        toggleTheme,
        identity,
        setIdentity,
        downloadState,
        setDownloadState,
        executionMode,
        setExecutionMode,
      }}
    >
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
