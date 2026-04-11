import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Settings, FileText, Shield, Sun, Moon, ChevronLeft, ChevronRight, Menu, X, Layers, Lightbulb, Database, Tag, Brain, Network, FileDown, Workflow, BookOpen, Library } from 'lucide-react';
import { useStateContext } from '../context/StateContext';
import Logo from './ui/Logo';

interface NavbarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  adminSubView: string;
  setAdminSubView: (view: string) => void;
}

/** Flat 2-level map: parent nav ID → direct child tabs (no intermediate groups). */
const adminTabs: Record<string, { id: string; label: string; icon: React.ComponentType<any> }[]> = {
  'expert-config': [
    { id: 'layers', label: 'Layers', icon: Layers },
    { id: 'principles', label: 'Principles', icon: Lightbulb },
    { id: 'bian', label: 'BIAN Domains', icon: Network },
    { id: 'metamodel', label: 'Content Metamodel', icon: Database },
    { id: 'categories', label: 'Master Categories', icon: Database },
    { id: 'tags', label: 'Tags', icon: Tag },
  ],
  'agent-config': [
    { id: 'prompts', label: 'AI Prompts', icon: Brain },
    { id: 'configs', label: 'Agent Configurations', icon: Settings },
    { id: 'workflows', label: 'Workflows', icon: Workflow },
    { id: 'templates', label: 'Templates', icon: FileDown },
  ],
  'system-pref': [
    { id: 'network', label: 'Network & Privacy', icon: Network },
    { id: 'users', label: 'User Access', icon: Shield },
    { id: 'audit', label: 'Audit Workspace', icon: FileText },
    { id: 'dpdp', label: 'DPDP / Privacy', icon: Shield },
  ],
  'knowledge-mgmt': [
    { id: 'knowledge', label: 'Enterprise Knowledge', icon: BookOpen },
    { id: 'models', label: 'Model Sandbox', icon: Database },
    { id: 'system', label: 'System & Portability', icon: Settings },
  ],
};
export default function Navbar({ currentView, setCurrentView, adminSubView, setAdminSubView }: NavbarProps) {
  const { theme, toggleTheme, identity } = useStateContext();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAdminSubmenuVisible, setIsAdminSubmenuVisible] = useState(true);

  // Keep submenu open when navigating within an admin view
  useEffect(() => {
    if (['expert-config', 'agent-config', 'system-pref', 'knowledge-mgmt'].includes(currentView)) {
      setIsAdminSubmenuVisible(true);
    }
  }, [adminSubView, currentView]);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'reviews', label: 'Architecture Reviews', icon: FileText },
    { id: 'threat', label: 'Threat Modeling', icon: Shield },
    ...(identity?.role === 'Lead EA' ? [
      { id: 'expert-config', label: 'Expert Setup', icon: Layers, hasSubmenu: true },
      { id: 'agent-config', label: 'Agent Center', icon: Brain, hasSubmenu: true },
      { id: 'knowledge-mgmt', label: 'Knowledge Management', icon: Library, hasSubmenu: true },
      { id: 'system-pref', label: 'System & Preference', icon: Settings, hasSubmenu: true }
    ] : [])
  ];

  /** Renders flat child tabs directly under the parent nav item (2-level only). */
  const renderAdminTabs = (isMobile: boolean, parentNavId: string) => {
    const tabs = adminTabs[parentNavId];
    if (!tabs) return null;

    return (
      <div className="ml-2 pl-2 border-l border-gray-200 dark:border-gray-700 mt-1 flex flex-col gap-0.5">
        {tabs.map(tab => {
          const TabIcon = tab.icon;
          const isActive = adminSubView === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setAdminSubView(tab.id);
                if (isMobile) setIsMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors w-full text-left ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <TabIcon size={13} className="shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 h-16 flex items-center justify-between px-4">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">EA NITI</h1>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="fixed left-0 top-16 bottom-0 w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center gap-3">
              <Logo className="w-8 h-8 shrink-0" animated={false} />
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight leading-tight">EA NITI</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Triage & Inference</p>
              </div>
            </div>
            <div className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => {
                        if (currentView === item.id && item.hasSubmenu) {
                          setIsAdminSubmenuVisible(!isAdminSubmenuVisible);
                        } else {
                          setCurrentView(item.id);
                          setIsAdminSubmenuVisible(true);
                          if (!item.hasSubmenu) setIsMobileMenuOpen(false);
                        }
                      }}
                      className={`flex items-center gap-3 px-4 py-3 w-full rounded-lg transition-colors text-sm font-medium ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-600/10 text-blue-600 dark:text-blue-400'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      <Icon size={18} className="shrink-0" />
                      <span>{item.label}</span>
                    </button>
                    {item.hasSubmenu && isActive && isAdminSubmenuVisible && renderAdminTabs(true, item.id)}
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-800">
              <button
                onClick={toggleTheme}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200 transition-colors text-sm font-medium"
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <nav className={`hidden md:flex md:flex-col ${isCollapsed ? 'md:w-20' : 'md:w-64'} bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 h-screen flex-col transition-all duration-300 relative`}>
        <div className={`p-5 border-b border-gray-200 dark:border-gray-800 flex ${isCollapsed ? 'justify-center' : 'justify-between'} items-center h-[73px] relative`}>
          {!isCollapsed && (
            <div className="flex items-center gap-3 overflow-hidden whitespace-nowrap">
              <Logo className="w-10 h-10 shrink-0" animated={false} />
              <div>
                <h1 className="text-[17px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">EA NITI</h1>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Triage & Inference</p>
              </div>
            </div>
          )}
          {isCollapsed && <Logo className="w-8 h-8 shrink-0" animated={false} />}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)} 
            className={`p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0 z-10 ${
              isCollapsed 
                ? 'absolute -right-3.5 top-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm rounded-full' 
                : 'rounded-lg'
            }`}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={20} />}
          </button>
        </div>
        <div className="flex-1 py-4 flex flex-col gap-1 px-3 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <div key={item.id} className="w-full">
                <button
                  onClick={() => {
                    if (currentView === item.id && item.hasSubmenu) {
                      setIsAdminSubmenuVisible(!isAdminSubmenuVisible);
                    } else {
                      setCurrentView(item.id);
                      setIsAdminSubmenuVisible(true);
                      if (item.hasSubmenu) {
                        setIsCollapsed(false);
                      }
                    }
                  }}
                  title={isCollapsed ? item.label : undefined}
                  className={`flex w-full items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-lg transition-colors text-sm font-medium ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-600/10 text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  <Icon size={18} className="shrink-0" />
                  {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
                </button>
                {item.hasSubmenu && isActive && !isCollapsed && isAdminSubmenuVisible && renderAdminTabs(false, item.id)}
              </div>
            );
          })}
        </div>
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={toggleTheme}
            title={isCollapsed ? (theme === 'dark' ? 'Light Mode' : 'Dark Mode') : undefined}
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-center gap-2'} w-full py-2 px-4 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm font-medium`}
          >
            {theme === 'dark' ? <Sun size={16} className="shrink-0" /> : <Moon size={16} className="shrink-0" />}
            {!isCollapsed && <span className="whitespace-nowrap">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>
        </div>
      </nav>
    </>
  );
}
