import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { generateReview } from '../../lib/aiEngine';
import { buildPrompt } from '../../lib/promptBuilder';
import { Logger } from '../../lib/logger';

interface AIRewriteButtonProps {
  currentText: string;
  onUpdate: (text: string) => void;
  promptKey?: string;
  disabled?: boolean;
  label?: string;
}

export default function AIRewriteButton({
  currentText,
  onUpdate,
  promptKey = 'FIELD_AUTO_REWRITE',
  disabled = false,
  label = 'Rewrite with AI'
}: AIRewriteButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleRewrite = async () => {
    if (!currentText.trim()) return;

    setIsGenerating(true);

    try {
      const prompt = await buildPrompt(promptKey, { architectureText: currentText });

      onUpdate('');
      await generateReview(prompt, (text) => {
        onUpdate(text);
      });
    } catch (err: any) {
      Logger.error('AI Rewrite Error:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleRewrite}
      disabled={disabled || isGenerating || !currentText.trim()}
      className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded border transition-colors ${
        isGenerating
          ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-400 border-purple-200 dark:border-purple-800 cursor-not-allowed'
          : 'bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/30 disabled:opacity-40 disabled:cursor-not-allowed'
      }`}
    >
      {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
      {isGenerating ? 'Rewriting...' : label}
    </button>
  );
}
