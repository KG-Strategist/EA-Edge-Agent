import Dexie, { Table } from 'dexie';
import { MASTER_CATEGORY_TYPES } from './constants';
import type { DeepParsedQuery } from './StructuralVectoriser';

export interface MasterCategory {
  id?: number;
  type: keyof typeof MASTER_CATEGORY_TYPES | string;
  name: string;
  description?: string;
  status: 'Draft' | 'Active' | 'Needs Review' | 'Deprecated';
}

export interface ArchitectureCategory {
  id?: number;
  name: string;
  type?: string;
  parentId?: number | null;
}

export interface ContentMetamodel {
  id?: number;
  name: string;
  admPhase: string;
  artifactType: string;
  description: string;
  ownerRole: string;
  status: 'Draft' | 'Active' | 'Needs Review' | 'Deprecated';
}

export interface ArchitectureLayer {
  id?: number;
  name: string;
  coreLayer: string;
  contextLayer: string;
  description: string;
  abstractionLevels: string;
  categoryId?: number; // Kept for backward compatibility during migration
  category?: string; // Kept for backward compatibility during migration
  status: 'Draft' | 'Active' | 'Needs Review' | 'Deprecated';
}

export interface ArchitecturePrinciple {
  id?: number;
  name: string;
  statement: string;
  rationale: string;
  implications: string;
  layerId: number;
  status: 'Draft' | 'Active' | 'Needs Review' | 'Deprecated';
}

export interface ServiceDomain {
  id?: number;
  name: string;
  businessArea: string;
  businessDomain: string;
  controlRecord: string;
  functionalPattern: string;
  description: string;
  frameworkTag: string;
  status: 'Draft' | 'Active' | 'Needs Review' | 'Deprecated';
}

export type BianDomain = ServiceDomain;

export interface BespokeTag {
  id?: number;
  name: string;
  category: string;
  colorCode: string;
  status: 'Draft' | 'Active' | 'Needs Review' | 'Deprecated';
}

export interface ArchitectureBlob {
  name: string;
  type: string;
  blob: Blob;
}

export interface ReportTemplate {
  id?: number;
  name: string;
  category: string;
  markdownStructure: string;
  version?: string;
  status: 'Draft' | 'Active' | 'Needs Review' | 'Deprecated';
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewWorkflow {
  id?: number;
  name: string; // e.g., NSI Process, ER Process
  description: string;
  version?: string;
  triggerReviewType: string; // The Review Type that automatically invokes this workflow
  domainTags: string[]; // Domain contexts (from master_categories type 'mitra_domain')
  defaultMitraProfileId: number | null; // Default persona for stages without override
  stages: {
    id: string; // UUID or string id
    name: string; // e.g., 'ABR', 'AIA', 'Final Selection'
    type: 'AI_EVALUATION' | 'HUMAN_APPROVAL';
    linkedPromptTemplateId?: number; // For AI Stages
    linkedReportTemplateId?: number; // For rendering
    mitraProfileId: number | null; // Per-stage persona override (null = use workflow default)
    orderIndex: number;
    requiresManualSignoff: boolean;
  }[];
  status: 'Draft' | 'Active' | 'Needs Review' | 'Deprecated';
}

export interface ReviewSession {
  id?: number;
  projectName: string;
  type: string;
  serviceDomainId: number | null;
  tags: string[];
  appTier?: string;
  hostingModel?: string;
  dataClassification?: string;
  networkPosture?: string;
  businessJustification?: string;

  // State Machine Pointers
  status: 'Draft' | 'Pending' | 'In Progress' | 'Completed' | 'Rejected';
  workflowState?: NSIWorkflowState; // 5-stage NSI state machine
  workflowId?: number; // Maps to ReviewWorkflow
  currentStageIndex?: number; // Pointer to current step in workflow.stages

  // MITRA Swarm Context (Phase 1.10)
  domainContext: string; // Resolved domain from workflow's domainTags
  assignedMitraProfileId: number | null; // Resolved persona from workflow's defaultMitraProfileId

  // Storage
  ddqBlobs?: ArchitectureBlob[]; // Multiple vendor DDQs
  architectureBlobs?: ArchitectureBlob[];
  ddqScorecard?: any; // Aggregate scorecards mapping array
  reportMarkdown?: string;
  humanThoughts?: string;
  reportTemplateId?: number;
  eacReportTemplateId?: number; // Points to the NSI EAC Council Report template

  // Final Board Overrides
  humanOverrides?: {
    winningVendorOverride?: string;
    justification?: string;
    overrideTimestamp?: string;
    overriddenBy?: string;
  };

