# Sources and caching

A source is anything with `getPage(slug, { locale, signal }) → Promise<PageDocument | null>`. Components never know which one they use, so you can move from JSON files to your API to a CMS without touching them.

| Source | Use for | Cache |
|---|---|---|
| `createStaticSource({ pages })` | JSON in the repo, build-time exports, tests, offline snapshots | In memory already (O(1) lookups) |
| `createApiSource({ baseUrl })` | Your content API or a CMS | **On by default** |
| `createCachedSource(source, opts)` | Caching any custom source | n/a (this is the cache) |
| `createFallbackSource(a, b, …, opts)` | Preview before published, primary → replica → snapshot | Per underlying source |
| `createUncachedApiSource(opts)` | The HTTP source without the cache wrapper | None |

## createApiSource

```ts
const source = createApiSource({
  baseUrl: "https://example.com/api/content",   // or relative: "/api/content"
  // Optional:
  url: (slug, { locale }) => `…`,                // custom URL shape (CMS query syntax)
  transform: (body) => body.docs[0] ?? null,     // map a CMS response to a PageDocument
  headers: () => ({ authorization: `Bearer ${token}` }),
  credentials: "include",
  fetch: customFetch,                            // defaults to global fetch
  timeoutMs: 10_000,                             // per attempt
  retry: { retries: 2, baseDelayMs: 200, maxDelayMs: 5_000 },  // or false
  etag: true,                                    // If-None-Match revalidation
  cache: { ttl: 60_000, staleWhileRevalidate: 300_000, staleIfError: 86_400_000, negativeTtl: 10_000, maxEntries: 500 },
  migrations: { /* see content-model.md */ },
});
```

### What happens on a request

1. **Fresh cache hit:** the same frozen object is returned at once (about 4M reads/s).
2. **Stale hit, within `staleWhileRevalidate`:** the cached page is returned at once, and **one** background refresh starts. Subscribers (mounted `CmsPage`s) re-render only if the content actually changed.
3. **Miss:** the page is fetched. Concurrent requests for the same page share **one** upstream call.
   - **Timeout and retries:** each attempt is aborted after `timeoutMs`. Network errors, timeouts and 408/425/429/5xx responses are retried with exponential backoff and full jitter, honouring `Retry-After`.
   - **ETag:** the response's ETag is remembered. The next fetch sends `If-None-Match`, and a `304` reuses the parsed page with no download and no re-validation.
4. **Failure while a stale copy exists (within `staleIfError`):** the stale copy is served and `onRevalidateError` is called. Users see content, and you see the alert.
5. **404 or a `null` body:** the result is `null` (not found), remembered for `negativeTtl`.

### Cache methods

`createApiSource` and `createCachedSource` return a `CachedContentSource` with these methods:

| Method | Use |
|---|---|
| `peek(slug, { locale })` | Synchronous read. `CmsPage` uses it to render cached pages with no loading state |
| `prefetch(slug)` | Warm the cache ahead of navigation. Never throws |
| `prime(page)` | Hand over a page you already have, e.g. one rendered on the server |
| `invalidate(slug?, { locale }?)` | Drop one page, all locales of a slug, or everything. Mounted pages reload; what is on screen stays until the new copy arrives |
| `subscribe(listener)` | Called when a page's content changes |
| `clear()`, `size` | Housekeeping |

### Per-user content: read this

The cache is keyed by **slug and locale** and shared by everyone using the same source instance.

- **Public content:** one module-level source per process, isolate or browser tab is ideal.
- **Per-user content** (auth headers, cookies, personalised capabilities, drafts): create a source **per request or per user**, or pass `cache: false`.
- **In the browser:** call `source.invalidate()` on login and logout.

## The content API contract

To serve content from your own backend, implement one endpoint:

```
GET {baseUrl}/pages?slug=/about&locale=fr
```

| Case | Response |
|---|---|
| Found | `200`, `content-type: application/json`, body: the `PageDocument` |
| Not found | `404` (any body), or `200` with body `null` |
| Unchanged since `If-None-Match` | `304`, no body |
| Overloaded | `429` / `503`, optionally `Retry-After` (the client backs off) |

Recommended headers:

```
ETag: "<hash of the body>"
Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300
Vary: Accept-Language          # only if the locale comes from headers
```

The `ETag` lets clients revalidate cheaply. `s-maxage` with `stale-while-revalidate` lets a CDN absorb traffic and keep serving during origin trouble.

Working implementations:

- [`examples/node-server/server.mjs`](../examples/node-server/server.mjs): `node:http`, runs on Node, Bun and Deno.
- [`examples/nextjs-app/app/api/content/pages/route.ts`](../examples/nextjs-app/app/api/content/pages/route.ts): a Next.js route handler.

### Using a CMS directly (Payload, Strapi, Contentful, Sanity…)

Map its response with `url` and `transform`:

```ts
// Payload
createApiSource({
  baseUrl: CMS_URL,
  url: (slug, { locale }) =>
    `${CMS_URL}/api/pages?where[slug][equals]=${encodeURIComponent(slug)}&locale=${locale ?? "en"}&depth=1&limit=1`,
  transform: (body) => {
    const doc = body.docs?.[0];
    return doc && { id: doc.id, slug: doc.slug, schemaVersion: 1, title: doc.title,
      blocks: doc.layout.map((b) => ({ id: b.id, type: b.blockType, content: b })) };
  },
});
```

Keep CMS secrets on the server. For browser traffic, put your own content API in front of the CMS, as both examples above do.

## High availability recipes

```ts
// Primary → replica → bundled snapshot. Users always get a page.
const source = createFallbackSource(
  createApiSource({ baseUrl: "https://content.example.com" }),
  createApiSource({ baseUrl: "https://content-replica.example.com" }),
  createStaticSource({ pages: snapshot }),
  { onError: "next", onFailover: (err, i) => metrics.increment("content.failover", { source: i }) },
);
```

| Layer | Protects against |
|---|---|
| Retries with backoff | Transient network errors and brief overloads |
| Timeout | Hung connections (frees the request) |
| Stale-while-revalidate | Latency: users never wait on refresh |
| Stale-if-error | Origin outages up to `staleIfError` |
| Fallback chain | Hard outages and region failures |
| CDN `s-maxage` + `stale-while-revalidate` | Traffic spikes and origin restarts |
| Static snapshot | Everything else: content ships with the app |

### Custom sources

Implement `ContentSource` for anything else, such as a database, a GraphQL API or the file system. Return validated pages with `parsePageDocument` and wrap the source with `createCachedSource`:

```ts
const dbSource: ContentSource = {
  async getPage(slug, { locale } = {}) {
    const row = await db.pages.findFirst({ where: { slug, locale } });
    return row ? parsePageDocument(row.document) : null;
  },
};
export const source = createCachedSource(dbSource, { ttl: 30_000 });
```
