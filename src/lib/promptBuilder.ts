import { db, ArchitecturePrinciple, ServiceDomain } from './db';
import { WeightedVendorResult } from './scorecardEngine';

export interface PromptContext {
  session?: {
    projectName?: string;
    type?: string;
    tags?: string[];
    appTier?: string;
    hostingModel?: string;
    dataClassification?: string;
    networkPosture?: string;
    serviceDomainId?: number | null;
  };
  domain?: ServiceDomain;
  principles?: ArchitecturePrinciple[];
  scorecard?: WeightedVendorResult[];
  architectureText?: string;
  historicalContext?: string[];
  eacTemplateMarkdown?: string;
}

function buildBDATVendorTable(vendors: WeightedVendorResult[]): string {
  if (!vendors || vendors.length === 0) {
    return '_No vendor scorecard data available._';
  }

  const rows = vendors.map((v, i) => {
    const rank = i === 0 ? '★' : `${i + 1}`;
    const risk = v.overallPercentage < 40 ? '⚠️ FAILED' : '✅ PASS';
    return `| ${rank} | **${v.name}** | ${v.axes.B.weighted.toFixed(1)} | ${v.axes.D.weighted.toFixed(1)} | ${v.axes.A.weighted.toFixed(1)} | ${v.axes.T.weighted.toFixed(1)} | **${v.totalWeightedScore.toFixed(2)}** | ${v.overallPercentage.toFixed(1)}% | ${risk} |`;
  }).join('\n');

  return `| Rank | Vendor | B (Bus) | D (Data) | A (App) | T (Tech) | Weighted Score | Overall % | Status |\n|---|---|---|---|---|---|---|---|---|\n${rows}

**Scoring Legend:** B = Business Value | D = Data Governance | A = Application Architecture | T = Technology Infrastructure
**Weight Distribution (NSI):** D & T are weighted most heavily (35% each); B & A are weighted at 15% each.

**Top Vendor:** ${vendors[0].name} — Overall BDAT Score: ${vendors[0].overallPercentage.toFixed(1)}%${vendors[0].overallPercentage < 40 ? '\n\n:warning: **ALERT:** Top vendor scored below 40%. Human-in-the-Loop review is MANDATORY before finalisation.' : ''}`;
}

function buildConceptMetadata(ctx: PromptContext): string {
  const s = ctx.session;
  if (!s) return 'No concept metadata available.';
  return [
    s.projectName ? `**Project Name:** ${s.projectName}` : null,
    s.type ? `**Review Type:** ${s.type}` : null,
    s.appTier ? `**Application Tier:** ${s.appTier}` : null,
    s.hostingModel ? `**Hosting Model:** ${s.hostingModel}` : null,
    s.dataClassification ? `**Data Classification:** ${s.dataClassification}` : null,
    s.networkPosture ? `**Network Posture:** ${s.networkPosture}` : null,
    s.tags && s.tags.length > 0 ? `**Tags:** ${s.tags.join(', ')}` : null,
  ].filter(Boolean).join('\n');
}

function buildPrinciplesText(principles: ArchitecturePrinciple[]): string {
  if (!principles || principles.length === 0) return '_No architecture principles configured._';
  return principles.map(p =>
    `- **${p.name}**\n  Statement: ${p.statement}\n  Rationale: ${p.rationale}\n  Implications: ${p.implications}`
  ).join('\n\n');
}

function buildHistoricalContext(historicalContext: string[]): string {
  if (!historicalContext || historicalContext.length === 0) {
    return 'No prior review history available for this system or domain.';
  }
  return historicalContext.map((c, i) => `[Historical Context ${i + 1}]: ${c}`).join('\n\n');
}

function replaceTags(template: string, ctx: PromptContext): string {
  const s = ctx.session || {};
  return template
    .replace(/\{\{projectName\}\}/g, s.projectName || 'Unknown')
    .replace(/\{\{reviewType\}\}/g, s.type || 'New System Implementation (NSI)')
    .replace(/\{\{appTier\}\}/g, s.appTier || 'Not specified')
    .replace(/\{\{hostingModel\}\}/g, s.hostingModel || 'Not specified')
    .replace(/\{\{tags\}\}/g, (s.tags || []).join(', ') || 'None')
    .replace(/\{\{dataClassification\}\}/g, s.dataClassification || 'Not specified')
    .replace(/\{\{networkPosture\}\}/g, s.networkPosture || 'Not specified')
    .replace(/\{\{concept_metadata\}\}/g, buildConceptMetadata(ctx))
    .replace(/\{\{bdat_table\}\}/g, ctx.scorecard ? buildBDATVendorTable(ctx.scorecard) : '_No vendor scorecard._')
    .replace(/\{\{report_structure\}\}/g, ctx.eacTemplateMarkdown || '')
    .replace(/\{\{architectural_principles\}\}/g, ctx.principles ? buildPrinciplesText(ctx.principles) : '_No principles._')
    .replace(/\{\{principles_text\}\}/g, ctx.principles ? buildPrinciplesText(ctx.principles) : '_No principles._')
    .replace(/\{\{architecture_reference\}\}/g, ctx.architectureText || 'No architecture diagrams attached to this session.')
    .replace(/\{\{historical_context\}\}/g, buildHistoricalContext(ctx.historicalContext || []))
    .replace(/\{\{service_domain\}\}/g, ctx.domain ? `${ctx.domain.name} — ${ctx.domain.description}` : 'Not classified');
}

export async function buildPrompt(promptKey: string, ctx: PromptContext): Promise<string> {
  const template = await db.prompt_templates.where('name').equals(promptKey).first();
  if (!template) {
    throw new Error(`[promptBuilder] Prompt template '${promptKey}' not found in prompt_templates table. Hint: ensure it has been seeded via seedData.ts or ea_seed_data.json.`);
  }
  return replaceTags(template.promptText, ctx);
}