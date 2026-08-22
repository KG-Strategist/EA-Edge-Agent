# Project Memory Graph — Schema

> ODF-inspired node-edge graph for contextual agent memory.
> Every entity in the project is a node. Every relationship is an edge.

## Node Format (JSON)

```json
{
  "id": "unique-kebab-id",
  "type": "component|file|decision|issue|config|gate|test|spec|wasm|model",
  "name": "Human Readable Name",
  "path": "src/path/to/file.ts",
  "description": "What this is",
  "tags": ["tag1", "tag2"],
  "status": "active|deprecated|blocked|pending",
  "created": "2026-04-17",
  "last_verified": "2026-08-11"
}
```

## Node Types

| Type | Description | Example |
|------|-------------|---------|
| `component` | A major subsystem or engine | `ai-engine`, `ocr-pipeline` |
| `file` | A specific source file | `src/lib/networkGuard.ts` |
| `decision` | An architectural decision | `decide-use-zoh-search` |
| `issue` | A known issue or blocker | `ocr-model-cer-above-gate` |
| `config` | A configuration file or gate | `ci-workflow`, `eslint-config` |
| `gate` | A CI/quality gate | `lint-gate`, `tsc-gate` |
| `test` | A test file or suite | `vitest-unit-tests` |
| `spec` | A TSD spec document | `tsd-039-sovereign-tensor-core` |
| `wasm` | A WASM module or build | `eaniti-engine-wasm` |
| `model` | An ML/AI model asset | `ocr-recognizer-int8` |

## Edge Format (JSON)

```json
{
  "id": "unique-edge-id",
  "from": "source-node-id",
  "to": "target-node-id",
  "relation": "depends-on|blocks|implements|derived-from|tests|guards|breaks|builds-from|reads|writes|owns",
  "description": "Why this edge exists",
  "verified": true
}
```

## Edge Relations

| Relation | Meaning |
|----------|---------|
| `depends-on` | A needs B to function |
| `blocks` | A prevents B from completing |
| `implements` | A is the implementation of spec B |
| `derived-from` | A was generated from B |
| `tests` | A tests B |
| `guards` | A protects/secures B |
| `breaks` | A change in B breaks A |
| `builds-from` | A is compiled/built from B |
| `reads` | A reads data from B |
| `writes` | A writes data to B |
| `owns` | A is the authority for B |

## Context Loading

When working on any file/component:
1. Find the node by path or id
2. Traverse all edges (in + out, 2 hops deep)
3. Load connected nodes' descriptions + TSD specs
4. Return a contextual brief

Run: `node .memory/scripts/context-loader.mjs <file-or-node-id>`
