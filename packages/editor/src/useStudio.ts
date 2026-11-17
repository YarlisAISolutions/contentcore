import {
  type ContentStore,
  type PageSummary,
  type StoredPage,
  isContentcoreError,
  normalizeSlug,
  safeParsePageDocument,
} from "@contentcore/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** A page as the editor holds it: exactly what was typed, not parsed or normalised. */
export interface DraftPage {
  id: string;
  slug: string;
  schemaVersion: number;
  locale?: string;
  title?: string;
  meta?: Record<string, unknown>;
  capabilities?: string[];
  blocks: Array<{ id: string; type: string; content: unknown }>;
}

interface Entry {
  draft: DraftPage;
  /** The stored page the draft started from; null for a page not saved yet. */
  base: StoredPage | null;
  dirty: boolean;
  conflict?: string;
}

export type Status = { kind: "idle" | "saving" | "saved" | "error" | "conflict"; message?: string };

const toDraft = (stored: StoredPage): DraftPage => structuredClone(stored.page) as DraftPage;

export function useStudio(store: ContentStore, hooks: { onSaved?: (s: StoredPage) => void; onDeleted?: (s: PageSummary) => void }) {
  const [summaries, setSummaries] = useState<PageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [selected, setSelected] = useState<string>();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;

  const fail = (error: unknown) =>
    setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSummaries(await store.list());
    } catch (error) {
      fail(error);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    setEntries({});
    setSelected(undefined);
    void refresh();
  }, [refresh]);

  const open = useCallback(
    async (id: string) => {
      setSelected(id);
      if (entries[id]) return;
      try {
        const stored = await store.get(id);
        if (!stored) return fail(`Page "${id}" no longer exists`);
        setEntries((e) => ({ ...e, [id]: { draft: toDraft(stored), base: stored, dirty: false } }));
      } catch (error) {
        fail(error);
      }
    },
    [entries, store],
  );

  const create = useCallback(() => {
    const taken = new Set([...summaries.map((s) => s.id), ...Object.keys(entries)]);
    let n = 1;
    while (taken.has(`page-${n}`)) n++;
    const id = `page-${n}`;
    const draft: DraftPage = { id, slug: `/${id}`, schemaVersion: 1, title: "Untitled", blocks: [] };
    setEntries((e) => ({ ...e, [id]: { draft, base: null, dirty: true } }));
    setSelected(id);
  }, [summaries, entries]);

  const update = useCallback((id: string, change: (draft: DraftPage) => DraftPage) => {
    setEntries((e) => {
      const entry = e[id];
      if (!entry) return e;
      return { ...e, [id]: { ...entry, draft: change(entry.draft), dirty: true } };
    });
    setStatus((s) => (s.kind === "saved" ? { kind: "idle" } : s));
  }, []);

  const save = useCallback(
    async (id: string, options: { overwrite?: boolean } = {}) => {
      const entry = entries[id];
      if (!entry) return;
      setStatus({ kind: "saving" });
      try {
        const sent = entry.draft;
        let opts: { expectedRevision?: string; mustNotExist?: boolean } = entry.base
          ? { expectedRevision: entry.base.revision }
          : { mustNotExist: true };
        if (options.overwrite) {
          const latest = await store.get(id);
          opts = latest ? { expectedRevision: latest.revision } : { mustNotExist: true };
        }
        const saved = await store.save(sent, opts);
        // Edits typed while the save was in flight are kept (and stay unsaved).
        setEntries((e) => {
          const now = e[id];
          const changed = Boolean(now && now.draft !== sent);
          return { ...e, [id]: { draft: changed && now ? now.draft : sent, base: saved, dirty: changed } };
        });
        setStatus({ kind: "saved", message: `Saved ${saved.page.slug}` });
        hooksRef.current.onSaved?.(saved);
        await refresh();
      } catch (error) {
        if (isContentcoreError(error) && error.code === "CONFLICT") {
          setEntries((e) => (e[id] ? { ...e, [id]: { ...e[id], conflict: error.message } } : e));
          setStatus({ kind: "conflict", message: error.message });
        } else fail(error);
      }
    },
    [entries, store, refresh],
  );

  const reload = useCallback(
    async (id: string) => {
      try {
        const stored = await store.get(id);
        setEntries((e) => {
          const next = { ...e };
          if (stored) next[id] = { draft: toDraft(stored), base: stored, dirty: false };
          else delete next[id];
          return next;
        });
        setStatus({ kind: "idle" });
      } catch (error) {
        fail(error);
      }
    },
    [store],
  );

  const remove = useCallback(
    async (id: string) => {
      const entry = entries[id];
      try {
        if (entry?.base || summaries.some((s) => s.id === id)) {
          await store.delete(id, { expectedRevision: entry?.base?.revision });
        }
        const summary = summaries.find((s) => s.id === id);
        setEntries((e) => {
          const next = { ...e };
          delete next[id];
          return next;
        });
        setSelected(undefined);
        setStatus({ kind: "saved", message: `Deleted ${summary?.slug ?? id}` });
        if (summary) hooksRef.current.onDeleted?.(summary);
        await refresh();
      } catch (error) {
        if (isContentcoreError(error) && error.code === "CONFLICT") setStatus({ kind: "conflict", message: error.message });
        else fail(error);
      }
    },
    [entries, summaries, store, refresh],
  );

  const current = selected ? entries[selected] : undefined;
  const parsed = useMemo(() => (current ? safeParsePageDocument(current.draft) : undefined), [current]);

  /** Page-level problems, including a (slug, locale) clash with another page. */
  const pageIssues = useMemo(() => {
    if (!current || !parsed) return [];
    const issues = parsed.ok ? [] : "issues" in parsed.error ? [...parsed.error.issues] : [{ path: "", message: parsed.error.message }];
    const slug = normalizeSlug(current.draft.slug ?? "");
    const clash = summaries.find((s) => s.id !== current.draft.id && s.slug === slug && s.locale === (current.draft.locale || undefined));
    if (clash) issues.push({ path: "slug", message: `Already used by "${clash.title ?? clash.id}"` });
    return issues;
  }, [current, parsed, summaries]);

  return {
    summaries,
    loading,
    entries,
    selected,
    current,
    parsed,
    pageIssues,
    status,
    open,
    create,
    update,
    save,
    reload,
    remove,
    refresh,
    setStatus,
  };
}
