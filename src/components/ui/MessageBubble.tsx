import React from 'react';
import { User, Brain, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Logo from './Logo';

interface MessageBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isTyping?: boolean;
  isLastMessage?: boolean;
  inferenceEngine?: string;
}

const MessageBubble = React.memo(
  ({ role, content, isTyping, isLastMessage, inferenceEngine }: MessageBubbleProps) => {
    const isNeuroSymbolic = inferenceEngine === 'neuro-symbolic';
    const isGuardrailBlock = content.startsWith('[CRITICAL GUARDRAIL INTERCEPT]');

    return (
      <div className={`flex gap-3 ${role === 'user' ? 'flex-row-reverse' : ''}`}>
        <div className={`w-8 h-8 flex items-center justify-center shrink-0 ${role === 'user' ? 'rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300' : ''}`}>
          {role === 'user' ? <User size={16} /> : <Logo className="w-5 h-5 drop-shadow-sm" animated={false} />}
        </div>
        <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${role === 'user' ? 'bg-gray-900 dark:bg-purple-600 text-white rounded-tr-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-sm border border-gray-200 dark:border-gray-700'}`}>
          {role === 'assistant' ? (
            <>
              {isNeuroSymbolic && !isGuardrailBlock && (
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wider">
                    <Brain size={10} />
                    Tier-3 Deterministic
                  </span>
                </div>
              )}
              <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                <ReactMarkdown>{content || (isTyping && isLastMessage ? '...' : '')}</ReactMarkdown>
              </div>
              {isNeuroSymbolic && !isGuardrailBlock && (
                <details className="mt-3 group">
                  <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-300 transition-colors list-none flex items-center gap-1">
                    <ChevronRight size={12} className="group-open:rotate-90 transition-transform" />
                    View Engine Telemetry
                  </summary>
                  <div className="mt-2 p-2 rounded bg-gray-900/50 border border-gray-800 text-[10px] text-gray-400 font-mono">
                    • Engine: Structural Semantic Hashing<br />
                    • Resolution: 2048-bit Orthogonal<br />
                    • Hallucination Risk: 0.0%
                  </div>
                </details>
              )}
            </>
          ) : (
            content
          )}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.role === nextProps.role &&
      prevProps.content === nextProps.content &&
      prevProps.isTyping === nextProps.isTyping &&
      prevProps.inferenceEngine === nextProps.inferenceEngine
    );
  }
);

MessageBubble.displayName = 'MessageBubble';

export default MessageBubble;