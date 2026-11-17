<img src="https://raw.githubusercontent.com/YarlisAISolutions/contentcore/main/brand/logo-512.png" alt="ContentCore logo" width="72" height="72" align="right">

# @contentcore/core

The framework-agnostic half of [ContentCore](https://www.npmjs.com/package/@contentcore/react). It has no React and no runtime dependencies, so it is safe to use on servers, in edge functions and in React Server Components.

```bash
npm i @contentcore/core
```

- **The stored-content contract:** `PageDocument` (`id`, `slug`, `schemaVersion`, `blocks[{ id, type, content }]`), validated by `parsePageDocument`, which reports every issue with its path.
- **Migrations:**
  - `migratePage` upgrades documents stored at an older `schemaVersion`. You can pass your own steps to any source as `migrations: { 1: (doc) => ({ ...doc, schemaVersion: 2 }) }`.
  - Documents newer than the package throw `UnsupportedSchemaVersionError` rather than rendering wrongly.
- **Sources:**
  - `createStaticSource`: in memory, O(1).
  - `createApiSource`: HTTP with cache, retries, timeout and ETag on by default.
  - `createFallbackSource`: chains sources and can fail over.
  - `createCachedSource`: an LRU with stale-while-revalidate and stale-if-error, request coalescing, `peek`, `prefetch`, `invalidate`, `prime` and `subscribe`.
- **HTML content:**
  - The `HtmlNode` tree type and the full HTML, SVG and MathML element catalogues.
  - `validateHtmlNodes` with depth and size limits, and `htmlContentSchema` (a Standard Schema).
- **Helpers:** `createCapabilities` (UI permission hints with `scope:*` wildcards), `validateBlockContent` (any Standard Schema), `normalizeSlug`, and typed errors with a stable `code`.

```ts
import { createApiSource } from "@contentcore/core";

const source = createApiSource({ baseUrl: "https://example.com/api/content" });
const page = await source.getPage("/pricing", { locale: "en" }); // PageDocument | null
```

See the [@contentcore/react README](https://www.npmjs.com/package/@contentcore/react) and the documentation below.

## Documentation

- [Getting started](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/getting-started.md)
- [Embedding in your app](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/embedding.md): SPA, Next.js, React Router/Remix, Node/Bun/Deno, edge, Astro, React Native, and page patterns
- [Content model](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/content-model.md) · [Blocks](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/blocks.md) · [Sources and caching](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/sources-and-caching.md)
- [Best practices](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/best-practices.md) · [Platform support](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/platform-support.md) · [API reference](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/api-reference.md)
- [Examples](https://github.com/YarlisAISolutions/contentcore/blob/main/examples/README.md): Vite feature tour, Next.js App Router, Node/Bun/Deno server, edge worker

## Licence

MIT
