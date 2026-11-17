# @contentcore/react

Render CMS-driven pages in React. Register schema-validated blocks, load pages from static JSON or your API (cached, retried and highly available by default), and render every HTML, SVG and MathML element safely.

```bash
npm i @contentcore/react zod
```

Works on Linux, macOS and Windows; Node 20+, Bun, Deno and edge runtimes; Chromium, Firefox and WebKit; React 18 and 19 ([platform support](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/platform-support.md)). React 18.2+ is a peer dependency. Zod is optional: any [Standard Schema](https://standardschema.dev) library works (Zod 3.24+/4, Valibot, ArkType).

## Quick start

```tsx
import { CmsProvider, CmsPage, createApiSource, defineBlock, htmlBlock } from "@contentcore/react";
import { z } from "zod";

const hero = defineBlock({
  schema: z.object({
    heading: z.string(),
    description: z.string().optional(),
  }),
  component: ({ content }) => (
    <section>
      <h1>{content.heading}</h1>
      <p>{content.description}</p>
    </section>
  ),
});

// Create sources and registries once (module scope or useMemo).
const source = createApiSource({ baseUrl: "/api/content" });
const blocks = { hero, html: htmlBlock };

export default function App() {
  return (
    <CmsProvider source={source} blocks={blocks}>
      <CmsPage slug="/" />
    </CmsProvider>
  );
}
```

The stored page:

```json
{
  "id": "home",
  "slug": "/",
  "schemaVersion": 1,
  "blocks": [
    { "id": "welcome", "type": "hero", "content": { "heading": "Welcome", "description": "Explore our products" } }
  ]
}
```

## Sources are interchangeable

```ts
const source = createStaticSource({ pages: [homePage, aboutPage] }); // JSON in the repo
const source = createApiSource({ baseUrl: "/api/content" });          // your backend
```

Both validate content and return the same normalised, immutable `PageDocument`. CMS response shapes (Payload, Strapi, Contentful) belong in the adapter:

```ts
createApiSource({
  baseUrl: "https://cms.example.com",
  url: (slug) => `https://cms.example.com/api/pages?where[slug][equals]=${encodeURIComponent(slug)}`,
  transform: (body) => body.docs[0] ?? null,
});
```

### Fast, cached and highly available by default

`createApiSource` comes with:

| Feature | Default | Option |
|---|---|---|
| In-memory LRU cache | 500 pages | `cache: { maxEntries }` |
| Fresh window | 60 s | `cache: { ttl }` |
| Stale-while-revalidate (instant response, background refresh) | 5 min | `cache: { staleWhileRevalidate }` |
| Stale-if-error (serve last good page while the backend is down) | 24 h | `cache: { staleIfError }` |
| Not-found caching | 10 s | `cache: { negativeTtl }` |
| Request coalescing (one upstream call per page) | on | n/a |
| ETag revalidation (`If-None-Match` / 304) | on | `etag: false` |
| Per-attempt timeout | 10 s | `timeoutMs` |
| Retries with exponential backoff and jitter on network errors, timeouts, 408/425/429/5xx, honouring `Retry-After` | 2 | `retry: { retries, baseDelayMs, maxDelayMs }` or `false` |

> **Per-user content:** the cache is keyed by slug and locale and shared by everyone using the same source instance. If responses differ per viewer (auth headers, cookies, per-user `capabilities`), don't put a cached source at module scope on a server: create one per request or use `cache: false`. In the browser, call `source.invalidate()` on login and logout.

Turn the cache off with `cache: false`. You can also cache any source with `createCachedSource(source, options)`. Its methods:

- `peek(slug)`: synchronous read.
- `prefetch(slug)`: warm the cache ahead of time.
- `invalidate(slug?)`: drop one page, or everything.
- `prime(page)`: hand a server-rendered page to the client cache.
- `subscribe(fn)`: get notified when a page changes.

Fail over across replicas:

```ts
const source = createFallbackSource(
  createApiSource({ baseUrl: "https://primary.example.com/content" }),
  createApiSource({ baseUrl: "https://replica.example.com/content" }),
  createStaticSource({ pages: snapshot }),
  { onError: "next" },
);
```

In React, a cached page renders on the **first** render with no loading flash. A background refresh with new content updates the page in place, and a failed refresh keeps the content on screen. `usePrefetch()` returns a function to warm the cache on link hover.

## Every HTML element

Register the built-in `html` block. Its content is an element tree stored as data:

```json
{ "id": "body", "type": "html", "content": { "nodes": [
  { "tag": "h2", "children": ["Pricing"] },
  { "tag": "p", "attrs": { "class": "lead" }, "children": ["Starts at ", { "tag": "strong", "children": ["$9"] }] },
  { "tag": "svg", "attrs": { "viewBox": "0 0 10 10" }, "children": [{ "tag": "circle", "attrs": { "cx": 5, "cy": 5, "r": 4 } }] }
] } }
```

What it supports:

- **Elements:** every WHATWG HTML element, the obsolete ones browsers still render (`font`, `center`, `marquee`, …), every SVG 2 element, MathML Core, and custom elements (`my-widget`).
- **Form fields:** `value` and `checked` become initial values (`defaultValue`/`defaultChecked`), so users can still edit them.
- **Attributes:** mapped to React automatically (`class`, `for`, `tabindex`, `style` strings, `stroke-width`, `aria-*`, `data-*`).
- **Safe by default:**
  - `on*` handlers are removed.
  - `javascript:`, `vbscript:` and non-media `data:` URLs are removed.
  - `script`, `iframe`, `object`, `embed`, `style`, `link`, `meta`, `base` and the SVG animation elements render only when you opt in.
  - `srcdoc` is always removed.

```tsx
const html = createHtmlBlock({
  allowElements: ["iframe"],          // e.g. video embeds you trust
  components: { a: RouterLink, img: OptimisedImage },
});
<HtmlContent nodes={nodes} />          // or render a tree anywhere
htmlToNodes("<p>Legacy <b>HTML</b></p>") // import existing HTML once, store the nodes
```

## States and fallbacks

Everything is unstyled and renders nothing until you say otherwise:

```tsx
<CmsProvider
  source={source}
  blocks={blocks}
  fallbacks={{
    loading: <Spinner />,
    notFound: (slug) => <NotFound slug={slug} />,
    error: (error, retry) => <button onClick={retry}>Try again</button>,
    unknownBlock: (block) => null,
    invalidBlock: (block, issues) => null,
    blockError: (block, error) => null, // a block threw; the rest of the page still renders
  }}
  onIssue={(issue) => logger.warn(issue)}
