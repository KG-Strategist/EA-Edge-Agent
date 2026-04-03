import React, { useState, useEffect } from 'react';
import { StateProvider, useStateContext } from './context/StateContext';
import Navbar from './components/Navbar';
import Dashboard from './views/Dashboard';
import ReviewIntake from './views/ReviewIntake';
import AdminPanel from './views/AdminPanel';
import ReviewExecution from './views/ReviewExecution';
import { seedDatabase } from './lib/seedData';

function AppContent() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
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

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 font-sans overflow-hidden transition-colors duration-200">
      <Navbar currentView={currentView} setCurrentView={setCurrentView} />
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 pt-20 md:pt-8">
        {currentView === 'dashboard' && <Dashboard setCurrentView={setCurrentView} setCurrentSessionId={setCurrentSessionId} />}
        {currentView === 'intake' && <ReviewIntake />}
        {currentView === 'admin' && <AdminPanel />}
        {currentView === 'execution' && currentSessionId && <ReviewExecution sessionId={currentSessionId} setCurrentView={setCurrentView} />}
      </main>
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
