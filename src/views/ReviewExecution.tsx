import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';
import * as XLSX from 'xlsx';
import { db, NSIWorkflowState, ReviewSession, ReportTemplate } from '../lib/db';
import { decryptBlob } from '../lib/cryptoVault';
import { parseDDQResponse, generateDDQ } from '../lib/ddqEngine';
import { computeWeightedScorecard, getDefaultWeightsForReviewType, WeightedVendorResult } from '../lib/scorecardEngine';
import { runOcrDetailed } from '../lib/ocrEngine';
import { buildPrompt, PromptContext } from '../lib/promptBuilder';
import { generateReview } from '../lib/aiEngine';
import { vectoriser } from '../lib/SemanticArena';
import { exportAsPDF, downloadAsMarkdown } from '../lib/exportEngine';
import { Logger } from '../lib/logger';
import { useNotification } from '../context/NotificationContext';
import { useStateContext } from '../context/StateContext';
import {
  ArrowLeft, FileSpreadsheet, Upload, Play, CheckCircle2,
  Loader2, Edit3, Eye, Download, FileText,
  ChevronRight, ShieldAlert, BadgeCheck
} from 'lucide-react';
import AIRewriteButton from '../components/ui/AIRewriteButton';

interface ParsedVendor {
  name: string;
  scorecard: any;
  blob?: Blob;
  arrayBuffer?: ArrayBuffer;
}

