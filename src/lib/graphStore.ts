/**
 * GraphRAG — Graph Store
 *
 * Standalone graph module with O(1) neighbor lookup via flat typed arrays.
 * Supports multi-hop BFS traversal and PageRank-lite evidence ranking.
 * Integrates with SemanticArena's causal graph for chained reasoning.
 *
 * Architecture: Layer 4 engine — zero React imports, async return promises.
 */

import { Logger } from './logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: number;
  subject: string;
  predicate: string;
  object: string;
  beliefState: number; // 1=unverified, 2=verified, 3=axiom
  source: string;
}

export interface GraphEdge {
  from: number;
  to: number;
  type: 'causes' | 'requires' | 'implies' | 'conflicts';
  strength: number; // 0..255
}

export interface EvidenceTrail {
  nodes: GraphNode[];
  edges: GraphEdge[];
  score: number; // PageRank-lite confidence
  depth: number; // hop count
}

export interface MultiHopResult {
  trails: EvidenceTrail[];
  queryNode: number;
  maxDepth: number;
  totalNodesVisited: number;
}

// ---------------------------------------------------------------------------
// Graph Store — flat typed-array adjacency
// ---------------------------------------------------------------------------

const NULL_POINTER = 0xFFFFFFFF;
// Modest defaults keep the eager global singleton cheap to import
// (<1MB typed arrays) on low-RAM devices. Pass explicit sizes for
// larger graphs; addNode/addEdge return -1 past capacity.
const MAX_EDGES_DEFAULT = 16_384;
const MAX_NODES_DEFAULT = 4_096;
// Hard caps for BFS bounds sanitization (WASM-trap prevention:
// autoregressive loops must enforce ceiling boundaries).
const MAX_BFS_DEPTH = 5;
const MAX_TRAILS_CAP = 50;

export class GraphStore {
  // Adjacency: for each node, head of singly-linked edge list
  private firstEdge: Uint32Array;
  private nextEdge: Uint32Array;
  private edgeTo: Uint32Array;
  private edgeType: Uint8Array;
  private edgeStrength: Uint8Array;
  private edgeCount = 0;
  private maxEdges: number;

  // Node metadata
  private nodeCount = 0;
  private maxNodes: number;
  private nodeSubject: string[];
  private nodePredicate: string[];
  private nodeObject: string[];
  private nodeBelief: Uint8Array;
  private nodeSource: string[];
  private nodeExists: Uint8Array;

  // PageRank-lite damping
  private static readonly DAMPING = 0.85;
  private static readonly ITERATIONS = 6;
  private pageRankScores: Float32Array;

  constructor(maxNodes = MAX_NODES_DEFAULT, maxEdges = MAX_EDGES_DEFAULT) {
    this.maxNodes = maxNodes;
    this.maxEdges = maxEdges;
    this.firstEdge = new Uint32Array(maxNodes).fill(NULL_POINTER);
    this.nextEdge = new Uint32Array(maxEdges).fill(NULL_POINTER);
    this.edgeTo = new Uint32Array(maxEdges);
    this.edgeType = new Uint8Array(maxEdges);
    this.edgeStrength = new Uint8Array(maxEdges);
    this.nodeSubject = new Array(maxNodes).fill('');
    this.nodePredicate = new Array(maxNodes).fill('');
    this.nodeObject = new Array(maxNodes).fill('');
    this.nodeBelief = new Uint8Array(maxNodes);
    this.nodeSource = new Array(maxNodes).fill('');
    this.nodeExists = new Uint8Array(maxNodes);
    this.pageRankScores = new Float32Array(maxNodes);
  }

