import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MessageSquare, X, Send, Loader2, Sparkles, AlertTriangle, Paperclip, Minus, Zap, Brain, ChevronDown, CheckCircle2, Cpu, History } from 'lucide-react';
import { setGlobalMoETarget } from '../../lib/aiEngine';
import { localDaemon } from '../../lib/providers/LocalDaemonProvider';
import { EdgeRouter } from '../../services/SemanticRouter';
import { pruneOldChats, db } from '../../lib/db';
import { Logger } from '../../lib/logger';
import { runOCR } from '../../lib/ocrEngine';
import { createThread, getThreads, addMessage, getOlderMessages, getRecentMessages, getSystemMessages } from '../../lib/chatMemory';
import { ChatMessage } from '../../lib/db';
import { useNotification } from '../../context/NotificationContext';

import Logo from './Logo';
import MessageBubble from './MessageBubble';
import { useStateContext } from '../../context/StateContext';

function toStoredEngine(engineUsed: string): 'sovereign' | 'neuro-symbolic' {
  return engineUsed === 'sovereign-wasm' || engineUsed === 'daemon' || engineUsed === 'byom-network'
    ? 'sovereign'
    : 'neuro-symbolic';
}

function describeChatError(error: any): string {
  const msg = error?.message || String(error || '');
  if (msg.includes('VaultLockedError') || msg.includes('Vault locked') || msg.includes('DEK not available')) {
    return '_Security vault is locked. Please re-authenticate before sending chat messages._';
  }
  if (msg.includes('CONSENT_REQUIRED')) {
    return '_A model download is required. Please approve the consent dialog or sideload weights offline._';
  }
  if (msg.includes('MODEL_NOT_CACHED')) {
    return '_Model not cached. Please download it via System Health or sideload via Upload Model._';
  }
  if (msg.includes('NO_MODEL_CONFIGURED')) {
    return '_No model configured. Please set up a model in Agent Settings -> Model Configuration._';
  }
  if (msg.includes('WATCHDOG_TIMEOUT')) {
    return '_Sovereign WASM inference stopped after the worker missed its heartbeat. The engine has been reset; try again after checking model compatibility._';
  }
  if (msg.includes('Worker not available') || msg.includes('Engine offline')) {
    return '_Sovereign WASM worker is not available. The engine will reinitialize on the next request._';
  }
  if (msg.includes('UNSUPPORTED') || msg.includes('Unsupported') || msg.includes('TENSOR_NOT_FOUND')) {
    return `_The cached GGUF is not compatible with the current Sovereign WASM runtime: ${msg}_`;
  }
  return '_An unexpected error occurred. Please check System Health for diagnostics._';
}

const CHAT_PAGE_SIZE = 80;

