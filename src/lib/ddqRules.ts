/**
 * DDQ Rules Engine — Enterprise Architecture Design Principles Question Bank
 * 
 * Each question belongs to a Design Principle, has a set of scored options (5/3/0),
 * and an optional trigger condition that determines whether the question appears
 * in a generated DDQ based on the review's metadata.
 */

export interface DDQOption {
  text: string;
  score: number;
}

export interface DDQQuestion {
  id: string;
  principle: string;
  question: string;
  options: DDQOption[];
  /** If provided, the question is only included when this returns true. Otherwise always included. */
  triggerCondition?: (meta: DDQMetadata) => boolean;
}

export interface DDQMetadata {
  reviewType: string;
  appTier: string;
  hostingModel: string;
  tags: string[];
  dataClassification?: string;
  networkPosture?: string;
}

export interface DDQScoreEntry {
  questionId: string;
  principle: string;
  question: string;
  selectedOption: string;
  score: number;
  maxScore: number;
}

export interface DDQScorecard {
  totalScore: number;
  maxPossibleScore: number;
  percentageScore: number;
  principleScores: Record<string, { score: number; maxScore: number; percentage: number; questionCount: number }>;
  entries: DDQScoreEntry[];
  generatedAt: string;
}

// Standard options reused across most questions
const STANDARD_OPTIONS: DDQOption[] = [
  { text: 'Fully implemented', score: 5 },
  { text: 'Partially implemented', score: 3 },
  { text: 'Not implemented', score: 0 }
];

const STANDARD_NA: DDQOption = { text: 'Not Applicable', score: 0 };

function withNA(opts: DDQOption[]): DDQOption[] {
  return [STANDARD_NA, ...opts];
}

// Helpers for trigger conditions
const isNSI = (m: DDQMetadata) => m.reviewType.includes('NSI') || m.reviewType.includes('New System');
const isTier1 = (m: DDQMetadata) => m.appTier === 'Tier 1';
const isCloudHosted = (m: DDQMetadata) => m.hostingModel?.toLowerCase().includes('cloud') || m.tags.some(t => t.includes('Cloud'));
const hasPII = (m: DDQMetadata) => m.tags.some(t => t.includes('PII')) || m.dataClassification === 'Restricted' || m.dataClassification === 'Confidential';

// ──────────────────────────────────────────────────────────────
// COMPLETE QUESTION BANK — 15 Design Principles
// ──────────────────────────────────────────────────────────────