  /**
   * Add a node to the graph. Returns the node ID, or -1 past capacity.
   * Belief states are clamped into the 0..3 range (0=empty, 1=unverified,
   * 2=verified, 3=axiom) so Uint8 storage can never wrap on bad input.
   */
  addNode(subject: string, predicate: string, object: string, beliefState: number, source: string = 'arena'): number {
    if (this.nodeCount >= this.maxNodes) {
      Logger.warn('[GraphStore] maxNodes reached, cannot add more nodes');
      return -1;
    }
    const id = this.nodeCount;
    this.nodeSubject[id] = subject;
    this.nodePredicate[id] = predicate;
    this.nodeObject[id] = object;
    this.nodeBelief[id] = Number.isFinite(beliefState)
      ? Math.max(0, Math.min(3, Math.floor(beliefState)))
      : 0;
    this.nodeSource[id] = source;
    this.nodeExists[id] = 1;
    this.nodeCount++;
    return id;
  }

  /**
   * Add a directed edge between two nodes. Returns the edge index,
   * or -1 for out-of-range endpoints, unknown nodes, or a full pool.
   */
  addEdge(from: number, to: number, type: GraphEdge['type'] = 'causes', strength: number = 200): number {
    if (!Number.isInteger(from) || !Number.isInteger(to)) return -1;
    if (from < 0 || to < 0 || from >= this.maxNodes || to >= this.maxNodes) return -1;
    if (this.edgeCount >= this.maxEdges) {
      Logger.warn('[GraphStore] maxEdges reached');
      return -1;
    }
    if (!this.nodeExists[from] || !this.nodeExists[to]) return -1;

    const typeMap: Record<string, number> = { causes: 0, requires: 1, implies: 2, conflicts: 3 };
    const idx = this.edgeCount;
    this.edgeTo[idx] = to;
    this.edgeType[idx] = typeMap[type] ?? 0;
    this.edgeStrength[idx] = Math.min(255, Math.max(0, strength));
    this.nextEdge[idx] = this.firstEdge[from];
    this.firstEdge[from] = idx;
    this.edgeCount++;
    return idx;
  }

  /**
   * Get all outgoing neighbors of a node (O(degree)).
   */
  getNeighbors(nodeId: number): { neighborId: number; edgeIdx: number }[] {
    if (!this.nodeExists[nodeId]) return [];
    const result: { neighborId: number; edgeIdx: number }[] = [];
    let eIdx = this.firstEdge[nodeId];
    while (eIdx !== NULL_POINTER) {
      result.push({ neighborId: this.edgeTo[eIdx], edgeIdx: eIdx });
      eIdx = this.nextEdge[eIdx];
    }
    return result;
  }

  /**
   * Get node metadata.
   */
  getNode(id: number): GraphNode | null {
    if (!this.nodeExists[id]) return null;
    return {
      id,
      subject: this.nodeSubject[id],
      predicate: this.nodePredicate[id],
      object: this.nodeObject[id],
      beliefState: this.nodeBelief[id],
      source: this.nodeSource[id],
    };
  }

