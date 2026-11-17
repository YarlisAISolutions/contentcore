<p align="center">
  <img src="brand/logo.svg" alt="ContentCore logo" width="112" height="112">
</p>

<h1 align="center">ContentCore</h1>

<p align="center"><b>Schema-driven content for React.</b> Typed blocks · cached, highly available sources · every HTML element rendered safely · runs everywhere.</p>

<p align="center">
  <a href="https://github.com/YarlisAISolutions/contentcore/actions/workflows/ci.yml"><img src="https://github.com/YarlisAISolutions/contentcore/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@contentcore/react"><img src="https://img.shields.io/npm/v/@contentcore/react?label=%40contentcore%2Freact" alt="npm @contentcore/react"></a>
  <a href="https://www.npmjs.com/package/@contentcore/core"><img src="https://img.shields.io/npm/v/@contentcore/core?label=%40contentcore%2Fcore" alt="npm @contentcore/core"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

Pages made of typed blocks, loaded from any source and rendered fast and safely. Built to last: the stored format is versioned and migrates forward.

```tsx
import { CmsProvider, CmsPage, createApiSource, defineBlock, htmlBlock } from "@contentcore/react";
import { z } from "zod";

const hero = defineBlock({
  schema: z.object({ heading: z.string(), description: z.string().optional() }),
  component: ({ content }) => (
    <section>
      <h1>{content.heading}</h1>
      <p>{content.description}</p>
    </section>
  ),
});

const source = createApiSource({ baseUrl: "/api/content" }); // cached, retried, ETag-revalidated
const blocks = { hero, html: htmlBlock };

export default function App() {
  return (
    <CmsProvider source={source} blocks={blocks}>
      <CmsPage slug="/" />
    </CmsProvider>
  );
}
```

## Packages

