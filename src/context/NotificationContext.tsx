import { createContext, useContext, useState, ReactNode, useCallback, useMemo, useEffect } from 'react';

export interface NotificationAction {
  label: string;
  actionType: 'RELOAD' | string;
}

export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
  action?: NotificationAction;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (message: string, type: Notification['type'], duration?: number, action?: NotificationAction) => string;
  removeNotification: (id: string) => void;
  isChatOpen: boolean;
  setIsChatOpen: (open: boolean) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const addNotification = useCallback((message: string, type: Notification['type'] = 'info', duration = 3000, action?: NotificationAction) => {
    const id = `${Date.now()}-${Math.random()}`;
    const notification: Notification = { id, message, type, duration, action };

    setNotifications(prev => [...prev, notification]);

    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }

    return id;
  }, [removeNotification]);

  useEffect(() => {
    const handler = (e: CustomEvent) => setIsChatOpen(e.detail.isOpen);
    window.addEventListener('EA_CHAT_STATE_CHANGED', handler as EventListener);
    return () => window.removeEventListener('EA_CHAT_STATE_CHANGED', handler as EventListener);
  }, []);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      addNotification(e.detail.message, e.detail.type, e.detail.duration, e.detail.action);
    };
    window.addEventListener('EA_NOTIFICATION', handler as EventListener);
    return () => window.removeEventListener('EA_NOTIFICATION', handler as EventListener);
  }, [addNotification]);

  const contextValue = useMemo(() => ({
    notifications,
    addNotification,
    removeNotification,
    isChatOpen,
    setIsChatOpen
  }), [notifications, addNotification, removeNotification, isChatOpen]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <NotificationDisplay notifications={notifications} removeNotification={removeNotification} isChatOpen={isChatOpen} />
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}

function NotificationDisplay({
  notifications,
  removeNotification,
  isChatOpen
}: {
  notifications: Notification[];
  removeNotification: (id: string) => void;
  isChatOpen: boolean;
}) {
  const getTypeStyles = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-600 dark:bg-green-700 text-white';
      case 'error':
        return 'bg-red-600 dark:bg-red-700 text-white';
      case 'warning':
        return 'bg-amber-600 dark:bg-amber-700 text-white';
      case 'info':
      default:
        return 'bg-blue-600 dark:bg-blue-700 text-white';
    }
  };

  const visible = notifications.filter(n => {
    if (n.message.includes('Hardware memory limit') && isChatOpen) return false;
    return true;
  });

  return (
    <div className="fixed bottom-24 right-6 z-[9999] pointer-events-none space-y-2">
      {visible.map(notification => (
        <div
          key={notification.id}
          className={`${getTypeStyles(notification.type)} px-4 py-3 rounded-lg shadow-lg pointer-events-auto flex flex-col gap-2 max-w-sm animate-in fade-in slide-in-from-bottom-4`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{notification.message}</span>
            <button
              onClick={() => removeNotification(notification.id)}
              className="text-white/80 hover:text-white transition-colors flex-shrink-0"
              aria-label="Close notification"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {notification.action && (
            <button
              onClick={() => {
                if (notification.action?.actionType === 'RELOAD') {
                  window.location.reload();
                }
                removeNotification(notification.id);
              }}
              className="w-full mt-1 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold py-1.5 px-3 rounded transition-colors"
            >
              {notification.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
