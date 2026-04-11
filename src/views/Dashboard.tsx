import { useState, useEffect } from 'react';
import SystemHealth from '../components/SystemHealth';
import SwarmTerminal from '../components/SwarmTerminal';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { FileText, Edit2, Save, LayoutGrid, CheckCircle } from 'lucide-react';
import { StatCard, NativeBarChart, NativeProgressRing } from '../components/widgets/WidgetLibrary';

// Default layout config if no dashboard exist
const DEFAULT_WIDGETS = ['drafts', 'completed', 'reviews_by_type', 'completion_rate'];

interface DashboardProps {
  setCurrentView: (view: string) => void;
  setCurrentSessionId: (id: number) => void;
}

export default function Dashboard({ setCurrentView: _setCurrentView, setCurrentSessionId: _setCurrentSessionId }: DashboardProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [boardName, setBoardName] = useState('Default View');
  const [activeWidgets, setActiveWidgets] = useState<string[]>(DEFAULT_WIDGETS);

  // Fetch Dashboards
  const savedBoards = useLiveQuery(() => db.dashboard_states.toArray());
  
  // Real-time Metrics Queries
  const allSessions = useLiveQuery(() => db.review_sessions.toArray()) || [];
  const threatModels = useLiveQuery(() => db.threat_models.toArray()) || [];
  
  const draftCount = allSessions.filter(s => s.status === 'Draft').length;
  const completedCount = allSessions.filter(s => s.status === 'Completed').length;
  
  // Aggregate Reviews by Type
  const typeMap: Record<string, number> = {};
  allSessions.forEach(s => {
     if (s.type) typeMap[s.type] = (typeMap[s.type] || 0) + 1;
  });
  const barChartData = Object.entries(typeMap).map(([label, value]) => ({ label, value }));

  // Load first board if exists
  useEffect(() => {
     if (savedBoards && savedBoards.length > 0 && !isEditMode) {
       const board = savedBoards[0];
       setBoardName(board.name);
       setActiveWidgets(board.layoutConfig);
     }
  }, [savedBoards, isEditMode]);

  const handleSaveBoard = async () => {
    try {
      await db.dashboard_states.add({
         name: boardName,
         isDefault: false,
         layoutConfig: activeWidgets,
         createdAt: new Date(),
         updatedAt: new Date(),
      });
      setIsEditMode(false);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleWidget = (id: string) => {
    setActiveWidgets(prev => prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]);
  };

  return (
    <div className="w-full pb-10">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          {isEditMode ? (
             <input type="text" value={boardName} onChange={e => setBoardName(e.target.value)}
                    className="text-2xl font-bold bg-white dark:bg-gray-800 border border-blue-500 rounded px-2 py-1 outline-none text-gray-900 dark:text-white" />
          ) : (
             <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
               <LayoutGrid size={24} className="text-blue-600 dark:text-blue-500" />
               {boardName}
             </h2>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {isEditMode ? (
             <button onClick={handleSaveBoard} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors">
               <Save size={16} /> Save As New
             </button>
          ) : (
             <button onClick={() => setIsEditMode(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg text-sm font-medium transition-colors">
               <Edit2 size={16} /> Edit Mode
             </button>
          )}
        </div>
      </div>

      {isEditMode && (
         <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-bold text-yellow-800 dark:text-yellow-400 mb-3">Widget Selection</h3>
            <div className="flex flex-wrap gap-2">
               {[
                 { id: 'drafts', label: 'Draft Sessions Card' },
                 { id: 'completed', label: 'Completed Reviews Card' },
                 { id: 'threats', label: 'Threat Models Card' },
                 { id: 'reviews_by_type', label: 'Reviews by Type (Bar)' },
                 { id: 'completion_rate', label: 'Completion Rate (Ring)' }
               ].map(w => (
                 <button key={w.id} onClick={() => toggleWidget(w.id)}
                         className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${activeWidgets.includes(w.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:border-gray-400'}`}>
                   {activeWidgets.includes(w.id) ? <CheckCircle size={10} className="inline mr-1" /> : null}
                   {w.label}
                 </button>
               ))}
            </div>
         </div>
      )}

      {/* Responsive Grid System for Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        
        {/* Row 1 / Stat Cards */}
        {activeWidgets.includes('drafts') && (
           <div className="lg:col-span-1 border border-transparent">
             <StatCard title="Draft Reviews" value={draftCount} icon={FileText} />
           </div>
        )}
        {activeWidgets.includes('completed') && (
           <div className="lg:col-span-1 border border-transparent">
             <StatCard title="Completed Output" value={completedCount} icon={CheckCircle} colorClass="text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30" />
           </div>
        )}
        {activeWidgets.includes('threats') && (
           <div className="lg:col-span-1 border border-transparent">
             <StatCard title="Threat Models" value={threatModels.length} colorClass="text-red-500 bg-red-100 dark:bg-red-900/30" />
           </div>
        )}

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        
        {/* Row 2 / Visualizations */}
        {activeWidgets.includes('completion_rate') && (
           <div className="lg:col-span-1 min-h-[250px] border border-transparent">
             <NativeProgressRing title="Completion Rate" value={completedCount} max={allSessions.length} label="Finalized" />
           </div>
        )}

        {activeWidgets.includes('reviews_by_type') && (
           <div className="lg:col-span-2 min-h-[250px] border border-transparent">
             <NativeBarChart title="Assessments By Review Type" data={barChartData} />
           </div>
        )}

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <SystemHealth />
        </div>
        <div className="lg:col-span-2">
          <SwarmTerminal />
        </div>
      </div>
    </div>
  );
}