>
```

## Capabilities

```tsx
<CmsProvider capabilities={["media:*"]} …>
const { can } = useCapabilities();   // merged with the page's own `capabilities`
{can("page:edit") && <EditButton />}
```

Capabilities are UI hints. **Your backend endpoints must still enforce permissions.**

## Next.js (App Router)

This entry is a client module (`"use client"`). In server components, import from `@contentcore/core` (no React, no client code), load the page, and pass it down:

```tsx
// app/[...slug]/page.tsx (server)
import { createApiSource } from "@contentcore/core";
const source = createApiSource({ baseUrl: process.env.CONTENT_API! });
// Public content only: this source is shared by every request.
export default async function Page({ params }) {
  const page = await source.getPage(`/${(await params).slug?.join("/") ?? ""}`);
  if (!page) notFound();
  return <ClientPage page={page} />; // renders <CmsPage page={page} /> inside CmsProvider
}
```

## API

- **Components:** `CmsProvider`, `CmsPage` (`slug` or a pre-loaded `page`), `HtmlContent`.
- **Hooks:** `usePage`, `usePrefetch`, `useCapabilities`, `usePageDocument`.
- **Blocks:** `defineBlock`, `htmlBlock`, `createHtmlBlock`, `resolveBlocks`.
- **Re-exports:** everything from `@contentcore/core`.

## Documentation

- [Getting started](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/getting-started.md)
- [Embedding in your app](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/embedding.md): SPA, Next.js, React Router/Remix, Node/Bun/Deno, edge, Astro, React Native, and page patterns
- [Content model](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/content-model.md) · [Blocks](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/blocks.md) · [Sources and caching](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/sources-and-caching.md)
- [Best practices](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/best-practices.md) · [Platform support](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/platform-support.md) · [API reference](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/api-reference.md)
- [Examples](https://github.com/YarlisAISolutions/contentcore/blob/main/examples/README.md): Vite feature tour, Next.js App Router, Node/Bun/Deno server, edge worker

## Licence

MIT
