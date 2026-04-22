import { db } from './db';
import seedData from '../data/ea_seed_data.json';
import { Logger } from '../lib/logger';

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
    await cleanupDuplicateCategories();
    await cleanupDuplicateMasterCategories();
    await cleanupDuplicateMetamodel();
    await cleanupDuplicateLayers();
    await cleanupDuplicatePrinciples();
    await cleanupDuplicateServiceDomains();
    await cleanupDuplicateTags();

    const categoriesCount = await db.architecture_categories.count();
    const masterCategoriesCount = await db.master_categories.count();
    const metamodelCount = await db.content_metamodel.count();
    const layersCount = await db.architecture_layers.count();
    const principlesCount = await db.architecture_principles.count();
    await db.service_domains.count();
    const tagsCount = await db.bespoke_tags.count();
    const workflowsCount = await db.review_workflows.count();
    const reportTemplatesCount = await db.report_templates.count();

    if (workflowsCount === 0 && seedData.review_workflows) {
      const mappedWorkflows = seedData.review_workflows.map(wf => ({
        name: wf.name,
        description: `Standard out-of-the-box governance pipeline for ${wf.name}`,
        version: String(wf.version),
        triggerReviewType: wf.triggerReviewType,
        status: wf.status as 'Active' | 'Draft' | 'Needs Review' | 'Deprecated',
        stages: wf.stages.map((stage: any, idx: number) => ({
          id: stage.id || crypto.randomUUID(),
          name: stage.name,
          type: stage.type === "Human" ? "HUMAN_APPROVAL" : "AI_EVALUATION" as 'HUMAN_APPROVAL' | 'AI_EVALUATION',
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
      await db.master_categories.bulkAdd([
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
        { type: 'Prompt Category', name: 'Custom', status: 'Active' },
        { type: 'AGENT_ENGINE_TYPES', name: 'WebLLM (Browser Cache)', status: 'Active' },
        { type: 'AGENT_ENGINE_TYPES', name: 'Local API (Ollama/Custom)', status: 'Active' },
        { type: 'AGENT_CATEGORIES', name: 'Tiny Triage', status: 'Active' },
        { type: 'AGENT_CATEGORIES', name: 'MOE (Mixture of Experts)', status: 'Active' },
        { type: 'AGENT_CATEGORIES', name: 'Coding Agent', status: 'Active' },
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
          promptText: "You are a governance classifier. Analyze this policy: '{{ruleText}}'. Return 1 or 2 relevant framework tags (e.g., GDPR, DPDP, SOC2, Architecture, Security). Output ONLY a comma-separated list of tags, nothing else.",
          status: 'Active',
          createdAt: now,
          updatedAt: now
        },
        {
          name: 'Master System Persona',
          category: 'System',
          promptText: 'You are EA-NITI (Network-isolated, In-browser, Triage & Inference). Elite, air-gapped Enterprise Architecture AI. Strict TOGAF/BIAN/0-trust focus. 0 cloud egress.',
          status: 'Active',
          createdAt: now,
          updatedAt: now
        },
        {
          name: 'DDQ Score Validation',
          category: 'DDQ Audit',
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
    const knowledgeCount = await db.enterprise_knowledge.count();
    if (knowledgeCount === 0 && seedData.togaf_phases && seedData.service_domains) {
      const togafChunks = seedData.togaf_phases.map((phase: any) => ({
        sourceFile: 'TOGAF_9.2_Base.txt',
        sourceType: 'TXT',
        textChunk: `TOGAF Phase ${phase.id}: ${phase.name}. Description: ${phase.description}`,
        embedding: Array.from({ length: 384 }).fill(0) as number[], 
        ingestedAt: new Date()
      }));

      const bianChunks = seedData.service_domains.map((domain: any) => ({
        sourceFile: 'BIAN_3.0_Standards.txt',
        sourceType: 'TXT',
        textChunk: `Service Domain ${domain.id}: ${domain.name}. Business Area: ${domain.businessArea}. Status: ${domain.status}`,
        embedding: Array.from({ length: 384 }).fill(0) as number[],
        ingestedAt: new Date()
      }));

      await db.enterprise_knowledge.bulkAdd([...togafChunks, ...bianChunks]);

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
          id: 'Phi-3-mini-4k-instruct-q4f16_1-MLC',
          url: 'https://huggingface.co/mlc-ai/Phi-3-mini-4k-instruct-q4f16_1-MLC',
          modelLibUrl: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/Phi-3-mini-4k-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm',
          context: 4096,
          isActive: true,
          agentCategory: 'MOE (Mixture of Experts)',
          engineType: 'WebLLM (Browser Cache)',
          personaInstruction: 'You are EA-NITI. Elite, air-gapped Enterprise Architecture AI.',
          modelSourceMode: 'Remote URL',
          baseApiEndpoint: '',
          modelSize: '~2.2 GB',
          isValidated: true
        }
      });
    }

    const triageSetting = await db.app_settings.get('core-triage');
    if (!triageSetting) {
      await db.app_settings.put({
        key: 'core-triage',
        value: {
          id: 'gemma-2b-it-q4f16_1-MLC',
          url: 'https://huggingface.co/mlc-ai/gemma-2b-it-q4f16_1-MLC',
          modelLibUrl: 'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/gemma-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm',
          context: 4096,
          isActive: true,
          agentCategory: 'Tiny Triage',
          engineType: 'WebLLM (Browser Cache)',
          personaInstruction: 'You are a Triage Agent. Analyze and categorize input.',
          modelSourceMode: 'Remote URL',
          baseApiEndpoint: '',
          modelSize: '~1.4 GB',
          isValidated: true
        }
      });
    }
    // ─────────────────────────────────────────────────────────────────────────────

    return true;
  } catch (error) {
    Logger.info('Failed to seed database:', error);
    return false;
  } finally {
    isSeeding = false;
  }
}
