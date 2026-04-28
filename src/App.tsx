import { useState, useEffect } from 'react';
import { StateProvider, useStateContext } from './context/StateContext';
import { NotificationProvider } from './context/NotificationContext';
import AuthGate from './views/AuthGate';
import Dashboard from './views/Dashboard';
import ArchitectureReviews from './views/ArchitectureReviews';
import ThreatModeling from './views/ThreatModeling';
import AdminPanel from './views/AdminPanel';
import Navbar from './components/layout/Navbar';
import Header from './components/layout/Header';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import AgentChat from './components/ui/AgentChat';
import ModelConsentModal from './components/ui/ModelConsentModal';
import BackupConsentModal from './components/ui/BackupConsentModal';
import NetworkGatekeeperModal from './components/ui/NetworkGatekeeperModal';
import { seedDatabase } from './lib/seedData';
import { globalArena, parser } from './lib/SemanticArena';

function AppContent() {
  const { identity, setIdentity } = useStateContext();
  const [currentView, setCurrentView] = useState('dashboard');
  const [adminSubView, setAdminSubView] = useState('layers');

  // Index Redirect Mechanism (Router-like behavior)
  useEffect(() => {
    if (currentView === 'expert-config' && !['layers', 'principles', 'service-domains', 'metamodel', 'categories', 'tags'].includes(adminSubView)) {
      setAdminSubView('layers');
    } else if (currentView === 'agent-config' && !['prompts', 'configs', 'workflows', 'templates'].includes(adminSubView)) {
      setAdminSubView('prompts');
    } else if (currentView === 'system-pref' && !['network', 'users', 'audit', 'dpdp', 'models', 'system'].includes(adminSubView)) {
      setAdminSubView('network');
    } else if (currentView === 'knowledge-mgmt' && !['knowledge', 'web-providers'].includes(adminSubView)) {
      setAdminSubView('knowledge');
    }
  }, [currentView, adminSubView]);

useEffect(() => {
  const bootEngine = async () => {
    try {
      await parser.loadLexicon();
      await seedDatabase();
      await globalArena.loadFromDB();
    } catch (err) {
      console.warn('[App] Failed to boot SemanticArena:', err);
    }
  };

  bootEngine();

    const worker = new Worker(new URL('./workers/distillation.worker.ts', import.meta.url), { type: 'module' });
    (window as any).distillationWorker = worker;

    worker.onmessage = (event) => {
      window.dispatchEvent(new CustomEvent('DISTILLATION_EVENT', { detail: event.data }));
    };

    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail.view) setCurrentView(customEvent.detail.view);
      if (customEvent.detail.subView) setAdminSubView(customEvent.detail.subView);
    };
    
    window.addEventListener('EA_NAVIGATE', handleNavigate);
    return () => {
      window.removeEventListener('EA_NAVIGATE', handleNavigate);
      worker.terminate();
    };
  }, []);

  if (!identity) {
    return <AuthGate onAuthenticated={setIdentity} />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'reviews':
        return <ArchitectureReviews />;
      case 'threat':
        return <ThreatModeling />;
      case 'expert-config':
      case 'agent-config':
      case 'system-pref':
      case 'knowledge-mgmt':
      case 'admin':
        return <AdminPanel adminSubView={adminSubView} setAdminSubView={setAdminSubView} />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <>
      <div className="min-h-screen flex flex-col md:flex-row bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
        <Navbar 
          currentView={currentView} 
          setCurrentView={setCurrentView} 
          adminSubView={adminSubView}
          setAdminSubView={setAdminSubView}
        />
        <div className="flex-1 flex flex-col mt-16 md:mt-0">
          <Header 
            currentView={currentView} 
            setCurrentView={setCurrentView} 
            adminSubView={adminSubView}
            setAdminSubView={setAdminSubView}
          />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto pb-12">
              {renderView()}
            </div>
          </main>
        </div>
      </div>
      <AgentChat />
      <ModelConsentModal />
      <BackupConsentModal />
      <NetworkGatekeeperModal />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <StateProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </StateProvider>
    </ErrorBoundary>
  );
}

export default App;
