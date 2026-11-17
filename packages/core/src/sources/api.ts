import { type CacheOptions, type CachedContentSource, createCachedSource } from "../cache";
import { linkedSignal } from "../compat";
import type { ContentSource, GetPageOptions, PageDocument } from "../contracts";
import { ContentSourceError, isAbortError, throwIfAborted } from "../errors";
import type { PageMigrations } from "../migrations";
import { normalizeSlug } from "../slug";
import { parsePageDocument } from "../validate";

type MaybePromise<T> = T | Promise<T>;

export interface RetryOptions {
  /** Extra attempts after the first. Default 2. */
  retries?: number;
  /** First backoff delay in ms; doubles each attempt, with full jitter. Default 200. */
  baseDelayMs?: number;
  /** Upper bound for one backoff delay, including `Retry-After`. Default 5 000. */
  maxDelayMs?: number;
}

export interface ApiSourceOptions {
  /**
   * Base URL of your content API, absolute or relative ("/api/content").
   * By default pages are fetched from `${baseUrl}/pages?slug=<slug>[&locale=<locale>]`.
   */
  baseUrl: string;
  /** Build the request URL yourself (e.g. for a REST path or a CMS's query syntax). */
  url?: (slug: string, options: GetPageOptions) => string;
  /**
   * Extra headers per request, e.g. a preview token. Never ship server secrets to the browser.
   * The cache is keyed by slug and locale only: if headers or credentials make responses differ per
   * user, use one source per user/request (or `cache: false`) so one viewer's page is never served to another.
   */
  headers?: HeadersInit | (() => MaybePromise<HeadersInit>);
  credentials?: RequestCredentials;
  /** Defaults to the global fetch. */
  fetch?: typeof fetch;
  /**
   * Turn the response body into a ContentCore page document. This is where a
   * Payload/Strapi/Contentful response shape is mapped; return `null` for "not found".
   */
  transform?: (body: unknown, slug: string) => MaybePromise<unknown>;
  migrations?: PageMigrations;
  /** Per-attempt timeout in ms. Default 10 000. 0 disables. */
  timeoutMs?: number;
  /** Retry transient failures (network, timeout, 408/425/429/5xx). `false` disables. */
  retry?: RetryOptions | false;
  /**
   * In-memory cache (on by default): fresh for 1 min, stale-while-revalidate 5 min,
   * stale-if-error 24 h, 500 pages. Pass options to tune, or `false` to disable.
   * The cache is shared by everyone using this source instance. On a server, keep per-user
   * content out of a module-level cached source; call `invalidate()` on login/logout in the browser.
   */
  cache?: CacheOptions | false;
  /** Remember ETags and revalidate with If-None-Match. Default true. */
  etag?: boolean;
}

