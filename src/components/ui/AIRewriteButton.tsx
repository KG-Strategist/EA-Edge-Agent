import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { initAIEngine, generateReview } from '../../lib/aiEngine';

interface AIRewriteButtonProps {
  /** Context/text to rewrite or generate from */
  context: string;
  /** Called with streamed text as it comes */
  onResult: (text: string) => void;
  /** Optional custom prompt override. Use {{context}} as placeholder. */
  promptTemplate?: string;
  /** Disable the button externally */
  disabled?: boolean;
  /** Button label text */
  label?: string;
}

export default function AIRewriteButton({ 
  context, 
  onResult, 
  promptTemplate,
  disabled = false, 
  label = 'Rewrite with AI' 
}: AIRewriteButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);

  const handleRewrite = async () => {
    if (!context.trim()) return;
    
    setIsGenerating(true);
    setAiProgress(0);

    try {
      await initAIEngine((progress) => {
        setAiProgress(Math.round(progress.progress * 100));
      });

      const defaultPrompt = `You are an Enterprise Architecture expert. Rewrite the following description to be clear, concise, and enterprise-grade. Output only the improved description, no filler or conversational text.\n\nOriginal: ${context}`;
      const prompt = promptTemplate 
        ? promptTemplate.replace('{{context}}', context)
        : defaultPrompt;

      onResult('');
      await generateReview(prompt, (text) => {
        onResult(text);
      });
    } catch (err: any) {
      console.error('AI Rewrite Error:', err);
    } finally {
      setIsGenerating(false);
      setAiProgress(0);
    }
  };

  const buttonLabel = isGenerating 
    ? (aiProgress > 0 && aiProgress < 100 ? `Loading AI (${aiProgress}%)` : 'Rewriting...') 
    : label;

  return (
    <button
      type="button"
      onClick={handleRewrite}
      disabled={disabled || isGenerating || !context.trim()}
      className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded border transition-colors ${
        isGenerating
          ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-400 border-purple-200 dark:border-purple-800 cursor-not-allowed'
          : 'bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/30 disabled:opacity-40 disabled:cursor-not-allowed'
      }`}
    >
      {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
      {buttonLabel}
    </button>
  );
}
