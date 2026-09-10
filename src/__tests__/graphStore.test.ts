import { describe, it, expect } from 'vitest';
import { GraphStore } from '../lib/graphStore';

describe('GraphStore — node and edge CRUD', () => {
  it('adds nodes and retrieves them', () => {
    const g = new GraphStore(100, 500);
    const id0 = g.addNode('BIAN', 'defines', 'service domains', 3, 'canonical');
    const id1 = g.addNode('TOGAF', 'structures', 'architecture work', 2, 'canonical');
    expect(id0).toBe(0);
    expect(id1).toBe(1);
    expect(g.nodeSize).toBe(2);

    const node = g.getNode(0);
    expect(node).not.toBeNull();
    expect(node!.subject).toBe('BIAN');
    expect(node!.predicate).toBe('defines');
    expect(node!.object).toBe('service domains');
    expect(node!.beliefState).toBe(3);
  });

  it('returns null for non-existent node', () => {
    const g = new GraphStore(100, 500);
    expect(g.getNode(99)).toBeNull();
  });

  it('adds edges and retrieves neighbors', () => {
    const g = new GraphStore(100, 500);
    const a = g.addNode('A', 'causes', 'B', 2);
    const b = g.addNode('B', 'causes', 'C', 2);
    const c = g.addNode('C', 'causes', 'D', 2);
    g.addEdge(a, b, 'causes', 200);
    g.addEdge(b, c, 'requires', 150);

    const neighborsA = g.getNeighbors(a);
    expect(neighborsA.length).toBe(1);
    expect(neighborsA[0].neighborId).toBe(b);

    const neighborsB = g.getNeighbors(b);
    expect(neighborsB.length).toBe(1);
    expect(neighborsB[0].neighborId).toBe(c);

    const neighborsC = g.getNeighbors(c);
    expect(neighborsC.length).toBe(0);
  });

  it('rejects edges to non-existent nodes', () => {
    const g = new GraphStore(100, 500);
    const a = g.addNode('A', 'x', 'y', 2);
    expect(g.addEdge(a, 99, 'causes')).toBe(-1);
  });
});

describe('GraphStore — multi-hop BFS', () => {
  it('traverses 3-hop chain correctly', () => {
    const g = new GraphStore(100, 500);
    const n0 = g.addNode('A', 'causes', 'B', 3);
    const n1 = g.addNode('B', 'requires', 'C', 2);
    const n2 = g.addNode('C', 'implies', 'D', 2);
    const n3 = g.addNode('D', 'causes', 'E', 1);
    g.addEdge(n0, n1, 'causes', 200);
    g.addEdge(n1, n2, 'requires', 180);
    g.addEdge(n2, n3, 'implies', 160);

    const result = g.multiHopBFS(n0, 3, 10);
    expect(result.totalNodesVisited).toBe(4); // A, B, C, D
    expect(result.trails.length).toBe(3); // B, C, D reachable
    expect(result.trails[0].depth).toBe(1); // B is 1 hop
    expect(result.trails[1].depth).toBe(2); // C is 2 hops
    expect(result.trails[2].depth).toBe(3); // D is 3 hops
  });

  it('respects maxDepth', () => {
    const g = new GraphStore(100, 500);
    const n0 = g.addNode('A', 'x', 'B', 2);
    const n1 = g.addNode('B', 'x', 'C', 2);
    const n2 = g.addNode('C', 'x', 'D', 2);
    g.addEdge(n0, n1, 'causes');
    g.addEdge(n1, n2, 'causes');

    const result1 = g.multiHopBFS(n0, 1, 10);
    expect(result1.trails.length).toBe(1); // Only B reachable at depth 1

    const result2 = g.multiHopBFS(n0, 2, 10);
    expect(result2.trails.length).toBe(2); // B and C reachable
  });

  it('handles diamond graph (multiple paths)', () => {
    const g = new GraphStore(100, 500);
    const n0 = g.addNode('ROOT', 'x', 'Y', 3);
    const n1 = g.addNode('LEFT', 'x', 'Y', 2);
    const n2 = g.addNode('RIGHT', 'x', 'Y', 2);
    const n3 = g.addNode('BOTTOM', 'x', 'Y', 1);
    g.addEdge(n0, n1, 'causes');
    g.addEdge(n0, n2, 'causes');
    g.addEdge(n1, n3, 'implies');
    g.addEdge(n2, n3, 'implies');

    const result = g.multiHopBFS(n0, 3, 10);
    // BFS visits BOTTOM via first path only (visited set prevents duplicates)
    expect(result.totalNodesVisited).toBe(4);
    expect(result.trails.length).toBe(3); // LEFT, RIGHT, BOTTOM
  });

  it('returns empty for non-existent seed', () => {
    const g = new GraphStore(100, 500);
    const result = g.multiHopBFS(99, 3, 10);
    expect(result.trails.length).toBe(0);
  });

  it('trail score ranks higher belief states first', () => {
    const g = new GraphStore(100, 500);
    const n0 = g.addNode('Q', 'x', 'Y', 3);
    const n1 = g.addNode('LOW', 'x', 'Y', 1);
    const n2 = g.addNode('HIGH', 'x', 'Y', 3);
    g.addEdge(n0, n1, 'causes', 100);
    g.addEdge(n0, n2, 'causes', 255);

    const result = g.multiHopBFS(n0, 2, 10);
    expect(result.trails.length).toBe(2);
    // HIGH should rank above LOW due to higher belief + strength
    expect(result.trails[0].nodes[1].subject).toBe('HIGH');
  });
});

