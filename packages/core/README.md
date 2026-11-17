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

See the [@contentcore/react README](https://www.npmjs.com/package/@contentcore/react) for the full guide.

## Licence

MIT
