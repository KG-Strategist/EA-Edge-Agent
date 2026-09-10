import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MessageSquare, Sparkles, Zap, Brain, Cpu } from 'lucide-react';
import { setGlobalMoETarget } from '../../lib/aiEngine';
import { localDaemon } from '../../lib/providers/LocalDaemonProvider';
import { EdgeRouter } from '../../services/SemanticRouter';
import { pruneOldChats, db } from '../../lib/db';
import { Logger } from '../../lib/logger';
import { runOCR } from '../../lib/ocrEngine';
import { createThread, getThreads, addMessage, getOlderMessages, getRecentMessages, getSystemMessages } from '../../lib/chatMemory';
import { ChatMessage } from '../../lib/db';
import { useNotification } from '../../context/NotificationContext';

import ChatHeader from './ChatHeader';
import ChatMessageList from './ChatMessageList';
import ChatComposer from './ChatComposer';
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
      {/* Floating Entry Button — BUG-003 FIX: immediate show/hide, no transition race */}
      <button
        onClick={() => { setIsOpen(true); setIsMinimized(false); }}
        data-testid="agentchat-open-button"
        className={`${isOpen && !isMinimized ? 'scale-0 pointer-events-none' : 'scale-100 pointer-events-auto'} fixed bottom-6 right-6 w-14 h-14 bg-gray-900 dark:bg-purple-600 rounded-full shadow-2xl flex items-center justify-center text-white hover:bg-gray-800 dark:hover:bg-purple-700 z-40 ring-4 ring-white dark:ring-gray-900 border border-gray-700/50 dark:border-purple-500`}
        aria-label="Open Chat"
        title="Open Chat"
      >
        <MessageSquare size={24} />
        <div className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900 dark:border-purple-600"></div>
      </button>

      {/* Chat Pane — BUG-003 FIX: Remove CSS transition race; use immediate visibility when open */}
      <div className={`fixed bottom-6 right-6 w-96 h-[600px] max-h-[85vh] bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl z-50 flex flex-col origin-bottom-right ${isOpen && !isMinimized ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-95 opacity-0 pointer-events-none translate-y-20'}`}>
        
        {/* Header */}
        <ChatHeader
          badge={selectedRouteBadge}
          executionMode={executionMode}
          onMinimize={() => setIsMinimized(true)}
          onClose={handleClose}
        />

        {/* Messages */}
        <ChatMessageList
          messages={messages}
          isTyping={isTyping}
          isGenerating={isGenerating}
          isCoTExpanded={isCoTExpanded}
          hasMoreBefore={hasMoreBefore}
          isLoadingEarlier={isLoadingEarlier}
          unlocked={authStatus === 'unlocked'}
          messagesEndRef={messagesEndRef}
          onLoadEarlier={handleLoadEarlier}
          onToggleCoT={() => setIsCoTExpanded(!isCoTExpanded)}
        />

        {/* Input */}
        <ChatComposer
          input={input}
          effectiveMaxLength={effectiveMaxLength}
          executionMode={executionMode}
          isTyping={isTyping}
          isGenerating={isGenerating}
          isUploading={isUploading}
          unlocked={authStatus === 'unlocked'}
          loadPercent={loadProgress.percent}
          loadText={loadProgress.text}
          fileInputRef={fileInputRef}
          onInputChange={setInput}
          onSend={handleSend}
          onAttachClick={() => fileInputRef.current?.click()}
          onFileChange={handleFileUpload}
          onModeChange={(val) => {
            setExecutionMode(val);
            setGlobalMoETarget(val);
          }}
        />
      </div>
    </>
  );
}
