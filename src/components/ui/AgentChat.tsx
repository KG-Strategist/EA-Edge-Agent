import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2, Sparkles, AlertTriangle, Paperclip, Minus } from 'lucide-react';
import { isModelCached, DEFAULT_TINY_MODEL_ID, setGlobalMoETarget } from '../../lib/aiEngine';
import { EdgeRouter } from '../../services/SemanticRouter';
import { pruneOldChats } from '../../lib/db';
import { Logger } from '../../lib/logger';
import { runOCR } from '../../lib/ocrEngine';

import Logo from './Logo';
import MessageBubble from './MessageBubble';
import { useStateContext } from '../../context/StateContext';

export default function AgentChat() {
  const { executionMode, setExecutionMode } = useStateContext();
  const initialMessages: {role: 'user'|'assistant'|'system', content: string}[] = [
    { role: 'system', content: 'You are EA NITI. A highly experienced Enterprise Architect. Keep answers concise, highly specific to BIAN, TOGAF, and STRIDE where applicable.' },
    { role: 'assistant', content: 'Hello! I am EA NITI. How can I help you map or review your architecture today?' }
  ];

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<{role: 'user'|'assistant'|'system', content: string}[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ text: '', percent: 0 });
  const [lastEngineUsed, setLastEngineUsed] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef<string>('');
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, isGenerating]);

  useEffect(() => {
    const handleProgress = (e: any) => {
      setLoadProgress({ text: e.detail.text, percent: e.detail.progress * 100 });
    };
    window.addEventListener('EA_AI_PROGRESS', handleProgress);
    return () => window.removeEventListener('EA_AI_PROGRESS', handleProgress);
  }, []);

  useEffect(() => {
    const checkModels = async () => {
      // Optimistically default to Primary EA Agent if it's explicitly cached.
      const isCoreCached = await isModelCached(DEFAULT_TINY_MODEL_ID);
      if (isCoreCached) {
        setExecutionMode('Primary EA Agent');
        setGlobalMoETarget('Primary EA Agent');
      }
    };
    checkModels();
  }, [isOpen]);

  useEffect(() => {
    // Cleanup timer on unmount
    return () => {
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // Prune old chat threads on component mount
    pruneOldChats().catch(e => Logger.warn('Chat history pruning failed:', e));
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
    setTimeout(() => setMessages([...initialMessages]), 300); // clear after animation
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const extractedText = await runOCR(file);
      setInput((prev) => prev + `\n[Attached Diagram Data]:\n${extractedText}\n`);
    } catch (err) {
      alert("Failed to parse image data.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isTyping || isGenerating) return;

    const userMsg = input.trim();
    setInput('');

    const newMessages = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(newMessages);
    setIsTyping(true);
    setIsGenerating(true);

    // Add temporary assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '🧠 Analyzing architecture...' }]);

    // Reset buffer and timer
    bufferRef.current = '';
    if (updateTimerRef.current) clearTimeout(updateTimerRef.current);

    try {
      // Throttled stream buffering callback
      const onUpdate = (text: string) => {
        bufferRef.current = text;

        // Clear existing timer
        if (updateTimerRef.current) clearTimeout(updateTimerRef.current);

        // Schedule state update every 500ms
        updateTimerRef.current = setTimeout(() => {
          setMessages(prev => {
            const updated = [...prev];
            if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
              updated[updated.length - 1].content = bufferRef.current;
            }
            return updated;
          });
        }, 500);
      };

      // Truncate message history to last 6 + system
      const truncatedMessages = [
        ...newMessages.filter(m => m.role === 'system'),
        ...newMessages.filter(m => m.role !== 'system').slice(-6)
      ];

      let responseText = '';
      if (executionMode === 'Auto-Route (MoE)') {
        const { response, engineUsed } = await EdgeRouter.routeInference(userMsg, truncatedMessages, onUpdate);
        responseText = response;
        setLastEngineUsed(engineUsed);
      } else {
        const { chatWithAgent } = await import('../../lib/aiEngine');
        responseText = await chatWithAgent(truncatedMessages, onUpdate, executionMode as 'Primary EA Agent' | 'Tiny Triage Agent');
        setLastEngineUsed(executionMode);
      }

      // Final update with complete buffer
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      setMessages(prev => {
        const updated = [...prev];
        if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
          updated[updated.length - 1].content = responseText || bufferRef.current;
        }
        return updated;
      });
    } catch (error: any) {
      Logger.error('[AgentChat] chatWithAgent error:', error);
      const errorDisplay =
        error?.message?.includes('CONSENT_REQUIRED')
          ? '_A model download is required. Please approve the consent dialog or sideload weights offline._'
          : '_An unexpected error occurred. Please check System Health for diagnostics._';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1].content = errorDisplay;
        return updated;
      });
    } finally {
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      setIsTyping(false);
      setIsGenerating(false);
    }
  };

  return (
    <>
      {/* Floating Entry Button */}
      <button
        onClick={() => { setIsOpen(true); setIsMinimized(false); }}
        className={`${isOpen && !isMinimized ? 'scale-0' : 'scale-100'} transition-transform duration-300 fixed bottom-6 right-6 w-14 h-14 bg-gray-900 dark:bg-purple-600 rounded-full shadow-2xl flex items-center justify-center text-white hover:bg-gray-800 dark:hover:bg-purple-700 z-40 ring-4 ring-white dark:ring-gray-900 border border-gray-700/50 dark:border-purple-500`}
        aria-label="Open Chat"
        title="Open Chat"
      >
        <MessageSquare size={24} />
        <div className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900 dark:border-purple-600"></div>
      </button>

      {/* Chat Pane */}
      <div className={`fixed bottom-6 right-6 w-96 h-[600px] max-h-[85vh] bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl z-50 flex flex-col transition-all duration-300 origin-bottom-right ${isOpen && !isMinimized ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none translate-y-20'}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center">
              <Logo className="w-7 h-7 shrink-0" animated={false} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                EA NITI
                {executionMode === 'Primary EA Agent' && <Sparkles size={12} className="text-purple-600 dark:text-purple-400" />}
              </h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">
                Offline AI Engine Active
              </p>
              {lastEngineUsed && (
                <p className="text-[9px] text-blue-500 dark:text-blue-400 mt-0.5">
                  Routed via: {lastEngineUsed}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
             <button 
               onClick={() => setIsMinimized(true)}
               className="p-1.5 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
               title="Minimize without resetting chat"
               aria-label="Minimize Chat"
             >
               <Minus size={18} />
             </button>
             <button 
               onClick={handleClose}
               className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
               title="Close and Clear chat block"
               aria-label="Close Chat"
             >
               <X size={18} />
             </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.filter(m => m.role !== 'system').map((msg, i, filtered) => (
            <MessageBubble
              key={i}
              role={msg.role}
              content={msg.content}
              isTyping={isTyping || isGenerating}
              isLastMessage={i === filtered.length - 1}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-b-2xl">
          {loadProgress.percent > 0 && loadProgress.percent < 100 && (
            <div className="mb-3">
              <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                <span className="truncate max-w-[80%]">{loadProgress.text}</span>
                <span>{Math.round(loadProgress.percent)}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div 
                  className="bg-purple-500 h-1.5 rounded-full transition-all duration-300" 
                  style={{ width: `${loadProgress.percent}%` }}
                ></div>
              </div>
            </div>
          )}
          <div className="mb-2">
            <select
               value={executionMode}
               onChange={(e) => {
                 setExecutionMode(e.target.value);
                 setGlobalMoETarget(e.target.value);
               }}
               className="w-full text-[11px] font-medium bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded px-2 py-1 outline-none"
               disabled={loadProgress.percent > 0 && loadProgress.percent < 100}
               aria-label="Agent Router Target"
               title="Agent Router Target"
            >
               <option value="Auto-Route (MoE)">⚡ Auto-Route (MoE)</option>
               <option value="Tiny Triage Agent">🧠 Tiny Triage Agent</option>
               <option value="Primary EA Agent">🏎️ Primary EA Agent</option>
            </select>
          </div>
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 border border-transparent dark:border-gray-700 focus-within:border-gray-300 focus-within:dark:border-gray-600 rounded-xl p-1"
          >
            <input 
               type="file" 
               accept="image/*" 
               className="hidden" 
               ref={fileInputRef}
               onChange={handleFileUpload}
               aria-label="Upload File"
               title="Upload File"
            />
            <button
               type="button"
               onClick={() => fileInputRef.current?.click()}
               className="p-1.5 text-gray-400 hover:text-purple-500 rounded-lg transition-colors"
               disabled={isUploading || isGenerating || (loadProgress.percent > 0 && loadProgress.percent < 100)}
               aria-label="Attach File"
               title="Attach File"
            >
               {isUploading ? <Loader2 size={16} className="animate-spin text-purple-500" /> : <Paperclip size={16} />}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask EA NITI purely..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-900 dark:text-white px-3 py-2 outline-none disabled:opacity-50"
              disabled={isTyping || isGenerating || (loadProgress.percent > 0 && loadProgress.percent < 100)}
              aria-label="Chat input"
              title="Chat input"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping || isGenerating || isUploading || (loadProgress.percent > 0 && loadProgress.percent < 100)}
              className="w-8 h-8 rounded-lg bg-gray-900 dark:bg-purple-600 text-white flex items-center justify-center disabled:opacity-50 shrink-0 transition-opacity"
              aria-label="Send Message"
              title="Send Message"
            >
              {isTyping || isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} className="ml-0.5" />}
            </button>
          </form>
          <div className="mt-2 text-center">
             <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center justify-center gap-1">
               <AlertTriangle size={10} /> Entirely Local & Air-gapped
             </span>
          </div>
        </div>
      </div>
    </>
  );
}
