import { type ValidationIssue, isContentcoreError } from "./errors";
import { normalizeSlug } from "./slug";
import { type ContentStore, findBySlug } from "./store";

export type ContentAction = "read" | "list" | "write" | "delete";

export interface ContentApiHandlerOptions {
  /** URL prefix the handler owns. Default "/api/content". */
  basePath?: string;
  /**
   * Decide whether a request may list, write or delete pages. Default: deny all three, so the
   * management API is closed until you open it. Return false (403), or throw
   * `new ContentForbiddenError("sign in", 401)`. Called for "read" only when `publicRead` is false.
   */
  authorize?: (request: Request, action: ContentAction) => boolean | Promise<boolean>;
  /** Serve the public read contract (GET pages?slug=) without calling `authorize`. Default true. */
  publicRead?: boolean;
  /** Largest accepted request body in bytes. Default 1 MiB. */
  maxBodyBytes?: number;
  /** Cache-Control for public reads. Default: CDN 60 s, stale-while-revalidate 5 min. */
  cacheControl?: string;
  /**
   * Called with unexpected errors (store failures). Callers only see a generic 500, so log here.
   * Default: console.error.
   */
  onError?: (error: unknown, request: Request) => void;
  /** Called after every successful save or delete, e.g. to invalidate caches or trigger a rebuild. */
  onChange?: (event: { type: "save" | "delete"; id: string; slug?: string; locale?: string }) => void | Promise<void>;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const etag = (revision: string) => `"${revision}"`;
const unquote = (value: string | null) => value?.replace(/^W\//, "").replace(/^"|"$/g, "") || undefined;

/**
 * A complete content API as a standard `Request → Response` handler, for any runtime:
 * Next.js route handlers, Hono, Bun.serve, Deno.serve, Cloudflare Workers, or Node via an adapter.
 *
 *   GET    {base}/pages?slug=/about&locale=fr   public read contract (what createApiSource reads), ETag/304
 *   GET    {base}/pages                         list summaries            (action "list")
 *   GET    {base}/pages/:id                     page + revision (ETag)    (action "list")
 *   PUT    {base}/pages/:id                     create/replace; If-Match  (action "write")
 *   DELETE {base}/pages/:id                     delete; If-Match required (action "delete")
 *
 * Returns `null` for requests outside `basePath`, so it composes with your own routing.
 */
export function createContentApiHandler(store: ContentStore, options: ContentApiHandlerOptions = {}) {
  const base = (options.basePath ?? "/api/content").replace(/\/+$/, "");
  const authorize = options.authorize ?? (() => false);
  const publicRead = options.publicRead !== false;
  const maxBody = options.maxBodyBytes ?? 1024 * 1024;
  const cacheControl = options.cacheControl ?? "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

  async function allowed(request: Request, action: ContentAction): Promise<Response | null> {
    if (action === "read" && publicRead) return null;
    try {
      if (await authorize(request, action)) return null;
      return json({ error: "forbidden" }, 403);
    } catch (error) {
      if (codeOf(error) === "FORBIDDEN") return json({ error: (error as Error).message }, statusOf(error, 403));
      throw error;
    }
  }

  /** Reads the body, stopping as soon as it exceeds the limit (also without Content-Length). */
  async function readBody(request: Request): Promise<unknown> {
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > maxBody) throw new BodyError(413, `body larger than ${maxBody} bytes`);
    let text = "";
    if (request.body) {
      const reader = request.body.getReader();
      const decoder = new TextDecoder();
      let size = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBody) {
          await reader.cancel().catch(() => {});
          throw new BodyError(413, `body larger than ${maxBody} bytes`);
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new BodyError(400, "body is not valid JSON");
    }
  }

  const internal = (error: unknown, request: Request) => {
    (options.onError ?? ((e: unknown) => console.error("[contentcore] content API error", e)))(error, request);
    return json({ error: "internal error" }, 500, { "cache-control": "no-store" });
  };

  return async function handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    if (url.pathname !== `${base}/pages` && !url.pathname.startsWith(`${base}/pages/`)) return null;
    const rest = url.pathname.slice(`${base}/pages`.length);
    let id: string | undefined;
    try {
      id = rest.startsWith("/") ? decodeURIComponent(rest.slice(1)) : undefined;
    } catch {
      return json({ error: "malformed page id" }, 400);
    }
    const method = request.method.toUpperCase();

    try {
      // Public read contract.
      if (!id && (method === "GET" || method === "HEAD") && url.searchParams.has("slug")) {
        const denied = await allowed(request, "read");
        if (denied) return denied;
        const summaries = await store.list();
        const pages = (await Promise.all(summaries.map((s) => store.get(s.id)))).flatMap((s) => (s ? [s] : []));
        const slug = normalizeSlug(url.searchParams.get("slug") ?? "/");
        const page = findBySlug(
          pages.map((s) => s.page),
          slug,
          url.searchParams.get("locale") ?? undefined,
        );
        if (!page) return json(null, 404, { "cache-control": cacheControl });
        const stored = pages.find((s) => s.page.id === page.id)!;
        const headers = { etag: etag(stored.revision), "cache-control": cacheControl };
        if (unquote(request.headers.get("if-none-match")) === stored.revision) return new Response(null, { status: 304, headers });
        return json(page, 200, headers);
      }

      if (!id) {
        if (method !== "GET") return json({ error: "method not allowed" }, 405, { allow: "GET" });
        const denied = await allowed(request, "list");
        if (denied) return denied;
        return json({ pages: await store.list() }, 200, { "cache-control": "no-store" });
      }

      if (method === "GET") {
        const denied = await allowed(request, "list");
        if (denied) return denied;
        const stored = await store.get(id);
        if (!stored) return json({ error: "not found" }, 404, { "cache-control": "no-store" });
        return json(stored, 200, { etag: etag(stored.revision), "cache-control": "no-store" });
      }

      if (method === "PUT") {
        const denied = await allowed(request, "write");
        if (denied) return denied;
        const body = await readBody(request);
        if (typeof body !== "object" || body === null || (body as { id?: unknown }).id !== id) {
          return json({ error: "the page id in the body must match the URL" }, 400);
        }
        const existing = await store.get(id);
        const ifMatch = unquote(request.headers.get("if-match"));
        if (existing && request.headers.get("if-none-match")?.trim() === "*") {
          return json({ error: `a page with id "${id}" already exists`, revision: existing.revision }, 412, { etag: etag(existing.revision) });
        }
        if (existing && !ifMatch) {
          return json({ error: "If-Match is required to update an existing page", revision: existing.revision }, 428);
        }
        // New pages are created only if nobody created the same id in the meantime.
        const saved = await store.save(body, existing ? { expectedRevision: ifMatch } : { mustNotExist: true });
        await options.onChange?.({ type: "save", id, slug: saved.page.slug, locale: saved.page.locale });
        return json(saved, existing ? 200 : 201, { etag: etag(saved.revision), "cache-control": "no-store" });
      }

      if (method === "DELETE") {
        const denied = await allowed(request, "delete");
        if (denied) return denied;
        const ifMatch = unquote(request.headers.get("if-match"));
        if (!ifMatch) return json({ error: "If-Match is required to delete a page" }, 428);
        const existing = await store.get(id);
        if (!existing) return json({ error: "not found" }, 404);
        await store.delete(id, { expectedRevision: ifMatch });
        await options.onChange?.({ type: "delete", id, slug: existing.page.slug, locale: existing.page.locale });
        return new Response(null, { status: 204 });
      }

      return json({ error: "method not allowed" }, 405, { allow: "GET, PUT, DELETE" });
    } catch (error) {
      // Map by stable `code`, never `instanceof`: errors may come from another bundle copy
      // (ESM vs CommonJS, or the fs subpath) of this package.
      if (error instanceof BodyError) return json({ error: error.message }, error.status);
      const code = codeOf(error);
      const message = (error as Error).message;
      if (code === "CONFLICT") {
        const revision = (error as { currentRevision?: string }).currentRevision;
        return json({ error: message, revision }, 412, revision ? { etag: etag(revision) } : {});
      }
      if (code === "VALIDATION" || code === "UNSUPPORTED_SCHEMA_VERSION") {
        const issues = (error as { issues?: ValidationIssue[] }).issues ?? [];
        // Only writes report details; a broken stored file must not leak paths to anonymous readers.
        return method === "PUT" ? json({ error: message, issues }, 422) : internal(error, request);
      }
      if (code === "FORBIDDEN") return json({ error: message }, statusOf(error, 403));
      return internal(error, request);
    }
  };
}

const codeOf = (error: unknown): string | undefined => (isContentcoreError(error) ? error.code : undefined);
const statusOf = (error: unknown, fallback: number) => {
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : fallback;
};

class BodyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