  createdAt: Date;
}

export type NSIWorkflowState =
  | 'CONCEPT_RECEIVED'
  | 'DDQ_GENERATED'
  | 'VENDOR_UPLOADED'
  | 'HITL_REVIEW'
  | 'COMPLETED';

/** @remarks RESERVED FOR PHASE 4.x: Human-In-The-Loop (HITL) Quarantine Zone. Prevents unverified review vectors from corrupting the core Semantic Arena. */
export interface ReviewEmbedding {
  id?: number;
  sessionId: number;
  text: string;
  embedding: number[];
}

export interface ThreatModelRecord {
  id?: number;
  sessionId?: number;
  projectName: string;
  components?: any[];
  threats?: any[];
  mermaidDFD?: string;
  encryptedData?: string; // Holds encrypted JSON of components, threats, and mermaidDFD
  componentCount?: number;
  threatCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

/** @remarks RESERVED FOR PHASE 4.x: Staging ground for Autonomous Curiosity and front-end training before local Wasm compilation into an OPFS-backed .bin.gz corpus. */
export interface EnterpriseEmbedding {
  id?: number;
  sourceFile: string;
  sourceType: string;
  textChunk: string;
  embedding: number[];
  ingestedAt: Date;
}

export interface TrainingJob {
  id?: number;
  filename: string;
  status: 'Pending' | 'Processing' | 'Completed' | 'Failed' | 'PURGED';
  logs: string[]; // Progress and error logs
  startedAt: Date;
  completedAt?: Date;
  purgedAt?: Date;
}

export interface AppSetting {
  key: string;
  value: any;
}

export interface LocalUser {
  id?: number;
  pseudokey: string; // Tokenized non-PII username
  passwordHash: string;
  pinHash: string;
  salt: string;
  tempPasswordHash?: string;
  requiresPinSetup?: boolean;
  isActive?: boolean;
  providerId?: string; // For Hybrid mode SSO linkage
  authMode: 'Air-Gapped' | 'Hybrid';
  createdAt: Date;
  securityQuestions?: {
    questionId: string;
    answerHash: string;
  }[];
  // DPDP/GDPR Data Management
  demographics?: {
    regionToken: string; // Tokenized region (e.g., EU, APAC)
    roleToken: string; // Tokenized role
  };
  consentHistory?: {
    type: 'TELEMETRY' | 'OFFLINE_LIMITS' | 'MULTI_UAM' | 'PAM_PIM' | 'HYBRID_LIMITED' | 'EXTERNAL_IDENTITY' | 'HYBRID_NETWORK' | 'AIRGAP_STRICT';
    grantedAt: Date;
    version: string;
    revokedAt?: Date;
  }[];
}

export interface AuditLog {
  id?: number;
  timestamp: Date;
  pseudokey: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'WEBLLM_CACHE_CONSENT' | 'SYSTEM_BACKUP_CONFIGURED' | 'SYSTEM_BACKUP_REVOKED' | 'SYSTEM_BACKUP_PERMISSION_RESTORED' | 'SYSTEM_BACKUP_PERMISSION_RESTORE_FAILED' | 'SYSTEM_BACKUP_PERMISSION_ERROR' | 'SYSTEM_BACKUP_SYNC';
  tableName: string;
  recordId?: string | number;
  details?: string;
}

export interface DashboardState {
  id?: number;
  name: string;
  isDefault: boolean;
  layoutConfig: any; // Array of widget configurations
  createdAt: Date;
  updatedAt: Date;
}

export interface AIModelRecord {
  id?: number;
  name: string; // e.g., 'EA-NITI Core' or 'Llama-3-BYOM'
  type: 'PRIMARY' | 'SECONDARY' | 'BYOM_NETWORK';
  modelUrl: string; // Points to SovereignEngine config root or BYOM endpoint URL
  wasmUrl?: string; // Optional custom WASM binder
  isLocalhost: boolean; // Resolves against window.location.origin
  isActive: boolean;
  allowDistillation?: boolean; // For Secondary models
  encryptedApiKey?: string; // AES-GCM encrypted API key for BYOM network models
  contextWindow?: number;
  engineType?: 'Localhost API' | 'Air-Gapped Network' | 'Cloud VPC (Internet Required)' | 'Air-Gapped Sideload';
  contextSource?: 'Global Corpus' | 'SAMIKSHA' | 'Threat Models';
}

export interface NetworkIntegration {
  id?: number;
  providerType: 'WebSearchAPI' | 'CloudLLMAPI' | 'CustomEnterprise';
  displayName: string;
  endpointUrl: string;
  encryptedApiKey?: string; // NEW: AES-GCM encrypted API key (hex format)
  isDefault: boolean;
  status: 'active' | 'inactive';
  createdAt: Date;
  modelName?: string;
}

export interface GlobalSetting {
  id: string; // e.g. 'SSO_CONFIG'
  connection_mode: 'HYBRID' | 'AIR_GAPPED' | null;
  local_enterprise_sso?: {
    providerName: string;
    authUrl: string;
    clientId: string;
    tokenUrl?: string;
  };
  local_ldap?: {
    ldapUrl: string;
    baseDn: string;
  };
  encryptedSsoConfig?: string; // AES-GCM encrypted JSON of local_enterprise_sso
  encryptedLdapConfig?: string; // AES-GCM encrypted JSON of local_ldap
  authType?: 'S2FA' | 'SSO' | 'LDAP' | 'OAUTH';
  public_sso_enabled: boolean;
}

export interface PromptTemplate {
  id?: number;
  name: string;
  category: string;
  type?: 'greeting' | 'system' | 'stage';
  executionTarget?: 'Primary EA Agent' | 'Tiny Triage Agent' | 'Auto-Route (MoE)';
  promptText: string;
  version?: string;
  status: 'Draft' | 'Active' | 'Needs Review' | 'Deprecated';
  createdAt: Date;
  updatedAt: Date;
}

export interface PrivacyGuardrail {
  id?: number;
  title: string;
  ruleText: string;
  isDefault: boolean;
  isActive: boolean;
  isArchived?: boolean;
  frameworkTags?: string[];
  enforcementScope?: string[];
}

export interface CustomAgent {
  id?: number;
  name: string;
  isActive: boolean;
  agentCategory: string;
  engineType: string;
  personaInstruction: string;
  modelSourceMode: 'Remote URL' | 'Offline Sideloaded';
  modelId: string;
  modelUrl: string;
  baseApiEndpoint: string;
  context: number;
  status: 'Active' | 'Inactive' | 'PURGED' | 'Deprecated';
  createdAt: Date;
  updatedAt: Date;
}

export interface DistillationTask {
  id?: number;
  query: string;
  contextContext?: string;
  status: 'pending' | 'resolved';
  createdAt: number;
  resolvedAt?: number;
}

export interface ChatThread {
  id?: number;
  title: string;
  updatedAt: number;
}

export interface ChatMessage {
  id?: number;
  threadId: number;
  role: 'user' | 'assistant' | 'system';
  content?: string; // Legacy plaintext — cleared after migration
  encryptedContent?: string; // AES-256-GCM encrypted message body
  inferenceEngine: 'sovereign' | 'neuro-symbolic' | 'pending';
  timestamp: number;
}

export interface SemanticMemory {
  id?: number;
  subject: string;
  predicate: string;
  object: string;
  context: string;
  vector: Uint32Array;
  beliefState: number;
  source?: string;
  createdAt: Date;
  orthogonal_components?: DeepParsedQuery;
}

export interface LocalTelemetry {
  id?: number;
  timestamp: Date;
  routingScore: number;
  engineUsed: string;
  executionTimeMs: number;
  distillationTriggered: boolean;
}

export interface MitraProfile {
  id?: number;
  name: string;
  systemPrompt: string;
  domain: string;
  ragTags: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface VaultSession {
  id?: number;
  pseudokey: string;
  wrappedDEK: string;
  iv: string;
  salt: string;
  wrappingKey: CryptoKey;
  createdAt: Date;
}

export class EADatabase extends Dexie {
  architecture_categories!: Table<ArchitectureCategory>;
  master_categories!: Table<MasterCategory>;
  content_metamodel!: Table<ContentMetamodel>;
  architecture_layers!: Table<ArchitectureLayer>;
  architecture_principles!: Table<ArchitecturePrinciple>;
  service_domains!: Table<ServiceDomain>;
  bespoke_tags!: Table<BespokeTag>;
  review_sessions!: Table<ReviewSession>;
  review_embeddings!: Table<ReviewEmbedding>;
  app_settings!: Table<AppSetting>;
  network_integrations!: Table<NetworkIntegration>;
  prompt_templates!: Table<PromptTemplate>;
  review_workflows!: Table<ReviewWorkflow>;
  report_templates!: Table<ReportTemplate>;
  threat_models!: Table<ThreatModelRecord>;
  enterprise_knowledge!: Table<EnterpriseEmbedding>;
  training_jobs!: Table<TrainingJob>;
  users!: Table<LocalUser>;
  audit_logs!: Table<AuditLog>;
  dashboard_states!: Table<DashboardState>;
  model_registry!: Table<AIModelRecord>;
  global_settings!: Table<GlobalSetting>;
  privacy_guardrails!: Table<PrivacyGuardrail>;
  custom_agents!: Table<CustomAgent>;
  chat_threads!: Table<ChatThread>;
  chat_messages!: Table<ChatMessage>;
  semantic_memory!: Table<SemanticMemory>;
  local_telemetry_vault!: Table<LocalTelemetry>;
  distillation_queue!: Table<DistillationTask>;
  mitra_profiles!: Table<MitraProfile>;
  vault_sessions!: Table<VaultSession>;

