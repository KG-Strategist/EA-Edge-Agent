import { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { StateProvider, useStateContext } from './context/StateContext';
import { NotificationProvider, useNotification } from './context/NotificationContext';
import AuthGate from './views/AuthGate';
import Dashboard from './views/Dashboard';
import ArchitectureReviews from './views/ArchitectureReviews';
import ThreatModeling from './views/ThreatModeling';
import AdminPanel from './views/AdminPanel';
import Navbar from './components/layout/Navbar';
import Header from './components/layout/Header';
import { ErrorBoundary } from './components/layout/ErrorBoundary';

const AgentChat = lazy(() => import('./components/ui/AgentChat'));
const ModelConsentModal = lazy(() => import('./components/ui/ModelConsentModal'));
const BackupConsentModal = lazy(() => import('./components/ui/BackupConsentModal'));
const NetworkGatekeeperModal = lazy(() => import('./components/ui/NetworkGatekeeperModal'));
import { seedDatabase } from './lib/seedData';
import { globalArena, parser } from './lib/SemanticArena';
import { localDaemon } from './lib/providers/LocalDaemonProvider';
import { Logger } from './lib/logger';

function AppContent() {
  const { identity, setIdentity, downloadState, authStatus, setAuthStatus } = useStateContext();
  const { addNotification } = useNotification();
  const [currentView, setCurrentView] = useState('dashboard');
  const [adminSubView, setAdminSubView] = useState('layers');
  const [vaultLocked, setVaultLocked] = useState(false);
  const downloadStateRef = useRef(downloadState);

  useEffect(() => {
    downloadStateRef.current = downloadState;
  }, [downloadState]);

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
        if (err instanceof Error && (err.name === 'VaultLockedError' || err.message.includes('VaultLockedError'))) {
          setAuthStatus('locked');
          setVaultLocked(true);
          return;
        }
        Logger.warn('[App] Failed to boot SemanticArena:', err);
      }
    };

    if (authStatus === 'unlocked') {
      Logger.info('[App] Boot engine starting after vault unlock.');
      bootEngine();
    } else {
      Logger.info(`[App] Boot engine deferred until vault unlock. authStatus=${authStatus}`);
    }

    // Eager ping: Detect Local Daemon on startup (non-blocking, async)
    localDaemon.pingDaemon();

    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail.view) setCurrentView(customEvent.detail.view);
      if (customEvent.detail.subView) setAdminSubView(customEvent.detail.subView);
    };

    window.addEventListener('EA_NAVIGATE', handleNavigate);
    return () => window.removeEventListener('EA_NAVIGATE', handleNavigate);
  }, [authStatus, setAuthStatus]);

  // Kill switch: surface contextual toast when network is disabled mid-download
  useEffect(() => {
    const handleKillSwitch = () => {
      const state = downloadStateRef.current;
      if (state.isActive && state.status === 'Downloading') {
        const isEmbedding = state.progressText?.toLowerCase().includes('embedding');
        const message = isEmbedding
          ? 'Network was disabled — embedding downloads halted. Re-enable network to resume.'
          : 'Network was disabled — LLM model weights preserved. Re-enable network to resume.';

        addNotification(message, 'warning', 0);
      }
    };
    window.addEventListener('APP_NETWORK_FORCE_KILLED', handleKillSwitch);
    return () => window.removeEventListener('APP_NETWORK_FORCE_KILLED', handleKillSwitch);
  }, [addNotification]);

  // TASK 6: If vault is locked, show AuthGate to allow re-authentication
  if (vaultLocked) {
    return (
      <AuthGate 
        onAuthenticated={(newIdentity) => {
          setVaultLocked(false);
          setIdentity(newIdentity);
        }} 
      />
    );
  }

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
      <Suspense fallback={null}>
        <AgentChat />
        <ModelConsentModal />
        <BackupConsentModal />
        <NetworkGatekeeperModal />
        
      </Suspense>
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
