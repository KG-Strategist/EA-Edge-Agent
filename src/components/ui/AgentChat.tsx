import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Loader2, Sparkles, AlertTriangle, Paperclip, Minus } from 'lucide-react';
import { chatWithAgent, isModelCached, DEFAULT_TINY_MODEL_ID } from '../../lib/aiEngine';
import { runOCR } from '../../lib/ocrEngine';
import ReactMarkdown from 'react-markdown';
import Logo from './Logo';

export default function AgentChat() {
  const initialMessages: {role: 'user'|'assistant'|'system', content: string}[] = [
    { role: 'system', content: 'You are EA NITI. A highly experienced Enterprise Architect. Keep answers concise, highly specific to BIAN, TOGAF, and STRIDE where applicable.' },
    { role: 'assistant', content: 'Hello! I am EA NITI. How can I help you map or review your architecture today?' }
  ];

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<{role: 'user'|'assistant'|'system', content: string}[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<'EA Core Model' | 'Domain SME Model' | 'Auto-Route Hybrid'>('Domain SME Model');
  const [isUploading, setIsUploading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Scroll to bottom whenever messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useEffect(() => {
    const checkModels = async () => {
      // Optimistically default to EA Core if it's explicitly cached.
      const isCoreCached = await isModelCached(DEFAULT_TINY_MODEL_ID);
      if (isCoreCached) setSelectedTarget('EA Core Model');
    };
    checkModels();
  }, [isOpen]);

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
    if (!input.trim() || isTyping) return;
    
    const userMsg = input.trim();
    setInput('');
    
    const newMessages = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(newMessages);
    setIsTyping(true);
    
    // Add temporary assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      await chatWithAgent(newMessages, (text) => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].content = text;
          return updated;
        });
      }, selectedTarget);
    } catch (error: any) {
      console.error(error);
      if (error.message?.includes('CONSENT_REQUIRED')) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].content = "_Action completely blocked. Please Consent to download the model from the System Health dashboard first._";
          return updated;
        });
      } else {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1].content = "_Error generating response. Ensure WebGPU is enabled and model is cached._";
          return updated;
        });
      }
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Floating Entry Button */}
      <button
        onClick={() => { setIsOpen(true); setIsMinimized(false); }}
        className={`${isOpen && !isMinimized ? 'scale-0' : 'scale-100'} transition-transform duration-300 fixed bottom-6 right-6 w-14 h-14 bg-gray-900 dark:bg-purple-600 rounded-full shadow-2xl flex items-center justify-center text-white hover:bg-gray-800 dark:hover:bg-purple-700 z-40 ring-4 ring-white dark:ring-gray-900 border border-gray-700/50 dark:border-purple-500`}
      >
        <MessageSquare size={24} />
        <div className="absolute top-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900 dark:border-purple-600"></div>
      </button>

      {/* Chat Pane */}
      <div className={`fixed bottom-6 right-6 w-96 h-[600px] max-h-[85vh] bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl z-50 flex flex-col transition-all duration-300 origin-bottom-right ${isOpen && !isMinimized ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none translate-y-20'}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center">
              <Logo className="w-8 h-8 shrink-0" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                EA NITI
                {selectedTarget === 'EA Core Model' && <Sparkles size={12} className="text-purple-600 dark:text-purple-400" />}
              </h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">
                Offline AI Engine Active
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
             <button 
               onClick={() => setIsMinimized(true)}
               className="p-1.5 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
               title="Minimize without resetting chat"
             >
               <Minus size={18} />
             </button>
             <button 
               onClick={handleClose}
               className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
               title="Close and Clear chat block"
             >
               <X size={18} />
             </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.filter(m => m.role !== 'system').map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300' : ''}`}>
                {msg.role === 'user' ? <User size={14} /> : <Logo className="w-8 h-8 drop-shadow-sm" />}
              </div>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${msg.role === 'user' ? 'bg-gray-900 dark:bg-purple-600 text-white rounded-tr-sm' : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-sm border border-gray-200 dark:border-gray-700'}`}>
                {msg.role === 'assistant' ? (
                   <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                     <ReactMarkdown>{msg.content || (isTyping && i === messages.length - 1 ? '...' : '')}</ReactMarkdown>
                   </div>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-b-2xl">
          <div className="mb-2">
            <select 
               value={selectedTarget}
               onChange={(e) => setSelectedTarget(e.target.value as any)}
               className="w-full text-[11px] font-medium bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded px-2 py-1 outline-none"
            >
               <option value="Auto-Route Hybrid">⚡ Auto-Route Hybrid</option>
               <option value="Domain SME Model">🧠 Domain SME Model (Primary)</option>
               <option value="EA Core Model">🏎️ Constraints Model (Tiny)</option>
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
            />
            <button
               type="button"
               onClick={() => fileInputRef.current?.click()}
               className="p-1.5 text-gray-400 hover:text-purple-500 rounded-lg transition-colors"
               disabled={isUploading}
            >
               {isUploading ? <Loader2 size={16} className="animate-spin text-purple-500" /> : <Paperclip size={16} />}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask EA NITI purely..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-900 dark:text-white px-3 py-2 outline-none"
              disabled={isTyping}
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping || isUploading}
              className="w-8 h-8 rounded-lg bg-gray-900 dark:bg-purple-600 text-white flex items-center justify-center disabled:opacity-50 shrink-0 transition-opacity"
            >
              {isTyping ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} className="ml-0.5" />}
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
