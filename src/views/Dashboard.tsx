import React from 'react';
import SystemHealth from '../components/SystemHealth';
import { useStateContext } from '../context/StateContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Clock, FileText, ChevronRight } from 'lucide-react';

interface DashboardProps {
  setCurrentView: (view: string) => void;
  setCurrentSessionId: (id: number) => void;
}

export default function Dashboard({ setCurrentView, setCurrentSessionId }: DashboardProps) {
  const { pendingReviews } = useStateContext();
  
  const draftSessions = useLiveQuery(() => 
    db.review_sessions.where('status').equals('Draft').reverse().toArray()
  ) || [];

  const handleSessionClick = (id: number) => {
    setCurrentSessionId(id);
    setCurrentView('execution');
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">Dashboard</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm dark:shadow-none">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Pending Reviews</h3>
          <p className="text-4xl font-bold text-gray-900 dark:text-white">{pendingReviews}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm dark:shadow-none">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Draft Sessions</h3>
          <p className="text-4xl font-bold text-gray-900 dark:text-white">{draftSessions.length}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm dark:shadow-none">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Active Domains</h3>
          <p className="text-4xl font-bold text-gray-900 dark:text-white">0</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 flex flex-col shadow-sm dark:shadow-none">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-6">Draft Reviews</h3>
          
          {draftSessions.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <FileText className="text-gray-400 dark:text-gray-600 mb-3" size={48} />
              <p className="text-gray-500 dark:text-gray-400">No draft reviews found.</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Start a new review in the Intake Form.</p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto pr-2">
              {draftSessions.map(session => (
                <div 
                  key={session.id} 
                  onClick={() => handleSessionClick(session.id!)}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500 transition-colors cursor-pointer group"
                >
                  <div className="flex items-start gap-4">
                    <div className="mt-1 p-2 bg-blue-100 dark:bg-blue-500/10 rounded-lg">
                      <Clock className="text-blue-600 dark:text-blue-400" size={20} />
                    </div>
                    <div>
                      <h4 className="text-gray-900 dark:text-white font-medium">{session.projectName}</h4>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        <span>{session.type}</span>
                        <span>•</span>
                        <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{session.architectureBlobs?.length || 0} Artifacts</span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="text-gray-400 dark:text-gray-600 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" size={20} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="lg:col-span-1">
          <SystemHealth />
        </div>
      </div>
    </div>
  );
}
