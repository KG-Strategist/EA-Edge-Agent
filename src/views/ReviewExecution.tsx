import React, { useState, useEffect, useRef } from 'react';
import { db, ReviewSession, BianDomain, ArchitecturePrinciple, ReviewWorkflow } from '../lib/db';
import { runOCR } from '../lib/ocrEngine';
import { initAIEngine, generateReview } from '../lib/aiEngine';
import { buildPrompt } from '../lib/promptBuilder';
import { storeReviewEmbeddings, findSimilarReviews } from '../lib/ragEngine';
import { parseDDQResponse } from '../lib/ddqEngine';
import { DDQScorecard } from '../lib/ddqRules';
import { computeWeightedScorecard, getDefaultWeightsForReviewType, BDAT_WEIGHT_PRESETS, BDATWeights, WeightedVendorResult, getPrinciplesByAxis } from '../lib/scorecardEngine';
import * as XLSX from 'xlsx';
import { useStateContext } from '../context/StateContext';
import { Loader2, Play, CheckCircle2, ArrowLeft, BrainCircuit, FileText, Download, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import SafeMermaid from '../components/ui/SafeMermaid';
import BDATRadar from '../components/ui/BDATRadar';
import { exportAsPDF, exportAsMarkdown, generateADRMarkdown } from '../lib/exportEngine';
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
  const [workflow, setWorkflow] = useState<ReviewWorkflow | null>(null);
  
  const [vendorScores, setVendorScores] = useState<any[]>([]);
  const [vendorScorecards, setVendorScorecards] = useState<{ name: string; scorecard: DDQScorecard }[]>([]);
  const [bdatWeights, setBdatWeights] = useState<BDATWeights>({ B: 25, D: 25, A: 25, T: 25 });
  const [weightedResults, setWeightedResults] = useState<WeightedVendorResult[]>([]);
  const [selectedPreset, setSelectedPreset] = useState('Flat');
  const [expandedAxis, setExpandedAxis] = useState<string | null>(null);
  const [winningVendor, setWinningVendor] = useState<string | null>(null);
  const [humanJustification, setHumanJustification] = useState('');
  
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
        if (s.workflowId) {
          const w = await db.review_workflows.get(s.workflowId);
          if (w) setWorkflow(w);
        }
        const p = await db.architecture_principles.where('status').equals('Active').toArray();
        setPrinciples(p);
        
        // Setup Vendor Matrix State with BDAT weighting
        if (s.ddqBlobs && s.ddqBlobs.length > 0) {
          const scores: any[] = [];
          const scorecardPairs: { name: string; scorecard: DDQScorecard }[] = [];
          for (const vblob of s.ddqBlobs) {
              try {
                  const arrBuf = await vblob.blob.arrayBuffer();
                  const wb = XLSX.read(arrBuf, { type: 'array' });
                  const scorecard = parseDDQResponse(wb);
                  const vendorName = vblob.name.replace('.xlsx','');
                  scores.push({ name: vendorName, ...scorecard });
                  scorecardPairs.push({ name: vendorName, scorecard });
              } catch (e) {
                  console.warn("Failed to parse DDQ:", vblob.name);
              }
          }
          setVendorScores(scores.sort((a,b) => b.percentageScore - a.percentageScore));
          setVendorScorecards(scorecardPairs);

          // Apply review-type-aware BDAT weights
          const defaultWeights = getDefaultWeightsForReviewType(s.type || '');
          setBdatWeights(defaultWeights);
          // Determine which preset was auto-selected
          const presetName = Object.entries(BDAT_WEIGHT_PRESETS).find(
            ([_, w]) => w.B === defaultWeights.B && w.D === defaultWeights.D && w.A === defaultWeights.A && w.T === defaultWeights.T
          )?.[0] || 'Custom';
          setSelectedPreset(presetName);

          const weighted = computeWeightedScorecard(scorecardPairs, defaultWeights);
          setWeightedResults(weighted);
          
          if (s.humanOverrides?.winningVendorOverride) {
              setWinningVendor(s.humanOverrides.winningVendorOverride);
          } else if (weighted.length > 0) {
              setWinningVendor(weighted[0].name);
          }
        }
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
      }, false, 'EA Core Model');
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
      
      const currentStage = workflow ? workflow.stages[session.currentStageIndex || 0] : null;
      let targetTemplateId = currentStage?.linkedReportTemplateId;
      let finalPrompt = '';
      
      // We'll inject vendor winning logic dynamically
      let extContext = ocrText;
      if (winningVendor) {
          extContext += `\n\n[HUMAN ARCHITECTURE BOARD OVERRIDE]: The officially mandated Vendor for this architecture is ${winningVendor}. Justification: ${humanJustification || 'Optimal mathematical compliance.'}`;
      }
      
      if (targetTemplateId) {
          const tmpl = await db.report_templates.get(targetTemplateId);
          if (tmpl) {
              extContext += `\n\n[MANDATORY OUTPUT FORMAT]: You MUST structure your final report strictly according to the following markdown template. Do not deviate. Fill in the variables:\n\n${tmpl.markdownStructure}`;
          }
      }
      
      finalPrompt = buildPrompt(session.type, domain, principles, extContext, history);
      
      await generateReview(
        finalPrompt, 
        (text) => { setReportText(text); },
        'EA Core Model'
      );
    } catch (error) {
      console.error("Generation Error:", error);
      alert("Failed to generate review.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApproveGate = async () => {
     if (!session || !workflow) return;
     
     // Update IndexDB state bridging
     await db.review_sessions.update(sessionId, {
         currentStageIndex: (session.currentStageIndex || 0) + 1,
         humanOverrides: {
             winningVendorOverride: winningVendor!,
             justification: humanJustification,
             overrideTimestamp: new Date().toISOString()
         }
     });
     
     const updated = await db.review_sessions.get(sessionId);
     if (updated) setSession(updated);
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
    exportAsPDF(reportRef.current, {
      filename: `ADR_${session?.projectName}.pdf`,
    });
  };

  const downloadMarkdown = () => {
    exportAsMarkdown(reportText, `ADR_${session?.projectName}.md`);
  };

  const downloadFullADR = () => {
    if (!session) return;
    // Build scorecard summary if available
    let scorecardSummary: string | undefined;
    if (weightedResults.length > 0) {
      scorecardSummary = `| Vendor | Weighted Score | B | D | A | T |\n|--------|---------------|---|---|---|---|\n`;
      weightedResults.forEach(v => {
        scorecardSummary += `| ${v.name} | **${v.totalWeightedScore.toFixed(1)}** | ${v.axes.B.percentage}% | ${v.axes.D.percentage}% | ${v.axes.A.percentage}% | ${v.axes.T.percentage}% |\n`;
      });
    }
    const adr = generateADRMarkdown({
      session,
      reportMarkdown: reportText,
      scorecardSummary,
      domainName: domain?.name,
    });
    exportAsMarkdown(adr, `ADR_Full_${session.projectName}.md`);
  };

  if (!session) return <div className="text-white">Loading session...</div>;

  return (
    <div className="w-full pb-20">
      <button onClick={() => setCurrentView('dashboard')} className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors">
        <ArrowLeft size={18} />
        Back to Dashboard
      </button>

      <div className="mb-8 flex justify-between items-end">
         <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Review Execution: {session.projectName}</h2>
            <div className="flex items-center gap-3">
               <span className="bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider">{session.type}</span>
               {workflow && (
                  <span className="text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-md mt-1 mb-1">
                      Executing Pipeline: {workflow.name} (Stage {(session.currentStageIndex || 0) + 1} of {workflow.stages.length})
                  </span>
               )}
            </div>
         </div>
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

          {/* Step 3: Architecture Board Review (Human Gate Override) */}
          <div className={`p-5 rounded-xl border ${step >= 3 ? 'bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700/50 shadow-sm dark:shadow-none' : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 opacity-50'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step > 3 ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400' : step === 3 ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'}`}>
                {step > 3 ? <CheckCircle2 size={16} /> : '3'}
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white">Architecture Board Review</h3>
            </div>
            {step === 3 && (
              <div className="animate-in fade-in zoom-in-95 duration-300 text-sm">
                <p className="text-gray-600 dark:text-gray-400 mb-4 font-medium px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800/30">
                   <strong>Pipeline Paused: HUMAN GATE.</strong> Review the BDAT Scorecard and approve vendor selection.
                </p>

                {/* Vendor Ranking Cards */}
                <div className="space-y-2 mb-4">
                   {weightedResults.map((v, idx) => (
                       <div key={v.name} className={`p-3 rounded-lg border-2 transition-all cursor-pointer ${winningVendor === v.name ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`} onClick={() => setWinningVendor(v.name)}>
                          <div className="flex justify-between items-center">
                             <div className="flex items-center gap-2">
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${idx === 0 ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'}`}>{idx+1}</span>
                                <h4 className={`font-semibold ${winningVendor === v.name ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-900 dark:text-white'}`}>{v.name}</h4>
                             </div>
                             <div className="text-right">
                                <span className="font-mono font-bold text-base text-gray-900 dark:text-white">{v.totalWeightedScore.toFixed(1)}</span>
                                <span className="text-gray-400 text-xs ml-1">/ 100</span>
                             </div>
                          </div>
                          {/* AI Bias Flag */}
                          {idx === 0 && winningVendor !== v.name && v.totalWeightedScore > 70 && (
                              <div className="text-[10px] uppercase font-bold text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-1 rounded inline-block mt-2">
                                  AI Flag: Mathematically optimal. Override requires justification.
                              </div>
                          )}
                       </div>
                   ))}
                </div>

                {winningVendor && (
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                       <label className="block text-xs uppercase text-gray-500 font-bold mb-2">Lead EA Override Justification</label>
                       <textarea 
                          className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-2.5 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-1 focus:ring-indigo-500 resize-none h-16"
                          placeholder="Ex: Mandated by global strategic partnership constraints..."
                          value={humanJustification}
                          onChange={e => setHumanJustification(e.target.value)}
                       />
                       <button 
                          onClick={() => {
                             handleApproveGate();
                             setStep(4);
                          }}
                          className="w-full mt-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-md transition-colors text-sm"
                       >
                          Approve Decision & Unlock AIA
                       </button>
                    </div>
                )}
              </div>
            )}
          </div>

          {/* Step 4: Final Generation */}
          <div className={`p-5 rounded-xl border ${step >= 4 ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-none' : 'bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 opacity-50'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step > 4 ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400' : step === 4 ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'}`}>
                {step > 4 ? <CheckCircle2 size={16} /> : '4'}
              </div>
              <h3 className="font-medium text-gray-900 dark:text-white">AIA Report Generation</h3>
            </div>
            {step === 4 && (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Generate the templated output record with context binding.</p>
                <button 
                  onClick={handleGenerateReview}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                >
                  <Play size={18} />
                  Initiate Final Review
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

          {/* BDAT Scorecard Panel */}
          {step >= 3 && vendorScorecards.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm dark:shadow-none">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">BDAT Scorecard Comparison</h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Weighted vendor analysis across Business, Data, Application & Technology axes</p>
                </div>
                <select
                  value={selectedPreset}
                  onChange={(e) => {
                    const preset = e.target.value;
                    setSelectedPreset(preset);
                    if (preset !== 'Custom' && BDAT_WEIGHT_PRESETS[preset]) {
                      const newW = { ...BDAT_WEIGHT_PRESETS[preset] };
                      setBdatWeights(newW);
                      setWeightedResults(computeWeightedScorecard(vendorScorecards, newW));
                    }
                  }}
                  className="text-xs bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-gray-700 dark:text-gray-300 outline-none"
                >
                  <option value="NSI">Preset: NSI Default</option>
                  <option value="Enhancement">Preset: Enhancement Default</option>
                  <option value="Flat">Preset: Flat (Equal)</option>
                  <option value="Custom">Custom Weights</option>
                </select>
              </div>

              {/* Radar Chart */}
              <div className="flex justify-center mb-6">
                <BDATRadar
                  vendors={weightedResults.map(wr => ({
                    name: wr.name,
                    B: wr.axes.B.percentage,
                    D: wr.axes.D.percentage,
                    A: wr.axes.A.percentage,
                    T: wr.axes.T.percentage,
                  }))}
                />
              </div>

              {/* Weight Sliders */}
              <div className="grid grid-cols-4 gap-3 mb-6 px-2">
                {(['B', 'D', 'A', 'T'] as const).map(axis => (
                  <div key={axis} className="text-center">
                    <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">
                      {{ B: 'Business', D: 'Data', A: 'Application', T: 'Technology' }[axis]}
                    </label>
                    <input
                      type="range" min={0} max={100} value={bdatWeights[axis]}
                      onChange={(e) => {
                        const newW = { ...bdatWeights, [axis]: parseInt(e.target.value) };
                        setBdatWeights(newW);
                        setSelectedPreset('Custom');
                        setWeightedResults(computeWeightedScorecard(vendorScorecards, newW));
                      }}
                      className="w-full accent-indigo-600 h-1.5"
                    />
                    <span className="text-xs font-mono text-gray-600 dark:text-gray-400">{bdatWeights[axis]}%</span>
                  </div>
                ))}
              </div>

              {/* Principle Breakdown Table */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-400">Axis / Principle</th>
                      {weightedResults.map(v => (
                        <th key={v.name} className="px-3 py-2 text-center font-semibold text-gray-600 dark:text-gray-400">{v.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(['B', 'D', 'A', 'T'] as const).map(axis => (
                      <React.Fragment key={axis}>
                        <tr
                          className="bg-gray-50/50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                          onClick={() => setExpandedAxis(expandedAxis === axis ? null : axis)}
                        >
                          <td className="px-3 py-2 font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1">
                            {expandedAxis === axis ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {{ B: '📊 Business', D: '🔒 Data', A: '⚙️ Application', T: '🖥️ Technology' }[axis]}
                            <span className="text-gray-400 font-normal ml-1">(w: {bdatWeights[axis]}%)</span>
                          </td>
                          {weightedResults.map(v => (
                            <td key={v.name} className="px-3 py-2 text-center">
                              <span className={`font-bold ${v.axes[axis].percentage >= 70 ? 'text-green-600 dark:text-green-400' : v.axes[axis].percentage >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                                {v.axes[axis].percentage}%
                              </span>
                            </td>
                          ))}
                        </tr>
                        {expandedAxis === axis && getPrinciplesByAxis(axis).map(principle => (
                          <tr key={principle} className="border-t border-gray-100 dark:border-gray-800">
                            <td className="px-3 py-1.5 pl-8 text-gray-600 dark:text-gray-400">{principle}</td>
                            {weightedResults.map(v => {
                              const vendorSc = vendorScorecards.find(vs => vs.name === v.name);
                              const pScore = vendorSc?.scorecard.principleScores[principle];
                              return (
                                <td key={v.name} className="px-3 py-1.5 text-center text-gray-600 dark:text-gray-400">
                                  {pScore ? `${pScore.score}/${pScore.maxScore}` : '—'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                    {/* Total Row */}
                    <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900">
                      <td className="px-3 py-2 font-bold text-gray-900 dark:text-white">Weighted Total</td>
                      {weightedResults.map(v => (
                        <td key={v.name} className="px-3 py-2 text-center font-bold text-indigo-700 dark:text-indigo-400 text-sm">
                          {v.totalWeightedScore.toFixed(1)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
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
                    <button 
                      onClick={downloadFullADR}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                    >
                      <FileText size={16} />
                      Full ADR
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