export default function ReviewExecution({ sessionId, onClose }: { sessionId: number; onClose: () => void }) {
  const [workflowState, setWorkflowState] = useState<NSIWorkflowState>('CONCEPT_RECEIVED');
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [vendors, setVendors] = useState<ParsedVendor[]>([]);
  const [ddqScorecardData, setDdqScorecardData] = useState<WeightedVendorResult[] | null>(null);
  const [generatedDDQBlob, setGeneratedDDQBlob] = useState<Blob | null>(null);
  const [generatedReport, setGeneratedReport] = useState('');
  const [editedReport, setEditedReport] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [eacTemplate, setEacTemplate] = useState<ReportTemplate | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const accumulatedRef = useRef('');
  const { addNotification } = useNotification();
  const { setActiveWorkflowId, setActiveStageId } = useStateContext();

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  useEffect(() => {
    db.review_sessions.get(sessionId).then((s) => {
      if (!s) return;
      setSession(s);
      if (s.workflowState) {
        setWorkflowState(s.workflowState);
      }
      if (s.reportMarkdown) {
        setGeneratedReport(s.reportMarkdown);
        setEditedReport(s.reportMarkdown);
      }
      if (s.eacReportTemplateId) {
        db.report_templates.get(s.eacReportTemplateId).then(t => { if (t) setEacTemplate(t ?? null); });
      }
      // Set workflow context for AgentChat persona resolution
      if (s.workflowId) {
        setActiveWorkflowId(s.workflowId);
        setActiveStageId(null); // Will be set per-stage during execution
      }
    });
    db.report_templates.where({ name: 'NSI EAC Council Report', category: 'NSI' }).first().then((t) => {
      if (t) setEacTemplate(t);
    });

    // Cleanup: clear workflow context when component unmounts
    return () => {
      setActiveWorkflowId(null);
      setActiveStageId(null);
    };
  }, [sessionId, setActiveWorkflowId, setActiveStageId]);

  const persistWorkflowState = useCallback(
    (state: NSIWorkflowState, extra?: Partial<ReviewSession>) => {
      db.review_sessions.update(sessionId, { workflowState: state, ...extra });
    },
    [sessionId]
  );

  // ─── STAGE 1: CONCEPT_RECEIVED ────────────────────────────────────────────
  const handleGenerateDDQ = async () => {
    if (!session) return;
    setIsGenerating(true);
    addLog('Generating NSI Vendor DDQ...');
    try {
      const ddqBlob = await generateDDQ(
        session.projectName,
        session.type,
        session.tags,
        session.appTier,
        session.hostingModel
      );
      setGeneratedDDQBlob(ddqBlob);
      const existingBlobs = session.ddqBlobs || [];
      const updatedBlobs = [
        ...existingBlobs.filter((b: any) => !b.name.includes('DDQ')),
        { name: `${session.projectName}_NSI_DDQ.xlsx`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', blob: ddqBlob }
      ];
      await db.review_sessions.update(sessionId, { ddqBlobs: updatedBlobs });
      addLog('DDQ generated. Ready for vendor distribution.');
      setWorkflowState('DDQ_GENERATED');
      persistWorkflowState('DDQ_GENERATED', { ddqBlobs: updatedBlobs });
      addNotification('DDQ Generated Successfully', 'success');
    } catch (err: any) {
      addLog(`DDQ generation failed: ${err.message}`);
      addNotification('DDQ Generation Failed', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── STAGE 2: DDQ_GENERATED ────────────────────────────────────────────────
  const handleDownloadDDQ = () => {
    if (!generatedDDQBlob || !session) return;
    const url = URL.createObjectURL(generatedDDQBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${session.projectName}_NSI_DDQ.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDDQDrop = async (files: FileList) => {
    if (!session) return;
    setIsParsing(true);
    addLog(`Processing ${files.length} uploaded DDQ file(s)...`);
    try {
      const parsed: ParsedVendor[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const scorecard = parseDDQResponse(workbook);
        parsed.push({ name: file.name, scorecard, blob: file, arrayBuffer });
        addLog(`Parsed DDQ: ${file.name} — ${scorecard.totalScore}/${scorecard.maxPossibleScore} points`);
      }
      const updatedBlobs: any[] = [
        ...(session.ddqBlobs || []),
        ...Array.from(files).map((f) => ({ name: f.name, type: f.type, blob: f as Blob }))
      ];
      setVendors(parsed);
      await db.review_sessions.update(sessionId, { ddqBlobs: updatedBlobs });
      addLog(`All ${files.length} DDQ(s) parsed. Moving to scoring...`);
      setWorkflowState('VENDOR_UPLOADED');
      persistWorkflowState('VENDOR_UPLOADED', { ddqBlobs: updatedBlobs });
      addNotification('Vendor DDQ Uploaded', 'success');
    } catch (err: any) {
      addLog(`DDQ parse error: ${err.message}`);
      addNotification('DDQ Parse Failed', 'error');
    } finally {
      setIsParsing(false);
    }
  };

  // ─── STAGE 3: VENDOR_UPLOADED → EAC REPORT GENERATION ─────────────────────
  const handleGenerateEACReport = async () => {
    if (!session) return;
    setIsGenerating(true);
    addLog('Starting EAC Council Report generation...');
    accumulatedRef.current = '';
    setGeneratedReport('');
    setDdqScorecardData(null);

    try {
      const weights = getDefaultWeightsForReviewType(session.type || '');
      const scorecard = computeWeightedScorecard(vendors.map((v) => ({ name: v.name, scorecard: v.scorecard })), weights);
      setDdqScorecardData(scorecard);
      addLog(`BDAT weighted scorecard computed. Top vendor: ${scorecard[0]?.name} (${scorecard[0]?.overallPercentage}%)`);

      addLog('Extracting architecture diagram text (OCR)...');
      let diagramsText = '';
      if (session.architectureBlobs && session.architectureBlobs.length > 0) {
        for (let i = 0; i < session.architectureBlobs.length; i++) {
          const encrypted = session.architectureBlobs[i];
          const isImage = encrypted.type.includes('image');
          const isPdf = encrypted.type.includes('pdf') || encrypted.type === 'application/pdf';
          const isSvg = encrypted.type.includes('svg') || encrypted.type === 'image/svg+xml';
          if (!isImage && !isPdf && !isSvg) continue;
          addLog(`OCR: processing attachment ${i + 1} of ${session.architectureBlobs.length} (${encrypted.name})…`);
          try {
            const blob = await decryptBlob(encrypted.blob);
            const detailed = await runOcrDetailed(blob, { enableReranker: false });
            diagramsText += `\n--- [${encrypted.name}] ---\n${detailed.text}\n`;
            addLog(
              `OCR: ${detailed.text.length} chars, mode=${detailed.mode}, pages=${detailed.pagesProcessed}/${detailed.pagesTotal ?? detailed.pagesProcessed}, confidence=${detailed.confidence.toFixed(2)} from ${encrypted.name}`,
            );
            if (detailed.internalFlags.length > 0) {
              addLog(`OCR flags for ${encrypted.name}: ${detailed.internalFlags.join(', ')}`);
            }
          } catch (error) {
            Logger.warn('[ReviewExecution] OCR failed for attachment', encrypted.name, error);
            addLog(`OCR skipped for: ${encrypted.name}`);
          }
        }
      }

addLog('Fetching architecture principles and BIAN domain context...');
      const principles = await db.architecture_principles.where('status').equals('Active').toArray();
      let domain = session.serviceDomainId ? await db.service_domains.get(session.serviceDomainId) : undefined;

      const ctx: PromptContext = {
        session,
        domain,
        principles,
        scorecard,
        architectureText: diagramsText,
        historicalContext: [],
        eacTemplateMarkdown: eacTemplate?.markdownStructure || '',
      };

      const finalPrompt = await buildPrompt('NSI_EAC_GENERATION', ctx);

      addLog('Invoking Sovereign Engine — blitting GGUF to Wasm memory...');

      let isCriticalFound = false;
      await generateReview(finalPrompt, (text) => {
        accumulatedRef.current = text;
        setGeneratedReport(text);
        if (!isCriticalFound && (text.includes('CRITICAL OBSERVATION') || text.includes('CRITICAL RISK'))) {
          isCriticalFound = true;
          addLog('⚠️ CRITICAL OBSERVATION detected in generated content — routing to Human-in-the-Loop review.');
        }
      }, 'Primary EA Agent', { mitraProfileId: session?.assignedMitraProfileId ?? undefined });

      setGeneratedReport(accumulatedRef.current);
      setEditedReport(accumulatedRef.current);
      setDdqScorecardData(scorecard);

      const topVendorPct = scorecard[0]?.overallPercentage ?? 100;
      const shouldHITL = isCriticalFound || topVendorPct < 40;

      if (shouldHITL) {
        addLog(`Risk gate triggered: ${isCriticalFound ? 'CRITICAL OBSERVATION found' : ''} ${topVendorPct < 40 ? `Top vendor score ${topVendorPct.toFixed(1)}% < 40%` : ''}`);
        setWorkflowState('HITL_REVIEW');
        persistWorkflowState('HITL_REVIEW', { ddqScorecard: scorecard });
        addNotification('Critical Observations Detected — Architect Review Required', 'warning');
      } else {
        addLog('Report generated — low risk. Finalizing automatically.');
        const finalReport = accumulatedRef.current;
        await db.review_sessions.update(sessionId, {
          status: 'Completed',
          workflowState: 'COMPLETED',
          ddqScorecard: scorecard,
          reportMarkdown: finalReport
        });
        // Store review context via Moat pipeline
        const reviewVector = await vectoriser.projectToBitfield(finalReport);
        db.semantic_memory.add({
          subject: 'review_report',
          predicate: 'completed',
          object: `Session ${sessionId}`,
          context: finalReport.substring(0, 1000),
          vector: reviewVector.slice(),
          beliefState: 2,
          source: 'review_embedding',
          createdAt: new Date()
        }).catch(() => {});
        setWorkflowState('COMPLETED');
        addNotification('EAC Report Generated — No Critical Issues', 'success');
      }
    } catch (err: any) {
      addLog(`FATAL ERROR: ${err.message}`);
      Logger.error('EAC report generation failed', err);
      addNotification('EAC Report Generation Failed', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── HITL APPROVE & FINALIZE ────────────────────────────────────────────────
  const handleApproveAndFinalize = async () => {
    const finalReport = editedReport || generatedReport;
    setIsGenerating(true);
    try {
      await db.review_sessions.update(sessionId, {
        status: 'Completed',
        workflowState: 'COMPLETED',
        reportMarkdown: finalReport
      });
      // Store review context via Moat pipeline
      const reviewVector = await vectoriser.projectToBitfield(finalReport);
      db.semantic_memory.add({
        subject: 'review_report',
        predicate: 'approved',
        object: `Session ${sessionId}`,
        context: finalReport.substring(0, 1000),
        vector: reviewVector.slice(),
        beliefState: 2,
        source: 'review_embedding',
        createdAt: new Date()
      }).catch(() => {});
      setWorkflowState('COMPLETED');
      setGeneratedReport(finalReport);
      addLog('Report approved and finalized by architect.');
      addNotification('Report Approved and Finalized', 'success');
    } catch (err: any) {
      addLog(`Save failed: ${err.message}`);
      addNotification('Save Failed', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── EXPORT ─────────────────────────────────────────────────────────────────
  const handleExportPDF = () => {
    if (reportRef.current) {
      exportAsPDF(reportRef.current, { filename: `${session?.projectName ?? 'EAC_Report'}.pdf` });
    }
  };

  const handleExportMarkdown = () => {
    const content = editedReport || generatedReport;
    downloadAsMarkdown(content, `${session?.projectName ?? 'EAC_Report'}.md`);
  };

  // ─── RENDER HELPERS ─────────────────────────────────────────────────────────
  const renderConceptCard = () => (
    <div className="space-y-4">
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">NSI Concept Note</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            ['Project', session?.projectName],
            ['Review Type', session?.type],
            ['App Tier', session?.appTier],
            ['Hosting Model', session?.hostingModel],
            ['Data Classification', session?.dataClassification],
            ['Network Posture', session?.networkPosture],
          ].map(([label, value]) => (
            value ? (
              <div key={label}>
                <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{value}</p>
              </div>
            ) : null
          ))}
        </div>
        {session?.tags && session.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {session.tags.map((t) => (
              <span key={t} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs rounded-full font-medium">{t}</span>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={handleGenerateDDQ}
        disabled={isGenerating}
        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-semibold transition-colors shadow-sm"
      >
        {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <FileSpreadsheet size={20} />}
        {isGenerating ? 'Generating DDQ...' : 'Generate Custom Vendor DDQ'}
      </button>
    </div>
  );

  const renderDDQGeneratedStage = () => (
    <div className="space-y-6">
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <CheckCircle2 size={22} className="text-green-600 dark:text-green-400" />
          <h3 className="text-base font-bold text-green-900 dark:text-green-100">DDQ Ready for Distribution</h3>
        </div>
        <p className="text-sm text-green-800 dark:text-green-200 mb-4">
          The custom NSI Vendor Due Diligence Questionnaire has been generated. Send it to your shortlisted vendors for completion.
        </p>
        <button
          onClick={handleDownloadDDQ}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Download size={16} /> Download DDQ (.xlsx)
        </button>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
          <Upload size={16} /> Upload Completed Vendor DDQ(s)
        </h4>
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'}`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length) handleDDQDrop(e.dataTransfer.files);
          }}
        >
          <FileSpreadsheet size={36} className="mx-auto mb-3 text-slate-400" />
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-1">Drag & drop completed DDQ Excel files here</p>
          <p className="text-xs text-slate-400">Supports .xlsx — one or multiple vendor files</p>
          <input
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            id="ddq-upload"
            onChange={(e) => { if (e.target.files?.length) handleDDQDrop(e.target.files); }}
          />
          <label
            htmlFor="ddq-upload"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg cursor-pointer transition-colors"
          >
            {isParsing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {isParsing ? 'Parsing...' : 'Browse Files'}
          </label>
        </div>
      </div>
    </div>
  );

  const renderVendorScorecardTable = () => {
    if (!ddqScorecardData || ddqScorecardData.length === 0) return null;
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Rank</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Vendor</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">B</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">D</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">A</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">T</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">Weighted</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">Overall %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {ddqScorecardData.map((v: WeightedVendorResult, i: number) => (
              <tr key={v.name} className={`${i === 0 ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{v.name}{i === 0 && ' ★'}</td>
                <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{v.axes.B.weighted.toFixed(1)}</td>
                <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{v.axes.D.weighted.toFixed(1)}</td>
                <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{v.axes.A.weighted.toFixed(1)}</td>
                <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{v.axes.T.weighted.toFixed(1)}</td>
                <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">{v.totalWeightedScore.toFixed(2)}</td>
                <td className={`px-3 py-2 text-right font-bold ${v.overallPercentage < 40 ? 'text-red-600' : 'text-green-700 dark:text-green-400'}`}>
                  {v.overallPercentage.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderVendorUploadStage = () => (
    <div className="space-y-6">
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
          <FileSpreadsheet size={16} /> Parsed Vendor DDQ Summary
        </h3>
        {vendors.length > 0 ? (
          <div className="space-y-3">
            {vendors.map((v) => (
              <div key={v.name} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{v.name}</p>
                  <p className="text-xs text-slate-500">Score: {v.scorecard.totalScore}/{v.scorecard.maxPossibleScore}</p>
                </div>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${v.scorecard.percentageScore >= 70 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : v.scorecard.percentageScore >= 40 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>
                  {v.scorecard.percentageScore.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 italic">No vendors uploaded yet.</p>
        )}
      </div>

      {ddqScorecardData && ddqScorecardData.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
            <BadgeCheck size={16} className="text-blue-500" /> BDAT Weighted Scorecard (All Vendors)
          </h4>
          {renderVendorScorecardTable()}
        </div>
      )}

      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Architecture Diagram OCR</h4>
        <p className="text-xs text-slate-500">
          {session?.architectureBlobs && session.architectureBlobs.length > 0
            ? `${session.architectureBlobs.length} architecture diagram(s) ready for OCR`
            : 'No architecture diagrams attached to this session.'}
        </p>
      </div>

      <button
        onClick={handleGenerateEACReport}
        disabled={isGenerating || vendors.length === 0}
        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-semibold transition-colors shadow-sm"
      >
        {isGenerating ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
        {isGenerating ? 'Generating Report...' : 'Generate EAC Council Report'}
      </button>
    </div>
  );

  const renderHITLStage = () => (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl">
        <ShieldAlert size={22} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-bold text-amber-900 dark:text-amber-100">Critical Observations Detected — Architect Review Required</h3>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
            The AI has flagged critical architectural concerns or the leading vendor scored below the 40% BDAT threshold. Review and edit the report before final approval.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setIsEditing(!isEditing)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${isEditing ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'}`}
        >
          {isEditing ? <Eye size={14} /> : <Edit3 size={14} />}
          {isEditing ? 'Preview' : 'Edit Report'}
        </button>
      </div>

{isEditing ? (
      <div className="space-y-2">
        <div className="flex justify-end">
          <AIRewriteButton currentText={editedReport} onUpdate={setEditedReport} />
        </div>
        <textarea
          value={editedReport}
          onChange={(e) => setEditedReport(e.target.value)}
          aria-label="Edited Report Markdown"
          className="w-full h-96 p-4 text-sm font-mono bg-slate-900 text-green-400 rounded-xl border border-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        spellCheck={false}
      />
      </div>
    ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none bg-slate-50 dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-700 max-h-96 overflow-y-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{generatedReport}</ReactMarkdown>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleApproveAndFinalize}
          disabled={isGenerating}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold rounded-xl transition-colors shadow-sm"
        >
          {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          {isGenerating ? 'Finalizing...' : 'Approve & Finalize'}
        </button>
        <button
          onClick={() => setWorkflowState('VENDOR_UPLOADED')}
          className="flex items-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-xl transition-colors"
        >
          <ChevronRight size={18} /> Back
        </button>
      </div>
    </div>
  );

  const renderCompletedStage = () => (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BadgeCheck size={22} className="text-green-500" />
          <h3 className="text-base font-bold text-green-900 dark:text-green-100">EAC Council Report — Finalized</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
          >
            <Download size={14} /> PDF
          </button>
          <button
            onClick={handleExportMarkdown}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
          >
            <FileText size={14} /> Markdown
          </button>
        </div>
      </div>

      {ddqScorecardData && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2 border-b border-slate-200 dark:border-slate-700">
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">Final BDAT Scorecard</p>
          </div>
          {renderVendorScorecardTable()}
        </div>
      )}

      <div ref={reportRef} className="prose prose-sm dark:prose-invert max-w-none bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {DOMPurify.sanitize(editedReport || generatedReport)}
        </ReactMarkdown>
      </div>
    </div>
  );

  const renderExecutingOverlay = () => (
    <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10">
      <Loader2 size={40} className="animate-spin text-blue-500 mb-4" />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-4">Invoking Sovereign Engine — generating report...</p>
      <div className="w-full max-w-2xl bg-gray-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-5xl mx-auto pb-20">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={onClose}
          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          title="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">NSI EAC Review</h2>
          <p className="text-sm text-slate-500">{session?.projectName ?? 'Loading...'}</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
        {(['CONCEPT_RECEIVED', 'DDQ_GENERATED', 'VENDOR_UPLOADED', 'HITL_REVIEW', 'COMPLETED'] as NSIWorkflowState[]).map((step, i) => {
          const isActive = workflowState === step;
          const isPast = ['CONCEPT_RECEIVED', 'DDQ_GENERATED', 'VENDOR_UPLOADED', 'HITL_REVIEW', 'COMPLETED'].indexOf(workflowState) > i;
          const labels: Record<NSIWorkflowState, string> = {
            CONCEPT_RECEIVED: '1. Concept',
            DDQ_GENERATED: '2. DDQ',
            VENDOR_UPLOADED: '3. Vendors',
            HITL_REVIEW: '4. HITL Review',
            COMPLETED: '5. Complete',
          };
          return (
            <div key={step} className="flex items-center gap-2 flex-shrink-0">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${isActive ? 'bg-blue-600 text-white' : isPast ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                {isPast && !isActive ? <CheckCircle2 size={12} /> : <span>{i + 1}</span>}
                <span className="hidden sm:inline">{labels[step]}</span>
              </div>
              {i < 4 && <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 flex-shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Main Content Card */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden relative">
        {isGenerating && renderExecutingOverlay()}

        <div className="p-8">
          {workflowState === 'CONCEPT_RECEIVED' && renderConceptCard()}
          {workflowState === 'DDQ_GENERATED' && renderDDQGeneratedStage()}
          {workflowState === 'VENDOR_UPLOADED' && renderVendorUploadStage()}
          {workflowState === 'HITL_REVIEW' && renderHITLStage()}
          {workflowState === 'COMPLETED' && renderCompletedStage()}
        </div>
      </div>

      {/* Logs */}
      {logs.length > 0 && (
        <div className="mt-6 bg-slate-900 dark:bg-slate-950 rounded-xl p-4 font-mono text-xs text-green-400 max-h-40 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i} className="mb-1">{log}</div>
          ))}
        </div>
      )}
    </div>
  );
}
