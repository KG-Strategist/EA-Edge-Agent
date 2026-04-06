import React, { useState, useEffect } from 'react';
import { StateProvider, useStateContext } from './context/StateContext';
import { LogOut } from 'lucide-react';
import Navbar from './components/Navbar';
import Dashboard from './views/Dashboard';
import ArchitectureReviews from './views/ArchitectureReviews';
import AdminPanel from './views/AdminPanel';
import ReviewExecution from './views/ReviewExecution';
import ThreatModeling from './views/ThreatModeling';
import ModelConsentModal from './components/ui/ModelConsentModal';
import AgentChat from './components/ui/AgentChat';
import { seedDatabase } from './lib/seedData';
import AuthGate from './views/AuthGate';

function AppContent() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [adminSubView, setAdminSubView] = useState('layers');
  const { setSystemHealth } = useStateContext();

  useEffect(() => {
    const initDb = async () => {
      const success = await seedDatabase();
      setSystemHealth((prev: any) => ({
        ...prev,
        dbStatus: success ? 'Connected (IndexedDB)' : 'Error'
      }));
    };
    initDb();
  }, [setSystemHealth]);

  const viewNames: Record<string, string> = {
    dashboard: 'Dashboard',
    reviews: 'Architecture Reviews',
    threat: 'Threat Modeling',
    admin: 'Control Panel',
    'expert-config': 'Expert Setup',
    'agent-config': 'Agent Center',
    'system-config': 'System Admin',
    execution: 'Review Execution'
  };

  const adminSubNames: Record<string, string> = {
    layers: 'Architecture Layers',
    principles: 'Architecture Principles',
    bian: 'BIAN Domains',
    metamodel: 'Content Metamodel',
    categories: 'Master Categories',
    tags: 'Tags',
    prompts: 'AI Prompts',
    workflows: 'Governance Workflows',
    templates: 'Report Templates',
    network: 'Network & Privacy',
    knowledge: 'Enterprise Knowledge',
    system: 'System & Portability',
    users: 'User Access Management',
    audit: 'Audit Workspace',
    dpdp: 'DPDP / Privacy'
  };

  const adminGroupNames: Record<string, string> = {
    layers: 'Architecture Setup',
    principles: 'Architecture Setup',
    bian: 'Architecture Setup',
    metamodel: 'Taxonomy & Metadata',
    categories: 'Taxonomy & Metadata',
    tags: 'Taxonomy & Metadata',
    prompts: 'Agent Behaviors',
    workflows: 'Agent Behaviors',
    templates: 'Agent Behaviors',
    network: 'System Preferences',
    knowledge: 'System Preferences',
    system: 'System Preferences',
    users: 'Security & Access',
    audit: 'Security & Access',
    dpdp: 'Security & Access'
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 font-sans overflow-hidden transition-colors duration-200 relative">
      {/* Minimalist Architect Grid Background */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none opacity-40 dark:opacity-20 transition-opacity"
        style={{
           backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
           backgroundSize: '24px 24px',
           color: 'rgb(148, 163, 184)' 
        }}
      />

      <Navbar 
         currentView={currentView} 
         setCurrentView={setCurrentView} 
         adminSubView={adminSubView}
         setAdminSubView={setAdminSubView}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        {/* Global Desktop Header */}
        <header className="hidden md:flex h-[73px] bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 items-center px-6 sticky top-0 z-20">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 capitalize">
             <button onClick={() => setCurrentView('dashboard')} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Home</button>
             <span className="text-gray-300 dark:text-gray-600">/</span>
             <button onClick={() => {
                if (!['expert-config', 'agent-config', 'system-config', 'admin'].includes(currentView)) {
                  setCurrentView('expert-config');
                }
                setAdminSubView('layers');
             }} className={`hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${!['expert-config', 'agent-config', 'system-config', 'admin'].includes(currentView) ? 'text-gray-900 dark:text-gray-100 font-semibold' : ''}`}>
               {viewNames[currentView] || currentView.replace('-', ' ')}
             </button>
             {['expert-config', 'agent-config', 'system-config', 'admin'].includes(currentView) && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">/</span>
                  <span className="text-gray-500 dark:text-gray-400">{adminGroupNames[adminSubView] || 'Setup'}</span>
                  <span className="text-gray-300 dark:text-gray-600">/</span>
                  <span className="text-gray-900 dark:text-gray-100 font-semibold">{adminSubNames[adminSubView] || adminSubView.replace('-', ' ')}</span>
                </>
             )}
          </div>
          <div className="ml-auto flex items-center gap-4">
             <button 
               onClick={() => {
                 sessionStorage.removeItem('ea_niti_session');
                 window.location.reload();
               }} 
               className="flex items-center gap-2 px-3 py-1.5 text-[11px] uppercase tracking-wider font-bold text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 bg-gray-100 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
               title="Securely terminate session"
             >
               <LogOut size={14} />
               <span className="hidden sm:inline">Log Out</span>
             </button>
          </div>
        </header>

        {/* Cleaned up layout padding for improved user-friendliness */}
        <main className="flex-1 overflow-y-auto w-full p-4 md:p-8 pt-20 md:pt-8 bg-transparent flex flex-col">
          <div className="mx-auto w-full max-w-[1400px] flex-1 flex flex-col h-full min-h-0">
             {currentView === 'dashboard' && <Dashboard setCurrentView={setCurrentView} setCurrentSessionId={setCurrentSessionId} />}
             {currentView === 'reviews' && <ArchitectureReviews setCurrentView={setCurrentView} />}
             {currentView === 'threat' && <ThreatModeling />}
             {['expert-config', 'agent-config', 'system-config', 'admin'].includes(currentView) && <AdminPanel adminSubView={adminSubView} setAdminSubView={setAdminSubView} />}
             {currentView === 'execution' && currentSessionId && <ReviewExecution sessionId={currentSessionId} setCurrentView={setCurrentView} />}
          </div>
        </main>
      </div>

      <ModelConsentModal />
      <AgentChat />
    </div>
  );
}

export default function App() {
  const [sessionIdentity, setSessionIdentity] = useState<any>(null);

  useEffect(() => {
    // Service Worker registration is now handled automatically by vite-plugin-pwa (injectRegister: 'auto')
    // and explicitly ignores WebLLM weights via the workbox runtimeCaching config in vite.config.ts.
  }, []);

  if (!sessionIdentity) {
    return <AuthGate onAuthenticated={(identity) => setSessionIdentity(identity)} />;
  }

  return (
    <StateProvider initialIdentity={sessionIdentity}>
      <AppContent />
    </StateProvider>
  );
}
