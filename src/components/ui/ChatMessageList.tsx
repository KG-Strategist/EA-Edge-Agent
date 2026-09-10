import { RefObject } from 'react';
import { Loader2, History, ChevronDown, CheckCircle2 } from 'lucide-react';
import MessageBubble from './MessageBubble';
import { ChatMessage } from '../../lib/db';

interface ChatMessageListProps {
  messages: ChatMessage[];
  isTyping: boolean;
  isGenerating: boolean;
  isCoTExpanded: boolean;
  hasMoreBefore: boolean;
  isLoadingEarlier: boolean;
  unlocked: boolean;
  messagesEndRef?: RefObject<HTMLDivElement>;
  onLoadEarlier: () => void;
  onToggleCoT: () => void;
}

/**
 * ChatMessageList — presentational slice of AgentChat (Stage 1.3 split).
 * Renders history, the load-earlier affordance, and the Chain-of-Thought
 * block verbatim. Zero hooks, zero logic.
 */
export default function ChatMessageList({
  messages,
  isTyping,
  isGenerating,
  isCoTExpanded,
  hasMoreBefore,
  isLoadingEarlier,
  unlocked,
  messagesEndRef,
  onLoadEarlier,
  onToggleCoT,
}: ChatMessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {hasMoreBefore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadEarlier}
            disabled={isLoadingEarlier || !unlocked}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            aria-label="Load earlier chat messages"
            title="Load earlier chat messages"
          >
            {isLoadingEarlier ? <Loader2 size={13} className="animate-spin" /> : <History size={13} />}
            Load Earlier
          </button>
        </div>
      )}
      {messages.filter(m => m.role !== 'system').map((msg, i, filtered) => {
        const isNeuroSymbolic = msg.inferenceEngine === 'neuro-symbolic';
        return (
          <div key={msg.id || i} className={isNeuroSymbolic && msg.role === 'assistant' ? "border-l-4 border-blue-500 bg-blue-900/20 rounded-r-2xl p-1" : ""}>
            <MessageBubble
              role={msg.role}
              content={msg.content || ''}
              isTyping={(isTyping || isGenerating) && i === filtered.length - 1}
              isLastMessage={i === filtered.length - 1}
              inferenceEngine={msg.inferenceEngine}
            />
          </div>
        );
      })}

      {/* Gemini-Style Chain of Thought (CoT) UI */}
      {isGenerating && (
        <div className="mb-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden transition-all duration-300">
          <button
            onClick={onToggleCoT}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-purple-500" />
              <span>Thinking Process</span>
            </div>
            <ChevronDown size={14} className={`transition-transform duration-300 ${isCoTExpanded ? 'rotate-180' : ''}`} />
          </button>

          <div className={`overflow-hidden transition-all duration-300 ${isCoTExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="px-4 pb-3 space-y-2 text-[11px] text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={12} className="text-green-500" />
                <span>Evaluating Global Guardrails...</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={12} className="text-green-500" />
                <span>Querying Local RAG Corpus...</span>
              </div>
              <div className="flex items-center gap-2">
                <Loader2 size={12} className="animate-spin text-blue-500" />
                <span>Synthesizing Response...</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
