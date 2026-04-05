import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, BianDomain, BespokeTag } from '../lib/db';

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
  activeBianDomains: BianDomain[];
  activeTags: BespokeTag[];
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const StateContext = createContext<StateContextType | undefined>(undefined);

export function StateProvider({ children }: { children: ReactNode }) {
  const [pendingReviews, setPendingReviews] = useState(0);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [systemHealth, setSystemHealth] = useState({
    webGpuSupported: null,
    dbStatus: 'Pending' as const,
    aiModelsStatus: 'Unloaded' as const,
  });
  
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const savedTheme = localStorage.getItem('ea-theme') as 'light' | 'dark' | null;
    if (savedTheme) return savedTheme;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    return 'dark';
  });

  useEffect(() => {
    const hasWebGPU = !!(navigator as any).gpu;
    setSystemHealth((prev) => ({ ...prev, webGpuSupported: hasWebGPU }));
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

  const activeBianDomains = useLiveQuery(() => db.bian_domains.where('status').equals('Active').toArray()) || [];
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
