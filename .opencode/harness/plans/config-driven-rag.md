# Plan: config-driven-rag — Config-driven RAG intelligence

> Goal: UI-configurable RAG chunkSize/chunkOverlap (+ surface maxPromptChars) | Branch: `feat/config-driven-rag`
> Roadmap: Stage 1.3 Config-Driven Intelligence

## Spec & contract ingestion
- `src/lib/seedData.ts` (maxPromptChars precedent: get-or-seed pattern)
- `src/lib/db.ts` (app_settings table; version via nextVersionAfter — NO new
  table needed, settings are key/value rows)
- Ingestion chunking call sites (find during implementation: grep chunk)
- `src/components/admin/AgentConfigTab.tsx` (existing settings editors)

## Blast-radius analysis
- New keys only (`ragChunkSize`, `ragChunkOverlap`); seeded defaults preserve
  current behavior exactly. No schema version bump (key/value rows).
- Readers fall back to compiled defaults when keys are absent (fresh/old DBs).
- Admin UI additions follow existing editor patterns in AgentConfigTab.

## Harness-first TDD
- Seed test: defaults seeded on fresh DB, never overwrite user values.
- Reader test: absent key → compiled default; present key → stored value.
- Validation test: clamp absurd values (e.g. chunkSize < 64 or > 8192).

## Atomic implementation (sketch)
- Seed defaults in seedData.ts; typed readers in the ingestion path;
  numeric editors in AgentConfigTab with the same styling/validation.

## Regression proof
- New seed/reader tests + full 8 gates. Update ROADMAP + BUG_BACKLOG.
