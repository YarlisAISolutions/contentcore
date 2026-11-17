import { type ContentSource, type PageDocument, isAbortError, normalizeSlug } from "@contentcore/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCms } from "./context";
import type { BlockRegistry } from "./define-block";
import { type ResolvedBlock, resolveBlocksCached } from "./resolve";

export type PageState =
  | { status: "loading"; retry: () => void }
  | { status: "ready"; page: PageDocument; blocks: ResolvedBlock[]; retry: () => void }
  | { status: "not-found"; retry: () => void }
  | { status: "error"; error: unknown; retry: () => void };

type Status =
  | { status: "loading" }
  | { status: "ready"; page: PageDocument; blocks: ResolvedBlock[] }
  | { status: "not-found" }
  | { status: "error"; error: unknown };

type Internal = Status & { key: string; source: ContentSource };

/** What can be shown right now, synchronously, from the source's cache. */
function fromPeek(source: ContentSource, slug: string, locale: string | undefined, registry: BlockRegistry): Status {
  let page: PageDocument | null | undefined;
  try {
    page = source.peek?.(slug, { locale });
  } catch {
    page = undefined;
  }
  if (page === null) return { status: "not-found" };
  if (page === undefined) return { status: "loading" };
  const blocks = resolveBlocksCached(page, registry);
  return Array.isArray(blocks) ? { status: "ready", page, blocks } : { status: "loading" };
}

/**
 * Loads a page from the provider's source and resolves its blocks.
 *
 * - Cached pages render on the first render (no loading flash), then revalidate.
 * - When the source reports new content (`subscribe`), the page updates in place.
 * - While a page is showing, a failed refresh keeps the content instead of switching to the error state.
 * - The in-flight request is cancelled when the slug, locale or source changes, or on unmount.
 */
export function usePage(slug: string, options: { locale?: string } = {}): PageState {
  const { source, blocks, locale: defaultLocale, onIssue } = useCms();
  const locale = options.locale ?? defaultLocale;
  const normalized = normalizeSlug(slug);
  const key = `${locale ?? ""}\u0000${normalized}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Internal>(() => ({ ...fromPeek(source, slug, locale, blocks), key, source }));

  // Read the registry and reporter through refs so an inline object or callback
  // in the provider does not trigger a refetch on every render.
  const latest = useRef({ blocks, onIssue });
  latest.current = { blocks, onIssue };

  // Slug, locale or source changed: switch immediately to whatever the cache has.
  let current = state;
  if (state.key !== key || state.source !== source) {
    current = { ...fromPeek(source, slug, locale, blocks), key, source };
    setState(current);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load on retry; `key` covers slug+locale.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const update = (next: Status) =>
      setState((prev) => {
        if (prev.key !== key || prev.source !== source) return prev;
        if (next.status === "ready" && prev.status === "ready" && prev.page === next.page && prev.blocks === next.blocks)
          return prev;
        if (next.status === "error" && prev.status === "ready") return prev; // keep showing content
        return { ...next, key, source };
      });

    const load = async () => {
      try {
        const page = await source.getPage(slug, { locale, signal });
        if (signal.aborted) return;
        if (!page) return update({ status: "not-found" });
        const resolved = await resolveBlocksCached(page, latest.current.blocks);
        if (signal.aborted) return;
        update({ status: "ready", page, blocks: resolved });
      } catch (error) {
        if (signal.aborted || isAbortError(error)) return;
        latest.current.onIssue({ kind: "load-error", slug, error });
        update({ status: "error", error });
      }
    };

    load();
    const unsubscribe = source.subscribe?.((changedSlug, changedLocale) => {
      if (normalizeSlug(changedSlug) === normalized && changedLocale === locale) load();
    });
    return () => {
      controller.abort();
      unsubscribe?.();
    };
  }, [source, key, attempt]);

  const retry = useCallback(() => {
    setState((prev) => (prev.status === "error" ? { status: "loading", key: prev.key, source: prev.source } : prev));
    setAttempt((n) => n + 1);
  }, []);

  const { key: _key, source: _source, ...status } = current;
  return { ...status, retry };
}

/**
 * Returns a function that warms the cache for a page, e.g. on link hover or focus,
 * so the next navigation renders instantly. Never throws.
 */
export function usePrefetch(): (slug: string, options?: { locale?: string }) => void {
  const { source, locale: defaultLocale } = useCms();
  return useCallback(
    (slug, options = {}) => {
      const locale = options.locale ?? defaultLocale;
      if (source.prefetch) void source.prefetch(slug, { locale });
      else void source.getPage(slug, { locale }).catch(() => {});
    },
    [source, defaultLocale],
  );
}
