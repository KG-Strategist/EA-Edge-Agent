import React, { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, Pencil, Trash2, Search, Copy, Check, Loader2, X } from 'lucide-react';
import PageHeader from '../ui/PageHeader';
import { useNotification } from '../../context/NotificationContext';
import {
  listPages,
  savePage,
  deletePage,
  askWiki,
  isWikiSupported,
  type WikiPage,
  type WikiHit,
} from '../../lib/wikiStore';
import { Logger } from '../../lib/logger';

interface Draft {
  slug?: string;
  title: string;
  body: string;
}

const EMPTY_DRAFT: Draft = { title: '', body: '' };

export default function WikiTab() {
  const { addNotification } = useNotification();
  const supported = isWikiSupported();
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<WikiHit[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported) {
      setLoading(false);
      return;
    }
    try {
      setPages(await listPages());
    } catch (e) {
      Logger.error('Wiki: failed to list pages', e);
    } finally {
      setLoading(false);
    }
  }, [supported]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSave = async () => {
    if (!draft || !draft.title.trim()) {
      addNotification('Wiki page needs a title.', 'error', 4000);
      return;
    }
    setSaving(true);
    try {
      const saved = await savePage(draft.title, draft.body, draft.slug);
      setDraft(null);
      await refresh();
      addNotification(`Wiki page "${saved.title}" saved to OPFS.`, 'success', 4000);
    } catch (e: any) {
      addNotification(e?.message || 'Failed to save wiki page.', 'error', 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (slug: string, title: string) => {
    if (!confirm(`Delete wiki page "${title}"?`)) return;
    try {
      await deletePage(slug);
      await refresh();
      addNotification('Wiki page deleted.', 'success', 4000);
    } catch (e: any) {
      addNotification(e?.message || 'Failed to delete wiki page.', 'error', 5000);
    }
  };

  const handleAsk = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;
    setAsking(true);
    try {
      setHits(await askWiki(query.trim()));
    } catch (err: any) {
      addNotification(err?.message || 'Wiki search failed.', 'error', 5000);
    } finally {
      setAsking(false);
    }
  };

  const handleCopyContext = async () => {
    if (!hits || hits.length === 0) return;
    const context = hits
      .map((h) => `## ${h.page.title}\n${h.excerpt}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(context);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addNotification('Clipboard unavailable.', 'error', 4000);
    }
  };

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      <PageHeader
        icon={<BookOpen className="text-teal-500" />}
        title="NITI-Pedia (Autonomous Edge Wiki)"
        description="OPFS-backed markdown knowledge base with retrieval overlay. Ask questions to surface grounded excerpts, then copy the context into chat."
      />

      {!supported && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          OPFS is not supported in this browser — the wiki is unavailable.
        </p>
      )}

      {supported && (
        <>
          {/* Ask overlay */}
          <form onSubmit={handleAsk} className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask the wiki… (e.g. how does sovereign inference work?)"
              aria-label="Ask the wiki"
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              type="submit"
              disabled={asking || !query.trim()}
              aria-label="Search wiki"
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {asking ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              Ask
            </button>
            {hits && hits.length > 0 && (
              <button
                type="button"
                onClick={handleCopyContext}
                aria-label="Copy wiki context for chat"
                className="px-4 py-2 bg-white dark:bg-gray-800 border border-teal-300 dark:border-teal-700 hover:border-teal-500 text-teal-700 dark:text-teal-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy context'}
              </button>
            )}
          </form>

          {hits !== null && (
            <div className="space-y-2">
              {hits.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">No wiki pages match that question yet.</p>
              )}
              {hits.map((hit) => (
                <div key={hit.page.slug} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-3">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {hit.page.title}
                    <span className="ml-2 text-[11px] font-normal text-gray-500">score {hit.score}</span>
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{hit.excerpt}</p>
                </div>
              ))}
            </div>
          )}

          {/* Page list */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">
              Pages ({pages.length})
            </h3>
            <button
              onClick={() => setDraft({ ...EMPTY_DRAFT })}
              aria-label="Create wiki page"
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <Plus size={14} /> New Page
            </button>
          </div>

          {loading && (
            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Loading wiki…
            </p>
          )}

          {!loading && pages.length === 0 && !draft && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No pages yet. Create the first page to seed the edge wiki.
            </p>
          )}

          <div className="space-y-2">
            {pages.map((page) => (
              <div key={page.slug} className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{page.title}</p>
                  <p className="text-[11px] text-gray-500 font-mono truncate">
                    {page.slug}.md · updated {new Date(page.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => setDraft({ slug: page.slug, title: page.title, body: page.body })}
                  aria-label={`Edit ${page.title}`}
                  className="p-2 text-gray-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => handleDelete(page.slug, page.title)}
                  aria-label={`Delete ${page.title}`}
                  className="p-2 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          {/* Editor */}
          {draft && (
            <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-900/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">
                  {draft.slug ? `Edit: ${draft.slug}.md` : 'New page'}
                </h3>
                <button
                  onClick={() => setDraft(null)}
                  aria-label="Close wiki editor"
                  className="p-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Page title"
                aria-label="Wiki page title"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
              />
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="Markdown body…"
                aria-label="Wiki page body"
                rows={8}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm font-mono text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDraft(null)}
                  className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !draft.title.trim()}
                  aria-label="Save wiki page"
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Save to OPFS
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
