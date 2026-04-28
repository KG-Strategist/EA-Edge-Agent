import React, { useState, useRef, useEffect } from 'react';
import { LogOut, ChevronRight, Home, CloudDownload, CheckCircle, AlertCircle, X } from 'lucide-react';
import { useStateContext } from '../../context/StateContext';
import { logoutUser } from '../../lib/authEngine';
import MoESelector from '../widgets/MoESelector';

interface HeaderProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  adminSubView: string;
  setAdminSubView: (view: string) => void;
}

const viewLabels: Record<string, string> = {
  'dashboard': 'Dashboard',
  'reviews': 'Architecture Reviews',
  'threat': 'Threat Modeling',
  'expert-config': 'Expert Setup',
  'agent-config': 'Agent Center',
  'system-pref': 'System & Preference',
  'knowledge-mgmt': 'Knowledge Management',
  'admin': 'Admin Panel',
};

const subViewLabels: Record<string, string> = {
  'layers': 'Layers',
  'principles': 'Principles',
  'service-domains': 'Service Domains',
  'metamodel': 'Content Metamodel',
  'categories': 'Master Categories',
  'tags': 'Tags',
  'prompts': 'AI Prompts',
  'configs': 'Agent Configurations',
  'workflows': 'Workflows',
  'templates': 'Templates',
  'network': 'Network & Privacy',
  'knowledge': 'Enterprise Knowledge',
  'models': 'Model Sandbox',
  'system': 'State Portability',
  'users': 'User Access Management',
  'audit': 'Audit Workspace',
  'dpdp': 'Global Guardrails',
  'web-providers': 'Web Trainings',
};

const adminSubViewToParent: Record<string, string> = {
  'layers': 'expert-config',
  'principles': 'expert-config',
  'service-domains': 'expert-config',
  'metamodel': 'expert-config',
  'categories': 'expert-config',
  'tags': 'expert-config',
  'prompts': 'agent-config',
  'configs': 'agent-config',
  'workflows': 'agent-config',
  'templates': 'agent-config',
  'network': 'system-pref',
  'users': 'system-pref',
  'audit': 'system-pref',
  'dpdp': 'system-pref',
  'models': 'system-pref',
  'system': 'system-pref',
  'knowledge': 'knowledge-mgmt',
  'web-providers': 'knowledge-mgmt',
};

export default function Header({ currentView, setCurrentView, adminSubView }: HeaderProps) {
  const { identity, setIdentity, downloadState, setDownloadState } = useStateContext();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRetry = () => {
    window.dispatchEvent(new CustomEvent('EA_NAVIGATE', { 
      detail: { view: 'agent-config', subView: 'configs' } 
    }));
    setDownloadState(prev => ({ ...prev, isActive: false }));
    setIsDropdownOpen(false);
  };

  const handleLogout = () => {
    logoutUser();
    setIdentity(null);
  };

  const getBreadcrumbs = () => {
    const crumbs = [
      { label: 'Home', onClick: () => setCurrentView('dashboard') }
    ];

    if (currentView !== 'dashboard') {
      let actualParentView = currentView;
      
      if (['expert-config', 'agent-config', 'system-pref', 'knowledge-mgmt', 'admin'].includes(currentView)) {
         actualParentView = adminSubViewToParent[adminSubView] || currentView;
      }

      crumbs.push({ 
        label: viewLabels[actualParentView] || actualParentView, 
        onClick: () => setCurrentView(actualParentView) 
      });

      if (['expert-config', 'agent-config', 'system-pref', 'knowledge-mgmt', 'admin'].includes(currentView)) {
        crumbs.push({ 
          label: subViewLabels[adminSubView] || adminSubView, 
          onClick: () => {} 
        });
      }
    }

    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 shrink-0 transition-colors duration-300">
      <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 flex-1 min-w-0 whitespace-nowrap truncate">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={index}>
            {index > 0 && <ChevronRight size={14} className="mx-1 sm:mx-2 shrink-0" />}
            <button 
              onClick={crumb.onClick}
              className={`flex items-center hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${index === breadcrumbs.length - 1 ? 'font-semibold text-gray-900 dark:text-gray-100 truncate' : 'shrink-0'}`}
              disabled={index === breadcrumbs.length - 1}
            >
              {index === 0 && <Home size={16} className="mr-1.5 shrink-0" />}
              <span className={index === breadcrumbs.length - 1 ? 'truncate' : ''}>{crumb.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>
      
      <div className="flex items-center gap-3 sm:gap-4 ml-4 shrink-0">
        <MoESelector />

        {downloadState.isActive && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={`p-2 rounded-full transition-colors relative ${isDropdownOpen ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400'}`}
              aria-label="Download Status"
            >
              <CloudDownload size={20} className={downloadState.status === 'Downloading' ? 'animate-pulse text-blue-600 dark:text-blue-400' : ''} />
              {downloadState.status === 'Downloading' && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-900"></span>
              )}
            </button>

            {isDropdownOpen && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden z-50">
                <div className="p-3 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                     {downloadState.status === 'Downloading' && <CloudDownload size={16} className="text-blue-600 dark:text-blue-400 animate-pulse" />}
                     {downloadState.status === 'Complete' && <CheckCircle size={16} className="text-green-600 dark:text-green-400" />}
                     {downloadState.status === 'Error' && <AlertCircle size={16} className="text-red-600 dark:text-red-400" />}
                     <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {downloadState.status === 'Downloading' ? 'Caching Model...' : downloadState.status}
                     </span>
                   </div>
                   <button onClick={() => setIsDropdownOpen(false)} aria-label="Close download status" title="Close download status" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={16}/></button>
                </div>
                <div className="p-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Progress</span>
                    <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{downloadState.progressPercentage}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2.5 mb-2 overflow-hidden">
                    <div 
                      className={`h-2.5 rounded-full transition-all duration-300 ${
                        downloadState.status === 'Complete' ? 'bg-green-500' :
                        downloadState.status === 'Error' ? 'bg-red-500' : 'bg-blue-600'
                      }`} 
                      style={{ width: `${downloadState.progressPercentage}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={downloadState.progressText}>
                    {downloadState.progressText}
                  </p>
                  {downloadState.status === 'Error' && downloadState.message && (
                    <p className="text-[10px] text-red-600 dark:text-red-400 mt-2 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-800 break-words max-h-24 overflow-y-auto">
                      {downloadState.message}
                    </p>
                  )}
                  {(downloadState.status === 'Complete' || downloadState.status === 'Error') && (
                    <div className="mt-3 flex gap-2 justify-end">
                      {downloadState.status === 'Error' && (
                        <button onClick={handleRetry} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md">Retry</button>
                      )}
                      <button onClick={() => { setDownloadState(prev => ({ ...prev, isActive: false })); setIsDropdownOpen(false); }} className="px-3 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-md">Dismiss</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="hidden md:flex items-center gap-2 text-sm">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold text-xs">
            {identity?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <span className="text-gray-700 dark:text-gray-200 font-medium">{identity?.username}</span>
          <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-semibold border border-gray-200 dark:border-gray-700">
            {identity?.role}
          </span>
        </div>
        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 hidden md:block"></div>
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors text-sm font-medium px-2 py-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/10"
        >
          <LogOut size={18} />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