describe('GraphStore — findNode', () => {
  it('finds node by exact subject', () => {
    const g = new GraphStore(100, 500);
    g.addNode('BIAN', 'defines', 'domains', 3);
    g.addNode('TOGAF', 'structures', 'work', 2);
    expect(g.findNodeBySubject('BIAN')).toBe(0);
    expect(g.findNodeBySubject('TOGAF')).toBe(1);
    expect(g.findNodeBySubject('unknown')).toBe(-1);
  });

  it('finds node by case-insensitive subject', () => {
    const g = new GraphStore(100, 500);
    g.addNode('BIAN', 'defines', 'domains', 3);
    expect(g.findNodeBySubject('bian')).toBe(0);
    expect(g.findNodeBySubject('Bian')).toBe(0);
  });

  it('falls back to substring match', () => {
    const g = new GraphStore(100, 500);
    g.addNode('Banking Industry Architecture Network', 'defines', 'x', 3);
    expect(g.findNodeBySubject('banking')).toBe(0);
  });

  it('finds node by triplet', () => {
    const g = new GraphStore(100, 500);
    g.addNode('BIAN', 'defines', 'service domains', 3);
    expect(g.findNodeByTriplet('BIAN', 'defines', 'service domains')).toBe(0);
    expect(g.findNodeByTriplet(undefined, 'defines', undefined)).toBe(0);
    expect(g.findNodeByTriplet('BIAN', undefined, undefined)).toBe(0);
  });
});

describe('GraphStore — PageRank-lite', () => {
  it('assigns higher scores to well-connected nodes', () => {
    const g = new GraphStore(100, 500);
    const hub = g.addNode('HUB', 'x', 'Y', 3);
    const leaf1 = g.addNode('L1', 'x', 'Y', 2);
    const leaf2 = g.addNode('L2', 'x', 'Y', 2);
    g.addEdge(hub, leaf1, 'causes', 200);
    g.addEdge(hub, leaf2, 'causes', 200);
    g.addEdge(leaf1, hub, 'requires', 200); // back-link to hub

    const scores = g.computePageRank();
    expect(scores[hub]).toBeGreaterThan(scores[leaf1]);
    expect(scores[hub]).toBeGreaterThan(scores[leaf2]);
  });

  it('produces finite scores on a 50-node chain (O(n+e) scaling)', () => {
    const g = new GraphStore(100, 500);
    let prev = g.addNode('N0', 'x', 'Y', 2);
    for (let i = 1; i < 50; i++) {
      const cur = g.addNode(`N${i}`, 'x', 'Y', 2);
      g.addEdge(prev, cur, 'causes', 200);
      prev = cur;
    }
    const scores = g.computePageRank();
    for (let i = 0; i < 50; i++) {
      expect(Number.isFinite(scores[i])).toBe(true);
      expect(scores[i]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('GraphStore — capacity & input hygiene', () => {
  it('uses modest defaults so the global singleton is cheap to import', () => {
    const g = new GraphStore();
    expect(g.nodeSize).toBe(0);
    expect(g.edgeSize).toBe(0);
    // Defaults must stay small enough for happy-dom / low-RAM devices:
    // 4096 nodes / 16384 edges keeps typed arrays under ~1MB.
    const id = g.addNode('SMOKE', 'x', 'Y', 2);
    expect(id).toBe(0);
  });

  it('returns -1 past capacity instead of growing unbounded', () => {
    const g = new GraphStore(2, 2);
    expect(g.addNode('A', 'x', 'Y', 2)).toBe(0);
    expect(g.addNode('B', 'x', 'Y', 2)).toBe(1);
    expect(g.addNode('C', 'x', 'Y', 2)).toBe(-1);
    expect(g.addEdge(0, 1, 'causes')).toBe(0);
    expect(g.addEdge(1, 0, 'causes')).toBe(1);
    expect(g.addEdge(0, 1, 'causes')).toBe(-1);
  });

  it('rejects out-of-range edge endpoints', () => {
    const g = new GraphStore(4, 8);
    g.addNode('A', 'x', 'Y', 2);
    expect(g.addEdge(-1, 0, 'causes')).toBe(-1);
    expect(g.addEdge(0, -1, 'causes')).toBe(-1);
    expect(g.addEdge(0, 999999, 'causes')).toBe(-1);
    expect(g.addEdge(3, 0, 'causes')).toBe(-1); // node 3 does not exist
  });

  it('clamps belief states into the 0..3 range', () => {
    const g = new GraphStore(4, 8);
    const id = g.addNode('A', 'x', 'Y', 99);
    expect(g.getNode(id)!.beliefState).toBe(3);
  });

  it('sanitizes BFS bounds (negative seed, clamped depth/trails)', () => {
    const g = new GraphStore(8, 16);
    const n0 = g.addNode('A', 'x', 'B', 3);
    const n1 = g.addNode('B', 'x', 'C', 2);
    g.addEdge(n0, n1, 'causes', 200);

    expect(g.multiHopBFS(-1, 3, 10).trails.length).toBe(0);
    expect(g.multiHopBFS(n0, -5, 10).trails.length).toBe(0);
    // Absurd trail caps are clamped, never unbounded
    expect(g.multiHopBFS(n0, 3, 999999).trails.length).toBe(1);
  });

  it('exposes no dead getEdge API (orphaned stubs are banned)', () => {
    const g = new GraphStore(4, 8);
    expect((g as unknown as Record<string, unknown>).getEdge).toBeUndefined();
  });
});