const join = (base: string, path: string) => `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_VALIDATORS = 1000;

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

class RetryableError extends ContentSourceError {
  readonly retryAfter?: number;
  constructor(message: string, details: { status?: number; url?: string; cause?: unknown; retryAfter?: number }) {
    super(message, details);
    this.retryAfter = details.retryAfter;
  }
}

/** The uncached HTTP source: timeout, retries with backoff, ETag revalidation. */
export function createUncachedApiSource(options: ApiSourceOptions): ContentSource {
  const buildUrl =
    options.url ??
    ((slug: string, opts: GetPageOptions) => {
      const params = new URLSearchParams({ slug });
      if (opts.locale) params.set("locale", opts.locale);
      return `${join(options.baseUrl, "pages")}?${params}`;
    });
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retry = options.retry === false ? { retries: 0 } : (options.retry ?? {});
  const retries = Math.max(0, retry.retries ?? 2);
  const baseDelay = retry.baseDelayMs ?? 200;
  const maxDelay = retry.maxDelayMs ?? 5_000;
  const useEtag = options.etag !== false;
  // url -> last validated response, bounded LRU.
  const validators = new Map<string, { etag: string; page: PageDocument | null }>();

  async function attempt(normalized: string, url: string, signal: AbortSignal | undefined) {
    const doFetch = options.fetch ?? globalThis.fetch;
    if (typeof doFetch !== "function") {
      throw new ContentSourceError("no fetch implementation available; pass `fetch` to createApiSource", { url });
    }
    const headers = new Headers(typeof options.headers === "function" ? await options.headers() : options.headers);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    const known = useEtag ? validators.get(url) : undefined;
    if (known) headers.set("if-none-match", known.etag);

    const link = linkedSignal(signal, timeoutMs);
    try {
      return await send(normalized, url, headers, known, signal, link);
    } finally {
      link.dispose();
    }
  }

  async function send(
    normalized: string,
    url: string,
    headers: Headers,
    known: { etag: string; page: PageDocument | null } | undefined,
    signal: AbortSignal | undefined,
    link: ReturnType<typeof linkedSignal>,
  ) {
    const init: RequestInit = { method: "GET", headers, signal: link.signal };
    // Some runtimes (Cloudflare Workers) reject unsupported keys even when undefined.
    if (options.credentials !== undefined) init.credentials = options.credentials;
    const doFetch = options.fetch ?? globalThis.fetch;

    let response: Response;
    try {
      response = await doFetch(url, init);
    } catch (cause) {
      if (signal?.aborted) throw cause;
      if (link.timedOut()) throw new RetryableError(`request for "${normalized}" timed out after ${timeoutMs}ms`, { url, cause });
      if (isAbortError(cause)) throw cause;
      throw new RetryableError(`request for "${normalized}" failed`, { url, cause });
    }

    if (response.status === 304 && known) return known.page;
    if (response.status === 404) return null;
    if (!response.ok) {
      const details = { url, status: response.status, retryAfter: retryAfterMs(response) };
      const message = `request for "${normalized}" returned ${response.status}`;
      throw RETRYABLE_STATUS.has(response.status) ? new RetryableError(message, details) : new ContentSourceError(message, details);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      if (signal?.aborted) throw cause;
      if (link.timedOut()) throw new RetryableError(`response for "${normalized}" timed out after ${timeoutMs}ms`, { url, cause });
      throw new ContentSourceError(`response for "${normalized}" is not valid JSON`, { url, status: response.status, cause });
    }

    const raw = options.transform ? await options.transform(body, normalized) : body;
    const page =
      raw === null || raw === undefined
        ? null
        : parsePageDocument(raw, { migrations: options.migrations, context: `api source "${normalized}"` });

    const etag = response.headers.get("etag");
    if (useEtag && etag) {
      validators.delete(url);
      validators.set(url, { etag, page });
      if (validators.size > MAX_VALIDATORS) validators.delete(validators.keys().next().value as string);
    }
    return page;
  }

  return {
    async getPage(slug: string, opts: GetPageOptions = {}) {
      throwIfAborted(opts.signal);
      const normalized = normalizeSlug(slug);
      const url = buildUrl(normalized, opts);
      for (let n = 0; ; n++) {
        try {
          return await attempt(normalized, url, opts.signal);
        } catch (error) {
          if (!(error instanceof RetryableError) || n >= retries) {
            if (error instanceof RetryableError) {
              // Surface a plain ContentSourceError to callers.
              throw new ContentSourceError(error.message, { url: error.url, status: error.status, cause: error.cause });
            }
            throw error;
          }
          const backoff = Math.random() * Math.min(maxDelay, baseDelay * 2 ** n);
          await sleep(Math.min(maxDelay, error.retryAfter ?? backoff), opts.signal);
        }
      }
    },
  };
}

/**
 * A source that loads pages over HTTP, with an in-memory cache, timeouts, retries and
 * ETag revalidation on by default. 404 and a `null` body mean "not found"; other failures
 * reject with `ContentSourceError` (unless the cache can serve the last good page).
 */
export function createApiSource(options: ApiSourceOptions & { cache: false }): ContentSource;
export function createApiSource(options: ApiSourceOptions): CachedContentSource;
export function createApiSource(options: ApiSourceOptions): ContentSource | CachedContentSource {
  const source = createUncachedApiSource(options);
  return options.cache === false ? source : createCachedSource(source, options.cache);
}