export default function AgentChat() {
  const { addNotification } = useNotification();
  const { executionMode, setExecutionMode, activeWorkflowId, activeStageId, authStatus } = useStateContext();

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreBefore, setHasMoreBefore] = useState(false);
  const [oldestCursor, setOldestCursor] = useState<number | null>(null);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCoTExpanded, setIsCoTExpanded] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ text: '', percent: 0 });
  const [lastEngineUsed, setLastEngineUsed] = useState<string | null>(null);
  const [isDaemonActive, setIsDaemonActive] = useState(localDaemon.isConnected);

  useEffect(() => {
    setGlobalMoETarget(executionMode);
  }, [executionMode]);

  useEffect(() => {
    const unsubscribe = localDaemon.subscribe(setIsDaemonActive);
    return () => { unsubscribe(); };
  }, []);

  const maxPromptCharsSetting = useLiveQuery(
    () => db.app_settings.get('maxPromptChars'),
    [],
    { value: 8000 } as { value: number }
  );
  const effectiveMaxLength = maxPromptCharsSetting?.value ?? 8000;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bufferRef = useRef<string>('');
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadRecentWindow = useCallback(async (threadId: number) => {
    const [window, system] = await Promise.all([
      getRecentMessages(threadId, CHAT_PAGE_SIZE),
      getSystemMessages(threadId),
    ]);
    setMessages(window.messages);
    setHasMoreBefore(window.hasMoreBefore);
    setOldestCursor(window.oldestCursor);
    return { visibleMessages: window.messages, systemMessages: system };
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('EA_CHAT_STATE_CHANGED', {
      detail: { isOpen }
    }));
  }, [isOpen]);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, isGenerating, isCoTExpanded]);

  useEffect(() => {
    const handleProgress = (e: any) => {
      setLoadProgress({ text: e.detail.text, percent: e.detail.progress * 100 });
    };
    window.addEventListener('EA_AI_PROGRESS', handleProgress);
    return () => window.removeEventListener('EA_AI_PROGRESS', handleProgress);
  }, []);

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

  useEffect(() => {
    const handleEpistemicInsight = (e: CustomEvent) => {
      const { insight } = e.detail;
      if (insight) {
        addNotification(`💡 Epistemic Insight: ${insight}`, 'info', 5000);
      }
    };
    window.addEventListener('EA_EPISTEMIC_INSIGHT', handleEpistemicInsight as EventListener);
    return () => window.removeEventListener('EA_EPISTEMIC_INSIGHT', handleEpistemicInsight as EventListener);
  }, [addNotification]);

  // Initialize DB Chat Memory — context-aware persona resolution
  useEffect(() => {
    if (authStatus !== 'unlocked') {
      setActiveThreadId(null);
      setMessages([]);
      setHasMoreBefore(false);
      setOldestCursor(null);
      return;
    }

    const initChat = async () => {
      try {
        let threads = await getThreads();
        let currentThreadId: number;

        if (threads.length === 0) {
          currentThreadId = await createThread('Session');

          // Resolve persona from workflow context or global MITRA
          let resolvedPersonaId: number | null = null;
          if (activeWorkflowId && activeStageId) {
            const workflow = await db.review_workflows.get(activeWorkflowId);
            if (workflow) {
              const stage = workflow.stages?.find(s => s.id === activeStageId);
              resolvedPersonaId = stage?.mitraProfileId ?? workflow.defaultMitraProfileId ?? null;
            }
          }
          if (!resolvedPersonaId) {
            const activeProfile = await db.mitra_profiles.filter(p => p.isActive).first();
            resolvedPersonaId = activeProfile?.id ?? null;
          }

          // Resolve greeting from persona identity
          let greeting = "Hello! I am **EA-NITI**, your enterprise-grade edge AI agent. I run completely air-gapped in your browser with Sovereign Engine (OPFS pipeline active).\n\nI can assist with any **SAMIKSHA** review process — Enhancement Reviews (ER), New System Implementation (NSI) — as well as DDQ audits, threat modeling, and all pre-configured workflows in your vault. How can I help?";
          if (resolvedPersonaId) {
            const profile = await db.mitra_profiles.get(resolvedPersonaId);
            if (profile?.domain) {
              const domainGreeting = await db.prompt_templates
                .where('type').equals('greeting')
                .and(p => p.category === profile.domain)
                .first();
              if (domainGreeting?.promptText) greeting = domainGreeting.promptText;
            }
            // Fallback to global greeting
            if (greeting.includes('EA-NITI')) {
              const globalGreeting = await db.prompt_templates.where('name').equals('EA_CHAT_GREETING').first();
              if (globalGreeting?.promptText) greeting = globalGreeting.promptText;
            }
          }

          // Resolve system prompt from persona
          let systemMsg = "You are EA NITI. A highly experienced Enterprise Architect. Keep answers concise, highly specific to BIAN, TOGAF, and STRIDE where applicable.";
          if (resolvedPersonaId) {
            const profile = await db.mitra_profiles.get(resolvedPersonaId);
            if (profile?.systemPrompt) systemMsg = profile.systemPrompt;
          }

          await addMessage(currentThreadId, 'system', systemMsg, 'neuro-symbolic');
          await addMessage(currentThreadId, 'assistant', greeting, 'neuro-symbolic');
        } else {
          currentThreadId = threads[0].id!;
        }

        setActiveThreadId(currentThreadId);
        await loadRecentWindow(currentThreadId);
      } catch (err) {
        Logger.error('Failed to initialize chat memory', err);
        addNotification('Security vault is locked. Please re-authenticate before chatting.', 'error', 5000);
      }
    };
    initChat();
  }, [activeWorkflowId, activeStageId, addNotification, authStatus, loadRecentWindow]);

  const handleLoadEarlier = async () => {
    if (!activeThreadId || !oldestCursor || isLoadingEarlier) return;
    setIsLoadingEarlier(true);
    try {
      const older = await getOlderMessages(activeThreadId, oldestCursor, CHAT_PAGE_SIZE);
      setMessages(prev => [...older.messages, ...prev]);
      setHasMoreBefore(older.hasMoreBefore);
      setOldestCursor(older.oldestCursor);
    } catch (error) {
      Logger.error('[AgentChat] Failed to load earlier messages:', error);
      addNotification('Security vault is locked. Please re-authenticate before loading earlier messages.', 'error', 5000);
    } finally {
      setIsLoadingEarlier(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
  };

  const selectedRouteBadge = (() => {
    if (isDaemonActive) {
      return {
        icon: <Cpu size={10} />,
        label: 'Native OS Daemon Active',
        className: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/50',
      };
    }

    if (executionMode === 'Primary EA Agent') {
      return {
        icon: <Sparkles size={10} />,
        label: lastEngineUsed === 'sovereign-wasm' ? 'Primary EA Agent Active' : 'Primary EA Agent Selected',
        className: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800/50',
      };
    }

    if (executionMode === 'Tiny Triage Agent') {
      return {
        icon: <Zap size={10} />,
        label: lastEngineUsed === 'sovereign-wasm' ? 'Tiny Triage Active' : 'Tiny Triage Selected',
        className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/50',
      };
    }

    if (executionMode === 'Auto-Route (MoE)') {
      return {
        icon: <Cpu size={10} />,
        label: lastEngineUsed === 'sovereign-wasm' ? 'MoE: Sovereign Wasm' : lastEngineUsed === 'epistemic' ? 'MoE: Epistemic' : 'Auto-Route Selected',
        className: 'bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
      };
    }

    return {
      icon: <Brain size={10} />,
      label: 'Tiny Epistemic Engine',
      className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
    };
  })();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const extractedText = await runOCR(file);
      const safeText = extractedText || '(no text could be extracted from this attachment)';
      setInput((prev) => prev + `\n[Attached ${file.name || 'document'}]:\n${safeText}\n`);
    } catch {
      addNotification("Failed to parse image data.", 'error', 3000);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if (authStatus !== 'unlocked') {
      addNotification('Security vault is locked. Please re-authenticate before chatting.', 'error', 5000);
      return;
    }

    if (!input.trim() || isTyping || isGenerating || !activeThreadId) return;

    const userMsg = input.trim();
    setInput('');

    let currentMessages: ChatMessage[];
    let currentSystemMessages: ChatMessage[];
    try {
      await addMessage(activeThreadId, 'user', userMsg, 'pending');
      const refreshed = await loadRecentWindow(activeThreadId);
      currentMessages = refreshed.visibleMessages;
      currentSystemMessages = refreshed.systemMessages;
    } catch (error: any) {
      Logger.error('[AgentChat] Failed to persist user message:', error);
      setInput(userMsg);
      addNotification('Security vault is locked. Please re-authenticate before chatting.', 'error', 5000);
      return;
    }

    setIsTyping(true);
    setIsGenerating(true);
    setIsCoTExpanded(true); // Auto-expand CoT on new request

    // Add temporary visual placeholder
    setMessages(prev => [...prev, {
       id: -1, 
       threadId: activeThreadId, 
       role: 'assistant', 
       content: '', // Let CoT UI handle the visual
       inferenceEngine: 'pending',
       timestamp: new Date() as any // type hack for local stub
    }]);

    bufferRef.current = '';
    if (updateTimerRef.current) clearTimeout(updateTimerRef.current);

    try {
      // Throttled stream buffering callback
      const onUpdate = (text: string) => {
        bufferRef.current = text;
        if (!updateTimerRef.current) {
          updateTimerRef.current = setTimeout(() => {
            setMessages(prev => {
              const updated = [...prev];
              if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
                updated[updated.length - 1].content = bufferRef.current;
              }
              return updated;
            });
            updateTimerRef.current = null;
          }, 100);
        }
      };

      // Truncate message history for context
      const inferenceMessages = [
        ...currentSystemMessages.map(m => ({ role: m.role, content: m.content || '' })),
        ...currentMessages.map(m => ({ role: m.role, content: m.content || '' })),
      ];
      const truncatedMessages = [
        ...inferenceMessages.filter(m => m.role === 'system'),
        ...inferenceMessages.filter(m => m.role !== 'system').slice(-6),
      ];

      let responseText = '';
      let engineUsed: 'sovereign' | 'neuro-symbolic' = 'neuro-symbolic';
      
      if (executionMode === 'Auto-Route (MoE)') {
        const { response, engineUsed: eu } = await EdgeRouter.routeInference(userMsg, truncatedMessages, onUpdate, executionMode as string);
        responseText = response;
        engineUsed = toStoredEngine(eu);
        setLastEngineUsed(eu);
      } else {
        const { chatWithAgentDetailed } = await import('../../lib/aiEngine');
        const result = await chatWithAgentDetailed(truncatedMessages, onUpdate, executionMode);
        responseText = result.text;
        engineUsed = toStoredEngine(result.engineUsed);
        setLastEngineUsed(result.engineUsed);
      }

      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      
      // Save finalized response to DB
      const finalContent = responseText || bufferRef.current;
      await addMessage(activeThreadId, 'assistant', finalContent, engineUsed);
      
      // Refresh the bounded chat window strictly from DB.
      await loadRecentWindow(activeThreadId);
      
    } catch (error: any) {
      Logger.error('[AgentChat] chatWithAgent error:', error);
      const errorDisplay = describeChatError(error);
      
      try {
        await addMessage(activeThreadId, 'assistant', errorDisplay, 'neuro-symbolic');
        await loadRecentWindow(activeThreadId);
      } catch (persistError) {
        Logger.error('[AgentChat] Failed to persist assistant error:', persistError);
        setMessages(prev => prev.filter(m => m.id !== -1));
        addNotification('Security vault is locked. Please re-authenticate before chatting.', 'error', 5000);
      }
      
    } finally {
      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      setIsTyping(false);
      setIsGenerating(false);
      setIsCoTExpanded(false);
    }
  };

  return (
    <>
      {/* Floating Entry Button */}
      <button
        onClick={() => { setIsOpen(true); setIsMinimized(false); }}
        data-testid="agentchat-open-button"
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
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${selectedRouteBadge.className}`}>
                  {selectedRouteBadge.icon} {selectedRouteBadge.label}
                </span>
              </div>
              
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
               title="Close chat"
               aria-label="Close Chat"
             >
               <X size={18} />
             </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {hasMoreBefore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleLoadEarlier}
                disabled={isLoadingEarlier || authStatus !== 'unlocked'}
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
                onClick={() => setIsCoTExpanded(!isCoTExpanded)}
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
               id="agentchat-execution-mode"
               name="executionMode"
               data-testid="agentchat-execution-mode"
               value={executionMode}
                onChange={(e) => {
                  const val = e.target.value;
                  setExecutionMode(val);
                  setGlobalMoETarget(val);
                }}
                className="w-full text-[11px] font-medium bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded px-2 py-1 outline-none"
               aria-label="Agent Router Target"
               title="Agent Router Target"
            >
               <option value="Tiny Triage Agent (Epistemic)" hidden>🧠 Tiny Triage Agent (Epistemic)</option>
               <option value="Auto-Route (MoE)">
                 ⚡ Auto-Route (MoE)
               </option>
               <option value="Tiny Triage Agent">🧠 Tiny Triage Agent</option>
               <option value="Primary EA Agent">
                 🏎️ Primary EA Agent
               </option>
            </select>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 border border-transparent dark:border-gray-700 focus-within:border-gray-300 focus-within:dark:border-gray-600 rounded-xl p-1"
          >
             <input
                type="file"
                id="agentchat-file-upload"
                name="fileUpload"
                accept="image/*,application/pdf,image/svg+xml,.pdf,.svg"
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
                disabled={isUploading || isGenerating || authStatus !== 'unlocked'}
               aria-label="Attach File"
               title="Attach File"
            >
               {isUploading ? <Loader2 size={16} className="animate-spin text-purple-500" /> : <Paperclip size={16} />}
            </button>
             <input
               id="agentchat-message-input"
               name="message"
               data-testid="agentchat-message-input"
               type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask EA NITI purely..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-900 dark:text-white px-3 py-2 outline-none disabled:opacity-50"
              maxLength={effectiveMaxLength}
                disabled={isTyping || isGenerating || authStatus !== 'unlocked'}
              aria-label="Chat input"
              title={`Max ${effectiveMaxLength.toLocaleString()} characters`}
            />
            <button
              type="submit"
              data-testid="agentchat-send-button"
               disabled={!input.trim() || isTyping || isGenerating || isUploading || authStatus !== 'unlocked'}
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
