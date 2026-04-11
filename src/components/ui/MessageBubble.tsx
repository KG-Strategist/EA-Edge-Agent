import React from 'react';
import { User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Logo from './Logo';

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isTyping?: boolean;
  isLastMessage?: boolean;
}

/**
 * Memoized message bubble component.
 * Prevents unnecessary re-renders when sibling messages update.
 */
const MessageBubble = React.memo(
  ({ role, content, isTyping, isLastMessage }: MessageBubbleProps) => {
    return (
      <div className={`flex gap-3 ${role === 'user' ? 'flex-row-reverse' : ''}`}>
        <div className={`w-8 h-8 flex items-center justify-center shrink-0 ${role === 'user' ? 'rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300' : ''}`}>
          {role === 'user' ? <User size={16} /> : <Logo className="w-5 h-5 drop-shadow-sm" animated={false} />}
        </div>
        <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${role === 'user' ? 'bg-gray-900 dark:bg-purple-600 text-white rounded-tr-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-sm border border-gray-200 dark:border-gray-700'}`}>
          {role === 'assistant' ? (
            <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
              <ReactMarkdown>{content || (isTyping && isLastMessage ? '...' : '')}</ReactMarkdown>
            </div>
          ) : (
            content
          )}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if role, content, or isTyping changes
    // Ignore isLastMessage as it doesn't affect rendering
    return (
      prevProps.role === nextProps.role &&
      prevProps.content === nextProps.content &&
      prevProps.isTyping === nextProps.isTyping
    );
  }
);

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;
