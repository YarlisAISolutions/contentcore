# ContentCore

[![CI](https://github.com/YarlisAISolutions/contentcore/actions/workflows/ci.yml/badge.svg)](https://github.com/YarlisAISolutions/contentcore/actions/workflows/ci.yml)
[![npm @contentcore/react](https://img.shields.io/npm/v/@contentcore/react?label=%40contentcore%2Freact)](https://www.npmjs.com/package/@contentcore/react)
[![npm @contentcore/core](https://img.shields.io/npm/v/@contentcore/core?label=%40contentcore%2Fcore)](https://www.npmjs.com/package/@contentcore/core)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Schema-driven content for React apps.** Pages made of typed blocks, loaded from any source, cached and highly available by default, with every HTML element rendered safely. Built to last: the stored format is versioned and migrates forward.

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
| [`@contentcore/core`](packages/core) | Contracts, validation, migrations, cached and highly available sources, HTML catalogue. No React, no dependencies, server-safe. | [npm](https://www.npmjs.com/package/@contentcore/core) |

```bash
npm i @contentcore/react zod
```

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
| **Versioned content** | `schemaVersion` + migrations; newer content fails loudly instead of rendering wrong | [Content model](docs/content-model.md) |
| **Every platform** | Linux, macOS, Windows · Node 20/22/24, Bun, Deno, edge · Chromium, Firefox, WebKit · React 18/19 · Next.js | [Platform support](docs/platform-support.md) |

## Documentation

1. [Getting started](docs/getting-started.md): install to rendered page in ten minutes
2. [Embedding in your app](docs/embedding.md): SPA, Next.js (App and Pages Router), React Router/Remix, Node/Bun/Deno servers, edge workers, Astro, React Native; plus page patterns (catch-all routes, sections inside app pages, multiple regions, layouts, modals, locales, previews, A/B tests, editor controls)
3. [Content model](docs/content-model.md): `PageDocument`, block ids, slugs, locales, versioning and migrations
4. [Blocks](docs/blocks.md): `defineBlock`, schemas, registries, failure handling, the `html` block
5. [Sources and caching](docs/sources-and-caching.md): static, API, cached and fallback sources; the content API contract; CMS adapters; high availability
6. [Best practices](docs/best-practices.md): production checklist (setup, content, performance, reliability, security, operations)
7. [Platform support](docs/platform-support.md): what runs where, and how each platform is verified
8. [API reference](docs/api-reference.md)
9. [Architecture](docs/ARCHITECTURE.md): boundaries, design decisions, versioning policy, roadmap

## Examples

Every example runs in CI against the packed packages. [Overview](examples/README.md)

| Example | Shows |
|---|---|
| [`examples/vite-app`](examples/vite-app) | **Feature tour** SPA: typed blocks, rich HTML/SVG/MathML, sanitisation, capabilities, prefetching links, embedded section, locales, failover to a bundled snapshot, every fallback state |
| [`examples/nextjs-app`](examples/nextjs-app) | **Next.js App Router**: server-loaded pages, metadata, ISR, catch-all route, embedded section, content API route with ETag, publish webhook |
| [`examples/node-server`](examples/node-server) | **Node / Bun / Deno** server: the content API contract (ETag, 304, CDN headers) and server rendering with safe hydration data |
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
bun run check              # build, typecheck, 86 tests, packed tarballs on Node/Bun/Deno + edge VM
bun run verify:browsers    # Chromium, Firefox, WebKit via Playwright
bun run verify:next        # Next.js build + start
bun run bench
```

- [Changelog](CHANGELOG.md)
- [Contributor notes](CLAUDE.md)
- [Licence (MIT)](LICENSE)