  /**
   * BFS multi-hop traversal from a seed node.
   * Returns evidence trails up to `maxDepth` hops.
   * Bounds are sanitized (depth clamped to 0..5, trails to 1..50) so
   * autoregressive loops can never breach memory vectors (WASM-trap
   * prevention). Invalid seeds return an empty result, never throw.
   */
  multiHopBFS(seedId: number, maxDepth: number = 3, maxTrails: number = 10): MultiHopResult {
    const depthCap = Number.isFinite(maxDepth)
      ? Math.max(0, Math.min(MAX_BFS_DEPTH, Math.floor(maxDepth)))
      : 3;
    const trailCap = Number.isFinite(maxTrails)
      ? Math.max(1, Math.min(MAX_TRAILS_CAP, Math.floor(maxTrails)))
      : 10;
    if (!Number.isInteger(seedId) || seedId < 0 || seedId >= this.maxNodes || !this.nodeExists[seedId]) {
      return { trails: [], queryNode: seedId, maxDepth: depthCap, totalNodesVisited: 0 };
    }

    const visited = new Uint8Array(this.maxNodes);
    const depth = new Uint8Array(this.maxNodes);
    const parentEdge = new Int32Array(this.maxNodes).fill(-1);
    const parentNode = new Int32Array(this.maxNodes).fill(-1);
    const queue: number[] = [seedId];
    visited[seedId] = 1;
    depth[seedId] = 0;

    let totalVisited = 0;
    let head = 0;

    while (head < queue.length) {
      const current = queue[head++];
      totalVisited++;

      if (depth[current] >= depthCap) continue;

      const neighbors = this.getNeighbors(current);
      for (const { neighborId, edgeIdx } of neighbors) {
        if (visited[neighborId]) continue;
        visited[neighborId] = 1;
        depth[neighborId] = depth[current] + 1;
        parentNode[neighborId] = current;
        parentEdge[neighborId] = edgeIdx;
        queue.push(neighborId);
      }
    }

    // Extract trails from seed to each reachable node
    const trails: EvidenceTrail[] = [];
    for (let i = 1; i < queue.length; i++) {
      const nodeId = queue[i];
      const trailDepth = depth[nodeId];
      if (trailDepth === 0) continue;

      // Reconstruct path from seed to this node
      const pathNodes: GraphNode[] = [];
      const pathEdges: GraphEdge[] = [];
      let cur = nodeId;
      while (cur !== seedId) {
        const node = this.getNode(cur);
        if (node) pathNodes.unshift(node);
        const eIdx = parentEdge[cur];
        if (eIdx >= 0) {
          const typeNames: GraphEdge['type'][] = ['causes', 'requires', 'implies', 'conflicts'];
          pathEdges.unshift({
            from: parentNode[cur],
            to: cur,
            type: typeNames[this.edgeType[eIdx]] ?? 'causes',
            strength: this.edgeStrength[eIdx],
          });
        }
        cur = parentNode[cur];
      }
      // Add seed node at the start
      const seedNode = this.getNode(seedId);
      if (seedNode) pathNodes.unshift(seedNode);

      // Compute trail score: belief-weighted, depth-penalized
      const score = this.computeTrailScore(pathNodes, pathEdges, trailDepth);
      trails.push({ nodes: pathNodes, edges: pathEdges, score, depth: trailDepth });
    }

    // Sort by score descending, take top N
    trails.sort((a, b) => b.score - a.score);
    return {
      trails: trails.slice(0, trailCap),
      queryNode: seedId,
      maxDepth: depthCap,
      totalNodesVisited: totalVisited,
    };
  }

  /**
   * PageRank-lite: iterative scoring over the graph in O(n+e) per
   * iteration. Each pass distributes every live node's score once over
   * its outgoing edges (strength-weighted) instead of scanning all
   * pairs — the previous O(n^2) formulation could never scale past
   * toy graphs. Runs a fixed number of iterations (no convergence
   * check — bounded cost). Dangling nodes keep only the base share.
   */
  computePageRank(): Float32Array {
    const n = this.nodeCount;
    const scores = this.pageRankScores;
    const outDegree = new Uint32Array(n);

    // Compute out-degrees
    for (let i = 0; i < n; i++) {
      if (!this.nodeExists[i]) continue;
      let count = 0;
      let eIdx = this.firstEdge[i];
      while (eIdx !== NULL_POINTER) {
        count++;
        eIdx = this.nextEdge[eIdx];
      }
      outDegree[i] = count;
    }

    // Initialize uniform scores
    const initScore = n > 0 ? 1 / n : 0;
    for (let i = 0; i < n; i++) scores[i] = this.nodeExists[i] ? initScore : 0;

    // Iterative PageRank — one edge sweep per iteration
    const temp = new Float32Array(n);
    const base = n > 0 ? (1 - GraphStore.DAMPING) / n : 0;
    for (let iter = 0; iter < GraphStore.ITERATIONS; iter++) {
      for (let i = 0; i < n; i++) temp[i] = this.nodeExists[i] ? base : 0;
      for (let j = 0; j < n; j++) {
        if (!this.nodeExists[j] || outDegree[j] === 0 || scores[j] === 0) continue;
        const contrib = (GraphStore.DAMPING * scores[j]) / outDegree[j];
        let eIdx = this.firstEdge[j];
        while (eIdx !== NULL_POINTER) {
          const to = this.edgeTo[eIdx];
          if (to < n && this.nodeExists[to]) {
            temp[to] += contrib * (this.edgeStrength[eIdx] / 255);
          }
          eIdx = this.nextEdge[eIdx];
        }
      }
      for (let i = 0; i < n; i++) scores[i] = temp[i];
    }

    return scores;
  }

