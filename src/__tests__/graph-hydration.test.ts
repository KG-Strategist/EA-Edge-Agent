import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphStore, hydrateGraphStore } from '../lib/graphStore';

vi.mock('../lib/db', () => ({
  db: {
    semantic_memory: {
      orderBy: vi.fn(() => ({
        reverse: vi.fn(() => ({
          limit: vi.fn(() => ({
            toArray: vi.fn(async () => [
              {
                subject: 'BIAN',
                predicate: 'defines',
                object: 'service domains',
                beliefState: 3,
                source: 'epistemic_engine',
                createdAt: new Date(),
              },
              {
                subject: 'service domains',
                predicate: 'compose',
                object: 'banking capabilities',
                beliefState: 2,
                source: 'epistemic_engine',
                createdAt: new Date(),
              },
            ]),
          })),
        })),
      })),
    },
    app_settings: { get: vi.fn(async () => undefined) },
  },
}));

describe('Graph hydration — hydrateGraphStore', () => {
  it('builds nodes and shared-entity edges from triplets', () => {
    const g = new GraphStore(64, 256);
    const stats = hydrateGraphStore(g, [
      { subject: 'BIAN', predicate: 'defines', object: 'service domains', beliefState: 3 },
      { subject: 'service domains', predicate: 'compose', object: 'banking capabilities', beliefState: 2 },
    ]);
    expect(stats.nodesAdded).toBe(2);
    expect(stats.edgesAdded).toBeGreaterThan(0);

    // Shared entity "service domains" must yield a 2-hop trail BIAN → … → banking capabilities
    const seed = g.findNodeBySubject('BIAN');
    expect(seed).toBeGreaterThanOrEqual(0);
    const result = g.multiHopBFS(seed, 3, 10);
    expect(result.trails.length).toBeGreaterThan(0);
    const reachesTarget = result.trails.some((t) =>
      t.nodes.some((n) => n.object === 'banking capabilities')
    );
    expect(reachesTarget).toBe(true);
  });

  it('is idempotent — second hydration adds nothing', () => {
    const g = new GraphStore(64, 256);
    const triplets = [
      { subject: 'A', predicate: 'x', object: 'B', beliefState: 2 },
    ];
    const first = hydrateGraphStore(g, triplets);
    const second = hydrateGraphStore(g, triplets);
    expect(first.nodesAdded).toBe(1);
    expect(second.nodesAdded).toBe(0);
    expect(second.nodesSkipped).toBe(1);
  });

  it('skips empty triplets and never throws on empty input', () => {
    const g = new GraphStore(64, 256);
    const stats = hydrateGraphStore(g, [
      { subject: '', predicate: '', object: '' },
      { subject: '  ', predicate: 'x', object: 'Y' },
    ]);
    expect(stats.nodesAdded).toBe(0);
    expect(hydrateGraphStore(g, []).nodesAdded).toBe(0);
  });

  it('respects maxNodes and reports truncation', () => {
    const g = new GraphStore(64, 256);
    const triplets = Array.from({ length: 10 }, (_, i) => ({
      subject: `S${i}`,
      predicate: 'x',
      object: `O${i}`,
      beliefState: 2,
    }));
    const stats = hydrateGraphStore(g, triplets, { maxNodes: 3 });
    expect(stats.nodesAdded).toBe(3);
    expect(stats.truncated).toBe(true);
  });
});

describe('Graph hydration — ensureGraphHydrated', () => {
  beforeEach(async () => {
    const { __resetGraphHydrationForTests } = await import('../lib/ragOrchestrator');
    __resetGraphHydrationForTests();
  });

  it('hydrates the global store from semantic_memory once', async () => {
    const { ensureGraphHydrated, multiHopQuery } = await import('../lib/ragOrchestrator');
    const { globalGraphStore } = await import('../lib/graphStore');

    const stats = await ensureGraphHydrated(10);
    expect(stats).not.toBeNull();
    expect(stats!.nodesAdded).toBe(2);
    expect(globalGraphStore.findNodeBySubject('BIAN')).toBeGreaterThanOrEqual(0);

    // Second call is a free no-op (once-flag)
    expect(await ensureGraphHydrated(10)).toBeNull();

    // End-to-end: multi-hop query traverses hydrated edges
    const answer = await multiHopQuery('What does BIAN define?', 3, 5);
    expect(answer.status).toBe('hit');
    expect(answer.trails!.length).toBeGreaterThan(0);
  });
});
