import {
  ContentConflictError,
  ContentForbiddenError,
  ContentSourceError,
  ContentValidationError,
  type ValidationIssue,
} from "./errors";
import type { ContentStore, PageSummary, StoredPage } from "./store";

type MaybePromise<T> = T | Promise<T>;

export interface ApiStoreOptions {
  /** The content API base, e.g. "/api/content" (see createContentApiHandler). */
  baseUrl: string;
  /** Auth for the management endpoints, e.g. `() => ({ authorization: \`Bearer ${token}\` })`. */
  headers?: HeadersInit | (() => MaybePromise<HeadersInit>);
  credentials?: RequestCredentials;
  fetch?: typeof fetch;
}

/**
 * A ContentStore that talks to a content API (createContentApiHandler, or anything implementing the
 * same endpoints). Never cached: editors always see the latest revision.
 */
export function createApiStore(options: ApiStoreOptions): ContentStore {
  const base = options.baseUrl.replace(/\/+$/, "");

  async function call(path: string, init: RequestInit & { ifMatch?: string; ifNoneMatch?: string } = {}) {
    const doFetch = options.fetch ?? globalThis.fetch;
    const headers = new Headers(typeof options.headers === "function" ? await options.headers() : options.headers);
    headers.set("accept", "application/json");
    if (init.body) headers.set("content-type", "application/json");
    if (init.ifMatch) headers.set("if-match", `"${init.ifMatch}"`);
    if (init.ifNoneMatch) headers.set("if-none-match", init.ifNoneMatch);
    const request: RequestInit = { method: init.method ?? "GET", headers, cache: "no-store" };
    if (init.body) request.body = init.body;
    if (options.credentials !== undefined) request.credentials = options.credentials;
    const url = `${base}${path}`;
    let response: Response;
    try {
      response = await doFetch(url, request);
    } catch (cause) {
      throw new ContentSourceError(`request to ${url} failed`, { url, cause });
    }
    if (response.ok || response.status === 404) return response;
    const body = (await response.json().catch(() => ({}))) as { error?: string; issues?: ValidationIssue[]; revision?: string };
    const message = body.error ?? `request to ${url} returned ${response.status}`;
    if (response.status === 412 || response.status === 409) throw new ContentConflictError(message, body.revision);
    if (response.status === 422) throw new ContentValidationError(body.issues?.length ? body.issues : [{ path: "", message }]);
    if (response.status === 401 || response.status === 403) throw new ContentForbiddenError(message, response.status);
    throw new ContentSourceError(message, { url, status: response.status });
  }

  return {
    async list() {
      const response = await call("/pages");
      return ((await response.json()) as { pages: PageSummary[] }).pages;
    },
    async get(id) {
      const response = await call(`/pages/${encodeURIComponent(id)}`);
      if (response.status === 404) return null;
      return (await response.json()) as StoredPage;
    },
    async save(page, opts = {}) {
      const id = (page as { id?: unknown })?.id;
      if (typeof id !== "string" || id === "") {
        throw new ContentValidationError([{ path: "id", message: "expected a non-empty string" }], "save");
      }
      const response = await call(`/pages/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(page),
        ifMatch: opts.expectedRevision,
        ifNoneMatch: opts.mustNotExist ? "*" : undefined,
      });
      return (await response.json()) as StoredPage;
    },
    async delete(id, opts = {}) {
      let revision = opts.expectedRevision;
      if (!revision) {
        const current = await this.get(id);
        if (!current) return;
        revision = current.revision;
      }
      await call(`/pages/${encodeURIComponent(id)}`, { method: "DELETE", ifMatch: revision });
    },
  };
}
