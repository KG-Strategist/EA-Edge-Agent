import Dexie, { Table } from 'dexie';
import { MASTER_CATEGORY_TYPES } from './constants';

export interface MasterCategory {
  id?: number;
  type: keyof typeof MASTER_CATEGORY_TYPES | string;
  name: string;
  description?: string;
  isActive: boolean;
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
  status: 'Active' | 'Deprecated';
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
}

export interface ArchitecturePrinciple {
  id?: number;
  name: string;
  statement: string;
  rationale: string;
  implications: string;
  layerId: number;
  status: 'Active' | 'Needs Review' | 'Deprecated';
}

export interface BianDomain {
  id?: number;
  name: string;
  businessArea: string;
  businessDomain: string;
  controlRecord: string;
  functionalPattern: string;
  description: string;
  status: 'Active' | 'Draft' | 'Deprecated';
}

export interface BespokeTag {
  id?: number;
  name: string;
  category: string;
  colorCode: string;
}

export interface ArchitectureBlob {
  name: string;
  type: string;
  blob: Blob;
}

export interface ReviewSession {
  id?: number;
  projectName: string;
  type: string;
  bianDomainId: number | null;
  tags: string[];
  status: 'Draft' | 'Pending' | 'Completed';
  vendorDdqBlob?: Blob | null;
  architectureBlobs?: ArchitectureBlob[];
  reportMarkdown?: string;
  createdAt: Date;
}

export interface ReviewEmbedding {
  id?: number;
  sessionId: number;
  text: string;
  embedding: number[];
}

export interface AppSetting {
  key: string;
  value: any;
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
  }
}

export const db = new EADatabase();
