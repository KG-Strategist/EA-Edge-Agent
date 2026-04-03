import * as XLSX from 'xlsx';

export function generateDDQ(projectName: string, reviewType: string, tags: string[]) {
  // Create a new workbook
  const wb = XLSX.utils.book_new();

  // Sheet 1: Instructions
  const instructionsData = [
    ["EA Edge Agent - Due Diligence Questionnaire"],
    [""],
    ["Project Name:", projectName],
    ["Review Type:", reviewType],
    [""],
    ["Instructions:"],
    ["1. Please navigate to the 'BDAT Questionnaire' sheet."],
    ["2. Provide detailed answers for each architectural control/question."],
    ["3. Save this file and upload it back to the EA Edge Agent Intake Form."],
    [""],
    ["Note: This file is processed locally and securely within your browser."]
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionsData);
  wsInstructions['!cols'] = [{ wch: 20 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");

  // Sheet 2: BDAT Questionnaire
  const questionnaireData = [
    ["Category", "Question", "Vendor Response"]
  ];

  // Dynamic questions based on Review Type
  if (reviewType === 'New System Implementation (NSI)') {
    questionnaireData.push(["Architecture", "What are the vendor lock-in risks and mitigation strategies?", ""]);
    questionnaireData.push(["Cost / FinOps", "Provide a breakdown of FinOps and cost scaling as usage increases.", ""]);
    questionnaireData.push(["Data", "Describe the data residency and encryption at rest strategies.", ""]);
  } else if (reviewType === 'Enhancement Review (ER)') {
    questionnaireData.push(["Technical Debt", "What technical debt is introduced or resolved by this enhancement?", ""]);
    questionnaireData.push(["Integration", "Detail the regression testing strategy for existing integrations.", ""]);
  } else {
    // Threat Modeling or others
    questionnaireData.push(["Security", "Detail the STRIDE threat model mitigations for this architecture.", ""]);
    questionnaireData.push(["Access", "How is identity and access management (IAM) handled?", ""]);
  }

  // Dynamic questions based on Tags
  if (tags.some(t => t.includes('Tier 1'))) {
    questionnaireData.push(["Reliability (Tier 1)", "Detail the High Availability (HA) architecture and SLA guarantees.", ""]);
    questionnaireData.push(["Disaster Recovery", "What is the RTO (Recovery Time Objective) and RPO (Recovery Point Objective)?", ""]);
  }
  if (tags.some(t => t.includes('Cloud Native'))) {
    questionnaireData.push(["Cloud", "Detail the containerization and orchestration strategy (e.g., Kubernetes).", ""]);
  }

  const wsQuestionnaire = XLSX.utils.aoa_to_sheet(questionnaireData);
  wsQuestionnaire['!cols'] = [{ wch: 25 }, { wch: 70 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsQuestionnaire, "BDAT Questionnaire");

  // Generate filename and trigger download
  const safeProjectName = projectName ? projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'untitled';
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `DDQ_${safeProjectName}_${dateStr}.xlsx`;

  XLSX.writeFile(wb, fileName);
}
