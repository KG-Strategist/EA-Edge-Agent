import { db } from './db';

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
    console.log(`Cleaned up ${duplicatesToRemove.length} duplicate master categories.`);
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
      if (idMapping.has(layer.categoryId)) {
        await db.architecture_layers.update(layer.id!, { categoryId: idMapping.get(layer.categoryId)! });
      }
    }
    for (const cat of allCategories) {
      if (cat.parentId && idMapping.has(cat.parentId)) {
        await db.architecture_categories.update(cat.id!, { parentId: idMapping.get(cat.parentId)! });
      }
    }
    await db.architecture_categories.bulkDelete(duplicatesToRemove);
    console.log(`Cleaned up ${duplicatesToRemove.length} duplicate categories.`);
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
    console.log(`Cleaned up ${duplicatesToRemove.length} duplicate metamodel entries.`);
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
    console.log(`Cleaned up ${duplicatesToRemove.length} duplicate layers.`);
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
    console.log(`Cleaned up ${duplicatesToRemove.length} duplicate principles.`);
  }
}

async function cleanupDuplicateBianDomains() {
  const all = await db.bian_domains.toArray();
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
      if (s.bianDomainId && idMapping.has(s.bianDomainId)) {
        await db.review_sessions.update(s.id!, { bianDomainId: idMapping.get(s.bianDomainId)! });
      }
    }
    await db.bian_domains.bulkDelete(duplicatesToRemove);
    console.log(`Cleaned up ${duplicatesToRemove.length} duplicate BIAN domains.`);
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
    console.log(`Cleaned up ${duplicatesToRemove.length} duplicate tags.`);
  }
}

export async function seedDatabase() {
  try {
    await cleanupDuplicateCategories();
    await cleanupDuplicateMasterCategories();
    await cleanupDuplicateMetamodel();
    await cleanupDuplicateLayers();
    await cleanupDuplicatePrinciples();
    await cleanupDuplicateBianDomains();
    await cleanupDuplicateTags();

    const categoriesCount = await db.architecture_categories.count();
    const masterCategoriesCount = await db.master_categories.count();
    const metamodelCount = await db.content_metamodel.count();
    const layersCount = await db.architecture_layers.count();
    const principlesCount = await db.architecture_principles.count();
    const bianCount = await db.bian_domains.count();
    const tagsCount = await db.bespoke_tags.count();

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
        { type: 'Review Type', name: 'New System Implementation (NSI)', isActive: true },
        { type: 'Review Type', name: 'Enhancement Review (ER)', isActive: true },
        { type: 'Application Tier', name: 'Tier 1', isActive: true },
        { type: 'Application Tier', name: 'Tier 2', isActive: true },
        { type: 'Application Tier', name: 'Tier 3', isActive: true },
        { type: 'Hosting Model', name: 'Cloud Native', isActive: true },
        { type: 'Hosting Model', name: 'On-Premise', isActive: true },
        { type: 'Hosting Model', name: 'Hybrid', isActive: true },
        { type: 'ADM Phase', name: 'Preliminary', isActive: true },
        { type: 'ADM Phase', name: 'Phase A', isActive: true },
        { type: 'ADM Phase', name: 'Phase B: Business Architecture', isActive: true },
        { type: 'ADM Phase', name: 'Phase C: Information Systems', isActive: true },
        { type: 'ADM Phase', name: 'Phase D: Technology Architecture', isActive: true },
        { type: 'ADM Phase', name: 'Phases E-F', isActive: true },
        { type: 'Artifact Type', name: 'Catalog', isActive: true },
        { type: 'Artifact Type', name: 'Matrix', isActive: true },
        { type: 'Artifact Type', name: 'Diagram', isActive: true },
        { type: 'Tag Category', name: 'Tier', isActive: true },
        { type: 'Tag Category', name: 'Hosting', isActive: true },
        { type: 'Tag Category', name: 'Lifecycle', isActive: true },
      ]);
    }

    if (metamodelCount === 0) {
      await db.content_metamodel.bulkAdd([
        {
          name: "Application Interaction Matrix",
          admPhase: "Phase C: Information Systems",
          artifactType: "Matrix",
          description: "Maps application components to the business services they support.",
          ownerRole: "Lead Enterprise Architect"
        },
        {
          name: "Business Footprint Diagram",
          admPhase: "Phase B: Business Architecture",
          artifactType: "Diagram",
          description: "Visualizes the links between business goals, organizational units, and functions.",
          ownerRole: "Business Architect"
        },
        {
          name: "Technology Standards Catalog",
          admPhase: "Phase D: Technology Architecture",
          artifactType: "Catalog",
          description: "An agreed list of standard technologies for the enterprise.",
          ownerRole: "Technology Architect"
        }
      ]);
    }

    if (layersCount === 0) {
      const categories = await db.architecture_categories.toArray();
      const getCatId = (name: string) => categories.find(c => c.name === name)?.id || 1;

      const layers = [
        { name: 'Business', categoryId: getCatId('Core BDAT') },
        { name: 'Data', categoryId: getCatId('Core BDAT') },
        { name: 'Application', categoryId: getCatId('Core BDAT') },
        { name: 'Technology', categoryId: getCatId('Core BDAT') },
        { name: 'Presentation', categoryId: getCatId('Architectural (3-Tier)') },
        { name: 'Persistence', categoryId: getCatId('Architectural (3-Tier)') },
        { name: 'Service', categoryId: getCatId('Architectural (3-Tier)') },
        { name: 'Strategic', categoryId: getCatId('Strategic & GRC') },
        { name: 'GRC', categoryId: getCatId('Strategic & GRC') },
        { name: 'Security', categoryId: getCatId('Strategic & GRC') },
        { name: 'Ingestion', categoryId: getCatId('Data-Specific') },
        { name: 'Data Processing', categoryId: getCatId('Data-Specific') },
        { name: 'Consumption', categoryId: getCatId('Data-Specific') },
        { name: 'Infrastructure Services', categoryId: getCatId('Infrastructure & Cloud') },
        { name: 'Platform Services', categoryId: getCatId('Infrastructure & Cloud') },
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

    if (bianCount === 0) {
      await db.bian_domains.bulkAdd([
        { name: 'Payments', description: 'Execution and management of payment transactions.', status: 'Active' },
        { name: 'Customer Offer', description: 'Management of customer offers and campaigns.', status: 'Active' },
        { name: 'Lending', description: 'Management of loans and credit facilities.', status: 'Active' },
      ]);
    }

    if (tagsCount === 0) {
      await db.bespoke_tags.bulkAdd([
        { name: 'Tier 1', category: 'Tier', colorCode: 'bg-red-500/20 text-red-400' },
        { name: 'Tier 2', category: 'Tier', colorCode: 'bg-orange-500/20 text-orange-400' },
        { name: 'Tier 3', category: 'Tier', colorCode: 'bg-yellow-500/20 text-yellow-400' },
        { name: 'Cloud Native', category: 'Hosting', colorCode: 'bg-blue-500/20 text-blue-400' },
        { name: 'On-Premise', category: 'Hosting', colorCode: 'bg-gray-500/20 text-gray-400' },
      ]);
    }
    return true;
  } catch (error) {
    console.error('Failed to seed database:', error);
    return false;
  }
}
