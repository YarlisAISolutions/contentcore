/**
 * The stored-content contract. This shape is what lives in your database, JSON files
 * or CMS, so it changes only with a `schemaVersion` bump and a migration
 * (see `migrations.ts` and docs/ARCHITECTURE.md).
 */

/** The page document version this release of ContentCore reads and writes. */
export const CURRENT_SCHEMA_VERSION = 1;

/** One block of content on a page. `id` is stable across edits; `type` picks the registered block. */
export interface BlockData<TContent = unknown> {
  id: string;
  type: string;
  content: TContent;
}

/** A page as stored and as returned by every content source, after validation. */
export interface PageDocument {
  id: string;
  /** Always starts with "/"; no trailing slash except the root. */
  slug: string;
  schemaVersion: number;
  locale?: string;
  title?: string;
  /** Free-form metadata for SEO and the like. ContentCore never interprets it. */
  meta?: Record<string, unknown>;
  /**
   * Actions the current viewer may take on this page, for UI hints only
   * (e.g. "page:edit"). Your backend must still enforce permissions.
   */
  capabilities?: string[];
  blocks: BlockData[];
}

/** Alias kept for readers coming from the original design note. */
export type CmsPageDocument = PageDocument;

export interface GetPageOptions {
  locale?: string;
  signal?: AbortSignal;
}

/**
 * Anything that can load a page. Static JSON, your own API and CMS adapters
 * (Payload, Strapi, …) all implement this, so apps can swap them freely.
 * Implementations resolve `null` for a missing page and reject for every other failure.
 */
export interface ContentSource {
  getPage(slug: string, options?: GetPageOptions): Promise<PageDocument | null>;
  /**
   * Optional synchronous read of an already-loaded page: the page, `null` for a known
   * missing page, or `undefined` when the source has nothing ready. Lets React render
   * cached content on the first render with no loading state.
   */
  peek?(slug: string, options?: Pick<GetPageOptions, "locale">): PageDocument | null | undefined;
  /** Optional warm-up, e.g. on link hover. Never rejects. */
  prefetch?(slug: string, options?: Pick<GetPageOptions, "locale">): Promise<void>;
  /** Optional change feed: called when a page for (slug, locale) has new content. Returns an unsubscribe. */
  subscribe?(listener: (slug: string, locale: string | undefined) => void): () => void;
}
