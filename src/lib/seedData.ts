import { db } from './db';
import seedData from '../data/ea_seed_data.json';
import { Logger } from '../lib/logger';
import { OPFSManager } from './storage/opfsManager';

async function cleanupDuplicateMasterCategories() {
  const allCategories = await db.master_categories.toArray();
  const nameTypeMap = new Map<string, number>();
  const duplicatesToRemove: number[] = [];

  for (const cat of allCategories) {
    const key = `${cat.type.toLowerCase()}_${cat.name.toLowerCase().trim()}`;
    if (nameTypeMap.has(key)) {
      duplicatesToRemove.push(cat.id!);
    } else {
      nameTypeMap.set(key, cat.id!);
    }
  }

  if (duplicatesToRemove.length > 0) {
    await db.master_categories.bulkDelete(duplicatesToRemove);
    Logger.info(`Cleaned up ${duplicatesToRemove.length} duplicate master categories.`);
  }
}

async function cleanupDuplicateCategories() {
  const allCategories = await db.architecture_categories.toArray();
  const nameMap = new Map<string, number>();
  const duplicatesToRemove: number[] = [];
  const idMapping = new Map<number, number>();

  for (const cat of allCategories) {
    const lowerName = cat.name.toLowerCase().trim();
    if (nameMap.has(lowerName)) {
      const keptId = nameMap.get(lowerName)!;
      duplicatesToRemove.push(cat.id!);
      idMapping.set(cat.id!, keptId);
    } else {
      nameMap.set(lowerName, cat.id!);
    }
  }

  if (duplicatesToRemove.length > 0) {
    const layers = await db.architecture_layers.toArray();
    for (const layer of layers) {
      if (layer.categoryId && idMapping.has(layer.categoryId)) {
        await db.architecture_layers.update(layer.id!, { categoryId: idMapping.get(layer.categoryId)! });
      }
    }
    for (const cat of allCategories) {
      if (cat.parentId && idMapping.has(cat.parentId)) {
        await db.architecture_categories.update(cat.id!, { parentId: idMapping.get(cat.parentId)! });
      }
    }
    await db.architecture_categories.bulkDelete(duplicatesToRemove);
    Logger.info(`Cleaned up ${duplicatesToRemove.length} duplicate categories.`);
  }
}

async function cleanupDuplicateMetamodel() {
  const all = await db.content_metamodel.toArray();
  const nameMap = new Map<string, number>();
  const duplicatesToRemove: number[] = [];

  for (const item of all) {
    const key = item.name.toLowerCase().trim();
    if (nameMap.has(key)) {
      duplicatesToRemove.push(item.id!);
    } else {
      nameMap.set(key, item.id!);
    }
  }

  if (duplicatesToRemove.length > 0) {
    await db.content_metamodel.bulkDelete(duplicatesToRemove);
    Logger.info(`Cleaned up ${duplicatesToRemove.length} duplicate metamodel entries.`);
  }
}

async function cleanupDuplicateLayers() {
  const all = await db.architecture_layers.toArray();
  const nameMap = new Map<string, number>();
  const duplicatesToRemove: number[] = [];
  const idMapping = new Map<number, number>();

  for (const item of all) {
    const key = item.name.toLowerCase().trim();
    if (nameMap.has(key)) {
      const keptId = nameMap.get(key)!;
      duplicatesToRemove.push(item.id!);
      idMapping.set(item.id!, keptId);
    } else {
      nameMap.set(key, item.id!);
    }
  }

  if (duplicatesToRemove.length > 0) {
    const principles = await db.architecture_principles.toArray();
    for (const p of principles) {
      if (idMapping.has(p.layerId)) {
        await db.architecture_principles.update(p.id!, { layerId: idMapping.get(p.layerId)! });
      }
    }
    await db.architecture_layers.bulkDelete(duplicatesToRemove);
    Logger.info(`Cleaned up ${duplicatesToRemove.length} duplicate layers.`);
  }
}

async function cleanupDuplicatePrinciples() {
  const all = await db.architecture_principles.toArray();
  const nameMap = new Map<string, number>();
  const duplicatesToRemove: number[] = [];

  for (const item of all) {
    const key = item.name.toLowerCase().trim();
    if (nameMap.has(key)) {
      duplicatesToRemove.push(item.id!);
    } else {
      nameMap.set(key, item.id!);
    }
  }

  if (duplicatesToRemove.length > 0) {
    await db.architecture_principles.bulkDelete(duplicatesToRemove);
    Logger.info(`Cleaned up ${duplicatesToRemove.length} duplicate principles.`);
  }
}

async function cleanupDuplicateServiceDomains() {
  const all = await db.service_domains.toArray();
  const nameMap = new Map<string, number>();
  const duplicatesToRemove: number[] = [];
  const idMapping = new Map<number, number>();

  for (const item of all) {
    const key = item.name.toLowerCase().trim();
    if (nameMap.has(key)) {
      const keptId = nameMap.get(key)!;
      duplicatesToRemove.push(item.id!);
      idMapping.set(item.id!, keptId);
    } else {
      nameMap.set(key, item.id!);
    }
  }

  if (duplicatesToRemove.length > 0) {
    const sessions = await db.review_sessions.toArray();
    for (const s of sessions) {
      if ((s as any).bianDomainId && idMapping.has((s as any).bianDomainId)) {
        await db.review_sessions.update(s.id!, { serviceDomainId: idMapping.get((s as any).bianDomainId)! });
      }
    }
    await db.service_domains.bulkDelete(duplicatesToRemove);
    Logger.info(`Cleaned up ${duplicatesToRemove.length} duplicate Service domains.`);
  }
}

