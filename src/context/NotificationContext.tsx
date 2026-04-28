import { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';

export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (message: string, type: Notification['type'], duration?: number) => string;
  removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const addNotification = useCallback((message: string, type: Notification['type'] = 'info', duration = 3000) => {
    const id = `${Date.now()}-${Math.random()}`;
    const notification: Notification = { id, message, type, duration };
    
    setNotifications(prev => [...prev, notification]);
    
    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }
    
    return id;
  }, [removeNotification]);

  const contextValue = useMemo(() => ({
    notifications,
    addNotification,
    removeNotification
  }), [notifications, addNotification, removeNotification]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <NotificationDisplay notifications={notifications} removeNotification={removeNotification} />
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
  removeNotification 
}: { 
  notifications: Notification[]; 
  removeNotification: (id: string) => void;
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

  return (
    <div className="fixed bottom-24 right-6 z-[9999] pointer-events-none space-y-2">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`${getTypeStyles(notification.type)} px-4 py-3 rounded-lg shadow-lg pointer-events-auto flex items-center justify-between gap-3 max-w-sm animate-in fade-in slide-in-from-bottom-4`}
        >
          <span className="text-sm font-medium">{notification.message}</span>
          <button
            onClick={() => removeNotification(notification.id)}
            className="text-white/80 hover:text-white transition-colors"
            aria-label="Close notification"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
