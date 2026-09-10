import { RefObject } from 'react';
import { Send, Loader2, Paperclip, AlertTriangle } from 'lucide-react';

interface ChatComposerProps {
  input: string;
  effectiveMaxLength: number;
  executionMode: string;
  isTyping: boolean;
  isGenerating: boolean;
  isUploading: boolean;
  unlocked: boolean;
  loadPercent: number;
  loadText: string;
  fileInputRef: RefObject<HTMLInputElement>;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onAttachClick: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onModeChange: (value: string) => void;
}

/**
 * ChatComposer — presentational slice of AgentChat (Stage 1.3 split).
 * Router select, attachment affordance, and message form verbatim.
 * Zero hooks, zero logic: the container owns state and engine calls.
 */
export default function ChatComposer({
  input,
  effectiveMaxLength,
  executionMode,
  isTyping,
  isGenerating,
  isUploading,
  unlocked,
  loadPercent,
  loadText,
  fileInputRef,
  onInputChange,
  onSend,
  onAttachClick,
  onFileChange,
  onModeChange,
}: ChatComposerProps) {
  return (
    <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-b-2xl">
      {loadPercent > 0 && loadPercent < 100 && (
        <div className="mb-3">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1">
            <span className="truncate max-w-[80%]">{loadText}</span>
            <span>{Math.round(loadPercent)}%</span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div
              className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${loadPercent}%` }}
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
          onChange={(e) => onModeChange(e.target.value)}
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
        onSubmit={(e) => { e.preventDefault(); onSend(); }}
        className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 border border-transparent dark:border-gray-700 focus-within:border-gray-300 focus-within:dark:border-gray-600 rounded-xl p-1"
      >
        <input
          type="file"
          id="agentchat-file-upload"
          name="fileUpload"
          accept="image/*,application/pdf,image/svg+xml,.pdf,.svg"
          className="hidden"
          ref={fileInputRef}
          onChange={onFileChange}
          aria-label="Upload File"
          title="Upload File"
        />
        <button
          type="button"
          onClick={onAttachClick}
          className="p-1.5 text-gray-400 hover:text-purple-500 rounded-lg transition-colors"
          disabled={isUploading || isGenerating || !unlocked}
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
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Ask EA NITI purely..."
          className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-900 dark:text-white px-3 py-2 outline-none disabled:opacity-50"
          maxLength={effectiveMaxLength}
          disabled={isTyping || isGenerating || !unlocked}
          aria-label="Chat input"
          title={`Max ${effectiveMaxLength.toLocaleString()} characters`}
        />
        <button
          type="submit"
          data-testid="agentchat-send-button"
          disabled={!input.trim() || isTyping || isGenerating || isUploading || !unlocked}
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
  );
}
