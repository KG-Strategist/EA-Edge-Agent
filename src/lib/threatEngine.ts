/**
 * Threat Engine — STRIDE-based Threat Modeling
 *
 * Pure function module. No React dependencies.
 * Implements automated STRIDE analysis on Data Flow Diagram components,
 * generates DFD Mermaid diagrams, and builds delta-focused AI prompts.
 */

import { ArchitecturePrinciple } from './db';

// ─── Types ───────────────────────────────────────────────────

export type ComponentType = 'External Entity' | 'Process' | 'Data Store' | 'Data Flow' | 'Trust Boundary';
export type StrideCategoryKey = 'S' | 'T' | 'R' | 'I' | 'D' | 'E';
export type SeverityLevel = 'Critical' | 'High' | 'Medium' | 'Low';

export interface DataFlowComponent {
  id: string;
  name: string;
  type: ComponentType;
  description: string;
  connectsTo: string[]; // IDs of components this connects to
}

export interface StrideThreat {
  id: string;
  componentId: string;
  componentName: string;
  category: StrideCategoryKey;
  categoryName: string;
  description: string;
  severity: SeverityLevel;
  mitigation: string;
  isAiEnriched: boolean;
}

export interface ThreatModel {
  id?: number;
  sessionId?: number;       // Optional link to review session
  projectName: string;
  components: DataFlowComponent[];
  threats: StrideThreat[];
  mermaidDFD: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── STRIDE Category Definitions ─────────────────────────────

export const STRIDE_CATEGORIES: Record<StrideCategoryKey, { name: string; description: string; color: string }> = {
  S: { name: 'Spoofing',                 description: 'Impersonating something or someone else.',                          color: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20' },
  T: { name: 'Tampering',                description: 'Modifying data or code without authorization.',                     color: 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/20' },
  R: { name: 'Repudiation',              description: 'Claiming to have not performed an action.',                         color: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20' },
  I: { name: 'Information Disclosure',    description: 'Exposing information to unauthorized individuals.',                 color: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20' },
  D: { name: 'Denial of Service',         description: 'Denying or degrading service to valid users.',                      color: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-900/20' },
  E: { name: 'Elevation of Privilege',    description: 'Gaining capabilities without proper authorization.',                color: 'text-pink-600 bg-pink-50 dark:text-pink-400 dark:bg-pink-900/20' },
};

// ─── Component → STRIDE Threat Rules ─────────────────────────
// Defines which STRIDE categories apply to each component type.

const COMPONENT_THREAT_RULES: Record<ComponentType, { category: StrideCategoryKey; template: string; severity: SeverityLevel; mitigation: string }[]> = {
  'External Entity': [
    { category: 'S', severity: 'High',   template: 'An attacker could impersonate {name} to gain unauthorized access to the system.', mitigation: 'Implement strong authentication (MFA, OAuth 2.0, mutual TLS) for all external entity interactions.' },
    { category: 'R', severity: 'Medium', template: '{name} could deny having initiated a transaction or data submission.', mitigation: 'Implement comprehensive audit logging with tamper-proof timestamps for all external entity actions.' },
  ],
  'Process': [
    { category: 'S', severity: 'High',     template: 'An attacker could spoof the {name} process to intercept or redirect data flows.', mitigation: 'Use code signing, process isolation, and runtime integrity validation.' },
    { category: 'T', severity: 'Critical',  template: 'The {name} process logic could be tampered with to alter business outcomes.', mitigation: 'Implement integrity checks, secure CI/CD pipelines, and runtime application self-protection (RASP).' },
    { category: 'D', severity: 'High',      template: 'The {name} process could be overwhelmed by excessive requests causing service disruption.', mitigation: 'Implement rate limiting, circuit breakers, auto-scaling, and graceful degradation patterns.' },
    { category: 'E', severity: 'Critical',  template: 'A user could exploit {name} to escalate privileges beyond their authorized scope.', mitigation: 'Apply principle of least privilege, RBAC/ABAC controls, and input validation on all process entry points.' },
  ],
  'Data Store': [
    { category: 'T', severity: 'Critical', template: 'Data within {name} could be modified without authorization, compromising data integrity.', mitigation: 'Implement write access controls, database auditing, checksums, and backup verification.' },
    { category: 'I', severity: 'Critical', template: 'Sensitive data in {name} could be exposed through unauthorized access or misconfiguration.', mitigation: 'Encrypt data at rest (AES-256/TDE), enforce access controls, and implement data classification policies.' },
    { category: 'R', severity: 'Medium',   template: 'Changes to {name} could occur without attribution, making forensic analysis difficult.', mitigation: 'Enable database audit trails, change data capture (CDC), and immutable logging.' },
    { category: 'D', severity: 'High',     template: '{name} could become unavailable due to resource exhaustion or targeted attacks.', mitigation: 'Implement database replication, failover mechanisms, connection pooling, and query timeouts.' },
  ],
  'Data Flow': [
    { category: 'T', severity: 'High',     template: 'Data in transit via {name} could be intercepted and modified (man-in-the-middle).', mitigation: 'Enforce TLS 1.3 for all data flows, implement message signing, and use certificate pinning.' },
    { category: 'I', severity: 'High',     template: 'Data flowing through {name} could be eavesdropped upon, exposing sensitive information.', mitigation: 'Encrypt all data in transit, implement network segmentation, and use VPN/private endpoints.' },
    { category: 'D', severity: 'Medium',   template: '{name} could be disrupted through network flooding or bandwidth exhaustion.', mitigation: 'Implement traffic shaping, DDoS protection, and redundant network paths.' },
  ],
  'Trust Boundary': [
    { category: 'S', severity: 'High',     template: 'Components crossing the {name} boundary could be spoofed if authentication is weak.', mitigation: 'Enforce strong authentication and authorization at every trust boundary crossing point.' },
    { category: 'E', severity: 'Critical', template: 'Privilege escalation could occur at the {name} boundary if access controls are insufficient.', mitigation: 'Implement zero-trust architecture, micro-segmentation, and continuous verification at boundary crossings.' },
    { category: 'I', severity: 'High',     template: 'Information could leak across the {name} boundary due to misconfigured access policies.', mitigation: 'Apply strict data classification enforcement and DLP (Data Loss Prevention) controls at boundary crossings.' },
  ],
};

// ─── Core Analysis ───────────────────────────────────────────

let threatIdCounter = 0;

/**
 * Analyzes DFD components and auto-generates STRIDE threats
 * based on the component type rules engine.
 */
export function analyzeComponentsForThreats(components: DataFlowComponent[]): StrideThreat[] {
  threatIdCounter = 0;
  const threats: StrideThreat[] = [];

  for (const component of components) {
    const rules = COMPONENT_THREAT_RULES[component.type];
    if (!rules) continue;

    for (const rule of rules) {
      threatIdCounter++;
      threats.push({
        id: `STRIDE-${String(threatIdCounter).padStart(3, '0')}`,
        componentId: component.id,
        componentName: component.name,
        category: rule.category,
        categoryName: STRIDE_CATEGORIES[rule.category].name,
        description: rule.template.replace(/\{name\}/g, component.name),
        severity: rule.severity,
        mitigation: rule.mitigation,
        isAiEnriched: false,
      });
    }
  }

  return threats;
}

// ─── Mermaid DFD Generator ───────────────────────────────────

/**
 * Generates a Mermaid.js Data Flow Diagram from the component list.
 * Uses flowchart TD syntax with styled nodes by component type.
 */
export function buildMermaidDFD(components: DataFlowComponent[]): string {
  if (components.length === 0) return '';

  const lines: string[] = ['flowchart TD'];

  // Node declarations
  for (const c of components) {
    switch (c.type) {
      case 'External Entity':
        lines.push(`    ${c.id}[/"${c.name}"\\]`);
        break;
      case 'Process':
        lines.push(`    ${c.id}(("${c.name}"))`);
        break;
      case 'Data Store':
        lines.push(`    ${c.id}[("${c.name}")]`);
        break;
      case 'Data Flow':
        lines.push(`    ${c.id}["${c.name}"]`);
        break;
      case 'Trust Boundary':
        lines.push(`    subgraph ${c.id}["${c.name}"]`);
        break;
    }
  }

  // Close trust boundaries
  const boundaries = components.filter(c => c.type === 'Trust Boundary');
  boundaries.forEach(() => lines.push('    end'));

  // Connections
  for (const c of components) {
    for (const targetId of c.connectsTo) {
      const target = components.find(t => t.id === targetId);
      if (target) {
        lines.push(`    ${c.id} --> ${targetId}`);
      }
    }
  }

  // Styling
  lines.push('');
  lines.push('    classDef external fill:#fef3c7,stroke:#f59e0b,color:#92400e');
  lines.push('    classDef process fill:#dbeafe,stroke:#3b82f6,color:#1e40af');
  lines.push('    classDef datastore fill:#d1fae5,stroke:#10b981,color:#065f46');
  lines.push('    classDef dataflow fill:#f3e8ff,stroke:#8b5cf6,color:#5b21b6');

  const externalIds = components.filter(c => c.type === 'External Entity').map(c => c.id);
  const processIds = components.filter(c => c.type === 'Process').map(c => c.id);
  const datastoreIds = components.filter(c => c.type === 'Data Store').map(c => c.id);
  const dataflowIds = components.filter(c => c.type === 'Data Flow').map(c => c.id);

  if (externalIds.length) lines.push(`    class ${externalIds.join(',')} external`);
  if (processIds.length) lines.push(`    class ${processIds.join(',')} process`);
  if (datastoreIds.length) lines.push(`    class ${datastoreIds.join(',')} datastore`);
  if (dataflowIds.length) lines.push(`    class ${dataflowIds.join(',')} dataflow`);

  return lines.join('\n');
}

// ─── AI Prompt Builder (Delta-Focused) ───────────────────────

/**
 * Builds a prompt for the local LLM that focuses ONLY on gaps
 * not covered by the rule-based analyzeComponentsForThreats().
 * Cross-references components against active architecture principles.
 */
export function generateThreatModelPrompt(
  model: ThreatModel,
  principles: ArchitecturePrinciple[]
): string {
  const componentList = model.components.map(c =>
    `- [${c.type}] "${c.name}": ${c.description}${c.connectsTo.length > 0 ? ` (connects to: ${c.connectsTo.join(', ')})` : ''}`
  ).join('\n');

  const existingThreats = model.threats.map(t =>
    `- [${t.categoryName}] ${t.componentName}: ${t.description}`
  ).join('\n');

  const principleText = principles.map(p =>
    `- ${p.name}: ${p.statement} (Implications: ${p.implications})`
  ).join('\n');

  return `You are a Senior Security Architect performing a STRIDE-based threat model review.

IMPORTANT: The following threats have ALREADY been identified by our automated rules engine. DO NOT repeat them. Focus exclusively on:
1. **Gaps and blind spots** not covered by the automated analysis.
2. **Cross-cutting concerns** that span multiple components.
3. **Architecture principle violations** — cross-reference the components against the enterprise's active architecture principles below.
4. **Supply chain risks** or implicit trust assumptions.

== DATA FLOW COMPONENTS ==
${componentList}

== ALREADY IDENTIFIED THREATS (DO NOT REPEAT) ==
${existingThreats}

== ACTIVE ARCHITECTURE PRINCIPLES TO CROSS-REFERENCE ==
${principleText}

Please output additional threats in this exact Markdown format:

### Additional Threats

| ID | Component | STRIDE Category | Description | Severity | Recommended Mitigation |
|----|-----------|----------------|-------------|----------|----------------------|
| AT-001 | [component name] | [S/T/R/I/D/E] | [description] | [Critical/High/Medium/Low] | [mitigation] |

After the table, provide a brief **Architecture Principle Alignment Summary** noting which principles are adequately covered by the current design and which have gaps.

CRITICAL: Include a Mermaid.js threat diagram showing the highest-risk attack paths using the \`\`\`mermaid syntax.`;
}

/**
 * Generates a unique component ID based on type prefix.
 */
export function generateComponentId(type: ComponentType): string {
  const prefixes: Record<ComponentType, string> = {
    'External Entity': 'EE',
    'Process': 'P',
    'Data Store': 'DS',
    'Data Flow': 'DF',
    'Trust Boundary': 'TB',
  };
  return `${prefixes[type]}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Returns threat statistics grouped by STRIDE category.
 */
export function getThreatStats(threats: StrideThreat[]): Record<StrideCategoryKey, { count: number; critical: number; high: number }> {
  const stats: Record<StrideCategoryKey, { count: number; critical: number; high: number }> = {
    S: { count: 0, critical: 0, high: 0 },
    T: { count: 0, critical: 0, high: 0 },
    R: { count: 0, critical: 0, high: 0 },
    I: { count: 0, critical: 0, high: 0 },
    D: { count: 0, critical: 0, high: 0 },
    E: { count: 0, critical: 0, high: 0 },
  };

  for (const t of threats) {
    stats[t.category].count++;
    if (t.severity === 'Critical') stats[t.category].critical++;
    if (t.severity === 'High') stats[t.category].high++;
  }

  return stats;
}
