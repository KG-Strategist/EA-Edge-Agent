import { Logger } from './logger';

// ── NITI-Pedia wiki store (v1.2 M4) ───────────────────────────────────────────
// OPFS-backed markdown knowledge base (`niti-pedia/` directory). Pages are
// `<slug>.md` files; the first `# Title` line is the title. Retrieval
// (search/ask) is deterministic keyword scoring — no model dependency.

export const WIKI_DIR = 'niti-pedia';

export interface WikiPage {
  slug: string;
  title: string;
  body: string;
  updatedAt: number;
}

export interface WikiHit {
  page: WikiPage;
  score: number;
  excerpt: string;
}

// ── Pure helpers (unit-tested) ────────────────────────────────────────────────

export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'untitled';
}

export function serializePage(title: string, body: string): string {
  return `# ${title.trim()}\n\n${body.replace(/\s+$/, '')}\n`;
}

export function parsePageFile(slug: string, text: string, updatedAt: number): WikiPage {
  const lines = text.split('\n');
  let title = slug;
  let bodyStart = 0;
  if (lines[0]?.startsWith('# ')) {
    title = lines[0].slice(2).trim() || slug;
    bodyStart = lines[1]?.trim() === '' ? 2 : 1;
  }
  return { slug, title, body: lines.slice(bodyStart).join('\n').trim(), updatedAt };
}

export function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

function countHits(text: string, tokens: string[]): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const token of tokens) {
    let idx = 0;
    while ((idx = lower.indexOf(token, idx)) !== -1) {
      hits++;
      idx += token.length;
    }
  }
  return hits;
}

export function scorePage(page: WikiPage, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  return countHits(page.title, tokens) * 3 + countHits(page.body, tokens);
}

export function buildExcerpt(page: WikiPage, tokens: string[], radius = 72): string {
  if (tokens.length === 0) return page.body.slice(0, radius * 2);
  const lower = page.body.toLowerCase();
  let first = -1;
  for (const token of tokens) {
    const idx = lower.indexOf(token);
    if (idx !== -1 && (first === -1 || idx < first)) first = idx;
  }
  if (first === -1) {
    const titleHit = tokens.some((t) => page.title.toLowerCase().includes(t));
    return titleHit ? `(title match) ${page.body.slice(0, radius * 2)}` : page.body.slice(0, radius * 2);
  }
  const start = Math.max(0, first - radius);
  const end = Math.min(page.body.length, first + radius);
  return `${start > 0 ? '… ' : ''}${page.body.slice(start, end).trim()}${end < page.body.length ? ' …' : ''}`;
}

/** Rank pages for a query; returns top-N hits with score > 0. */
export function rankPages(pages: WikiPage[], query: string, topN = 3): WikiHit[] {
  const tokens = tokenizeQuery(query);
  return pages
    .map((page) => ({ page, score: scorePage(page, tokens), excerpt: buildExcerpt(page, tokens) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

// ── OPFS I/O ──────────────────────────────────────────────────────────────────

export function isWikiSupported(): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof (navigator as any).storage?.getDirectory === 'function'
    );
  } catch {
    return false;
  }
}

async function wikiDir(create: boolean): Promise<any> {
  if (!isWikiSupported()) throw new Error('OPFS is not supported in this browser.');
  const root: any = await (navigator as any).storage.getDirectory();
  return root.getDirectoryHandle(WIKI_DIR, { create });
}

function assertSlug(slug: string): void {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new Error(`Invalid wiki slug: ${slug}`);
}

export async function listPages(): Promise<WikiPage[]> {
  try {
    const dir = await wikiDir(false);
    const pages: WikiPage[] = [];
    for await (const [name, handle] of dir.values()) {
      if (typeof name !== 'string' || !name.endsWith('.md')) continue;
      try {
        const file = await handle.getFile();
        const text = await file.text();
        pages.push(parsePageFile(name.slice(0, -3), text, file.lastModified));
      } catch (e) {
        Logger.error(`Wiki: failed to read ${name}`, e);
      }
    }
    return pages.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') return [];
    throw e;
  }
}

export async function getPage(slug: string): Promise<WikiPage | null> {
  assertSlug(slug);
  try {
    const dir = await wikiDir(false);
    const handle = await dir.getFileHandle(`${slug}.md`);
    const file = await handle.getFile();
    return parsePageFile(slug, await file.text(), file.lastModified);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotFoundError') return null;
    throw e;
  }
}

export async function savePage(title: string, body: string, slug?: string): Promise<WikiPage> {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error('Wiki page needs a title.');
  const finalSlug = slug ?? slugifyTitle(cleanTitle);
  assertSlug(finalSlug);
  const dir = await wikiDir(true);
  const handle = await dir.getFileHandle(`${finalSlug}.md`, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(serializePage(cleanTitle, body));
  } finally {
    await writable.close();
  }
  const file = await handle.getFile();
  return parsePageFile(finalSlug, await file.text(), file.lastModified);
}

export async function deletePage(slug: string): Promise<void> {
  assertSlug(slug);
  const dir = await wikiDir(false);
  await dir.removeEntry(`${slug}.md`);
}

/** Ask the wiki: ranked excerpts grounding an answer (retrieval overlay). */
export async function askWiki(query: string, topN = 3): Promise<WikiHit[]> {
  return rankPages(await listPages(), query, topN);
}
