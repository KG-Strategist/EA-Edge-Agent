import { describe, it, expect } from 'vitest';
import {
  slugifyTitle,
  serializePage,
  parsePageFile,
  tokenizeQuery,
  scorePage,
  buildExcerpt,
  rankPages,
  isWikiSupported,
  type WikiPage,
} from '../lib/wikiStore';

const PAGES: WikiPage[] = [
  {
    slug: 'sovereign-inference',
    title: 'Sovereign Inference Engine',
    body: 'The sovereign tensor core runs GGUF models locally via WASM SIMD. WebGPU acceleration is deferred.',
    updatedAt: 3,
  },
  {
    slug: 'nsi-pipeline',
    title: 'NSI Intake Pipeline',
    body: 'Concept to DDQ to vendors with human-in-the-loop approval gates.',
    updatedAt: 2,
  },
  {
    slug: 'random-notes',
    title: 'Random Notes',
    body: 'Grocery lists and unrelated musings about office plants.',
    updatedAt: 1,
  },
];

describe('wikiStore pure core (v1.2 M4)', () => {
  it('slugifies titles deterministically', () => {
    expect(slugifyTitle('Sovereign Inference Engine!')).toBe('sovereign-inference-engine');
    expect(slugifyTitle('  Déjà  Vu  ')).toBe('deja-vu');
    expect(slugifyTitle('!!!')).toBe('untitled');
  });

  it('serializes and re-parses pages losslessly', () => {
    const text = serializePage('My Title', 'Body line one.\nBody line two.');
    const page = parsePageFile('my-title', text, 123);
    expect(page.title).toBe('My Title');
    expect(page.body).toBe('Body line one.\nBody line two.');
    expect(page.updatedAt).toBe(123);
  });

  it('falls back to slug when no title line exists', () => {
    const page = parsePageFile('plain', 'just body text', 0);
    expect(page.title).toBe('plain');
    expect(page.body).toBe('just body text');
  });

  it('tokenizes queries ignoring short tokens', () => {
    expect(tokenizeQuery('What is the NSI DDQ?')).toEqual(['what', 'is', 'the', 'nsi', 'ddq']);
  });

  it('weights title hits over body hits', () => {
    const tokens = ['pipeline'];
    expect(scorePage(PAGES[1], tokens)).toBeGreaterThan(scorePage(PAGES[0], tokens));
    expect(scorePage(PAGES[2], tokens)).toBe(0);
  });

  it('builds excerpts around the first match', () => {
    const excerpt = buildExcerpt(PAGES[0], ['wasm']);
    expect(excerpt.toLowerCase()).toContain('wasm');
    expect(excerpt.length).toBeLessThan(PAGES[0].body.length + 8);
  });

  it('ranks relevant pages first and drops zero-score pages', () => {
    const hits = rankPages(PAGES, 'sovereign tensor WASM inference');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].page.slug).toBe('sovereign-inference');
    expect(hits.every((h) => h.score > 0)).toBe(true);
  });

  it('returns no hits for unrelated queries', () => {
    expect(rankPages(PAGES, 'grocery office plants')).toHaveLength(1);
    expect(rankPages(PAGES, 'quantum blockchain synergy')).toHaveLength(0);
  });

  it('respects the topN limit', () => {
    expect(rankPages(PAGES, 'the', 1)).toHaveLength(1);
  });

  it('reports OPFS unsupported in happy-dom', () => {
    expect(isWikiSupported()).toBe(false);
  });
});