  constructor() {
    super('EADatabase');
    this.version(1).stores({
      togaf_principles: '++id, name, layer, status',
      bian_domains: '++id, name, status',
      bespoke_tags: '++id, name, category',
    });
    this.version(2).stores({
      togaf_principles: '++id, name, layer, status',
      bian_domains: '++id, name, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, status',
    });
    this.version(3).stores({
      togaf_principles: '++id, name, layer, status',
      bian_domains: '++id, name, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, status',
      review_embeddings: '++id, sessionId'
    });
    this.version(4).stores({
      architecture_layers: '++id, name, category',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, status',
      review_embeddings: '++id, sessionId'
    });
    this.version(5).stores({
      architecture_categories: '++id, name, parentId',
      architecture_layers: '++id, name, categoryId',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, status',
      review_embeddings: '++id, sessionId'
    });
    this.version(8).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name',
      content_metamodel: '++id, name, admPhase, artifactType',
      architecture_layers: '++id, name, categoryId',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, status',
      review_embeddings: '++id, sessionId'
    });
    this.version(9).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name',
      content_metamodel: '++id, name, admPhase, artifactType',
      architecture_layers: '++id, name, categoryId',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, status',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault'
    });
    this.version(10).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, categoryId',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, status',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault'
    }).upgrade(tx => {
      return tx.table('content_metamodel').toCollection().modify(item => {
        if (!item.status) item.status = 'Active';
      });
    });
    this.version(11).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, categoryId',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, status',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault'
    }).upgrade(tx => {
      // Clear out the old flat BIAN domains, so the new hook will seed the rich ones
      return tx.table('bian_domains').clear();
    });
    this.version(12).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, status',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault'
    }).upgrade(tx => {
      // Ensure existing records have default strings to prevent UI crashes over undefined constraints
      return tx.table('architecture_layers').toCollection().modify(layer => {
        if (!layer.coreLayer) layer.coreLayer = layer.category || 'Unknown';
        if (!layer.contextLayer) layer.contextLayer = '';
        if (!layer.description) layer.description = '';
        if (!layer.abstractionLevels) layer.abstractionLevels = '';
      });
    });
    this.version(13).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, type, status',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, isActive'
    });
    this.version(14).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, type, status',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, isActive, executionTarget'
    });
    this.version(15).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, type, status, workflowId', // workflow pointer
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, isActive, executionTarget',
      review_workflows: '++id, name, triggerReviewType, isActive',
      report_templates: '++id, name, category, isActive'
    }).upgrade(tx => {
      // Clear out outdated Drafts that break array-blob expectations
      return tx.table('review_sessions').toCollection().modify((session: any) => {
          if (!session.ddqBlobs && session.vendorDdqBlob) {
             session.ddqBlobs = [{ name: 'Legacy_DDQ.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', blob: session.vendorDdqBlob }];
          } else if (!session.ddqBlobs) {
             session.ddqBlobs = [];
          }
          delete session.vendorDdqBlob;
      });
    });
    this.version(16).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, isActive, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, isActive, version',
      report_templates: '++id, name, category, isActive, version'
    }).upgrade(async tx => {
      await tx.table('prompt_templates').toCollection().modify(item => { if (!item.version) item.version = '1.0.0'; });
      await tx.table('review_workflows').toCollection().modify(item => { if (!item.version) item.version = '1.0.0'; });
      await tx.table('report_templates').toCollection().modify(item => { if (!item.version) item.version = '1.0.0'; });
    });
    // v17: Add threat_models table — purely additive, no data migration needed
    this.version(17).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, isActive, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, isActive, version',
      report_templates: '++id, name, category, isActive, version',
      threat_models: '++id, projectName, sessionId, createdAt'
    });
    // v18: Enterprise RAG "Training" Knowledge base & jobs
    this.version(18).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, isActive, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, isActive, version',
      report_templates: '++id, name, category, isActive, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt'
    });
    // v19: Global unified status migration
    this.version(19).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt'
    }).upgrade(async tx => {
      // 1. Migrate Master Categories
      await tx.table('master_categories').toCollection().modify((item: any) => {
        if (item.status === undefined) item.status = item.isActive ? 'Active' : 'Deprecated';
        delete item.isActive;
      });
      // 2. Migrate Architecture Layers (Soft-delete via [ARCHIVED] -> Deprecated)
      await tx.table('architecture_layers').toCollection().modify((item: any) => {
        if (item.status === undefined) {
          if (item.description && item.description.startsWith('[ARCHIVED]')) {
            item.description = item.description.replace('[ARCHIVED] ', '').replace('[ARCHIVED]', '');
            item.status = 'Deprecated';
          } else {
            item.status = 'Active';
          }
        }
      });
      // 3. Migrate Bespoke Tags (Soft-delete via [ARCHIVED] -> Deprecated)
      await tx.table('bespoke_tags').toCollection().modify((item: any) => {
        if (item.status === undefined) {
          if (item.name.startsWith('[ARCHIVED]')) {
            item.name = item.name.replace('[ARCHIVED] ', '').replace('[ARCHIVED]', '');
            item.status = 'Deprecated';
          } else {
            item.status = 'Active';
          }
        }
      });
      // 4. Migrate Prompts, Workflows, Templates
      const upg = async (tableName: string) => {
        await tx.table(tableName).toCollection().modify((item: any) => {
          if (item.status === undefined) item.status = item.isActive ? 'Active' : 'Deprecated';
          delete item.isActive;
        });
      };
      await upg('prompt_templates');
      await upg('review_workflows');
      await upg('report_templates');
    });
    // v20: Phase 9 - Zero-PII Auth, Audit Engine, & Dashboards
    this.version(20).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault'
    });
    // v21: DPDP Local Auth Hybrid properties
    this.version(21).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault'
    });
    // v22: Dual-Engine BYOM Model Registry
    this.version(22).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive'
    }).upgrade(async tx => {
      // Seed default Core + Tiny models on upgrade
      if ((await tx.table('model_registry').count()) === 0) {
        await tx.table('model_registry').bulkAdd([
          {
            name: 'EA-NITI Core (Gemma-4-E2B-it-Q4_0)',
            type: 'PRIMARY',
            modelUrl: 'https://huggingface.co/bartowski/google_gemma-4-E2B-it-GGUF/resolve/main/google_gemma-4-E2B-it-Q4_0.gguf',
            isLocalhost: false,
            isActive: true,
            contextWindow: 4096,
            engineType: 'Air-Gapped Sideload'
          },
          {
            name: 'EA-NITI-Alt (SmolLM2-1.7B-Instruct-Q4_0)',
            type: 'SECONDARY',
            modelUrl: 'https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_0.gguf',
            isLocalhost: false,
            isActive: true,
            allowDistillation: true,
            contextWindow: 2048,
            engineType: 'Air-Gapped Sideload'
          }
        ]);
      }
    });
    // v23: DPDP Global Settings
    this.version(23).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id'
    });
    // v24: Privacy Guardrails — DPDP/GDPR contextual compliance rules
    this.version(24).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive'
    }).upgrade(async tx => {
      if ((await tx.table('privacy_guardrails').count()) === 0) {
        await tx.table('privacy_guardrails').bulkAdd([
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
          }
        ]);
      }
    });

    // v25: Custom Agent Registry (Buddy Personas)
    this.version(25).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive',
      custom_agents: '++id, name, agentCategory, status'
    });
    // v26: Chat History Rolling Cache (FIFO)
    this.version(26).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive',
      custom_agents: '++id, name, agentCategory, status',
      chat_threads: '++id, threadId, updatedAt',
      chat_messages: '++id, threadId, timestamp, role'
    });
    // v27: Semantic Memory for Distillation Target
    this.version(27).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive',
      custom_agents: '++id, name, agentCategory, status',
      chat_threads: '++id, threadId, updatedAt',
      chat_messages: '++id, threadId, timestamp, role',
      semantic_memory: '++id, createdAt'
    });
    // v28: Local Telemetry Vault
    this.version(28).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      bian_domains: '++id, name, businessArea, businessDomain, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive',
      custom_agents: '++id, name, agentCategory, status',
      chat_threads: '++id, threadId, updatedAt',
      chat_messages: '++id, threadId, timestamp, role',
      semantic_memory: '++id, createdAt, source',
      local_telemetry_vault: '++id, timestamp'
    });

    // v29: Strategic Pivot - Rename BIAN Domains to Service Domains & add frameworkTag
    this.version(29).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      service_domains: '++id, name, businessArea, businessDomain, frameworkTag, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive',
      custom_agents: '++id, name, agentCategory, status',
      chat_threads: '++id, threadId, updatedAt',
      chat_messages: '++id, threadId, timestamp, role',
      semantic_memory: '++id, createdAt, source',
      local_telemetry_vault: '++id, timestamp'
    }).upgrade(async tx => {
      // 1. Migrate data from bian_domains to service_domains
      const oldData = await tx.table('bian_domains').toArray();
      const migratedData = oldData.map(item => ({
        ...item,
        frameworkTag: 'BIAN'
      }));
      await tx.table('service_domains').bulkAdd(migratedData);
      // Note: bian_domains table will be dropped by Dexie as it's no longer in the stores definition for v29
    });

    // v30: Add isArchived to privacy_guardrails
    this.version(30).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      service_domains: '++id, name, businessArea, businessDomain, frameworkTag, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive, isArchived',
      custom_agents: '++id, name, agentCategory, status',
      chat_threads: '++id, threadId, updatedAt',
      chat_messages: '++id, threadId, timestamp, role',
      semantic_memory: '++id, createdAt, source',
      local_telemetry_vault: '++id, timestamp'
    });

    // v31: Add frameworkTags and enforcementScope to privacy_guardrails
    this.version(31).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      service_domains: '++id, name, businessArea, businessDomain, frameworkTag, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive, isArchived, *frameworkTags, *enforcementScope',
      custom_agents: '++id, name, agentCategory, status',
      chat_threads: '++id, threadId, updatedAt',
      chat_messages: '++id, threadId, timestamp, role',
      semantic_memory: '++id, createdAt, source',
      local_telemetry_vault: '++id, timestamp'
    });

    // v32: 3-Tier Chat Architecture Memory
    this.version(32).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      service_domains: '++id, name, businessArea, businessDomain, frameworkTag, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive, isArchived, *frameworkTags, *enforcementScope',
      custom_agents: '++id, name, agentCategory, status',
      chat_threads: '++id, title, updatedAt',
      chat_messages: '++id, threadId, role, inferenceEngine, timestamp',
      semantic_memory: '++id, createdAt, source',
      local_telemetry_vault: '++id, timestamp',
      distillation_queue: '++id, query, status, createdAt'
    });

    // v33: SOVEREIGN ENGINE MIGRATION — Purge orphaned WebLLM Cache API data (2GB+ disk recovery)
    this.version(33).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      service_domains: '++id, name, businessArea, businessDomain, frameworkTag, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive, isArchived, *frameworkTags, *enforcementScope',
      custom_agents: '++id, name, agentCategory, status',
      chat_threads: '++id, title, updatedAt',
      chat_messages: '++id, threadId, role, inferenceEngine, timestamp',
      semantic_memory: '++id, createdAt, source',
      local_telemetry_vault: '++id, timestamp',
      distillation_queue: '++id, query, status, createdAt'
    }).upgrade(async () => {
      try {
        const cacheKeys = await caches.keys();
        for (const key of cacheKeys) {
          if (key.toLowerCase().includes('webllm') || key.toLowerCase().includes('mlc')) {
            await caches.delete(key);
          }
        }
        await caches.delete('webllm/model');
      } catch {
        // Best-effort — don't block migration if cache purge fails
      }
    });

    // v34: EPISTEMIC PERSISTENCE — Pre-computed vectors, zero-compute hydration
    this.version(34).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      service_domains: '++id, name, businessArea, businessDomain, frameworkTag, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive, isArchived, *frameworkTags, *enforcementScope',
      custom_agents: '++id, name, agentCategory, status',
      chat_threads: '++id, title, updatedAt',
      chat_messages: '++id, threadId, role, inferenceEngine, timestamp',
      semantic_memory: '++id, createdAt, source',
      local_telemetry_vault: '++id, timestamp',
      distillation_queue: '++id, query, status, createdAt'
    }).upgrade(async (tx) => {
      const { parser, vectoriser } = await import('./SemanticArena');

      const oldRecords = await tx.table('semantic_memory').toArray();
      for (const rec of oldRecords) {
        if (rec.vector && rec.vector instanceof Uint32Array) continue;

        const subject = rec.metadata?.entity || 'System';
        const predicate = rec.metadata?.intent || 'defines';
        const object = rec.text || '';
        const parsed = parser.parse(`${subject} ${predicate} ${object}`);
        const vector = vectoriser.vectorise(parsed);

        await tx.table('semantic_memory').put({
          id: rec.id,
          subject,
          predicate,
          object,
          context: rec.text || '',
          vector: vector.slice(),
          beliefState: rec.metadata?.belief ?? 2,
          source: rec.metadata?.source || 'legacy_migration',
          createdAt: rec.createdAt || new Date()
        });
      }
    });

    // v35: MITRA LOGICAL SWARM — Persona profiles with RAG tag filtering
    this.version(35).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      service_domains: '++id, name, businessArea, businessDomain, frameworkTag, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive, isArchived, *frameworkTags, *enforcementScope',
      custom_agents: '++id, name, agentCategory, status',
      chat_threads: '++id, title, updatedAt',
      chat_messages: '++id, threadId, role, inferenceEngine, timestamp',
      semantic_memory: '++id, createdAt, source',
      local_telemetry_vault: '++id, timestamp',
      distillation_queue: '++id, query, status, createdAt',
      mitra_profiles: '++id, name, domain, isActive'
    }).upgrade(async (tx) => {
      if ((await tx.table('mitra_profiles').count()) === 0) {
        await tx.table('mitra_profiles').bulkAdd([
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
    });

    // v36: Phase 1.10 — MITRA Swarm UI & Multi-Persona Workflow Handoff
    // Adds: prompt_templates.type, ReviewWorkflow.domainTags/defaultMitraProfileId,
    // stage.mitraProfileId, ReviewSession.domainContext/assignedMitraProfileId
    this.version(36).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      service_domains: '++id, name, businessArea, businessDomain, frameworkTag, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version, type',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive, isArchived, *frameworkTags, *enforcementScope',
      custom_agents: '++id, name, agentCategory, status',
      chat_threads: '++id, title, updatedAt',
      chat_messages: '++id, threadId, role, inferenceEngine, timestamp',
      semantic_memory: '++id, createdAt, source',
      local_telemetry_vault: '++id, timestamp',
      distillation_queue: '++id, query, status, createdAt',
      mitra_profiles: '++id, name, domain, isActive'
    }).upgrade(async (tx) => {
      // Set type='system' on all existing prompt templates
      await tx.table('prompt_templates').toCollection().modify((item: any) => {
        if (!item.type) item.type = 'system';
      });

      // Add domainTags and defaultMitraProfileId to all workflows
      await tx.table('review_workflows').toCollection().modify((wf: any) => {
        if (!wf.domainTags) wf.domainTags = [];
        if (wf.defaultMitraProfileId === undefined) wf.defaultMitraProfileId = null;
        // Add mitraProfileId to each stage
        if (wf.stages) {
          wf.stages = wf.stages.map((s: any) => ({
            ...s,
            mitraProfileId: s.mitraProfileId ?? null
          }));
        }
      });

      // Add domainContext and assignedMitraProfileId to all sessions
      // Default to EA domain and Enterprise Architect profile (id=1)
      await tx.table('review_sessions').toCollection().modify((s: any) => {
        if (!s.domainContext) s.domainContext = 'EA';
        if (s.assignedMitraProfileId === undefined) s.assignedMitraProfileId = 1;
      });
    });

    // v37: ENCRYPTION AT REST — AES-256-GCM for chat messages and threat models
    // Adds encryptedContent to chat_messages, encryptedData to threat_models
    // Idempotent migration: skips rows where encrypted fields already exist
    this.version(37).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      service_domains: '++id, name, businessArea, businessDomain, frameworkTag, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version, type',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      enterprise_knowledge: '++id, sourceFile',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive, isArchived, *frameworkTags, *enforcementScope',
      custom_agents: '++id, name, agentCategory, status',
      chat_threads: '++id, title, updatedAt',
      chat_messages: '++id, threadId, role, inferenceEngine, timestamp',
      semantic_memory: '++id, createdAt, source',
      local_telemetry_vault: '++id, timestamp',
      distillation_queue: '++id, query, status, createdAt',
      mitra_profiles: '++id, name, domain, isActive'
    }).upgrade(async (tx) => {
      // Import cryptoVault dynamically to avoid circular deps during migration
      const { encryptString } = await import('./cryptoVault');

      // Migrate chat_messages: content -> encryptedContent (idempotent)
      const chatMessages = await tx.table('chat_messages').toArray();
      for (const msg of chatMessages) {
        if (msg.content && !msg.encryptedContent) {
          try {
            const encrypted = await encryptString(msg.content);
            await tx.table('chat_messages').update(msg.id!, {
              encryptedContent: encrypted,
            });
          } catch {
            // If vault is not initialized during migration, skip — will be retried on next boot
          }
        }
      }

      // Migrate threat_models: plaintext fields -> encryptedData (idempotent)
      const threatModels = await tx.table('threat_models').toArray();
      for (const tm of threatModels) {
        if ((tm.components || tm.threats || tm.mermaidDFD) && !tm.encryptedData) {
          try {
            const payload = JSON.stringify({
              components: tm.components,
              threats: tm.threats,
              mermaidDFD: tm.mermaidDFD,
            });
            const encrypted = await encryptString(payload);
            await tx.table('threat_models').update(tm.id!, {
              encryptedData: encrypted,
            });
          } catch {
            // Same as above — vault may not be ready
          }
        }
      }
    });

    // v38: ORTHOGONAL BIT-ARENA — Remove enterprise_knowledge, migrate to semantic_memory
    // Legacy Float32 embeddings are tagged as 'legacy_embedding' with placeholder bitfields
    this.version(38).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      service_domains: '++id, name, businessArea, businessDomain, frameworkTag, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version, type',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive, isArchived, *frameworkTags, *enforcementScope',
      custom_agents: '++id, name, agentCategory, status',
      chat_threads: '++id, title, updatedAt',
      chat_messages: '++id, threadId, role, inferenceEngine, timestamp',
      semantic_memory: '++id, createdAt, source',
      local_telemetry_vault: '++id, timestamp',
      distillation_queue: '++id, query, status, createdAt',
      mitra_profiles: '++id, name, domain, isActive'
    }).upgrade(async (tx) => {
      // Migrate enterprise_knowledge records to semantic_memory
      const oldRecords = await tx.table('enterprise_knowledge').toArray();
      for (const rec of oldRecords) {
        await tx.table('semantic_memory').add({
          subject: rec.sourceFile || 'unknown_source',
          predicate: 'ingested_from',
          object: (rec.textChunk || '').substring(0, 500),
          context: rec.textChunk || '',
          vector: new Uint32Array(64),
          beliefState: 1,
          source: 'legacy_embedding',
          createdAt: rec.ingestedAt || new Date()
        });
      }
      // Drop the enterprise_knowledge table
      await tx.table('enterprise_knowledge').clear();
    });

    // v39: Sealed vault sessions — non-extractable wrapping key, persisted in IndexedDB
    this.version(39).stores({
      architecture_categories: '++id, name, type, parentId',
      master_categories: '++id, [type+name], type, name, status',
      content_metamodel: '++id, name, admPhase, artifactType, status',
      architecture_layers: '++id, name, coreLayer, contextLayer, status',
      architecture_principles: '++id, name, layerId, status',
      service_domains: '++id, name, businessArea, businessDomain, frameworkTag, status',
      bespoke_tags: '++id, name, category, status',
      review_sessions: '++id, projectName, type, status, workflowId',
      review_embeddings: '++id, sessionId',
      app_settings: 'key',
      network_integrations: '++id, providerType, isDefault',
      prompt_templates: '++id, name, category, status, executionTarget, version, type',
      review_workflows: '++id, name, triggerReviewType, status, version',
      report_templates: '++id, name, category, status, version',
      threat_models: '++id, projectName, sessionId, createdAt',
      training_jobs: '++id, status, startedAt',
      users: '++id, pseudokey, providerId',
      audit_logs: '++id, timestamp, pseudokey, action, tableName',
      dashboard_states: '++id, name, isDefault',
      model_registry: '++id, name, type, isActive',
      global_settings: 'id',
      privacy_guardrails: '++id, title, isDefault, isActive, isArchived, *frameworkTags, *enforcementScope',
      custom_agents: '++id, name, agentCategory, status',
      chat_threads: '++id, title, updatedAt',
      chat_messages: '++id, threadId, role, inferenceEngine, timestamp',
      semantic_memory: '++id, createdAt, source',
      local_telemetry_vault: '++id, timestamp',
      distillation_queue: '++id, query, status, createdAt',
      mitra_profiles: '++id, name, domain, isActive',
      vault_sessions: '++id, pseudokey, createdAt',
    });
  }
}

