#!/usr/bin/env node
/**
 * context-loader.mjs — ODF-like graph context loader.
 *
 * Given a file path or node ID, traverses the project-memory graph
 * and returns all relevant context: connected nodes, edges, TSD specs,
 * related decisions, known issues.
 *
 * Usage:
 *   node context-loader.mjs src/lib/aiEngine.ts
 *   node context-loader.mjs ai-engine
 *   node context-loader.mjs --full  (dump entire graph)
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const MEMORY = resolve(__dirname, '..');
const NODES_DIR = resolve(MEMORY, 'nodes');
const EDGES_DIR = resolve(MEMORY, 'edges');
const TSD_DIR = resolve(ROOT, '.artefacts/docs-internal/tsd');

function loadJSON(dir) {
  const items = [];
  if (!existsSync(dir)) return items;
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.json')) {
      try {
        const data = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
        if (Array.isArray(data)) items.push(...data);
      } catch { /* skip malformed */ }
    }
  }
  return items;
}

function findNodeByPath(nodes, filePath) {
  const abs = resolve(ROOT, filePath);
  const rel = relative(ROOT, abs);
  return nodes.find(n => n.path && (n.path === rel || n.path === filePath));
}

function findNodeById(nodes, id) {
  return nodes.find(n => n.id === id);
}

function findNodeByFuzzy(nodes, query) {
  // Try exact match first
  const byId = findNodeById(nodes, query);
  if (byId) return byId;

  // Try path match
  const byPath = findNodeByPath(nodes, query);
  if (byPath) return byPath;

  // Try fuzzy: query appears in id, name, or path
  const q = query.toLowerCase();
  return nodes.find(n =>
    n.id.toLowerCase().includes(q) ||
    n.name.toLowerCase().includes(q) ||
    (n.path && n.path.toLowerCase().includes(q))
  );
}

function traverseEdges(edges, nodeId, depth = 2) {
  const visited = new Set();
  const result = { incoming: [], outgoing: [] };

  function walk(id, currentDepth) {
    if (currentDepth > depth || visited.has(id)) return;
    visited.add(id);

    for (const e of edges) {
      if (e.to === id) {
        result.incoming.push(e);
        if (currentDepth < depth) walk(e.from, currentDepth + 1);
      }
      if (e.from === id) {
        result.outgoing.push(e);
        if (currentDepth < depth) walk(e.to, currentDepth + 1);
      }
    }
  }

  walk(nodeId, 1);
  return result;
}

function findRelatedTSDs(node) {
  if (!existsSync(TSD_DIR)) return [];
  const related = [];
  const tags = node.tags || [];
  const name = (node.name || '').toLowerCase();
  const desc = (node.description || '').toLowerCase();

  // Walk TSD directories
  for (const dir of readdirSync(TSD_DIR)) {
    const dirPath = resolve(TSD_DIR, dir);
    if (!statSync(dirPath).isDirectory()) continue;

    for (const f of readdirSync(dirPath)) {
      if (!f.endsWith('.md')) continue;
      const content = readFileSync(resolve(dirPath, f), 'utf8').toLowerCase();
      const score = tags.reduce((s, t) => s + (content.includes(t.toLowerCase()) ? 1 : 0), 0)
        + (content.includes(name) ? 2 : 0)
        + (content.split(desc.split('.')[0].toLowerCase()).length - 1);

      if (score > 0) {
        related.push({
          path: `.artefacts/docs-internal/tsd/${dir}/${f}`,
          score,
          snippet: content.slice(0, 200),
        });
      }
    }
  }

  return related.sort((a, b) => b.score - a.score).slice(0, 5);
}

function formatContext(node, edges, tsds) {
  const lines = [];
  lines.push(`# Context: ${node.name}`);
  lines.push(`> Type: ${node.type} | Status: ${node.status} | Last verified: ${node.last_verified}`);
  lines.push('');

  // Description
  lines.push('## What This Is');
  lines.push(node.description || '(no description)');
  lines.push('');

  // Path
  if (node.path) {
    lines.push('## File');
    lines.push(`\`${node.path}\``);
    lines.push('');
  }

  // Tags
  if (node.tags && node.tags.length) {
    lines.push('## Tags');
    lines.push(node.tags.join(', '));
    lines.push('');
  }

  // Edges
  if (edges.incoming.length || edges.outgoing.length) {
    lines.push('## Relationships');
    for (const e of edges.outgoing) {
      lines.push(`- **${e.relation}** → \`${e.to}\` — ${e.description}`);
    }
    for (const e of edges.incoming) {
      lines.push(`- **${e.relation}** ← \`${e.from}\` — ${e.description}`);
    }
    lines.push('');
  }

  // Related TSD specs
  if (tsds.length) {
    lines.push('## Related TSD Specs (read before modifying)');
    for (const t of tsds) {
      lines.push(`- \`${t.path}\` (relevance: ${t.score})`);
    }
    lines.push('');
  }

  // Security invariants
  lines.push('## Security Invariants');
  lines.push('- All network calls: `await checkNetworkConsent()` + `validateEndpointUrl()`');
  lines.push('- User prompts: `epistemicShadow.interrupt()`');
  lines.push('- DEKs: RAM only, wrapping keys in IndexedDB');
  lines.push('- Logging: `logger.ts`, never `console.log`');
  lines.push('');

  return lines.join('\n');
}

function formatFullGraph(nodes, edges) {
  const lines = [];
  lines.push('# Full Project Memory Graph');
  lines.push(`> ${nodes.length} nodes, ${edges.length} edges`);
  lines.push('');

  const byType = {};
  for (const n of nodes) {
    (byType[n.type] = byType[n.type] || []).push(n);
  }

  for (const [type, items] of Object.entries(byType).sort()) {
    lines.push(`## ${type.charAt(0).toUpperCase() + type.slice(1)}s (${items.length})`);
    for (const n of items) {
      const status = n.status === 'active' ? '' : ` [${n.status}]`;
      lines.push(`- **${n.id}**${status}: ${n.name}`);
      if (n.path) lines.push(`  \`${n.path}\``);
    }
    lines.push('');
  }

  lines.push('## Edges');
  for (const e of edges) {
    lines.push(`- \`${e.from}\` —[${e.relation}]→ \`${e.to}\` — ${e.description}`);
  }

  return lines.join('\n');
}

// ─── CLI ────────────────────────────────────────────

const query = process.argv[2];

if (!query) {
  console.log('Usage: node context-loader.mjs <file-or-node-id>');
  console.log('       node context-loader.mjs --full');
  process.exit(1);
}

const nodes = loadJSON(NODES_DIR);
const edges = loadJSON(EDGES_DIR);

if (query === '--full') {
  console.log(formatFullGraph(nodes, edges));
  process.exit(0);
}

const node = findNodeByFuzzy(nodes, query);
if (!node) {
  console.error(`No node found for: ${query}`);
  console.error('Available nodes:');
  for (const n of nodes) console.error(`  ${n.id} (${n.type}): ${n.name}`);
  process.exit(1);
}

const edgeResult = traverseEdges(edges, node.id);
const tsds = findRelatedTSDs(node);
console.log(formatContext(node, edgeResult, tsds));