  /**
   * Find seed node matching a subject string (exact or substring).
   */
  findNodeBySubject(subject: string): number {
    const lower = subject.toLowerCase();
    for (let i = 0; i < this.nodeCount; i++) {
      if (!this.nodeExists[i]) continue;
      if (this.nodeSubject[i].toLowerCase() === lower) return i;
    }
    // Fallback: substring match
    for (let i = 0; i < this.nodeCount; i++) {
      if (!this.nodeExists[i]) continue;
      if (this.nodeSubject[i].toLowerCase().includes(lower)) return i;
    }
    return -1;
  }

  /**
   * Find seed node matching any of subject/predicate/object.
   */
  findNodeByTriplet(subject?: string, predicate?: string, object?: string): number {
    for (let i = 0; i < this.nodeCount; i++) {
      if (!this.nodeExists[i]) continue;
      const matchS = !subject || this.nodeSubject[i].toLowerCase() === subject.toLowerCase();
      const matchP = !predicate || this.nodePredicate[i].toLowerCase() === predicate.toLowerCase();
      const matchO = !object || this.nodeObject[i].toLowerCase() === object.toLowerCase();
      if (matchS && matchP && matchO) return i;
    }
    return -1;
  }

  get nodeSize(): number { return this.nodeCount; }
  get edgeSize(): number { return this.edgeCount; }

  /**
   * Check whether a directed edge already exists (O(degree) scan).
   * Used by hydration to avoid duplicate shared-entity links.
   */
  hasEdge(from: number, to: number): boolean {
    if (!Number.isInteger(from) || !Number.isInteger(to)) return false;
    if (from < 0 || from >= this.maxNodes || !this.nodeExists[from]) return false;
    let eIdx = this.firstEdge[from];
    while (eIdx !== NULL_POINTER) {
      if (this.edgeTo[eIdx] === to) return true;
      eIdx = this.nextEdge[eIdx];
    }
    return false;
  }
  // ---------------------------------------------------------------------------
  // Internal scoring
  // ---------------------------------------------------------------------------

  /**
   * Trail score = belief-weighted sum / depth-penalized.
   * Higher belief states and stronger edges produce higher scores.
   * Depth penalty discourages distant inferences.
   */
  private computeTrailScore(nodes: GraphNode[], edges: GraphEdge[], depth: number): number {
    if (nodes.length === 0) return 0;
    let beliefSum = 0;
    let strengthSum = 0;
    for (const node of nodes) beliefSum += node.beliefState;
    for (const edge of edges) strengthSum += edge.strength;

    const avgBelief = beliefSum / nodes.length;
    const avgStrength = edges.length > 0 ? strengthSum / edges.length : 128;
    const depthPenalty = 1 / (1 + depth * 0.3);

    return (avgBelief / 3) * (avgStrength / 255) * depthPenalty;
  }
}

// ---------------------------------------------------------------------------
// Singleton for global access
// ---------------------------------------------------------------------------

export const globalGraphStore = new GraphStore();

// ---------------------------------------------------------------------------
// Production hydration — bulk-load triplets (e.g. Dexie semantic_memory
// rows) into a store, linking nodes that share an entity so multi-hop BFS
// can traverse them. Pure function over plain data: no DB imports here,
// so unit tests and workers stay dependency-free. Callers (ragOrchestrator)
// own the once-flag, the row fetching, and the fail-silent contract.
// Idempotent: existing triplets are skipped, never duplicated.
// ---------------------------------------------------------------------------

