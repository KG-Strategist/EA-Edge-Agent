import React, { useState, useEffect } from 'react';
import { StateProvider, useStateContext } from './context/StateContext';
import Navbar from './components/Navbar';
import Dashboard from './views/Dashboard';
import ReviewIntake from './views/ReviewIntake';
import AdminPanel from './views/AdminPanel';
import ReviewExecution from './views/ReviewExecution';
import ThreatModeling from './views/ThreatModeling';
import ModelConsentModal from './components/ui/ModelConsentModal';
import AgentChat from './components/ui/AgentChat';
import { seedDatabase } from './lib/seedData';

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
    intake: 'Review Intake',
    threat: 'Threat Modeling',
    admin: 'Control Panel',
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
    system: 'System & Portability'
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
    system: 'System Preferences'
  };

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 font-sans overflow-hidden transition-colors duration-200">
      <Navbar 
         currentView={currentView} 
         setCurrentView={setCurrentView} 
         adminSubView={adminSubView}
         setAdminSubView={setAdminSubView}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Global Desktop Header */}
        <header className="hidden md:flex h-[73px] bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 items-center px-6 sticky top-0 z-20">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 capitalize">
             <button onClick={() => setCurrentView('dashboard')} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Home</button>
             <span className="text-gray-300 dark:text-gray-600">/</span>
             <button onClick={() => {
                if (currentView !== 'admin') {
                  setCurrentView('admin');
                }
                setAdminSubView('layers');
             }} className={`hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${currentView !== 'admin' ? 'text-gray-900 dark:text-gray-100 font-semibold' : ''}`}>
               {viewNames[currentView] || currentView.replace('-', ' ')}
             </button>
             {currentView === 'admin' && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">/</span>
                  <span className="text-gray-500 dark:text-gray-400">{adminGroupNames[adminSubView] || 'Setup'}</span>
                  <span className="text-gray-300 dark:text-gray-600">/</span>
                  <span className="text-gray-900 dark:text-gray-100 font-semibold">{adminSubNames[adminSubView] || adminSubView.replace('-', ' ')}</span>
                </>
             )}
          </div>
          <div className="ml-auto flex items-center gap-4">
             {/* Future Header utilities like User Avatar, Status can go here */}
          </div>
        </header>

        {/* Cleaned up layout padding for improved user-friendliness */}
        <main className="flex-1 overflow-y-auto w-full p-4 md:p-8 pt-20 md:pt-8 bg-gray-50 dark:bg-gray-950 flex flex-col">
          <div className="mx-auto w-full max-w-[1400px] flex-1 flex flex-col h-full min-h-0">
             {currentView === 'dashboard' && <Dashboard setCurrentView={setCurrentView} setCurrentSessionId={setCurrentSessionId} />}
             {currentView === 'intake' && <ReviewIntake />}
             {currentView === 'threat' && <ThreatModeling />}
             {currentView === 'admin' && <AdminPanel adminSubView={adminSubView} setAdminSubView={setAdminSubView} />}
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
  useEffect(() => {
    // Unregister Service Worker to prevent WebLLM caching issues
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.unregister();
          console.log('ServiceWorker unregistered');
        }
      });
    }
  }, []);

  return (
    <StateProvider>
      <AppContent />
    </StateProvider>
  );
}
