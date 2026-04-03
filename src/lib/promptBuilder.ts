import { ArchitecturePrinciple, BianDomain } from './db';

export function buildPrompt(
  reviewType: string,
  domain: BianDomain | undefined,
  principles: ArchitecturePrinciple[],
  ocrText: string,
  historicalContext: string[]
): string {
  const principlesText = principles.map(p => `- ${p.name}:\n  Statement: ${p.statement}\n  Rationale: ${p.rationale}\n  Implications: ${p.implications}`).join('\n\n');
  const historyText = historicalContext.length > 0 
    ? historicalContext.map((c, i) => `[Historical Chunk ${i+1}]: ${c}`).join('\n\n')
    : 'No historical context available.';
  
  return `You are an Enterprise Architecture Review Agent.
Your task is to review the provided architecture diagram text and context, and generate a comprehensive Architectural Decision Record (ADR) and Review Report.

Context:
- Review Type: ${reviewType}
- BIAN Domain: ${domain ? `${domain.name} - ${domain.description}` : 'None'}

Applicable Architecture Principles:
${principlesText}

Historical Context: Ensure this new architecture does not conflict with these past decisions:
${historyText}

Extracted Text from Architecture Diagram (OCR):
"""
${ocrText}
"""

Please generate a structured Markdown report including:
1. Executive Summary
2. Alignment with BIAN Domain
3. Adherence to Architecture Principles
4. Identified Risks & Mitigation Strategies
5. Final Recommendation (Approve, Approve with Conditions, Reject)

CRITICAL: You MUST include a Mermaid.js diagram block visualizing the reviewed architecture. Use the \`\`\`mermaid ... \`\`\` syntax.
`;
}