async function cleanupDuplicateTags() {
  const all = await db.bespoke_tags.toArray();
  const nameMap = new Map<string, number>();
  const duplicatesToRemove: number[] = [];

  for (const item of all) {
    const key = `${item.category.toLowerCase()}_${item.name.toLowerCase().trim()}`;
    if (nameMap.has(key)) {
      duplicatesToRemove.push(item.id!);
    } else {
      nameMap.set(key, item.id!);
    }
  }

  if (duplicatesToRemove.length > 0) {
    await db.bespoke_tags.bulkDelete(duplicatesToRemove);
    Logger.info(`Cleaned up ${duplicatesToRemove.length} duplicate tags.`);
  }
}

let isSeeding = false;

export async function seedDatabase() {
  if (isSeeding) return true;
  isSeeding = true;
  try {
    // Evict stale GGUF models from previous quantizations (e.g. Q4_K_M → Q4_0)
    const [primaryCfg, triageCfg] = await Promise.all([
      db.app_settings.get('core-primary'),
      db.app_settings.get('core-triage'),
    ]);
    const primaryId = (primaryCfg?.value as any)?.id;
    const triageId = (triageCfg?.value as any)?.id;
    const activeIds = [primaryId, triageId].filter(Boolean) as string[];
    if (activeIds.length > 0) {
      await OPFSManager.evictStaleModels(activeIds);
    }

    const seedVersion = await db.app_settings.get('seedVersion');
    const isAlreadySeeded = seedVersion && seedVersion.value >= 5001;
    if (!isAlreadySeeded) {
      await cleanupDuplicateCategories();
      await cleanupDuplicateMasterCategories();
      await cleanupDuplicateMetamodel();
      await cleanupDuplicateLayers();
      await cleanupDuplicatePrinciples();
      await cleanupDuplicateServiceDomains();
      await cleanupDuplicateTags();
    }

    const categoriesCount = await db.architecture_categories.count();
    const masterCategoriesCount = await db.master_categories.count();
    const metamodelCount = await db.content_metamodel.count();
    const layersCount = await db.architecture_layers.count();
    const principlesCount = await db.architecture_principles.count();
    await db.service_domains.count();
    const tagsCount = await db.bespoke_tags.count();
    const workflowsCount = await db.review_workflows.count();
    const reportTemplatesCount = await db.report_templates.count();
    const memoryCount = await db.semantic_memory.count();

    if (memoryCount === 0 && (seedData as any).semantic_memory) {
      const mappedMemory = (seedData as any).semantic_memory.map((item: any) => ({
        text: item.Payload,
        embedding: [], // Ignored by StructuralVectoriser, but satisfies schema
        metadata: { intent: item.Intent, entity: item.Entity },
        createdAt: new Date()
      }));
      await db.semantic_memory.bulkAdd(mappedMemory);
    }

    if (workflowsCount === 0 && seedData.review_workflows) {
      const mappedWorkflows = seedData.review_workflows.map(wf => ({
        name: wf.name,
        description: `Standard out-of-the-box governance pipeline for ${wf.name}`,
        version: String(wf.version),
        triggerReviewType: wf.triggerReviewType,
        status: wf.status as 'Active' | 'Draft' | 'Needs Review' | 'Deprecated',
        domainTags: ['EA'],
        defaultMitraProfileId: 1,
        stages: wf.stages.map((stage: any, idx: number) => ({
          id: stage.id || crypto.randomUUID(),
          name: stage.name,
          type: stage.type === "Human" ? "HUMAN_APPROVAL" : "AI_EVALUATION" as 'HUMAN_APPROVAL' | 'AI_EVALUATION',
          mitraProfileId: null,
          orderIndex: idx,
          requiresManualSignoff: stage.type === "Human"
        }))
      }));
      await db.review_workflows.bulkAdd(mappedWorkflows);
    }

    if (reportTemplatesCount === 0 && seedData.report_templates) {
      await db.report_templates.bulkAdd(seedData.report_templates as any);
    }

    if (categoriesCount === 0) {
      await db.architecture_categories.bulkAdd([
        { name: 'Core BDAT', type: 'Layer Category', parentId: null },
        { name: 'Architectural (3-Tier)', type: 'Layer Category', parentId: null },
        { name: 'Strategic & GRC', type: 'Layer Category', parentId: null },
        { name: 'Data-Specific', type: 'Layer Category', parentId: null },
        { name: 'Infrastructure & Cloud', type: 'Layer Category', parentId: null },
      ]);
    }

if (masterCategoriesCount === 0) {
  await db.master_categories.bulkAdd((seedData as any).master_categories || [
        { type: 'Review Type', name: 'New System Implementation (NSI)', status: 'Active' },
        { type: 'Review Type', name: 'Enhancement Review (ER)', status: 'Active' },
        { type: 'Application Tier', name: 'Tier 1', status: 'Active' },
        { type: 'Application Tier', name: 'Tier 2', status: 'Active' },
        { type: 'Application Tier', name: 'Tier 3', status: 'Active' },
        { type: 'Hosting Model', name: 'Cloud Native', status: 'Active' },
        { type: 'Hosting Model', name: 'On-Premise', status: 'Active' },
        { type: 'Hosting Model', name: 'Hybrid', status: 'Active' },
        { type: 'ADM Phase', name: 'Preliminary', status: 'Active' },
        { type: 'ADM Phase', name: 'Phase A', status: 'Active' },
        { type: 'ADM Phase', name: 'Phase B: Business Architecture', status: 'Active' },
        { type: 'ADM Phase', name: 'Phase C: Information Systems', status: 'Active' },
        { type: 'ADM Phase', name: 'Phase D: Technology Architecture', status: 'Active' },
        { type: 'ADM Phase', name: 'Phases E-F', status: 'Active' },
        { type: 'Artifact Type', name: 'Catalog', status: 'Active' },
        { type: 'Artifact Type', name: 'Matrix', status: 'Active' },
        { type: 'Artifact Type', name: 'Diagram', status: 'Active' },
        { type: 'Tag Category', name: 'Tier', status: 'Active' },
        { type: 'Tag Category', name: 'Hosting', status: 'Active' },
        { type: 'Tag Category', name: 'Lifecycle', status: 'Active' },
        { type: 'Prompt Category', name: 'DDQ Audit', status: 'Active' },
        { type: 'Prompt Category', name: 'Anomaly Detection', status: 'Active' },
        { type: 'Prompt Category', name: 'ADR Generation', status: 'Active' },
        { type: 'Prompt Category', name: 'Threat Modeling', status: 'Active' },
        { type: 'Prompt Category', name: 'NSI', status: 'Active' },
        { type: 'Prompt Category', name: 'Custom', status: 'Active' },
        { type: 'AGENT_ENGINE_TYPES', name: 'Sovereign Engine (OPFS)', status: 'Active' },
        { type: 'AGENT_ENGINE_TYPES', name: 'Local API (Ollama/Custom)', status: 'Active' },
        { type: 'AGENT_CATEGORIES', name: 'Tiny Triage', status: 'Active' },
        { type: 'AGENT_CATEGORIES', name: 'MOE (Mixture of Experts)', status: 'Active' },
        { type: 'AGENT_CATEGORIES', name: 'Coding Agent', status: 'Active' },
        { type: 'mitra_domain', name: 'EA', status: 'Active' },
        { type: 'mitra_domain', name: 'Legal', status: 'Active' },
        { type: 'mitra_domain', name: 'Healthcare', status: 'Active' },
        { type: 'mitra_domain', name: 'SecOps', status: 'Active' },
        { type: 'mitra_domain', name: 'Finance', status: 'Active' },
      ]);
    }

    if (metamodelCount === 0) {
      await db.content_metamodel.bulkAdd([
        {
          name: "Application Interaction Matrix",
          admPhase: "Phase C: Information Systems",
          artifactType: "Matrix",
          description: "Maps application components to the business services they support.",
          ownerRole: "Lead Enterprise Architect",
          status: "Active"
        },
        {
          name: "Business Footprint Diagram",
          admPhase: "Phase B: Business Architecture",
          artifactType: "Diagram",
          description: "Visualizes the links between business goals, organizational units, and functions.",
          ownerRole: "Business Architect",
          status: "Active"
        },
        {
          name: "Technology Standards Catalog",
          admPhase: "Phase D: Technology Architecture",
          artifactType: "Catalog",
          description: "An agreed list of standard technologies for the enterprise.",
          ownerRole: "Technology Architect",
          status: "Active"
        }
      ]);
    }

    if (layersCount === 0) {

      const layers = [
        { name: 'Business', coreLayer: 'Core BDAT', contextLayer: 'Strategic', description: 'Defines business strategy, governance, and organizational structures.', abstractionLevels: 'Conceptual', status: 'Active' as const },
        { name: 'Data', coreLayer: 'Core BDAT', contextLayer: 'Information', description: 'Manages data assets, models, and governance across the enterprise.', abstractionLevels: 'Logical', status: 'Active' as const },
        { name: 'Application', coreLayer: 'Core BDAT', contextLayer: 'Solutions', description: 'Describes application components, interactions, and service mappings.', abstractionLevels: 'Logical', status: 'Active' as const },
        { name: 'Technology', coreLayer: 'Core BDAT', contextLayer: 'Infrastructure', description: 'Covers infrastructure, platforms, networks, and hosting environments.', abstractionLevels: 'Physical', status: 'Active' as const },
        { name: 'Presentation', coreLayer: 'Architectural (3-Tier)', contextLayer: 'User Experience', description: 'Front-end interfaces and user interaction patterns.', abstractionLevels: 'Physical', status: 'Active' as const },
        { name: 'Persistence', coreLayer: 'Architectural (3-Tier)', contextLayer: 'Data Storage', description: 'Database patterns, storage engines, and data persistence mechanisms.', abstractionLevels: 'Physical', status: 'Active' as const },
        { name: 'Service', coreLayer: 'Architectural (3-Tier)', contextLayer: 'Integration', description: 'Service-oriented patterns including APIs, middleware, and buses.', abstractionLevels: 'Logical', status: 'Active' as const },
        { name: 'Strategic', coreLayer: 'Strategic & GRC', contextLayer: 'Governance', description: 'Strategic alignment with enterprise goals, roadmaps, and investment planning.', abstractionLevels: 'Conceptual', status: 'Active' as const },
        { name: 'GRC', coreLayer: 'Strategic & GRC', contextLayer: 'Compliance', description: 'Governance, risk, and compliance frameworks and audit controls.', abstractionLevels: 'Conceptual', status: 'Active' as const },
        { name: 'Security', coreLayer: 'Strategic & GRC', contextLayer: 'InfoSec', description: 'Security architecture covering IAM, encryption, and threat modeling.', abstractionLevels: 'Logical', status: 'Active' as const },
        { name: 'Ingestion', coreLayer: 'Data-Specific', contextLayer: 'Data Pipeline', description: 'Data ingestion pipelines, ETL/ELT processes, and streaming.', abstractionLevels: 'Physical', status: 'Active' as const },
        { name: 'Data Processing', coreLayer: 'Data-Specific', contextLayer: 'Analytics', description: 'Data transformation, enrichment, and processing engines.', abstractionLevels: 'Logical', status: 'Active' as const },
        { name: 'Consumption', coreLayer: 'Data-Specific', contextLayer: 'Reporting', description: 'Data consumption via dashboards, reports, and analytical tools.', abstractionLevels: 'Physical', status: 'Active' as const },
        { name: 'Infrastructure Services', coreLayer: 'Infrastructure & Cloud', contextLayer: 'Platform', description: 'IaaS/PaaS services, compute, storage, and networking.', abstractionLevels: 'Physical', status: 'Active' as const },
        { name: 'Platform Services', coreLayer: 'Infrastructure & Cloud', contextLayer: 'Platform', description: 'Managed services, container orchestration, and serverless.', abstractionLevels: 'Physical', status: 'Active' as const },
      ];
      await db.architecture_layers.bulkAdd(layers);
    }

    if (principlesCount === 0) {
      // Fetch layers to get their IDs
      const layers = await db.architecture_layers.toArray();
      const getLayerId = (name: string) => layers.find(l => l.name === name)?.id || 1;

      await db.architecture_principles.bulkAdd([
        { 
          name: 'Maximize Enterprise Benefit', 
          statement: 'Information management decisions are made to provide maximum benefit to the enterprise as a whole.', 
          rationale: 'Sub-optimizing for a specific department hinders enterprise-wide agility.', 
          implications: 'Projects may be required to adopt enterprise standards over department preferences.', 
          layerId: getLayerId('Business'), 
          status: 'Active' 
        },
        { 
          name: 'Data is an Asset', 
          statement: 'Data is a corporate asset that has value to the enterprise and is managed accordingly.', 
          rationale: 'Accurate, timely data is critical to decision-making.', 
          implications: 'Data stewards must be assigned; strict data quality metrics must be enforced.', 
          layerId: getLayerId('Data'), 
          status: 'Active' 
        },
        { 
          name: 'Technology Independence', 
          statement: 'Applications are independent of specific technology choices and can operate on a variety of platforms.', 
          rationale: 'Prevents vendor lock-in and reduces migration costs.', 
          implications: 'Use of open standards and RESTful APIs is mandatory.', 
          layerId: getLayerId('Application'), 
          status: 'Active' 
        },
        { 
          name: 'Control Technical Diversity', 
          statement: 'Technological diversity is controlled to minimize the non-trivial cost of maintaining expertise across multiple environments.', 
          rationale: 'Reduces O&M costs and security surface area.', 
          implications: 'New technologies must go through a strict EA exception process.', 
          layerId: getLayerId('Technology'), 
          status: 'Active' 
        },
        { 
          name: 'Zero Trust Architecture', 
          statement: 'Never trust, always verify. No user or system is trusted by default, regardless of their location on the corporate network.', 
          rationale: 'Mitigates lateral movement of threats in case of a network breach.', 
          implications: 'Micro-segmentation, MFA, and continuous authentication must be implemented.', 
          layerId: getLayerId('Security'), 
          status: 'Active' 
        },
        { 
          name: 'Immutable Audit Trails', 
          statement: 'All data ingestion pipelines must maintain an immutable log of raw payloads before transformation.', 
          rationale: 'Essential for data lineage, debugging, and compliance auditing.', 
          implications: 'Increased storage footprint; requires append-only storage patterns like Kafka or S3.', 
          layerId: getLayerId('Ingestion'), 
          status: 'Active' 
        },
      ]);
    }

    if (tagsCount === 0) {
      await db.bespoke_tags.bulkAdd([
        { name: 'Tier 1', category: 'Tier', colorCode: 'bg-red-500/20 text-red-400', status: 'Active' },
        { name: 'Tier 2', category: 'Tier', colorCode: 'bg-orange-500/20 text-orange-400', status: 'Active' },
        { name: 'Tier 3', category: 'Tier', colorCode: 'bg-yellow-500/20 text-yellow-400', status: 'Active' },
        { name: 'Cloud Native', category: 'Hosting', colorCode: 'bg-blue-500/20 text-blue-400', status: 'Active' },
        { name: 'On-Premise', category: 'Hosting', colorCode: 'bg-gray-500/20 text-gray-400', status: 'Active' },
      ]);
    }

    const promptsCount = await db.prompt_templates.count();
    if (promptsCount === 0) {
      const now = new Date();
      await db.prompt_templates.bulkAdd([
        {
          name: 'System Auto-Tagging Classifier',
          category: 'System',
          type: 'system',
          promptText: "You are a governance classifier. Analyze this policy: '{{ruleText}}'. Return 1 or 2 relevant framework tags (e.g., GDPR, DPDP, SOC2, Architecture, Security). Output ONLY a comma-separated list of tags, nothing else.",
          status: 'Active',
          createdAt: now,
          updatedAt: now
        },
        {
          name: 'Master System Persona',
          category: 'System',
          type: 'system',
          promptText: 'You are EA-NITI (Edge Agent Network Inference & Triage). Elite, air-gapped Enterprise Architecture AI. Strict TOGAF/BIAN/0-trust focus. 0 cloud egress.',
          status: 'Active',
          createdAt: now,
          updatedAt: now
        },
        {
          name: 'EA_CHAT_GREETING',
          category: 'System',
          type: 'greeting',
          promptText: "Hello! I am **EA-NITI**, your enterprise-grade edge AI agent. I run completely air-gapped in your browser with Sovereign Engine (OPFS pipeline active).\n\nI can assist with any **SAMIKSHA** review process — Enhancement Reviews (ER), New System Implementation (NSI) — as well as DDQ audits, threat modeling, and all pre-configured workflows in your vault. How can I help?",
          status: 'Active',
          createdAt: now,
          updatedAt: now
        },
        {
          name: 'EA_GREETING',
          category: 'EA',
          type: 'greeting',
          promptText: "Hello! I am **EA-NITI** operating in Enterprise Architect mode. I specialize in TOGAF ADM, BIAN service domains, and architectural governance. How can I assist with your enterprise architecture today?",
          status: 'Active',
          createdAt: now,
          updatedAt: now
        },
        {
          name: 'LEGAL_GREETING',
          category: 'Legal',
          type: 'greeting',
          promptText: "Hello! I am **EA-NITI** operating in Legal Compliance mode. I specialize in DPDP, GDPR, data privacy regulations, and contractual compliance. How can I assist with your legal and regulatory review?",
          status: 'Active',
          createdAt: now,
          updatedAt: now
        },
        {
          name: 'SECOPS_GREETING',
          category: 'SecOps',
          type: 'greeting',
          promptText: "Hello! I am **EA-NITI** operating in Security Analyst mode. I specialize in STRIDE threat modeling, Zero-Trust Architecture, and security controls. How can I assist with your security assessment?",
          status: 'Active',
          createdAt: now,
          updatedAt: now
        },
        {
          name: 'DDQ Score Validation',
          category: 'DDQ Audit',
          type: 'system',
          promptText: `You are an Enterprise Architecture auditor for a Tier-1 financial institution. A vendor has self-assessed their architecture using a Due Diligence Questionnaire (DDQ).

Vendor's Self-Assessment Summary:
{{scorecardSummary}}

Architecture Documentation (extracted via OCR):
{{documentText}}

Instructions:
1. For each design principle where the vendor scored 5 ("Fully implemented"), critically verify whether the uploaded architecture documentation actually supports that claim.
2. Flag any discrepancies where the vendor over-scored themselves.
3. Highlight any design principles that are completely missing from the documentation.
4. Output your findings as a structured JSON array with fields: principle, vendorScore, auditedScore, finding.`,
          status: 'Active',
          createdAt: now,
          updatedAt: now
        },
        {
          name: 'Migration Loophole Detection',
          category: 'Anomaly Detection',
          type: 'system',
          promptText: `You are an Enterprise Architecture governance engine. A delivery team has submitted a review classified as "{{reviewType}}".

Project Metadata:
- Project Name: {{projectName}}
- Current Hosting: {{hostingModel}}
- Application Tier: {{appTier}}
- Tags: {{tags}}

Architecture Description:
{{documentText}}

Instructions:
Analyze whether this submission is correctly classified. If the project involves ANY of the following, it MUST be classified as "New System Implementation (NSI)" regardless of what the team selected:
- Changing the core technology stack
- Altering the disaster recovery profile
- Shifting deployment models (e.g., IaaS to SaaS, On-Premise to Cloud)
- Replacing the primary database engine
- Introducing a new vendor for a mission-critical component

Respond with:
1. CLASSIFICATION_VALID: true/false
2. REASON: Brief explanation
3. RECOMMENDED_ACTION: What the ARB should do`,
          status: 'Active',
          createdAt: now,
          updatedAt: now
        },
        {
          name: 'ADR Generator',
          category: 'ADR Generation',
          type: 'system',
          promptText: `You are an Architecture Decision Record (ADR) author. Generate a formal ADR based on the following review session data.

Project: {{projectName}}
Review Type: {{reviewType}}
Status: {{status}}
BIAN Domain: {{bianDomain}}
Tags: {{tags}}
DDQ Score: {{overallScore}}%

Key Findings:
{{findings}}

Generate an ADR in the standard format:
# ADR-{{adrNumber}}: [Decision Title]
## Status: [Proposed/Accepted/Deprecated]
## Context: [Why this decision was needed]
## Decision: [What was decided]
## Consequences: [Positive and negative impacts]
## Compliance Notes: [Regulatory alignment]`,
          status: 'Active',
          createdAt: now,
          updatedAt: now
        },
        {
          name: 'STRIDE Threat Model',
          category: 'Threat Modeling',
          type: 'system',
          promptText: `You are a security architect performing a STRIDE threat analysis. Analyze the following architecture for potential threats.

Architecture Documentation:
{{documentText}}

Network Posture: {{networkPosture}}
Data Classification: {{dataClassification}}
Hosting Model: {{hostingModel}}

For each STRIDE category, identify:
1. **Spoofing**: Authentication weaknesses
2. **Tampering**: Data integrity risks
3. **Repudiation**: Audit trail gaps
4. **Information Disclosure**: Data leakage risks
5. **Denial of Service**: Availability threats
6. **Elevation of Privilege**: Authorization flaws

Output as a structured threat matrix with severity (Critical/High/Medium/Low) and recommended mitigations.`,
          status: 'Active',
          createdAt: now,
          updatedAt: now
        },
        {
          name: 'NSI_EAC_GENERATION',
          category: 'NSI',
          type: 'system',
          executionTarget: 'Primary EA Agent',
          promptText: `You are an Enterprise Architecture Council (EAC) Review Agent.
Your task is to produce a formal NSI EAC Council Report for a New System Implementation vendor selection, using the structure and data provided below.

## REPORT STRUCTURE
Follow this template EXACTLY. The BDAT Vendor Scorecard has been pre-formatted for you — do NOT reformat it. Fill in all other placeholders with rich, specific narrative content.

{{report_structure}}

## CONTEXT
- Review Type: {{reviewType}}
- Service Domain: {{service_domain}}
- Concept Metadata:
{{concept_metadata}}

## APPLICABLE ARCHITECTURE PRINCIPLES
{{architectural_principles}}

## HISTORICAL CONTEXT
{{historical_context}}

## ARCHITECTURE REFERENCE
{{architecture_reference}}

## VENDOR SCORECARD DATA
The following vendors submitted DDQs. The BDAT scorecard below is pre-computed — do NOT regenerate it or alter any scores.

{{bdat_table}}

## INSTRUCTIONS
1. Replace every {{placeholder}} EXCEPT {{bdat_table}} and {{report_structure}} (already filled) with rich, specific narrative content.
2. In the {{executive_summary}}, synthesise the overall assessment, leading vendor recommendation, and key risk posture in 3-5 sentences.
3. In the {{architectural_analysis}}, evaluate the top vendor's architecture against the applicable principles and domain standards. Highlight alignment and gaps.
4. In the {{risk_assessment}}, call out specific, named risks (data sovereignty violations, SPOF, encryption gaps at rest, public internet exposure, absence of DR/BCP, etc.). Prefix each CRITICAL risk with **CRITICAL OBSERVATION:** so it can be programmatically detected by the host application.
5. In the {{eac_recommendations}}, recommend the highest-scoring BDAT vendor unless a critical risk makes them unsuitable. Provide specific conditions if recommending "Approve with Conditions."
6. Keep the BDAT scorecard table exactly as provided — do not modify vendor names, scores, or percentages.

CRITICAL GATE: If any vendor scores below 40% overall, OR if the architecture presents any critical risks (data sovereignty violations, single points of failure, unencrypted data at rest, public internet exposure, absence of DR/BCP), you MUST include the exact phrase "CRITICAL OBSERVATION" in the Risk Assessment section.`,
          status: 'Active',
          createdAt: now,
          updatedAt: now
        },
{
    name: 'NSI_DDQ_GENERATION',
    category: 'NSI',
    type: 'system',
    executionTarget: 'Primary EA Agent',
    promptText: `You are a Due Diligence Questionnaire (DDQ) Generator for Enterprise Architecture reviews.
Based on the concept metadata below, generate a comprehensive NSI Vendor DDQ scope document.

## CONCEPT METADATA
{{concept_metadata}}

## INSTRUCTIONS
1. Review the concept metadata and identify all applicable BDAT design principles relevant to this NSI.
2. For each applicable principle, generate 3-5 probing questions that expose gaps in vendor capabilities.
3. Highlight any questions where a "Partially Implemented" or "Not Implemented" response represents a CRITICAL RISK for a Tier-1 financial institution.
4. Output a structured DDQ scope summary in Markdown format.
5. Flag any high-risk areas (e.g., data sovereignty, single-vendor lock-in, absence of DR/BCP) that require additional scrutiny.`,
    status: 'Active',
    createdAt: now,
    updatedAt: now
},
{
    name: 'FIELD_AUTO_REWRITE',
    category: 'Custom',
    type: 'system',
    executionTarget: 'Primary EA Agent',
    promptText: `You are an Enterprise Architecture technical writer. Rewrite and professionally enhance the following text. Fix any grammatical errors, improve the technical tone, and output ONLY the enhanced text without any conversational filler, introductory remarks, or markdown code blocks:

{{architecture_reference}}`,
    status: 'Active',
    createdAt: now,
    updatedAt: now
},
      ]);
    }

    // Privacy Guardrails baseline (DPDP/GDPR non-deletable defaults)
    const guardrailsCount = await db.privacy_guardrails.count();
    if (guardrailsCount === 0) {
      await db.privacy_guardrails.bulkAdd([
        {
          title: 'Strict PII Anonymization',
          ruleText: 'Never output names, emails, or exact IP addresses in architecture reviews.',
          isDefault: true,
          isActive: true
        },
        {
          title: 'Data Localization (DPDP)',
          ruleText: 'Assume all enterprise data must remain within the geographic boundaries of the host organization.',
          isDefault: true,
          isActive: true
        },
        {
          title: 'GDPR Data Minimization',
          ruleText: 'Ensure that only data strictly necessary for the specified purpose is collected and processed.',
          isDefault: true,
          isActive: true
        },
        {
          title: 'CCPA Right to Opt-Out',
          ruleText: 'Architectures must explicitly support mechanisms for users to opt-out of data sale or sharing.',
          isDefault: true,
          isActive: true
        }
      ]);
    }

    // Seed initial TOGAF and Service data into Knowledge Management if empty
    const knowledgeCount = await db.semantic_memory.where('source').startsWith('togaf').count();
    if (knowledgeCount === 0 && seedData.togaf_phases && seedData.service_domains) {
      const { vectoriser } = await import('./SemanticArena');
      const togafChunks: any[] = [];
      for (const phase of seedData.togaf_phases) {
        const text = `TOGAF Phase ${phase.id}: ${phase.name}. Description: ${phase.description}`;
        const vector = await vectoriser.projectToBitfield(text);
        togafChunks.push({
          subject: `TOGAF Phase ${phase.id}`,
          predicate: 'defines',
          object: phase.name,
          context: text,
          vector: vector.slice(),
          beliefState: 2,
          source: 'togaf_seed',
          createdAt: new Date()
        });
      }

      const bianChunks: any[] = [];
      for (const domain of seedData.service_domains) {
        const text = `Service Domain ${domain.id}: ${domain.name}. Business Area: ${domain.businessArea}. Status: ${domain.status}`;
        const vector = await vectoriser.projectToBitfield(text);
        bianChunks.push({
          subject: `BIAN Domain ${domain.id}`,
          predicate: 'defines',
          object: domain.name,
          context: text,
          vector: vector.slice(),
          beliefState: 2,
          source: 'bian_seed',
          createdAt: new Date()
        });
      }

      await db.semantic_memory.bulkAdd([...togafChunks, ...bianChunks]);

      // Seed dummy training jobs so they show as "Completed" in the UI
      await db.training_jobs.bulkAdd([
        {
          filename: 'TOGAF_9.2_Base.txt',
          status: 'Completed',
          logs: ['Extracted TOGAF metadata directly from seed data.', 'Semantic chunking and embedding generation successful.', 'Indexing complete.'],
          startedAt: new Date(),
          completedAt: new Date()
        },
        {
          filename: 'BIAN_3.0_Standards.txt',
          status: 'Completed',
          logs: ['Extracted BIAN standards and functional patterns directly from seed data.', 'Semantic chunking and embedding generation successful.', 'Indexing complete.'],
          startedAt: new Date(),
          completedAt: new Date()
        }
      ]);
    }

    // ── Core Agent Configs: seed only if not already present ────────────────────
    const primarySetting = await db.app_settings.get('core-primary');
    if (!primarySetting) {
      await db.app_settings.put({
        key: 'core-primary',
        value: {
          id: 'gemma-4-e2b-it-q4_0',
          url: 'https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_0.gguf',
          context: 4096,
          isActive: true,
          agentCategory: 'MOE (Mixture of Experts)',
          engineType: 'Sovereign Engine (OPFS)',
          personaInstruction: 'You are EA-NITI. Elite, air-gapped Enterprise Architecture AI.',
          modelSourceMode: 'Remote URL',
          baseApiEndpoint: '',
          modelSize: '~1.3 GB',
          isValidated: true
        }
      });
    }

    const triageSetting = await db.app_settings.get('core-triage');
    if (!triageSetting) {
      await db.app_settings.put({
        key: 'core-triage',
        value: {
          id: 'tinyllama-1.1b-chat-v1.0-q4_0',
          url: 'https://huggingface.co/bartowski/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/TinyLlama-1.1B-Chat-v1.0-Q4_0.gguf',
          context: 2048,
          isActive: true,
          agentCategory: 'Tiny Triage',
          engineType: 'Sovereign Engine (OPFS)',
          personaInstruction: 'You are a Triage Agent. Analyze and categorize input.',
          modelSourceMode: 'Remote URL',
          baseApiEndpoint: '',
          modelSize: '~700 MB',
          isValidated: true
        }
      });
    }
// ─── Genesis Seeder: Semantic Memory from JSON Corpus ───────────────────────
const CURRENT_CORPUS_VERSION = 5001; // FORCE RE-SEED

async function seedSemanticMemory() {
  // Baseline corpus is loaded directly into RAM via SemanticArena.loadCompiledBinary()
  // No Dexie insertion needed. Guardrails managed exclusively via UI.
  const settings = await db.app_settings.get('seedVersion');
  if (!settings || settings.value < CURRENT_CORPUS_VERSION) {
    await db.app_settings.put({ key: 'seedVersion', value: CURRENT_CORPUS_VERSION });
  }
}

await seedSemanticMemory();

// ── Input Safety Config: maxPromptChars ──────────────────────────────────────
const maxPromptCharsSetting = await db.app_settings.get('maxPromptChars');
if (!maxPromptCharsSetting) {
  await db.app_settings.put({ key: 'maxPromptChars', value: 8000 });
}

// ── Phase 1.3.1: Sovereign Engine OPFS Config ────────────────────────────────

const opfsQuotaSetting = await db.app_settings.get('opfsStorageQuotaMB');
if (!opfsQuotaSetting) {
  await db.app_settings.put({ key: 'opfsStorageQuotaMB', value: 4096 });
}

const sovereignModelUrlSetting = await db.app_settings.get('sovereignModelUrl');
if (!sovereignModelUrlSetting) {
  await db.app_settings.put({
    key: 'sovereignModelUrl',
    value: 'https://huggingface.co/bartowski/Phi-3-mini-4k-instruct-GGUF/resolve/main/Phi-3-mini-4k-instruct-Q4_0.gguf'
  });
}

// ── Phase 1.5: Local Daemon WebSocket URL ──────────────────────────────
const daemonWsUrlSetting = await db.app_settings.get('daemonWsUrl');
if (!daemonWsUrlSetting) {
  await db.app_settings.put({ key: 'daemonWsUrl', value: 'ws://127.0.0.1:8080' });
}

// ── Phase 1.6: RAG Budget Weights & MoE Threshold ───────────────────────────
const ragWeightEpistemic = await db.app_settings.get('ragWeightEpistemic');
if (!ragWeightEpistemic) {
  await db.app_settings.put({ key: 'ragWeightEpistemic', value: 0.5 });
}

const ragWeightVector = await db.app_settings.get('ragWeightVector');
if (!ragWeightVector) {
  await db.app_settings.put({ key: 'ragWeightVector', value: 0.3 });
}

const ragWeightEnterprise = await db.app_settings.get('ragWeightEnterprise');
if (!ragWeightEnterprise) {
  await db.app_settings.put({ key: 'ragWeightEnterprise', value: 0.2 });
}

const moEThreshold = await db.app_settings.get('moEThreshold');
if (!moEThreshold) {
  await db.app_settings.put({ key: 'moEThreshold', value: 0.18 });
}

// ── Phase 1.8: Background Distillation Mode ──────────────────────────────────
const backgroundDistillation = await db.app_settings.get('backgroundDistillation');
if (!backgroundDistillation) {
  await db.app_settings.put({ key: 'backgroundDistillation', value: 'auto' });
}

// ── Phase 1.10: MITRA Logical Swarm — Default Persona Profiles ────────────────
const mitraCount = await db.mitra_profiles.count();
if (mitraCount === 0) {
  await db.mitra_profiles.bulkAdd([
    {
      name: 'Enterprise Architect',
      systemPrompt: 'You are EA-NITI, an elite Enterprise Architecture council member. Focus on TOGAF ADM phases, BIAN service domains, and architectural governance principles. Provide structured, framework-aligned responses.',
      domain: 'EA',
      ragTags: ['TOGAF', 'BIAN'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      name: 'Security Analyst',
      systemPrompt: 'You are a security architect specializing in STRIDE threat modeling and Zero-Trust Architecture. Analyze all inputs through the lens of threat vectors, attack surfaces, and security controls. Reference STRIDE categories explicitly.',
      domain: 'SecOps',
      ragTags: ['STRIDE', 'Zero-Trust'],
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      name: 'Legal Compliance',
      systemPrompt: 'You are a legal compliance officer specializing in DPDP (Digital Personal Data Protection) and GDPR regulations. Evaluate all architecture decisions for data privacy compliance, data localization requirements, and user consent obligations.',
      domain: 'Legal',
      ragTags: ['DPDP', 'GDPR'],
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]);
}

return true;
  } catch (error) {
    Logger.info('Failed to seed database:', error);
    return false;
  } finally {
    isSeeding = false;
  }
}
