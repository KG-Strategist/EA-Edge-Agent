import { useState, useEffect } from 'react';
import { StateProvider, useStateContext } from './context/StateContext';
import AuthGate from './views/AuthGate';
import Dashboard from './views/Dashboard';
import ArchitectureReviews from './views/ArchitectureReviews';
import ThreatModeling from './views/ThreatModeling';
import AdminPanel from './views/AdminPanel';
import Navbar from './components/Navbar';
import Header from './components/Header';
import { ErrorBoundary } from './components/ErrorBoundary';
import AgentChat from './components/ui/AgentChat';
import ModelConsentModal from './components/ui/ModelConsentModal';
import { seedDatabase } from './lib/seedData';

function AppContent() {
  const { identity, setIdentity } = useStateContext();
  const [currentView, setCurrentView] = useState('dashboard');
  const [adminSubView, setAdminSubView] = useState('layers');

  const [_currentSessionId, setCurrentSessionId] = useState<number | null>(null);

  useEffect(() => {
    seedDatabase();

    const handleNavigate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail.view) setCurrentView(customEvent.detail.view);
      if (customEvent.detail.subView) setAdminSubView(customEvent.detail.subView);
    };
    
    window.addEventListener('EA_NAVIGATE', handleNavigate);
    return () => window.removeEventListener('EA_NAVIGATE', handleNavigate);
  }, []);

  if (!identity) {
    return <AuthGate onAuthenticated={setIdentity} />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard setCurrentView={setCurrentView} setCurrentSessionId={setCurrentSessionId} />;
      case 'reviews':
        return <ArchitectureReviews setCurrentView={setCurrentView} setCurrentSessionId={setCurrentSessionId} />;
      case 'threat':
        return <ThreatModeling />;
      case 'expert-config':
      case 'agent-config':
      case 'system-pref':
      case 'knowledge-mgmt':
      case 'admin':
        return <AdminPanel adminSubView={adminSubView} setAdminSubView={setAdminSubView} />;
      default:
        return <Dashboard setCurrentView={setCurrentView} setCurrentSessionId={setCurrentSessionId} />;
    }
  };

  return (
    <>
      <div className="h-screen overflow-hidden flex flex-col md:flex-row bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
        <Navbar 
          currentView={currentView} 
          setCurrentView={setCurrentView} 
          adminSubView={adminSubView}
          setAdminSubView={setAdminSubView}
        />
        <div className="flex-1 flex flex-col overflow-hidden mt-16 md:mt-0">
          <Header 
            currentView={currentView} 
            setCurrentView={setCurrentView} 
            adminSubView={adminSubView}
            setAdminSubView={setAdminSubView}
          />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto pb-12">
              {renderView()}
            </div>
          </main>
        </div>
      </div>
      <AgentChat />
      <ModelConsentModal />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <StateProvider>
        <AppContent />
      </StateProvider>
    </ErrorBoundary>
  );
}

export default App;