export const db = new EADatabase();

/**
 * Prunes old chat threads to maintain storage efficiency.
 * Automatically deletes the oldest thread and its associated messages if count > 50.
 */
export async function pruneOldChats(): Promise<void> {
  try {
    const threadCount = await db.chat_threads.count();
    if (threadCount > 50) {
      const oldest = await db.chat_threads
        .orderBy('updatedAt')
        .first();

      if (oldest?.id) {
        // Delete all messages associated with oldest thread
        await db.chat_messages.where('threadId').equals(oldest.id).delete();
        // Delete the thread itself
        await db.chat_threads.delete(oldest.id);
      }
    }
  } catch (e) {
    // Silently log to avoid disrupting UI
    if (typeof window !== 'undefined') {
      // Dynamic import to avoid circular dependencies
      import('./logger').then(({ Logger }) => {
        Logger.warn('[pruneOldChats] Error during chat history pruning:', e);
      }).catch(err => void err);
    }
  }
}

// Setup Audit Hooks globally across all tables (excluding audit_logs itself)
db.on('ready', () => {
  db.tables.forEach(table => {
    if (table.name === 'audit_logs' || table.name === 'users' || table.name === 'privacy_guardrails') return;

    table.hook('creating', function () {
      const pseudokey = sessionStorage.getItem('ea_niti_session') || 'SYSTEM';
      Dexie.ignoreTransaction(() => {
        db.audit_logs.add({
          timestamp: new Date(),
          pseudokey,
          action: 'CREATE',
          tableName: table.name,
          details: `Created record in ${table.name}`
        });
      });
    });

    table.hook('updating', function (modifications, primKey) {
      void modifications;
      const pseudokey = sessionStorage.getItem('ea_niti_session') || 'SYSTEM';
      Dexie.ignoreTransaction(() => {
        db.audit_logs.add({
          timestamp: new Date(),
          pseudokey,
          action: 'UPDATE',
          tableName: table.name,
          recordId: String(primKey),
          details: `Updated record in ${table.name}`
        });
      });
    });

    table.hook('deleting', function (primKey) {
      const pseudokey = sessionStorage.getItem('ea_niti_session') || 'SYSTEM';
      Dexie.ignoreTransaction(() => {
        db.audit_logs.add({
          timestamp: new Date(),
          pseudokey,
          action: 'DELETE',
          tableName: table.name,
          recordId: String(primKey),
          details: `Deleted record from ${table.name}`
        });
      });
    });
  });
});

export async function logForensicAudit(
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  tableName: string,
  recordId: string | number,
  previousState: Record<string, any> | null,
  newState: Record<string, any> | null
) {
  const pseudokey = sessionStorage.getItem('ea_niti_session') || 'SYSTEM';

  const sanitize = (obj: Record<string, any> | null) => {
    if (!obj) return null;
    const clone = { ...obj };
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential', 'encrypted'];
    for (const key of Object.keys(clone)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        clone[key] = '[REDACTED]';
      }
    }
    return clone;
  };

  await db.audit_logs.add({
    timestamp: new Date(),
    pseudokey,
    action,
    tableName,
    recordId: String(recordId),
    details: JSON.stringify({
      recordId: String(recordId),
      previousState: sanitize(previousState),
      newState: sanitize(newState)
    }, null, 2)
  });
}

