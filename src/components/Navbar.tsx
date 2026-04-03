import React, { useState } from 'react';
import { LayoutDashboard, Settings, FileText, Sun, Moon, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import { useStateContext } from '../context/StateContext';

interface NavbarProps {
  currentView: string;
  setCurrentView: (view: string) => void;
}

export default function Navbar({ currentView, setCurrentView }: NavbarProps) {
  const { theme, toggleTheme } = useStateContext();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'intake', label: 'Review Intake', icon: FileText },
    { id: 'admin', label: 'Control Panel', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 h-16 flex items-center justify-between px-4">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">EA Edge Agent</h1>
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
          <div className="fixed left-0 top-16 bottom-0 w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200 dark:border-gray-800">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">EA Edge Agent</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Offline Architecture Review</p>
            </div>
            <div className="flex-1 py-6 flex flex-col gap-2 px-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentView(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-600/10 text-blue-600 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                    }`}
                  >
                    <Icon size={18} className="shrink-0" />
                    <span>{item.label}</span>
                  </button>
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
      <nav className={`hidden md:flex md:flex-col ${isCollapsed ? 'md:w-20' : 'md:w-64'} bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 h-screen flex-col transition-all duration-300`}>
        <div className={`p-6 border-b border-gray-200 dark:border-gray-800 flex ${isCollapsed ? 'justify-center' : 'justify-between'} items-center h-[73px]`}>
          {!isCollapsed && (
            <div className="overflow-hidden whitespace-nowrap">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">EA Edge Agent</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Offline Architecture Review</p>
            </div>
          )}
          <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 shrink-0">
            {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
        <div className="flex-1 py-6 flex flex-col gap-2 px-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-lg transition-colors text-sm font-medium ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-600/10 text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <Icon size={18} className="shrink-0" />
                {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </button>
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
