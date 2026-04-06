import Dexie, { Table } from 'dexie';
import { MASTER_CATEGORY_TYPES } from './constants';

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

export interface BianDomain {
  id?: number;
  name: string;
  businessArea: string;
  businessDomain: string;
  controlRecord: string;
  functionalPattern: string;
  description: string;
  status: 'Draft' | 'Active' | 'Needs Review' | 'Deprecated';
}

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
  stages: {
    id: string; // UUID or string id
    name: string; // e.g., 'ABR', 'AIA', 'Final Selection'
    type: 'AI_EVALUATION' | 'HUMAN_APPROVAL';
    linkedPromptTemplateId?: number; // For AI Stages
    linkedReportTemplateId?: number; // For rendering
    orderIndex: number;
    requiresManualSignoff: boolean;
  }[];
  status: 'Draft' | 'Active' | 'Needs Review' | 'Deprecated';
}

export interface ReviewSession {
  id?: number;
  projectName: string;
  type: string;
  bianDomainId: number | null;
  tags: string[];
  appTier?: string;
  hostingModel?: string;
  dataClassification?: string;
  networkPosture?: string;
  businessJustification?: string;
  
  // State Machine Pointers
  status: 'Draft' | 'Pending' | 'In Progress' | 'Completed' | 'Rejected';
  workflowId?: number; // Maps to ReviewWorkflow
  currentStageIndex?: number; // Pointer to current step in workflow.stages
  
  // Storage
  ddqBlobs?: ArchitectureBlob[]; // Multiple vendor DDQs
  architectureBlobs?: ArchitectureBlob[];
  ddqScorecard?: any; // Aggregate scorecards mapping array
  reportMarkdown?: string;
  
  // Final Board Overrides
  humanOverrides?: {
    winningVendorOverride?: string;
    justification?: string;
    overrideTimestamp?: string;
    overriddenBy?: string;
  };
  
  createdAt: Date;
}

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
  components: any[];
  threats: any[];
  mermaidDFD: string;
  createdAt: Date;
  updatedAt: Date;
}

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
  status: 'Pending' | 'Processing' | 'Completed' | 'Failed';
  logs: string[]; // Progress and error logs
  startedAt: Date;
  completedAt?: Date;
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
  providerId?: string; // For Hybrid mode SSO linkage
  authMode: 'Air-Gapped' | 'Hybrid';
  createdAt: Date;
}

export interface AuditLog {
  id?: number;
  timestamp: Date;
  pseudokey: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN';
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
  type: 'PRIMARY' | 'SECONDARY';
  modelUrl: string; // Points to WebLLM config root
  wasmUrl?: string; // Optional custom WASM binder
  isLocalhost: boolean; // Resolves against window.location.origin
  isActive: boolean;
  allowDistillation?: boolean; // For Secondary models
}

export interface NetworkIntegration {
  id?: number;
  providerType: 'WebSearchAPI' | 'CloudLLMAPI' | 'CustomEnterprise';
  displayName: string;
  endpointUrl: string;
  apiKey: string;
  isDefault: boolean;
  createdAt: Date;
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
  public_sso_enabled: boolean;
}

export interface PromptTemplate {
  id?: number;
  name: string;
  category: string;
  executionTarget?: 'EA Core Model' | 'Domain SME Model' | 'Auto-Route Hybrid';
  promptText: string;
  version?: string;
  status: 'Draft' | 'Active' | 'Needs Review' | 'Deprecated';
  createdAt: Date;
  updatedAt: Date;
}

export class EADatabase extends Dexie {
  architecture_categories!: Table<ArchitectureCategory>;
  master_categories!: Table<MasterCategory>;
  content_metamodel!: Table<ContentMetamodel>;
  architecture_layers!: Table<ArchitectureLayer>;
  architecture_principles!: Table<ArchitecturePrinciple>;
  bian_domains!: Table<BianDomain>;
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
      // Seed default Core Model on upgrade
      if ((await tx.table('model_registry').count()) === 0) {
        await tx.table('model_registry').add({
          name: 'EA-NITI Core (Llama-3-8B-Instruct-q4f16_1-MLC)',
          type: 'PRIMARY',
          modelUrl: 'https://huggingface.co/mlc-ai/Llama-3-8B-Instruct-q4f16_1-MLC',
          isLocalhost: false,
          isActive: true
        });
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
  }
}

export const db = new EADatabase();

// Setup Audit Hooks globally across all tables (excluding audit_logs itself)
db.on('ready', () => {
  db.tables.forEach(table => {
    if (table.name === 'audit_logs' || table.name === 'users') return; // Don't audit the audit or identity table loops

    table.hook('creating', function (primKey, obj, transaction) {
      const pseudokey = sessionStorage.getItem('ea_niti_session') || 'SYSTEM';
      // Create separate async transaction to avoid blocking main CRUD
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

    table.hook('updating', function (modifications, primKey, obj, transaction) {
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

    table.hook('deleting', function (primKey, obj, transaction) {
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