export const DDQ_QUESTION_BANK: DDQQuestion[] = [

  // ═══════════════════════ SCALABILITY ═══════════════════════
  {
    id: 'SCALE-01', principle: 'Scalability',
    question: 'Does the application consider volume projection and transactions per second (TPS)?',
    options: withNA([
      { text: 'Fully considered and tested', score: 5 },
      { text: 'Partially considered', score: 3 },
      { text: 'Not considered', score: 0 }
    ])
  },
  {
    id: 'SCALE-02', principle: 'Scalability',
    question: 'Does the architecture support horizontal, vertical scaling, VMs, or containers?',
    options: withNA([
      { text: 'Supports all', score: 5 },
      { text: 'Supports some', score: 3 },
      { text: 'Does not support', score: 0 }
    ])
  },
  {
    id: 'SCALE-03', principle: 'Scalability',
    question: 'Are capacity triggers and modes defined and implemented?',
    options: withNA([
      { text: 'Fully defined and implemented', score: 5 },
      { text: 'Partially defined', score: 3 },
      { text: 'Not defined', score: 0 }
    ])
  },
  {
    id: 'SCALE-04', principle: 'Scalability',
    question: 'Is scalability accounted for during peak times (festive/seasonal phases)?',
    options: withNA([
      { text: 'Fully accounted', score: 5 },
      { text: 'Partially accounted', score: 3 },
      { text: 'Not accounted', score: 0 }
    ])
  },
  {
    id: 'SCALE-05', principle: 'Scalability',
    question: 'Are all scalability dependents identified and involved in the planning?',
    options: withNA([
      { text: 'Fully identified and involved', score: 5 },
      { text: 'Partially identified', score: 3 },
      { text: 'Not identified', score: 0 }
    ])
  },
  {
    id: 'SCALE-06', principle: 'Scalability',
    question: 'Are scalability components clearly identified in the architecture?',
    options: withNA([
      { text: 'Fully identified', score: 5 },
      { text: 'Partially identified', score: 3 },
      { text: 'Not identified', score: 0 }
    ])
  },

  // ═══════════════════════ SECURITY ═══════════════════════
  {
    id: 'SEC-01', principle: 'Security',
    question: "Is the application's security designed based on the type of data, users, and hosting?",
    options: withNA([
      { text: 'Fully designed and documented', score: 5 },
      { text: 'Partially designed', score: 3 },
      { text: 'Not designed', score: 0 }
    ])
  },
  {
    id: 'SEC-02', principle: 'Security',
    question: 'Are measures in place for data encryption, access security, user secrets, and storage security?',
    options: withNA([...STANDARD_OPTIONS])
  },
  {
    id: 'SEC-03', principle: 'Security',
    question: 'Does the application secure PII, customer access, and data in transit effectively?',
    options: withNA([
      { text: 'Fully secured', score: 5 },
      { text: 'Partially secured', score: 3 },
      { text: 'Not secured', score: 0 }
    ]),
    triggerCondition: hasPII
  },
  {
    id: 'SEC-04', principle: 'Security',
    question: 'Are security dependents clearly identified (providers and internal teams)?',
    options: withNA([
      { text: 'Fully identified and engaged', score: 5 },
      { text: 'Partially identified', score: 3 },
      { text: 'Not identified', score: 0 }
    ])
  },
  {
    id: 'SEC-05', principle: 'Security',
    question: 'Are security standards (e.g., PCI DSS, AppSec) met for cloud, storage, and DB environments?',
    options: withNA([
      { text: 'Fully compliant', score: 5 },
      { text: 'Partially compliant', score: 3 },
      { text: 'Not compliant', score: 0 }
    ])
  },
  {
    id: 'SEC-06', principle: 'Security',
    question: 'Are advanced mechanisms like BYOK, IP whitelisting, TDE, and firewalls implemented?',
    options: withNA([...STANDARD_OPTIONS]),
    triggerCondition: (m) => isTier1(m) || isNSI(m)
  },

  // ═══════════════════════ RELIABILITY ═══════════════════════
  {
    id: 'REL-01', principle: 'Reliability',
    question: 'Is reliability aligned with business criticality and customer-facing needs?',
    options: withNA([
      { text: 'Fully aligned', score: 5 },
      { text: 'Partially aligned', score: 3 },
      { text: 'Not aligned', score: 0 }
    ])
  },
  {
    id: 'REL-02', principle: 'Reliability',
    question: 'Are HA models like active-passive or active-active implemented?',
    options: withNA([...STANDARD_OPTIONS]),
    triggerCondition: isTier1
  },
  {
    id: 'REL-03', principle: 'Reliability',
    question: 'Are redundancy, fault tolerance, and auto-healing mechanisms in place?',
    options: withNA([...STANDARD_OPTIONS])
  },
  {
    id: 'REL-04', principle: 'Reliability',
    question: 'Are reliability triggers and use cases tested for peak scenarios/events?',
    options: withNA([
      { text: 'Fully tested', score: 5 },
      { text: 'Partially tested', score: 3 },
      { text: 'Not tested', score: 0 }
    ])
  },
  {
    id: 'REL-05', principle: 'Reliability',
    question: 'Are dependents and stakeholders aligned on reliability requirements?',
    options: withNA([
      { text: 'Fully aligned', score: 5 },
      { text: 'Partially aligned', score: 3 },
      { text: 'Not aligned', score: 0 }
    ])
  },

  // ═══════════════════════ EXTENSIBILITY ═══════════════════════
  {
    id: 'EXT-01', principle: 'Extensibility',
    question: 'Is the architecture designed for future enhancements or regulatory requirements?',
    options: withNA([
      { text: 'Fully designed', score: 5 },
      { text: 'Partially designed', score: 3 },
      { text: 'Not designed', score: 0 }
    ])
  },
  {
    id: 'EXT-02', principle: 'Extensibility',
    question: 'Are modules and features designed to accommodate extensibility?',
    options: withNA([
      { text: 'Fully designed', score: 5 },
      { text: 'Partially designed', score: 3 },
      { text: 'Not designed', score: 0 }
    ])
  },
  {
    id: 'EXT-03', principle: 'Extensibility',
    question: 'Are design patterns like API-first, modularity, and low-code practices implemented?',
    options: withNA([...STANDARD_OPTIONS])
  },
  {
    id: 'EXT-04', principle: 'Extensibility',
    question: 'Are domain enhancements and time-to-market changes planned?',
    options: withNA([
      { text: 'Fully planned', score: 5 },
      { text: 'Partially planned', score: 3 },
      { text: 'Not planned', score: 0 }
    ])
  },
  {
    id: 'EXT-05', principle: 'Extensibility',
    question: 'Are all dependents aligned on extensibility needs?',
    options: withNA([
      { text: 'Fully aligned', score: 5 },
      { text: 'Partially aligned', score: 3 },
      { text: 'Not aligned', score: 0 }
    ])
  },

  // ═══════════════════════ PERFORMANCE OPTIMIZATION ═══════════════════════
  {
    id: 'PERF-01', principle: 'Performance Optimization',
    question: 'Is performance optimization aligned with user experience and system resilience?',
    options: withNA([
      { text: 'Fully aligned', score: 5 },
      { text: 'Partially aligned', score: 3 },
      { text: 'Not aligned', score: 0 }
    ])
  },
  {
    id: 'PERF-02', principle: 'Performance Optimization',
    question: 'Are optimization efforts targeted at application, infra, network, or DB levels?',
    options: withNA([
      { text: 'All levels targeted', score: 5 },
      { text: 'Some levels targeted', score: 3 },
      { text: 'No levels targeted', score: 0 }
    ])
  },
  {
    id: 'PERF-03', principle: 'Performance Optimization',
    question: 'Are benchmarking, load testing, and cross-system communications addressed?',
    options: withNA([
      { text: 'Fully addressed', score: 5 },
      { text: 'Partially addressed', score: 3 },
      { text: 'Not addressed', score: 0 }
    ])
  },
  {
    id: 'PERF-04', principle: 'Performance Optimization',
    question: 'Are techniques like caching, indexing, multi-threading, and sharding implemented?',
    options: withNA([...STANDARD_OPTIONS])
  },
  {
    id: 'PERF-05', principle: 'Performance Optimization',
    question: 'Are performance strategies prepared for high demand or storage volume increases?',
    options: withNA([
      { text: 'Fully prepared', score: 5 },
      { text: 'Partially prepared', score: 3 },
      { text: 'Not prepared', score: 0 }
    ])
  },
  {
    id: 'PERF-06', principle: 'Performance Optimization',
    question: 'Are all performance optimization dependents and users identified?',
    options: withNA([
      { text: 'Fully identified', score: 5 },
      { text: 'Partially identified', score: 3 },
      { text: 'Not identified', score: 0 }
    ])
  },

  // ═══════════════════════ OBSERVABILITY ═══════════════════════
  {
    id: 'OBS-01', principle: 'Observability',
    question: 'Are monitoring, behavior analytics, and traceability goals defined?',
    options: withNA([
      { text: 'Fully defined', score: 5 },
      { text: 'Partially defined', score: 3 },
      { text: 'Not defined', score: 0 }
    ])
  },
  {
    id: 'OBS-02', principle: 'Observability',
    question: 'Are observability mechanisms applied across application, DB, infra, and network levels?',
    options: withNA([
      { text: 'All levels covered', score: 5 },
      { text: 'Some levels covered', score: 3 },
      { text: 'No levels covered', score: 0 }
    ])
  },
  {
    id: 'OBS-03', principle: 'Observability',
    question: 'Are key metrics like CPU usage, API response time, and error rates tracked?',
    options: withNA([
      { text: 'All key metrics tracked', score: 5 },
      { text: 'Some metrics tracked', score: 3 },
      { text: 'No metrics tracked', score: 0 }
    ])
  },
  {
    id: 'OBS-04', principle: 'Observability',
    question: 'Are logging, monitoring, alerts, and dashboards implemented?',
    options: withNA([...STANDARD_OPTIONS])
  },
  {
    id: 'OBS-05', principle: 'Observability',
    question: 'Is observability aligned with business-critical use cases?',
    options: withNA([
      { text: 'Fully aligned', score: 5 },
      { text: 'Partially aligned', score: 3 },
      { text: 'Not aligned', score: 0 }
    ])
  },
  {
    id: 'OBS-06', principle: 'Observability',
    question: 'Are SOC, ITSM, and NOC teams equipped to handle observability tools?',
    options: withNA([
      { text: 'Fully equipped', score: 5 },
      { text: 'Partially equipped', score: 3 },
      { text: 'Not equipped', score: 0 }
    ])
  },

  // ═══════════════════════ INTEROPERABILITY ═══════════════════════
  {
    id: 'INT-01', principle: 'Interoperability',
    question: 'Does the system enable seamless information exchange across applications?',
    options: withNA([
      { text: 'Fully enables', score: 5 },
      { text: 'Partially enables', score: 3 },
      { text: 'Does not enable', score: 0 }
    ])
  },
  {
    id: 'INT-02', principle: 'Interoperability',
    question: 'Are interoperability measures applied at application, infra, or DB levels?',
    options: withNA([
      { text: 'All levels addressed', score: 5 },
      { text: 'Some levels addressed', score: 3 },
      { text: 'No levels addressed', score: 0 }
    ])
  },
  {
    id: 'INT-03', principle: 'Interoperability',
    question: 'Are data types (PII, monitoring, reporting, etc.) clearly defined for interoperability?',
    options: withNA([
      { text: 'Fully defined', score: 5 },
      { text: 'Partially defined', score: 3 },
      { text: 'Not defined', score: 0 }
    ])
  },
  {
    id: 'INT-04', principle: 'Interoperability',
    question: 'Are adaptors, API gateways, and pub/sub mechanisms implemented?',
    options: withNA([...STANDARD_OPTIONS])
  },
  {
    id: 'INT-05', principle: 'Interoperability',
    question: 'Is interoperability prepared for synchronous, asynchronous, and batch processing?',
    options: withNA([
      { text: 'Fully prepared', score: 5 },
      { text: 'Partially prepared', score: 3 },
      { text: 'Not prepared', score: 0 }
    ])
  },
  {
    id: 'INT-06', principle: 'Interoperability',
    question: 'Are all stakeholders and dependents for interoperability aligned?',
    options: withNA([
      { text: 'Fully aligned', score: 5 },
      { text: 'Partially aligned', score: 3 },
      { text: 'Not aligned', score: 0 }
    ])
  },

  // ═══════════════════════ COMPLIANCE ═══════════════════════
  {
    id: 'COMP-01', principle: 'Compliance',
    question: 'Are compliance needs for data localization, PII, and third-party sharing addressed?',
    options: withNA([
      { text: 'Fully addressed', score: 5 },
      { text: 'Partially addressed', score: 3 },
      { text: 'Not addressed', score: 0 }
    ])
  },
  {
    id: 'COMP-02', principle: 'Compliance',
    question: 'Are compliance measures applied across storage, transit, and reporting?',
    options: withNA([
      { text: 'Fully applied', score: 5 },
      { text: 'Partially applied', score: 3 },
      { text: 'Not applied', score: 0 }
    ])
  },
  {
    id: 'COMP-03', principle: 'Compliance',
    question: 'Are regulatory standards (GDPR, PCI DSS) and internal compliance addressed?',
    options: withNA([
      { text: 'Fully addressed', score: 5 },
      { text: 'Partially addressed', score: 3 },
      { text: 'Not addressed', score: 0 }
    ])
  },
  {
    id: 'COMP-04', principle: 'Compliance',
    question: 'Are mechanisms like auditing trails, encryption, and tokenization implemented?',
    options: withNA([...STANDARD_OPTIONS])
  },
  {
    id: 'COMP-05', principle: 'Compliance',
    question: 'Are compliance checks maintained throughout the application lifecycle?',
    options: withNA([
      { text: 'Fully maintained', score: 5 },
      { text: 'Partially maintained', score: 3 },
      { text: 'Not maintained', score: 0 }
    ])
  },
  {
    id: 'COMP-06', principle: 'Compliance',
    question: 'Are all organizational and external compliance stakeholders identified?',
    options: withNA([
      { text: 'Fully identified', score: 5 },
      { text: 'Partially identified', score: 3 },
      { text: 'Not identified', score: 0 }
    ])
  },

  // ═══════════════════════ BUILD AND DEPLOYMENTS ═══════════════════════
  {
    id: 'BUILD-01', principle: 'Build and Deployments',
    question: 'Are deployment strategies (e.g., Canary/Rolling Updates) chosen effectively?',
    options: withNA([
      { text: 'Fully aligned', score: 5 },
      { text: 'Partially aligned', score: 3 },
      { text: 'Not aligned', score: 0 }
    ])
  },
  {
    id: 'BUILD-02', principle: 'Build and Deployments',
    question: 'Are code, database objects, and patch management processes clearly defined?',
    options: withNA([
      { text: 'Fully defined', score: 5 },
      { text: 'Partially defined', score: 3 },
      { text: 'Not defined', score: 0 }
    ])
  },
  {
    id: 'BUILD-03', principle: 'Build and Deployments',
    question: 'Are CI/CD pipelines, versioning, and rollback strategies implemented?',
    options: withNA([...STANDARD_OPTIONS])
  },
  {
    id: 'BUILD-04', principle: 'Build and Deployments',
    question: 'Are application and vendor teams aligned on build and deployment requirements?',
    options: withNA([
      { text: 'Fully aligned', score: 5 },
      { text: 'Partially aligned', score: 3 },
      { text: 'Not aligned', score: 0 }
    ])
  },
  {
    id: 'BUILD-05', principle: 'Build and Deployments',
    question: 'Are deployments planned for non-business hours or downtime windows?',
    options: withNA([
      { text: 'Fully planned', score: 5 },
      { text: 'Partially planned', score: 3 },
      { text: 'Not planned', score: 0 }
    ])
  },

  // ═══════════════════════ MIGRATION ═══════════════════════
  {
    id: 'MIG-01', principle: 'Migration',
    question: 'Is the migration intended for application replacement, tech upgrades, or hosting changes?',
    options: withNA([
      { text: 'Fully aligned with objectives', score: 5 },
      { text: 'Partially aligned with objectives', score: 3 },
      { text: 'Not aligned with objectives', score: 0 }
    ]),
    triggerCondition: isNSI
  },
  {
    id: 'MIG-02', principle: 'Migration',
    question: 'Are migration efforts targeting applications, databases, storage, or hosting?',
    options: withNA([
      { text: 'All layers targeted', score: 5 },
      { text: 'Some layers targeted', score: 3 },
      { text: 'No layers targeted', score: 0 }
    ]),
    triggerCondition: isNSI
  },
  {
    id: 'MIG-03', principle: 'Migration',
    question: 'Are data types like documents, PII, and transaction logs explicitly planned for migration?',
    options: withNA([
      { text: 'Fully planned', score: 5 },
      { text: 'Partially planned', score: 3 },
      { text: 'Not planned', score: 0 }
    ]),
    triggerCondition: isNSI
  },
  {
    id: 'MIG-04', principle: 'Migration',
    question: 'Are approaches like ETL, replication, APIs, or services mapping used for migration?',
    options: withNA([
      { text: 'Fully utilized', score: 5 },
      { text: 'Partially utilized', score: 3 },
      { text: 'Not utilized', score: 0 }
    ]),
    triggerCondition: isNSI
  },
  {
    id: 'MIG-05', principle: 'Migration',
    question: 'Is migration planned as big bang, incremental, or phase-wise with proper timelines?',
    options: withNA([
      { text: 'Fully planned with timelines', score: 5 },
      { text: 'Partially planned', score: 3 },
      { text: 'Not planned', score: 0 }
    ]),
    triggerCondition: isNSI
  },
  {
    id: 'MIG-06', principle: 'Migration',
    question: 'Are all stakeholders and teams aligned on migration dependencies and responsibilities?',
    options: withNA([
      { text: 'Fully aligned', score: 5 },
      { text: 'Partially aligned', score: 3 },
      { text: 'Not aligned', score: 0 }
    ]),
    triggerCondition: isNSI
  },

  // ═══════════════════════ PORTABILITY ═══════════════════════
  {
    id: 'PORT-01', principle: 'Portability',
    question: 'Are portability frameworks in place for schema segregation, normalization, and CAP considerations?',
    options: withNA([
      { text: 'Fully addressed', score: 5 },
      { text: 'Partially addressed', score: 3 },
      { text: 'Not addressed', score: 0 }
    ])
  },
  {
    id: 'PORT-02', principle: 'Portability',
    question: 'Does portability cover data models, tech stacks, and environments?',
    options: withNA([
      { text: 'Fully covered', score: 5 },
      { text: 'Partially covered', score: 3 },
      { text: 'Not covered', score: 0 }
    ])
  },
  {
    id: 'PORT-03', principle: 'Portability',
    question: 'Are open-source dependencies, licensing, and versioning identified?',
    options: withNA([
      { text: 'Fully identified', score: 5 },
      { text: 'Partially identified', score: 3 },
      { text: 'Not identified', score: 0 }
    ])
  },
  {
    id: 'PORT-04', principle: 'Portability',
    question: 'Are portability strategies like ESCROW, SaaS risk assessment, and compliance measures implemented?',
    options: withNA([...STANDARD_OPTIONS]),
    triggerCondition: isCloudHosted
  },
  {
    id: 'PORT-05', principle: 'Portability',
    question: 'Are vendor and internal teams aligned for portability support and SLA management?',
    options: withNA([
      { text: 'Fully aligned', score: 5 },
      { text: 'Partially aligned', score: 3 },
      { text: 'Not aligned', score: 0 }
    ])
  },
  {
    id: 'PORT-06', principle: 'Portability',
    question: 'Are timelines and frameworks for portability aligned with upgrades or decommissioning?',
    options: withNA([
      { text: 'Fully aligned', score: 5 },
      { text: 'Partially aligned', score: 3 },
      { text: 'Not aligned', score: 0 }
    ])
  },

  // ═══════════════════════ API ═══════════════════════
  {
    id: 'API-01', principle: 'API',
    question: 'Are APIs designed for interoperability, capability extension, or BaaS services?',
    options: withNA([
      { text: 'Fully aligned with purpose', score: 5 },
      { text: 'Partially aligned', score: 3 },
      { text: 'Not aligned', score: 0 }
    ])
  },
  {
    id: 'API-02', principle: 'API',
    question: 'Are APIs deployed on gateways like Apigee, OBP, or local gateways?',
    options: withNA([
      { text: 'Fully deployed', score: 5 },
      { text: 'Partially deployed', score: 3 },
      { text: 'Not deployed', score: 0 }
    ])
  },
  {
    id: 'API-03', principle: 'API',
    question: 'Are API types (REST, SOAP, sync, async, batch) clearly defined?',
    options: withNA([
      { text: 'Fully defined', score: 5 },
      { text: 'Partially defined', score: 3 },
      { text: 'Not defined', score: 0 }
    ])
  },
  {
    id: 'API-04', principle: 'API',
    question: 'Are API practices like versioning, encryption, fault tolerance, and observability implemented?',
    options: withNA([...STANDARD_OPTIONS])
  },
  {
    id: 'API-05', principle: 'API',
    question: 'Are dependent teams and external users aligned for API usage and documentation?',
    options: withNA([
      { text: 'Fully aligned', score: 5 },
      { text: 'Partially aligned', score: 3 },
      { text: 'Not aligned', score: 0 }
    ])
  },
  {
    id: 'API-06', principle: 'API',
    question: 'Are API testing and usage planned for BOD/EOD or lean business hours?',
    options: withNA([
      { text: 'Fully planned', score: 5 },
      { text: 'Partially planned', score: 3 },
      { text: 'Not planned', score: 0 }
    ])
  },

  // ═══════════════════════ TESTING ═══════════════════════
  {
    id: 'TEST-01', principle: 'Testing',
    question: 'Are testing objectives like regression, negative, and payload tests clearly defined?',
    options: withNA([
      { text: 'Fully defined', score: 5 },
      { text: 'Partially defined', score: 3 },
      { text: 'Not defined', score: 0 }
    ])
  },
  {
    id: 'TEST-02', principle: 'Testing',
    question: 'Are tests conducted across environments, backups, and failover setups?',
    options: withNA([
      { text: 'Fully conducted', score: 5 },
      { text: 'Partially conducted', score: 3 },
      { text: 'Not conducted', score: 0 }
    ])
  },
  {
    id: 'TEST-03', principle: 'Testing',
    question: 'Are testing types like DR drills, A/B testing, and restoration testing considered?',
    options: withNA([
      { text: 'Fully considered', score: 5 },
      { text: 'Partially considered', score: 3 },
      { text: 'Not considered', score: 0 }
    ])
  },
  {
    id: 'TEST-04', principle: 'Testing',
    question: 'Are automated tools and manual checks used for comprehensive testing?',
    options: withNA([...STANDARD_OPTIONS])
  },
  {
    id: 'TEST-05', principle: 'Testing',
    question: 'Are QA teams and dependent teams aligned for test cases and results?',
    options: withNA([
      { text: 'Fully aligned', score: 5 },
      { text: 'Partially aligned', score: 3 },
      { text: 'Not aligned', score: 0 }
    ])
  },
  {
    id: 'TEST-06', principle: 'Testing',
    question: 'Is testing scheduled during appropriate business hours or downtime windows?',
    options: withNA([
      { text: 'Fully scheduled', score: 5 },
      { text: 'Partially scheduled', score: 3 },
      { text: 'Not scheduled', score: 0 }
    ])
  },

  // ═══════════════════════ DATA MODELS ═══════════════════════
  {
    id: 'DATA-01', principle: 'Data Models',
    question: 'Is schema segregation, read vs write separation, and normalization properly designed?',
    options: withNA([
      { text: 'Fully designed', score: 5 },
      { text: 'Partially designed', score: 3 },
      { text: 'Not designed', score: 0 }
    ])
  },
  {
    id: 'DATA-02', principle: 'Data Models',
    question: 'Are OLTP/OLAP, CQRS, and CAP theorem considerations addressed in the data architecture?',
    options: withNA([
      { text: 'Fully addressed', score: 5 },
      { text: 'Partially addressed', score: 3 },
      { text: 'Not addressed', score: 0 }
    ])
  },

  // ═══════════════════════ TECH OBSOLESCENCE ═══════════════════════
  {
    id: 'TECHOBS-01', principle: 'Tech Obsolescence',
    question: 'Are all technology components documented with versioning, EOL/EOS dates, and licensing?',
    options: withNA([
      { text: 'Fully documented', score: 5 },
      { text: 'Partially documented', score: 3 },
      { text: 'Not documented', score: 0 }
    ])
  },
  {
    id: 'TECHOBS-02', principle: 'Tech Obsolescence',
    question: 'Is Software Composition Analysis (SCA) in place for vulnerability scanning?',
    options: withNA([...STANDARD_OPTIONS])
  },

  // ═══════════════════════ OUTSOURCING ═══════════════════════
  {
    id: 'OUTS-01', principle: 'Outsourcing',
    question: 'Are ESCROW agreements, SLAs, BCP, and exit plans in place for outsourced components?',
    options: withNA([
      { text: 'Fully in place', score: 5 },
      { text: 'Partially in place', score: 3 },
      { text: 'Not in place', score: 0 }
    ]),
    triggerCondition: isNSI
  },

  // ═══════════════════════ CAPABILITY DEDUPE ═══════════════════════
  {
    id: 'DEDUPE-01', principle: 'Capability Dedupe',
    question: 'Has the EA team verified that no existing application in the bank provides the same capabilities?',
    options: withNA([
      { text: 'Verified — no overlap', score: 5 },
      { text: 'Partial overlap identified with justification', score: 3 },
      { text: 'Not verified', score: 0 }
    ]),
    triggerCondition: isNSI
  },

  // ═══════════════════════ VAPT / APPSEC ═══════════════════════
  {
    id: 'VAPT-01', principle: 'VAPT / AppSec',
    question: 'Has a third-party VAPT been conducted and certified?',
    options: withNA([
      { text: 'Fully certified', score: 5 },
      { text: 'In progress', score: 3 },
      { text: 'Not conducted', score: 0 }
    ])
  },
];

/**
 * Filters the question bank based on review metadata.
 * Questions without a triggerCondition are always included.
 * Questions with a triggerCondition are only included if it returns true.
 */
export function getFilteredQuestions(metadata: DDQMetadata): DDQQuestion[] {
  return DDQ_QUESTION_BANK.filter(q => {
    if (!q.triggerCondition) return true;
    return q.triggerCondition(metadata);
  });
}

/**
 * Returns the list of unique design principles present in the question bank.
 */
export function getDesignPrinciples(): string[] {
  return [...new Set(DDQ_QUESTION_BANK.map(q => q.principle))];
}
