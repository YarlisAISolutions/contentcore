import type { ContentSource, GetPageOptions, PageDocument } from "./contracts";
import { abortError } from "./compat";
import { throwIfAborted } from "./errors";
import { deepFreeze } from "./freeze";
import { normalizeSlug } from "./slug";

export interface CacheOptions {
  /** How long a page is fresh, in ms. Default 60 000 (1 min). */
  ttl?: number;
  /** After `ttl`, serve the cached page instantly and refresh in the background for this long. Default 300 000 (5 min). */
  staleWhileRevalidate?: number;
  /** When a refresh fails, keep serving the last good page for this long. Default 86 400 000 (24 h). */
  staleIfError?: number;
  /** How long "page not found" is remembered. Default 10 000 (10 s). 0 disables. */
  negativeTtl?: number;
  /** Least-recently-used entries beyond this are evicted, keeping memory bounded. Default 500. */
  maxEntries?: number;
  /** Called when a background refresh fails (the stale page keeps being served). */
  onRevalidateError?: (error: unknown, slug: string, locale: string | undefined) => void;
  /** Clock, for tests. */
  now?: () => number;
}

/** A content source with an in-memory cache in front of it. */
export interface CachedContentSource extends ContentSource {
  peek(slug: string, options?: Pick<GetPageOptions, "locale">): PageDocument | null | undefined;
  prefetch(slug: string, options?: Pick<GetPageOptions, "locale">): Promise<void>;
  subscribe(listener: (slug: string, locale: string | undefined) => void): () => void;
  /**
   * Drop one page (all locales when `locale` is omitted), or everything when called with no slug.
   * Subscribers (mounted pages) are notified and reload; what is on screen stays until the new copy arrives.
   */
  invalidate(slug?: string, options?: Pick<GetPageOptions, "locale">): void;
  /** Store a page directly, e.g. one rendered on the server and handed to the client. */
  prime(page: PageDocument): void;
  clear(): void;
  readonly size: number;
}

interface Entry {
  value: PageDocument | null;
  storedAt: number;
  slug: string;
  locale: string | undefined;
}

export const DEFAULT_CACHE_OPTIONS = Object.freeze({
  ttl: 60_000,
  staleWhileRevalidate: 300_000,
  staleIfError: 86_400_000,
  negativeTtl: 10_000,
  maxEntries: 500,
});

const keyOf = (slug: string, locale: string | undefined) => `${locale ?? ""}\u0000${slug}`;

/** Resolves with `promise`, or rejects as soon as `signal` aborts, without cancelling the shared work. */
function withSignal<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

/**
 * Puts a bounded LRU cache in front of any source:
 * - fresh hits return the same immutable object in O(1);
 * - stale-while-revalidate serves instantly and refreshes once in the background;
 * - stale-if-error keeps serving the last good page while the backend is down;
 * - concurrent requests for the same page share one upstream call.
 */
export function createCachedSource(source: ContentSource, options: CacheOptions = {}): CachedContentSource {
  const o = { ...DEFAULT_CACHE_OPTIONS, ...options };
  const now = options.now ?? Date.now;
  const entries = new Map<string, Entry>();
  const inflight = new Map<string, Promise<PageDocument | null>>();
  const listeners = new Set<(slug: string, locale: string | undefined) => void>();

  const touch = (key: string, entry: Entry) => {
    entries.delete(key);
    entries.set(key, entry);
  };

  const store = (key: string, entry: Entry) => {
    const previous = entries.get(key);
    entries.delete(key);
    entries.set(key, entry);
    while (entries.size > o.maxEntries) {
      const oldest = entries.keys().next().value as string;
      entries.delete(oldest);
    }
    if (previous && previous.value !== entry.value) {
      for (const listener of listeners) listener(entry.slug, entry.locale);
    }
  };

  const fetchInto = (key: string, slug: string, locale: string | undefined): Promise<PageDocument | null> => {
    const running = inflight.get(key);
    if (running) return running;
    const promise = source
      .getPage(slug, { locale })
      .then((page) => {
        const previous = entries.get(key)?.value;
        // Unchanged content keeps the same object, so subscribers and React memo see no change.
        const value =
          page === null
            ? null
            : previous && (previous === page || JSON.stringify(previous) === JSON.stringify(page))
              ? previous
              : deepFreeze(page);
        if (value !== null || o.negativeTtl > 0) store(key, { value, storedAt: now(), slug, locale });
        else entries.delete(key);
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  };

  const revalidate = (key: string, slug: string, locale: string | undefined) => {
    if (inflight.has(key)) return;
    fetchInto(key, slug, locale).catch((error) => o.onRevalidateError?.(error, slug, locale));
  };

  const read = (slug: string, locale: string | undefined) => {
    const normalized = normalizeSlug(slug);
    const key = keyOf(normalized, locale);
    const entry = entries.get(key);
    const age = entry ? now() - entry.storedAt : Number.POSITIVE_INFINITY;
    const freshFor = entry?.value === null ? o.negativeTtl : o.ttl;
    return { normalized, key, entry, age, fresh: age < freshFor };
  };

  return {
    async getPage(slug, opts = {}) {
      throwIfAborted(opts.signal);
      const { normalized, key, entry, age, fresh } = read(slug, opts.locale);
      if (entry && fresh) {
        touch(key, entry);
        return entry.value;
      }
      if (entry?.value && age < o.ttl + o.staleWhileRevalidate) {
        touch(key, entry);
        revalidate(key, normalized, opts.locale);
        return entry.value;
      }
      try {
        return await withSignal(fetchInto(key, normalized, opts.locale), opts.signal);
      } catch (error) {
        if (opts.signal?.aborted) throw error;
        if (entry?.value && age < o.ttl + o.staleIfError) {
          o.onRevalidateError?.(error, normalized, opts.locale);
          return entry.value;
        }
        throw error;
      }
    },

    peek(slug, opts = {}) {
      const { normalized, key, entry, age, fresh } = read(slug, opts.locale);
      if (!entry) return undefined;
      if (fresh) return entry.value;
      if (entry.value && age < o.ttl + Math.max(o.staleWhileRevalidate, o.staleIfError)) {
        revalidate(key, normalized, opts.locale);
        return entry.value;
      }
      return undefined;
    },

    async prefetch(slug, opts = {}) {
      try {
        await this.getPage(slug, opts);
      } catch {
        // Prefetch is best effort; the real request reports errors.
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    invalidate(slug, opts) {
      // Mounted pages are told, so they reload (e.g. a "Refresh content" button or a publish webhook).
      const dropped: Entry[] = [];
      const normalized = slug === undefined ? undefined : normalizeSlug(slug);
      for (const [key, entry] of entries) {
        const matches =
          normalized === undefined ||
          (entry.slug === normalized && (!opts || !("locale" in opts) || entry.locale === opts.locale));
        if (matches) {
          entries.delete(key);
          dropped.push(entry);
        }
      }
      for (const entry of dropped) for (const listener of listeners) listener(entry.slug, entry.locale);
    },

    prime(page) {
      const slug = normalizeSlug(page.slug);
      store(keyOf(slug, page.locale), { value: deepFreeze(page), storedAt: now(), slug, locale: page.locale });
    },

    clear() {
      entries.clear();
    },

    get size() {
      return entries.size;
    },
  };
}