export interface GraphTriplet {
  subject: string;
  predicate: string;
  object: string;
  beliefState?: number;
  source?: string;
}

export interface HydrationStats {
  nodesAdded: number;
  nodesSkipped: number;
  edgesAdded: number;
  truncated: boolean;
}

export interface HydrationOptions {
  /** Hard ceiling on triplets consumed per call (default 1000). */
  maxNodes?: number;
  /** Link nodes sharing an entity with bidirectional 'implies' edges. */
  linkSharedEntities?: boolean;
  /** Default belief when the triplet carries none (default 2 = verified). */
  defaultBelief?: number;
}

function normalizeEntity(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim();
}

/**
 * Bulk-load triplets into `store`. Returns counts; never throws —
 * malformed rows are skipped and capacity exhaustion sets `truncated`.
 */
export function hydrateGraphStore(
  store: GraphStore,
  triplets: GraphTriplet[],
  options: HydrationOptions = {},
): HydrationStats {
  const stats: HydrationStats = { nodesAdded: 0, nodesSkipped: 0, edgesAdded: 0, truncated: false };
  if (!Array.isArray(triplets) || triplets.length === 0) return stats;

  const maxNodes = Number.isFinite(options.maxNodes)
    ? Math.max(0, Math.floor(options.maxNodes as number))
    : 1000;
  const linkShared = options.linkSharedEntities !== false;
  const defaultBelief = Number.isFinite(options.defaultBelief) ? (options.defaultBelief as number) : 2;

  const consumed = triplets.slice(0, maxNodes);
  if (triplets.length > consumed.length) stats.truncated = true;

  // Entity index for shared-entity linking: entity -> node ids.
  // Includes pre-existing nodes so cross-call hydration still links.
  const entityIndex = new Map<string, number[]>();

  for (const t of consumed) {
    const subject = normalizeEntity(t.subject);
    const predicate = normalizeEntity(t.predicate);
    const object = normalizeEntity(t.object);
    if (!subject || !predicate || !object) {
      stats.nodesSkipped += 1;
      continue;
    }
    let id = store.findNodeByTriplet(subject, predicate, object);
    if (id >= 0) {
      stats.nodesSkipped += 1;
    } else {
      id = store.addNode(
        t.subject.trim(),
        t.predicate.trim(),
        t.object.trim(),
        Number.isFinite(t.beliefState) ? (t.beliefState as number) : defaultBelief,
        typeof t.source === 'string' && t.source ? t.source : 'semantic-memory',
      );
      if (id < 0) {
        stats.truncated = true; // store full — stop consuming
        break;
      }
      stats.nodesAdded += 1;
    }
    if (linkShared) {
      for (const entity of new Set([subject, predicate, object])) {
        const bucket = entityIndex.get(entity);
        if (bucket) {
          if (!bucket.includes(id)) bucket.push(id);
        } else {
          entityIndex.set(entity, [id]);
        }
      }
    }
  }

  if (linkShared) {
    for (const ids of entityIndex.values()) {
      const unique = [...new Set(ids)];
      for (let a = 0; a < unique.length; a++) {
        for (let b = a + 1; b < unique.length; b++) {
          // Bidirectional: shared-entity relatedness is symmetric, and BFS
          // follows outgoing edges — both directions must be traversable.
          // hasEdge guards keep re-hydration idempotent on the edge side.
          if (!store.hasEdge(unique[a], unique[b])) {
            if (store.addEdge(unique[a], unique[b], 'implies', 128) >= 0) stats.edgesAdded += 1;
            else stats.truncated = true;
          }
          if (!store.hasEdge(unique[b], unique[a])) {
            if (store.addEdge(unique[b], unique[a], 'implies', 128) >= 0) stats.edgesAdded += 1;
            else stats.truncated = true;
          }
        }
      }
    }
  }

  return stats;
}
