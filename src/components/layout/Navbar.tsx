import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Settings, FileText, Shield, Sun, Moon, ChevronLeft, ChevronRight, Menu, X, Layers, Lightbulb, Database, Tag, Brain, Network, FileDown, Workflow, BookOpen, Library, Globe, Plane } from 'lucide-react';
import { useStateContext } from '../../context/StateContext';
import Logo from '../ui/Logo';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../lib/db';
import { useNotification } from '../../context/NotificationContext';

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
    { id: 'service-domains', label: 'Service Domains', icon: Network },
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
    { id: 'dpdp', label: 'Global Guardrails', icon: Shield },
    { id: 'models', label: 'Model Sandbox', icon: Database },
    { id: 'system', label: 'State Portability', icon: Settings },
  ],
  'knowledge-mgmt': [
    { id: 'knowledge', label: 'Enterprise Knowledge', icon: BookOpen },
    { id: 'web-providers', label: 'Web Trainings', icon: Globe },
  ],
};

export default function Navbar({ currentView, setCurrentView, adminSubView, setAdminSubView }: NavbarProps) {
  const { theme, toggleTheme, identity } = useStateContext();
  const { addNotification } = useNotification();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAdminSubmenuVisible, setIsAdminSubmenuVisible] = useState(true);

  const appSettings = useLiveQuery(() => db.app_settings.toArray()) || [];
  const enableNetworkIntegrations = appSettings.find(s => s.key === 'enableNetworkIntegrations')?.value === true;
  const isAirGapped = !enableNetworkIntegrations;

  const handleToggleNetworkIntegrations = async (enabled: boolean) => {
    if (!identity?.username) {
      addNotification("Network access must be initialized via System Preferences > Network & Privacy.", "error");
      return;
    }
    try {
      const user = await db.users.where('pseudokey').equals(identity.username).first();
      const hasConsent = user?.consentHistory?.some((c: any) => c.type === 'HYBRID_NETWORK' || c.type === 'HYBRID_LIMITED' || c.type === 'EXTERNAL_IDENTITY' || c.type === 'TELEMETRY');
      
      if (enabled && !hasConsent) {
        addNotification("Network access must be initialized via System Preferences > Network & Privacy.", "error");
        return;
      }
      
      await db.app_settings.put({ key: 'enableNetworkIntegrations', value: enabled });
      if (!enabled) {
        window.dispatchEvent(new CustomEvent('APP_NETWORK_FORCE_KILLED'));
      }
      addNotification(enabled ? 'Network access enabled.' : 'Network access disabled. Active background processes terminated.', 'success', 3000);
    } catch {
      addNotification('Failed to update network settings.', 'error');
    }
  };

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
    ...((identity?.role === 'Lead EA' || identity?.role === 'System Admin') ? [
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
                        if (item.hasSubmenu) {
                          setIsAdminSubmenuVisible(!isAdminSubmenuVisible);
                          setCurrentView(item.id);
                          if (adminTabs[item.id]) {
                            setAdminSubView(adminTabs[item.id][0].id);
                          }
                        } else {
                          setCurrentView(item.id);
                          setIsMobileMenuOpen(false);
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
              <div className="flex gap-2 w-full">
                <button
                  onClick={toggleTheme}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 ease-in-out text-sm font-medium"
                >
                  {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                  <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
                </button>
                <div className="flex-1 flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 transition-all duration-200 ease-in-out text-sm font-medium">
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    {isAirGapped ? <Plane size={16} className="text-blue-500" /> : <Network size={16} className="text-emerald-500" />}
                    <span>{isAirGapped ? 'Offline' : 'Online'}</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={!isAirGapped}
                      onChange={(e) => handleToggleNetworkIntegrations(e.target.checked)}
                    />
                    <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-500 peer-checked:bg-emerald-500 transition-all duration-200 ease-in-out"></div>
                  </label>
                </div>
              </div>
              <div className="mt-4 text-center">
                <span className="text-[10px] text-gray-400 dark:text-gray-500 opacity-60 whitespace-nowrap">© 2026 EANITI Foundation | EA-NITI™</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <nav className={`hidden md:flex md:flex-col ${isCollapsed ? 'md:w-20' : 'md:w-64'} bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 h-screen sticky top-0 flex-col transition-all duration-300 z-30`}>
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
                    if (item.hasSubmenu) {
                      setIsAdminSubmenuVisible(!isAdminSubmenuVisible);
                      setCurrentView(item.id);
                      if (adminTabs[item.id]) {
                        setAdminSubView(adminTabs[item.id][0].id);
                      }
                      setIsCollapsed(false);
                    } else {
                      setCurrentView(item.id);
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
        <div className="p-3 border-t border-gray-200 dark:border-gray-800 mt-auto">
          <div className={`flex ${isCollapsed ? 'flex-col' : ''} gap-1.5 w-full`}>
            <button
              onClick={toggleTheme}
              title={isCollapsed ? (theme === 'dark' ? 'Light Mode' : 'Dark Mode') : undefined}
              className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-center gap-2'} flex-1 py-1.5 px-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 ease-in-out text-sm font-medium`}
            >
              {theme === 'dark' ? <Sun size={15} className="shrink-0" /> : <Moon size={15} className="shrink-0" />}
              {!isCollapsed && <span className="whitespace-nowrap text-xs">{theme === 'dark' ? 'Light' : 'Dark'}</span>}
            </button>
            <button
              onClick={() => handleToggleNetworkIntegrations(isAirGapped)}
              title={isCollapsed ? (isAirGapped ? 'Offline Mode' : 'Online Mode') : undefined}
              className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-center gap-2'} flex-1 py-1.5 px-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 ease-in-out text-sm font-medium`}
            >
              {isAirGapped ? <Plane size={15} className="text-blue-500 shrink-0" /> : <Network size={15} className="text-emerald-500 shrink-0" />}
              {!isCollapsed && <span className="whitespace-nowrap text-xs">{isAirGapped ? 'Offline' : 'Online'}</span>}
            </button>
          </div>
          {!isCollapsed && (
            <div className="mt-2 text-center">
              <span className="text-[10px] text-gray-400 dark:text-gray-500 opacity-60 whitespace-nowrap">© 2026 EANITI Foundation | EA-NITI™</span>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}