| Package | What it is | |
|---|---|---|
| [`@contentcore/react`](packages/react) | `CmsProvider`, `CmsPage`, `defineBlock`, hooks, the `html` block for every HTML/SVG/MathML element. Re-exports core. | [npm](https://www.npmjs.com/package/@contentcore/react) |
| [`@contentcore/core`](packages/core) | Contracts, validation, migrations, cached and highly available sources, content stores and a content API handler, HTML catalogue. No React, no dependencies, server-safe. | [npm](https://www.npmjs.com/package/@contentcore/core) |
| [`@contentcore/editor`](packages/editor) | **ContentCore Studio**: a UI to manage and edit pages (forms from your schemas, rich text, live preview), for static JSON and API content. | [npm](https://www.npmjs.com/package/@contentcore/editor) |

```bash
npm i @contentcore/react zod
```

## Static and dynamic content

ContentCore renders the same pages whether they are **static** (shipped with your app) or **dynamic** (loaded at runtime from an API or CMS). Only the source changes; blocks and components stay the same. Each example below is copy-paste ready and is covered by [`packages/react/tests/readme.test.tsx`](packages/react/tests/readme.test.tsx).

All the examples share these blocks:

```tsx
// blocks.tsx
import { defineBlock, htmlBlock } from "@contentcore/react";
import { z } from "zod";

export const hero = defineBlock({
  schema: z.object({ heading: z.string(), description: z.string().optional() }),
  component: ({ content }) => (
    <section>
      <h1>{content.heading}</h1>
      {content.description && <p>{content.description}</p>}
    </section>
  ),
});

// Keys are the block `type`s stored in content. Define the registry once, at module scope.
export const blocks = { hero, html: htmlBlock };
```

### 1. Static content: JSON in your repo

The pages ship with the app. There is no network call, rendering is instant, and the site works offline. To change content, you deploy.

```json
// content/pages.json
[
  {
    "id": "home",
    "slug": "/",
    "schemaVersion": 1,
    "title": "Home",
    "blocks": [
      { "id": "welcome", "type": "hero", "content": { "heading": "Welcome", "description": "Explore our products" } },
      { "id": "intro", "type": "html", "content": { "nodes": [
        { "tag": "p", "children": ["Built with ", { "tag": "strong", "children": ["ContentCore"] }, "."] }
      ] } }
    ]
  },
  {
    "id": "about",
    "slug": "/about",
    "schemaVersion": 1,
    "title": "About",
    "blocks": [{ "id": "intro", "type": "hero", "content": { "heading": "About us" } }]
  }
]
```

```tsx
// App.tsx
import { CmsPage, CmsProvider, createStaticSource } from "@contentcore/react";
import { blocks } from "./blocks";
import pages from "./content/pages.json";

const source = createStaticSource({ pages }); // each page is validated once, on first use

export function App() {
  return (
    <CmsProvider source={source} blocks={blocks} fallbacks={{ notFound: (slug) => <p>No page at {slug}</p> }}>
      <CmsPage slug={window.location.pathname} />
    </CmsProvider>
  );
}
```

`/` renders `<section><h1>Welcome</h1><p>Explore our products</p></section><p>Built with <strong>ContentCore</strong>.</p>` on the first render, with no loading state.

**Use it for:** marketing sites, docs, landing pages, content edited in pull requests, tests and offline apps.

### 2. Dynamic content: from your API or CMS

Pages load at runtime, so editors can publish without a deploy. The cache, retries, timeouts and ETag revalidation are on by default.

**The backend** needs one endpoint: `GET /api/content/pages?slug=/about&locale=fr`. It returns the page JSON, or a 404 when there is no page. Here it is as a standard `Request → Response` handler, which runs as-is in Next.js route handlers, Hono, Bun, Deno and Workers:

```ts
// api/content/pages.ts
export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = await db.pages.find({
    slug: url.searchParams.get("slug") ?? "/",
    locale: url.searchParams.get("locale"),
  }); // your database or CMS
  if (!page) return Response.json(null, { status: 404 });

  const body = JSON.stringify(page);
  const etag = `"${page.updatedAt}"`;            // anything that changes when the page changes
  const headers = { etag, "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { ...headers, "content-type": "application/json" } });
}
```

**The frontend:**

```tsx
// App.tsx
import { CmsPage, CmsProvider, createApiSource, usePrefetch } from "@contentcore/react";
import { blocks } from "./blocks";

const source = createApiSource({
  baseUrl: "/api/content",
  cache: { ttl: 30_000 },           // fresh for 30 s; then served instantly while refreshing in the background
});

const fallbacks = {
  loading: <p>Loading…</p>,
  notFound: (slug: string) => <p>No page at {slug}</p>,
  error: (_error: unknown, retry: () => void) => <button onClick={retry}>Couldn't load. Try again</button>,
};

export function App({ path }: { path: string }) {
  return (
    <CmsProvider source={source} blocks={blocks} fallbacks={fallbacks}>
      <nav>
        <NavLink href="/">Home</NavLink> <NavLink href="/about">About</NavLink>
        <button onClick={() => source.invalidate()}>Refresh content</button>
      </nav>
      <CmsPage slug={path} />
    </CmsProvider>
  );
}

// Warm the cache on hover, so the next page renders instantly
function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const prefetch = usePrefetch();
  return <a href={href} onMouseEnter={() => prefetch(href)}>{children}</a>;
}
```

What users see:
- **First visit:** the `loading` fallback, then the page.
- **Pages already visited or prefetched:** render instantly from the cache.
- **Published changes:** show up after the `ttl`. The visible page updates in place, with no flash.
- **API down:** the last good copy keeps showing (stale-if-error, 24 h by default). If nothing is cached, the `error` fallback appears with a retry button.

**Use it for:** content editors change often, CMS-driven sites, localised content and per-environment content.

### 3. Both (recommended for production): dynamic, with a static safety net

Load from the API, and fall back to a snapshot bundled with the app if the API fails:

```ts
import { createApiSource, createFallbackSource, createStaticSource } from "@contentcore/react";
import snapshot from "./content/pages.json"; // exported from the CMS at build time

export const source = createFallbackSource(
  createApiSource({ baseUrl: "/api/content" }),
  createStaticSource({ pages: snapshot }),
  { onError: "next" },                         // on an API error or timeout, serve the snapshot
);
```

### 4. Dynamic content rendered on the server

For SEO and fast first paint, load on the server and render the page directly. In a Next.js App Router page:

```tsx
// app/[[...slug]]/page.tsx: a server component, so import from @contentcore/core
import { createApiSource } from "@contentcore/core";
import { notFound } from "next/navigation";
import { ContentPage } from "@/components/ContentPage"; // "use client": <CmsProvider…><CmsPage page={page} /></CmsProvider>

const source = createApiSource({ baseUrl: process.env.CONTENT_API! });
export const revalidate = 60;

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const page = await source.getPage("/" + ((await params).slug ?? []).join("/"));
  if (!page) notFound();
  return <ContentPage page={page} />;
}
```

`<CmsPage page={page} />` renders synchronously from a page you already have, with no source request. That works for any server: Express, Remix, Astro or workers. See the [embedding guide](docs/embedding.md).

### 5. Live data inside static content

Content decides *what* to show, and the block fetches *live* values such as prices, stock or scores at render time:

```tsx
const productCard = defineBlock({
  schema: z.object({ productId: z.string(), headline: z.string() }), // stored in content
  component: ({ content }) => {
    const price = useLivePrice(content.productId);                   // your data hook (SWR, React Query, fetch…)
    return (
      <article>
        <h3>{content.headline}</h3>
        <p>{price ?? "…"}</p>
      </article>
    );
  },
});
```

### Which one?

| | Static | Dynamic | Dynamic + static fallback | Server-rendered dynamic |
|---|---|---|---|---|
| Content changes without a deploy | ❌ | ✅ | ✅ | ✅ |
| Works offline / API down | ✅ | ✅ cached pages | ✅ every page | ✅ cached pages (+ CDN) |
| First render | instant | loading, then cached | loading, then cached | instant (HTML) |
| SEO | needs SSR or prerender | needs SSR | needs SSR | ✅ |
| Source | `createStaticSource` | `createApiSource` | `createFallbackSource` | `@contentcore/core` on the server, `<CmsPage page>` |

Runnable versions: [`examples/vite-app`](examples/vite-app) (static, plus dynamic with failover when `VITE_CONTENT_API` is set), [`examples/nextjs-app`](examples/nextjs-app) (server-rendered), [`examples/node-server`](examples/node-server) (the API and SSR).

## Managing content: ContentCore Studio

`@contentcore/editor` is a UI to manage and edit pages. It covers listing, creating and deleting pages; forms generated from your block schemas; rich text; live validation and preview; and conflict-safe saving. It works with **static** and **API** content.

```bash
npm i @contentcore/editor
```

**Static content (JSON in your repo):** edit in the browser, then **Export JSON** and commit.

```tsx
import { createMemoryStore } from "@contentcore/react";
import { ContentStudio } from "@contentcore/editor";
import { blocks } from "./blocks";            // the registry your site renders with
import pages from "./content/pages.json";

const store = createMemoryStore(pages);

export const Studio = () => <ContentStudio store={store} blocks={blocks} />;
```

**API content:** the studio in the browser, and one handler on the server:

```tsx
// Browser
import { createApiStore } from "@contentcore/react";
const store = createApiStore({ baseUrl: "/api/content", headers: () => ({ authorization: `Bearer ${token}` }) });
<ContentStudio store={store} blocks={blocks} onSaved={(s) => siteSource.invalidate(s.page.slug)} />
```

```ts
// Server: any runtime (Next.js route handler, Hono, Bun, Deno, Workers, Node)
import { createContentApiHandler } from "@contentcore/core";
import { createFileStore } from "@contentcore/core/fs";    // saves to content/pages.json; or your own DB store

const handle = createContentApiHandler(createFileStore("content/pages.json"), {
  authorize: (request) => isEditor(request),              // list/write/delete are denied by default
});
// handle(request) → Response: the public read contract for sites, plus list/get/PUT/DELETE for the studio,
// with server-side validation, unique slugs, If-Match (412 on conflicts) and a body size limit.
```

The full guide is in [docs/editing.md](docs/editing.md). For a runnable version with both modes, see [`examples/studio`](examples/studio).

## Features

| | | Docs |
|---|---|---|
| **Typed blocks** | Any Standard Schema (Zod, Valibot, ArkType); `content` is inferred; invalid content never crashes a page | [Blocks](docs/blocks.md) |
| **Any source** | Static JSON, your API, a CMS (Payload, Strapi, Contentful…) or your own; components never change | [Sources](docs/sources-and-caching.md) |
| **Cache on by default** | LRU, stale-while-revalidate, stale-if-error, request coalescing, ETag/304, instant first render from cache | [Caching](docs/sources-and-caching.md#createapisource) |
| **High availability** | Timeouts, retries with backoff and `Retry-After`, failover chains, static snapshots | [HA recipes](docs/sources-and-caching.md#high-availability-recipes) |
| **Every HTML element** | All HTML, legacy HTML, SVG 2, MathML Core and custom elements; sanitised at render time | [HTML block](docs/blocks.md#rich-content-the-html-block) |
| **Fallbacks** | Loading, not found, error + retry, unknown/invalid/crashed blocks; unstyled | [API](docs/api-reference.md#cmsfallbacks) |
| **Capabilities** | `useCapabilities().can("page:edit")` for editor UI hints | [Embedding](docs/embedding.md#9-editor-affordances) |
| **Studio UI** | Manage and edit pages for static JSON and API content; schema-driven forms, rich text, live preview, conflict-safe saves | [Editing](docs/editing.md) |
| **Versioned content** | `schemaVersion` + migrations; newer content fails loudly instead of rendering wrong | [Content model](docs/content-model.md) |
| **Every platform** | Linux, macOS, Windows · Node 20/22/24, Bun, Deno, edge · Chromium, Firefox, WebKit · React 18/19 · Next.js | [Platform support](docs/platform-support.md) |

## Documentation

1. [Getting started](docs/getting-started.md): install to rendered page in ten minutes ([static and dynamic examples above](#static-and-dynamic-content))
2. [Embedding in your app](docs/embedding.md): SPA, Next.js (App and Pages Router), React Router/Remix, Node/Bun/Deno servers, edge workers, Astro, React Native; plus page patterns (catch-all routes, sections inside app pages, multiple regions, layouts, modals, locales, previews, A/B tests, editor controls)
3. [Content model](docs/content-model.md): `PageDocument`, block ids, slugs, locales, versioning and migrations
4. [Blocks](docs/blocks.md): `defineBlock`, schemas, registries, failure handling, the `html` block
5. [Sources and caching](docs/sources-and-caching.md): static, API, cached and fallback sources; the content API contract; CMS adapters; high availability
6. [Managing and editing content](docs/editing.md): ContentCore Studio, content stores, the management API, custom stores
7. [Best practices](docs/best-practices.md): production checklist (setup, content, performance, reliability, security, operations)
8. [Platform support](docs/platform-support.md): what runs where, and how each platform is verified
9. [API reference](docs/api-reference.md)
10. [Architecture](docs/ARCHITECTURE.md): boundaries, design decisions, versioning policy, roadmap

## Examples

Every example runs in CI against the packed packages. [Overview](examples/README.md)

| Example | Shows |
|---|---|
| [`examples/vite-app`](examples/vite-app) | **Feature tour** SPA: typed blocks, rich HTML/SVG/MathML, sanitisation, capabilities, prefetching links, embedded section, locales, failover to a bundled snapshot, every fallback state |
| [`examples/nextjs-app`](examples/nextjs-app) | **Next.js App Router**: server-loaded pages, metadata, ISR, catch-all route, embedded section, content API route with ETag, publish webhook |
| [`examples/node-server`](examples/node-server) | **Node / Bun / Deno** server: the content API contract (ETag, 304, CDN headers) and server rendering with safe hydration data |
| [`examples/studio`](examples/studio) | **ContentCore Studio**: edit static JSON in the browser (import/export) or through the content API saving to `content/pages.json`; token auth |
| [`examples/edge-worker`](examples/edge-worker) | **Edge** (Cloudflare Workers, Vercel Edge, Deno Deploy): streaming render with a per-isolate cache |

## Performance

`bun run bench` on an Apple-silicon laptop (Bun 1.4, React 19.3):

| Operation | Result |
|---|---|
| Cached `getPage` hit | ~4,000,000 ops/s |
| Cached `peek` hit | ~7,000,000 ops/s |
| Validate a 1,000-block page | ~0.06 ms |
| Resolve 1,000 blocks against schemas (cold / memoised) | ~0.13 ms / ~80M ops/s |
| `renderToString` of a 1,000-block page | ~2.3 ms |

## Develop

```bash
bun install
bun run check              # build, typecheck, 130 tests, packed tarballs on Node/Bun/Deno + edge VM
bun run verify:browsers    # Chromium, Firefox, WebKit via Playwright (site and studio)
bun run verify:next        # Next.js build + start
bun run bench
```

- [Changelog](CHANGELOG.md)
- [Contributor notes](CLAUDE.md)
- [Brand guide and logo files](brand/BRAND.md)
- [Licence (MIT)](LICENSE)
