import { cloneData } from "./compat";
import type { ContentSource, GetPageOptions, PageDocument } from "./contracts";
import { ContentConflictError, ContentValidationError } from "./errors";
import { normalizeSlug } from "./slug";
import { parsePageDocument } from "./validate";

/**
 * The write side of ContentCore: what an editor (or a migration script, or an import job)
 * talks to. Sources read published pages by slug; stores manage pages by id.
 */
export interface ContentStore {
  /** Every page, newest edits first (summaries only). */
  list(): Promise<PageSummary[]>;
  /** One page by id, with its revision, or null. */
  get(id: string): Promise<StoredPage | null>;
  /**
   * Create or replace the page with `page.id`. The page is validated (and migrated) first.
   * Pass `expectedRevision` (from `get`) to fail with `ContentConflictError` if someone else
   * saved in between; omit it only when creating a new page.
   */
  save(page: unknown, options?: SaveOptions): Promise<StoredPage>;
  /** Remove a page. `expectedRevision` guards against deleting someone else's newer edit. */
  delete(id: string, options?: SaveOptions): Promise<void>;
}

export interface SaveOptions {
  expectedRevision?: string;
}

export interface StoredPage {
  page: PageDocument;
  /** Opaque version token; changes whenever the page changes. Sent as ETag / If-Match over HTTP. */
  revision: string;
  updatedAt?: string;
}

export interface PageSummary {
  id: string;
  slug: string;
  locale?: string;
  title?: string;
  blockCount: number;
  revision: string;
  updatedAt?: string;
}

/** A stable, fast, non-cryptographic content hash (cyrb53) used as the page revision. */
export function revisionOf(page: PageDocument): string {
  const text = JSON.stringify(page);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function summarize(stored: StoredPage): PageSummary {
  const { page } = stored;
  const summary: PageSummary = { id: page.id, slug: page.slug, blockCount: page.blocks.length, revision: stored.revision };
  if (page.locale !== undefined) summary.locale = page.locale;
  if (page.title !== undefined) summary.title = page.title;
  if (stored.updatedAt !== undefined) summary.updatedAt = stored.updatedAt;
  return summary;
}

/**
 * Validates a page for writing and checks that (slug, locale) is not taken by another page.
 * Shared by every store so all of them enforce the same rules.
 */
export function prepareForSave(
  input: unknown,
  others: Iterable<PageDocument>,
): PageDocument {
  const page = parsePageDocument(input, { context: "save" });
  for (const other of others) {
    if (other.id !== page.id && normalizeSlug(other.slug) === page.slug && other.locale === page.locale) {
      throw new ContentValidationError(
        [{ path: "slug", message: `"${page.slug}"${page.locale ? ` (${page.locale})` : ""} is already used by page "${other.id}"` }],
        "save",
      );
    }
  }
  return page;
}

export function checkRevision(current: StoredPage | undefined, expected: string | undefined, id: string) {
  if (expected === undefined) return;
  if (!current) throw new ContentConflictError(`page "${id}" no longer exists`);
  if (current.revision !== expected) {
    throw new ContentConflictError(`page "${id}" was changed by someone else; reload it and re-apply your edits`, current.revision);
  }
}

/** Finds the page for (slug, locale) with the same rules as the static source. */
export function findBySlug(pages: Iterable<PageDocument>, slug: string, locale: string | undefined): PageDocument | undefined {
  const normalized = normalizeSlug(slug);
  let fallback: PageDocument | undefined;
  for (const page of pages) {
    if (page.slug !== normalized) continue;
    if (page.locale === locale) return page;
    if (page.locale === undefined) fallback = page;
  }
  return fallback;
}

export interface MemoryStore extends ContentStore, ContentSource {
  /** All pages as plain JSON, e.g. to download as pages.json. */
  exportPages(): PageDocument[];
  /** Replace everything with these pages (validated; all-or-nothing). */
  importPages(pages: readonly unknown[]): void;
  /** Called after every change, e.g. to persist to localStorage or refresh a preview. */
  onChange(listener: () => void): () => void;
}

/**
 * An in-memory store: edit static content in the browser (import pages.json, export it back),
 * back tests, or prototype. It is also a ContentSource, so a live preview can read from it.
 */
export function createMemoryStore(initial: readonly unknown[] = [], options: { now?: () => Date } = {}): MemoryStore {
  const now = options.now ?? (() => new Date());
  let pages = new Map<string, StoredPage>();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of listeners) l();
  };

  const load = (list: readonly unknown[]) => {
    const next = new Map<string, StoredPage>();
    for (const raw of list) {
      const page = prepareForSave(raw, [...next.values()].map((s) => s.page));
      if (next.has(page.id)) throw new ContentValidationError([{ path: "id", message: `duplicate page id "${page.id}"` }], "import");
      next.set(page.id, { page, revision: revisionOf(page) });
    }
    pages = next;
  };
  load(initial);

  const copy = (stored: StoredPage): StoredPage => ({ ...stored, page: cloneData(stored.page) });

  return {
    async list() {
      return [...pages.values()]
        .map(summarize)
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.slug.localeCompare(b.slug));
    },
    async get(id) {
      const stored = pages.get(id);
      return stored ? copy(stored) : null;
    },
    async save(input, opts = {}) {
      const page = prepareForSave(input, [...pages.values()].map((s) => s.page));
      checkRevision(pages.get(page.id), opts.expectedRevision, page.id);
      const stored: StoredPage = { page, revision: revisionOf(page), updatedAt: now().toISOString() };
      pages.set(page.id, stored);
      emit();
      return copy(stored);
    },
    async delete(id, opts = {}) {
      checkRevision(pages.get(id), opts.expectedRevision, id);
      if (pages.delete(id)) emit();
    },
    async getPage(slug: string, opts: GetPageOptions = {}) {
      const page = findBySlug(
        [...pages.values()].map((s) => s.page),
        slug,
        opts.locale,
      );
      return page ? cloneData(page) : null;
    },
    exportPages() {
      return [...pages.values()].map((s) => cloneData(s.page)).sort((a, b) => a.slug.localeCompare(b.slug));
    },
    importPages(list) {
      load(list);
      emit();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
