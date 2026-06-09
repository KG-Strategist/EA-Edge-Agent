import * as XLSX from 'xlsx';
import DOMPurify from 'dompurify';
import { getFilteredQuestions, DDQMetadata, DDQQuestion, DDQScorecard, DDQScoreEntry, DDQ_QUESTION_BANK } from './ddqRules';

// Pre-built question ID → definition lookup — avoids rebuilding Map on every parseDDQResponse call
const QUESTION_MAP = new Map<string, DDQQuestion>();
DDQ_QUESTION_BANK.forEach((q: DDQQuestion) => QUESTION_MAP.set(q.id, q));

/**
 * Generates a Dynamic Due Diligence Questionnaire Excel file with dropdown validation.
 * Questions are filtered based on review metadata (tier, type, tags, etc.)
 */
export function generateDDQ(
  projectName: string,
  reviewType: string,
  tags: string[],
  appTier: string = '',
  hostingModel: string = ''
): Blob {
  const metadata: DDQMetadata = { reviewType, appTier, hostingModel, tags };
  const questions = getFilteredQuestions(metadata);

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Instructions ──
  const instructionsData = [
    ['EA Edge Agent — Due Diligence Questionnaire (DDQ)'],
    [''],
    ['Project Name:', projectName],
    ['Review Type:', reviewType],
    ['Application Tier:', appTier],
    ['Hosting Model:', hostingModel],
    ['Tags:', tags.join(', ')],
    ['Generated:', new Date().toISOString()],
    [''],
    ['Instructions:'],
    ['1. Navigate to the "DDQ Scorecard" sheet.'],
    ['2. For each question, select an answer from the dropdown in the "Vendor Response" column.'],
    ['3. DO NOT modify any other columns — scores are computed automatically on re-import.'],
    ['4. Save this file and upload it back to the EA Edge Agent Intake Form.'],
    [''],
    ['Note: This file is processed 100% locally within your browser. No data leaves your machine.']
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
  wsInstructions['!cols'] = [{ wch: 20 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

  // ── Sheet 2: DDQ Scorecard ──
  const header = ['Question ID', 'Design Principle', 'Question', 'Vendor Response', 'Max Score'];
  const rows: any[][] = [header];

  questions.forEach(q => {
    rows.push([
      q.id,
      q.principle,
      q.question,
      '', // Vendor fills this in via dropdown
      5   // Max score per question
    ]);
  });

  const wsScorecard = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  wsScorecard['!cols'] = [
    { wch: 12 }, // Question ID
    { wch: 28 }, // Design Principle
    { wch: 80 }, // Question
    { wch: 40 }, // Vendor Response
    { wch: 12 }, // Max Score
  ];

  // ── Apply Excel Data Validation (Dropdowns) on each response cell ──
  if (!wsScorecard['!dataValidations']) {
    wsScorecard['!dataValidations'] = [];
  }

  questions.forEach((q, idx) => {
    const rowNum = idx + 2; // 1-indexed, skipping header
    const optionTexts = q.options.map(o => o.text).join(',');

    // SheetJS data validation format
    (wsScorecard['!dataValidations'] as any[]).push({
      sqref: `D${rowNum}`,
      type: 'list',
      formula1: `"${optionTexts}"`,
      showDropDown: true,
      showErrorMessage: true,
      errorTitle: 'Invalid Response',
      error: 'Please select a valid option from the dropdown.',
    });
  });

  XLSX.utils.book_append_sheet(wb, wsScorecard, 'DDQ Scorecard');

  // ── Sheet 3: Options Reference ──
  // Hidden sheet that maps option strings to scores for human reference
  const refHeader = ['Question ID', 'Option Text', 'Score'];
  const refRows: any[][] = [refHeader];
  questions.forEach(q => {
    q.options.forEach(o => {
      refRows.push([q.id, o.text, o.score]);
    });
  });
  const wsRef = XLSX.utils.aoa_to_sheet(refRows);
  wsRef['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, wsRef, 'Score Reference');

  // ── Generate Blob ──
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  // Also trigger browser download for immediate use
  const safeProjectName = projectName ? projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'untitled';
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `DDQ_${safeProjectName}_${dateStr}.xlsx`;
  XLSX.writeFile(wb, fileName);

  return blob;
}

/**
 * Parses an uploaded DDQ Excel file and computes the automated scorecard.
 * Returns a structured DDQScorecard object ready for storage.
 */
export function parseDDQResponse(workbook: XLSX.WorkBook): DDQScorecard {
  // Try exact match first, then fall back to case-insensitive search
  let sheet = workbook.Sheets['DDQ Scorecard'];
  if (!sheet) {
    const sheetNames = Object.keys(workbook.Sheets);
    const scorecardSheet = sheetNames.find(name =>
      name.toLowerCase().includes('scorecard') ||
      name.toLowerCase().includes('ddq') ||
      name.toLowerCase().includes('response')
    );
    if (scorecardSheet) {
      sheet = workbook.Sheets[scorecardSheet];
    }
  }

  if (!sheet) {
    const availableSheets = Object.keys(workbook.Sheets).join(', ');
    throw new Error(
      `DDQ Scorecard sheet not found. Available sheets: ${availableSheets}. ` +
      `Please ensure your upload contains a "DDQ Scorecard" sheet with columns: Question ID, Design Principle, Question, Vendor Response, Max Score.`
    );
  }

  const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  // Skip header row
  const entries: DDQScoreEntry[] = [];
  const principleAccum: Record<string, { score: number; maxScore: number; count: number }> = {};

  // Use pre-built question map (module-level constant)

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length < 4) continue;

    const questionId = DOMPurify.sanitize(String(row[0] || '').trim());
    const principle = DOMPurify.sanitize(String(row[1] || '').trim());
    const question = DOMPurify.sanitize(String(row[2] || '').trim());
    const selectedOption = DOMPurify.sanitize(String(row[3] || '').trim());
    const maxScore = 5;

    // Look up the score based on the selected option text
    let score = 0;
    const qDef = QUESTION_MAP.get(questionId);
    if (qDef && selectedOption) {
      const match = qDef.options.find((o: any) => o.text === selectedOption);
      if (match) score = match.score;
    }

    entries.push({ questionId, principle, question, selectedOption, score, maxScore });

    // Accumulate by principle
    if (!principleAccum[principle]) {
      principleAccum[principle] = { score: 0, maxScore: 0, count: 0 };
    }
    principleAccum[principle].score += score;
    principleAccum[principle].maxScore += maxScore;
    principleAccum[principle].count += 1;
  }

  // Build principle-level summary
  const principleScores: DDQScorecard['principleScores'] = {};
  for (const [key, val] of Object.entries(principleAccum)) {
    principleScores[key] = {
      score: val.score,
      maxScore: val.maxScore,
      percentage: val.maxScore > 0 ? Math.round((val.score / val.maxScore) * 100) : 0,
      questionCount: val.count
    };
  }

  const totalScore = entries.reduce((sum, e) => sum + e.score, 0);
  const maxPossibleScore = entries.reduce((sum, e) => sum + e.maxScore, 0);

  return {
    totalScore,
    maxPossibleScore,
    percentageScore: maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 100) : 0,
    principleScores,
    entries,
    generatedAt: new Date().toISOString()
  };
}
