# Plan: graph-hydration — GraphStore production hydration

> Goal: wire the GraphStore scaffold to real data | Branch: `feat/graph-hydration`
> Roadmap: Stage 4 GraphRAG (early slice)

## Spec & contract ingestion
- `src/lib/graphStore.ts` (GraphStore, globalGraphStore, multiHopBFS)
- `src/lib/ragOrchestrator.ts` (processQuery fallback + multiHopQuery)
- `src/lib/SemanticArena.ts` (causal graph: causedBy/firstEffect/nextSiblingEffect)
- TSD-055 Paged Attention (scaffold status precedent — be honest about wiring)

## Blast-radius analysis
- Layer 4 only (graphStore, ragOrchestrator). No React. No DB version bump
  unless a new table is needed (prefer in-memory hydration first).
- `globalGraphStore` is imported by ragOrchestrator — keep import cost trivial
  (defaults 4096/16384, verified this cycle).
- Never block `processQuery` on hydration: hydrate lazily, cap nodes/edges,
  fail silent with flags (zero-throw engine law).

## Harness-first TDD
- `src/__tests__/graph-hydration.test.ts`:
  - hydration from a seeded arena snapshot builds N nodes / M edges
  - multiHopBFS over hydrated graph returns trails for a known subject
  - hydration of an empty/unavailable source returns empty, never throws
  - hydration is idempotent (second run adds no duplicates)

## Atomic implementation (sketch)
- `hydrateGraphStore(source)` in graphStore.ts: consume `{nodes, edges}`
  triplets (from SemanticArena causal links and/or Dexie semantic_memory),
  up to capacity, assign belief from source beliefState.
- Wire one lazy call site in ragOrchestrator (guarded, try/catch, once-flag).
- No new UI. No schema change in v1 (reassess if persistence is required).

## Regression proof
- New hydration tests + full 8-gate run (Node 22, sequential).
- Update ROADMAP + BUG_BACKLOG + engineer-state.json.
