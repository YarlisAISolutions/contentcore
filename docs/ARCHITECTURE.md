# ContentCore architecture

ContentCore is a content SDK for React: it defines the contract between stored content and React, makes reading that content fast and reliable, and (since 0.2) lets people edit it.
- **Reading** is the `ContentSource` side: static, API, cached and fallback sources.
- **Writing** is the `ContentStore` side: memory, file, API or your own stores, plus a `Request → Response` content API handler.
- **Editing** is ContentCore Studio (`@contentcore/editor`), which works against any store.

ContentCore is still not a full CMS. Revision history, roles, workflows and a media library belong to your backend or a CMS behind a custom store.

## Boundaries

```
             stored content (DB, JSON, CMS)
                         │
        ┌────────────────┴────────────────┐
        │ @contentcore/core               │  no React, no dependencies; server-safe
        │  contracts → validate → migrate │
        │  sources: static / api / cache / fallback
        └────────────────┬────────────────┘
                         │ PageDocument (immutable)
        ┌────────────────┴────────────────┐
        │ @contentcore/react  "use client"│
        │  CmsProvider → CmsPage → blocks │
        │  html block, hooks, fallbacks   │
        └────────────────┬────────────────┘
                         │
              app-owned block components
```

- **CMS-specific shapes** stay inside adapters: `createApiSource({ transform })`, or your own `ContentSource`.
- **Business components** (pricing, product cards, account panels) stay in the consuming app. ContentCore only registers them.
- **Components are unstyled.**
- **Capabilities are UI hints.** Permissions are enforced by the backend.

## The stored-content contract

`PageDocument` is the one shape that outlives code: `{ id, slug, schemaVersion, locale?, title?, meta?, capabilities?, blocks: [{ id, type, content }] }`.

- **Block `id`s are stable** and unique within a page. They are React keys and the anchor for future editing, comments and analytics.
- **`content` belongs to the block's schema.** ContentCore validates it at render time with that schema, and an invalid block renders its fallback without breaking the page.
- **`schemaVersion` describes the document envelope.**
  - When ContentCore changes the envelope, it bumps `CURRENT_SCHEMA_VERSION` and ships a step in `BUILTIN_MIGRATIONS`.
  - Apps can version their own block content the same way, by passing `migrations` to a source.
  - Old documents are upgraded on read. Documents newer than the installed package are rejected (`UnsupportedSchemaVersionError`) rather than mis-rendered.

## Performance and availability model

- **Immutable pages.** Sources return deep-frozen objects that are shared between callers, so reads are O(1) with no cloning. React memoisation works by reference: blocks resolve once per page version (`resolveBlocksCached`) and unchanged blocks skip re-rendering (`memo`).
- **Cache in front of the network.** `createCachedSource` is an LRU bounded by `maxEntries`.
  - A fresh hit returns at once.
  - A stale hit returns at once and refreshes in the background (stale-while-revalidate).
  - A failed refresh keeps serving the last good page (stale-if-error).
  - Concurrent misses share one upstream request.
  - A refresh that returns unchanged content keeps the same object, so nothing re-renders.
- **Resilient transport.** `createApiSource` sets a per-attempt timeout, retries transient failures with exponential backoff and full jitter (honouring `Retry-After`), and revalidates with ETags.
- **Failover.** `createFallbackSource(..., { onError: "next" })` chains a primary, replicas and a static snapshot.
- **No loading flash for cached content.** `ContentSource.peek` lets `usePage` render synchronously, and `subscribe` pushes background updates into mounted pages.
- **Scale guards.** The cache is size-bounded, the ETag validator map is bounded, and HTML trees have depth and node limits (64 / 20,000 by default).

## HTML content

The `html` block stores markup as a tree of `HtmlNode` data, never as an HTML string, so content can be validated and stays portable.

- **Rendering.** It covers the full WHATWG HTML, SVG 2 and MathML Core catalogues plus custom elements. Attributes are mapped to React props, and unknown or document-level wrappers are unwrapped.
- **Sanitisation** happens at render time and can't be skipped:
  - Event-handler attributes are removed.
  - Script-bearing URLs are removed.
  - Elements that can execute code or load documents need an explicit `allowElements`.
- **Importing existing HTML.** `htmlToNodes` converts it once, and the result is stored as nodes.

## Versioning policy

- Semver per package. Both packages are released together with the same version while they are 0.x.
- Breaking changes to `PageDocument` are only made with a new `schemaVersion` and a migration, never in place.
- Runtime targets: Node 20+, evergreen browsers, React 18.2+ (tested on 19). ESM and CommonJS builds with type declarations.

## Roadmap

- `@contentcore/payload`: a first-party Payload adapter (`transform` plus preview tokens).
- Studio: revision history and rollback, scheduled publishing, roles and approvals, media library.
- An optional persistent cache layer (IndexedDB / KV) behind the same `CachedContentSource` interface.
