import React, { useState, useEffect, useRef } from 'react';
import { db, ReviewSession, BianDomain, ArchitecturePrinciple } from '../lib/db';
import { runOCR } from '../lib/ocrEngine';
import { initAIEngine, generateReview } from '../lib/aiEngine';
import { buildPrompt } from '../lib/promptBuilder';
import { storeReviewEmbeddings, findSimilarReviews } from '../lib/ragEngine';
import { useStateContext } from '../context/StateContext';
import { Loader2, Play, CheckCircle2, ArrowLeft, BrainCircuit, FileText, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import SafeMermaid from '../components/ui/SafeMermaid';
import html2pdf from 'html2pdf.js';

interface ReviewExecutionProps {
  sessionId: number;
  setCurrentView: (view: string) => void;
}

export default function ReviewExecution({ sessionId, setCurrentView }: ReviewExecutionProps) {
  const { setSystemHealth } = useStateContext();
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [domain, setDomain] = useState<BianDomain | undefined>();
  const [principles, setPrinciples] = useState<ArchitecturePrinciple[]>([]);
  
  const [step, setStep] = useState(1);
  const [ocrText, setOcrText] = useState('');
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  
  const [aiProgress, setAiProgress] = useState(0);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiReady, setIsAiReady] = useState(false);
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportText, setReportText] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [historicalContext, setHistoricalContext] = useState<string[]>([]);
  
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadSession = async () => {
      const s = await db.review_sessions.get(sessionId);
      if (s) {
        setSession(s);
        if (s.bianDomainId) {
          const d = await db.bian_domains.get(s.bianDomainId);
          setDomain(d);
        }
        const p = await db.architecture_principles.where('status').equals('Active').toArray();
        setPrinciples(p);
      }
    };
    loadSession();
  }, [sessionId]);

  const handleRunOCR = async () => {
    if (!session?.architectureBlobs || session.architectureBlobs.length === 0) {
      alert("No architecture artifacts to process.");
      return;
    }
    
    setIsOcrRunning(true);
    try {
      const imageBlob = session.architectureBlobs[0].blob;
      const text = await runOCR(imageBlob);
      setOcrText(text);
      setStep(2);
    } catch (error) {
      console.error("OCR Error:", error);
      alert("Failed to run OCR. Check console.");
    } finally {
      setIsOcrRunning(false);
    }
  };

  const handleInitAI = async () => {
    setIsAiLoading(true);
    try {
      await initAIEngine((progress) => {
        const percent = Math.round(progress.progress * 100);
        setAiProgress(percent);
        setSystemHealth((prev: any) => ({ ...prev, aiModelsStatus: `Downloading (${percent}%)` }));
      });
      setIsAiReady(true);
      setSystemHealth((prev: any) => ({ ...prev, aiModelsStatus: 'Loaded & Ready (WebGPU)' }));
      setStep(3);
    } catch (error: any) {
      console.error("AI Init Error:", error);
      if (error.message?.includes('NetworkError') || error.message?.includes('Cache.add')) {
        alert("Network Error: Failed to download AI model. This can happen if HuggingFace is blocked by a corporate VPN, or if your browser's storage quota is exceeded (e.g., in Incognito/Private mode).");
      } else {
        alert("Failed to initialize WebGPU AI Engine. Check console.");
      }
      setSystemHealth((prev: any) => ({ ...prev, aiModelsStatus: 'Error' }));
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleGenerateReview = async () => {
    if (!session) return;
    setIsGenerating(true);
    setStep(4);
    
    try {
      const history = await findSimilarReviews(ocrText);
      setHistoricalContext(history);
      
      const prompt = buildPrompt(session.type, domain, principles, ocrText, history);
      await generateReview(prompt, (text) => {
        setReportText(text);
      });
    } catch (error) {
      console.error("Generation Error:", error);
      alert("Failed to generate review.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveReport = async () => {
    if (!session?.id) return;
    try {
      await db.review_sessions.update(session.id, {
        reportMarkdown: reportText,
        status: 'Completed'
      });
      await storeReviewEmbeddings(session.id, reportText);
      setIsSaved(true);
    } catch (error) {
      console.error("Save Error:", error);
      alert("Failed to save report.");
    }
  };

  const downloadPDF = () => {
    if (!reportRef.current) return;
    const opt = {
      margin:       1,
      filename:     `ADR_${session?.projectName}.pdf`,
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' as const }
    };
    html2pdf().set(opt).from(reportRef.current).save();
  };

  const downloadMarkdown = () => {
    const blob = new Blob([reportText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ADR_${session?.projectName}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!session) return <div className="text-white">Loading session...</div>;

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <button onClick={() => setCurrentView('dashboard')} className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors">
        <ArrowLeft size={18} />
        Back to Dashboard
      </button>

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Review Execution: {session.projectName}</h2>
        <p className="text-gray-600 dark:text-gray-400">Air-gapped AI processing pipeline.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          {/* Step 1: Vision */}
          <div className={`p-5 rounded-xl border ${step >= 1 ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none' : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 opacity-50'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step > 1 ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-blue-600 text-white'}`}>
                {step > 1 ? <CheckCircle2 size={16} /> : '1'}
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white">Vision (OCR)</h3>
            </div>
            {step === 1 && (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Extract text from uploaded architecture diagrams.</p>
                <button 
                  onClick={handleRunOCR}
                  disabled={isOcrRunning}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  {isOcrRunning ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                  {isOcrRunning ? 'Processing...' : 'Run Local OCR'}
                </button>
              </div>
            )}
          </div>

          {/* Step 2: AI Setup */}
          <div className={`p-5 rounded-xl border ${step >= 2 ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none' : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 opacity-50'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step > 2 ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400' : step === 2 ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'}`}>
                {step > 2 ? <CheckCircle2 size={16} /> : '2'}
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white">AI Engine Setup</h3>
            </div>
            {step === 2 && (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Initialize WebGPU LLM (Phi-3-mini).</p>
                {isAiLoading && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>Downloading Weights</span>
                      <span>{aiProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-900 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full transition-all duration-300" style={{ width: `${aiProgress}%` }}></div>
                    </div>
                  </div>
                )}
                <button 
                  onClick={handleInitAI}
                  disabled={isAiLoading || isAiReady}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  {isAiLoading ? <Loader2 size={18} className="animate-spin" /> : <BrainCircuit size={18} />}
                  {isAiReady ? 'Ready' : isAiLoading ? 'Initializing...' : 'Load AI Model'}
                </button>
              </div>
            )}
          </div>

          {/* Step 3: Execution */}
          <div className={`p-5 rounded-xl border ${step >= 3 ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none' : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 opacity-50'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step > 3 ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400' : step === 3 ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'}`}>
                {step > 3 ? <CheckCircle2 size={16} /> : '3'}
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white">Execution</h3>
            </div>
            {step === 3 && (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Generate the Architectural Decision Record.</p>
                <button 
                  onClick={handleGenerateReview}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Play size={18} />
                  Generate EA Review
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {step >= 2 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm dark:shadow-none">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">Extracted OCR Text</h3>
              <textarea 
                value={ocrText}
                onChange={(e) => setOcrText(e.target.value)}
                className="w-full h-32 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-3 text-sm text-gray-900 dark:text-gray-300 outline-none focus:border-blue-500 font-mono"
              />
            </div>
          )}

          {step >= 4 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 flex flex-col min-h-[400px] shadow-sm dark:shadow-none">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">AI Review Report</h3>
                {isGenerating && <Loader2 size={16} className="text-blue-600 dark:text-blue-400 animate-spin" />}
              </div>
              
              <div ref={reportRef} className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-6 overflow-y-auto text-gray-900 dark:text-gray-300 prose dark:prose-invert max-w-none">
                <ReactMarkdown
                  components={{
                    code({node, inline, className, children, ...props}: any) {
                      const match = /language-(\w+)/.exec(className || '')
                      if (!inline && match && match[1] === 'mermaid') {
                        return <SafeMermaid chart={String(children).replace(/\n$/, '')} />
                      }
                      return <code className={className} {...props}>{children}</code>
                    }
                  }}
                >
                  {reportText || '*Generating...*'}
                </ReactMarkdown>
              </div>
              
              {!isGenerating && !isSaved && (
                <div className="mt-6 flex justify-end">
                  <button 
                    onClick={handleSaveReport}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                  >
                    <CheckCircle2 size={18} />
                    Save & Complete
                  </button>
                </div>
              )}
              {isSaved && (
                <div className="mt-6 flex justify-between items-center">
                  <span className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
                    <CheckCircle2 size={18} />
                    Review Saved & Embedded Successfully
                  </span>
                  <div className="flex gap-3">
                    <button 
                      onClick={downloadMarkdown}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg font-medium transition-colors"
                    >
                      <Download size={16} />
                      Markdown
                    </button>
                    <button 
                      onClick={downloadPDF}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                    >
                      <Download size={16} />
                      PDF
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
