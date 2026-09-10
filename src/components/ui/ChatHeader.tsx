import { ReactNode } from 'react';
import { Minus, X, Sparkles } from 'lucide-react';
import Logo from './Logo';

export interface ChatBadge {
  icon: ReactNode;
  label: string;
  className: string;
}

interface ChatHeaderProps {
  badge: ChatBadge;
  executionMode: string;
  onMinimize: () => void;
  onClose: () => void;
}

/**
 * ChatHeader — presentational slice of AgentChat (Stage 1.3 split).
 * Zero hooks, zero logic: every behavior lives in the container.
 */
export default function ChatHeader({ badge, executionMode, onMinimize, onClose }: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 rounded-t-2xl">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 flex items-center justify-center transition-all duration-200 ease-in-out">
          <Logo className="w-9 h-9 shrink-0" animated={false} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            EA NITI
            {executionMode === 'Primary EA Agent' && <Sparkles size={12} className="text-purple-600 dark:text-purple-400" />}
          </h3>

          {/* Dynamic Telemetry Badge */}
          <div className="mt-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${badge.className}`}>
              {badge.icon} {badge.label}
            </span>
          </div>

        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onMinimize}
          className="p-1.5 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          title="Minimize without resetting chat"
          aria-label="Minimize Chat"
        >
          <Minus size={18} />
        </button>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          title="Close chat"
          aria-label="Close Chat"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
