# Changelog

## 0.1.1 (2026-11-17)

- **Every platform:**
  - Portable fallbacks for `AbortSignal.any`/`timeout`, `DOMException`, `structuredClone` and `Object.hasOwn`, for older Safari, Hermes and edge runtimes.
  - Request timers are always cleared.
  - `fetch` options omit unset keys, because Workers reject them.
  - The build targets ES2020.
- **Next.js:** `@contentcore/react` uses named re-exports instead of `export *`, which Next.js rejects in a `"use client"` module.
- **React 18:** custom elements in the `html` block keep their `class` attribute.
- **Types:**
  - New `HtmlBlockContent` type. `HtmlContent` stays as a deprecated alias, because the name clashed with the `<HtmlContent>` component.
  - `LEGACY_HTML_ELEMENTS` is now exported.
- **Docs:** getting started, embedding guide (every app type plus page patterns), content model, blocks, sources and caching, best practices, platform support and API reference.
- **Examples:** a Vite feature tour, the Next.js App Router, a Node/Bun/Deno server and an edge worker.
- **CI:** Linux, macOS and Windows × Node 20/22/24; React 18; Bun; Deno; an edge runtime; Chromium, Firefox and WebKit; Next.js; publint and arethetypeswrong.

## 0.1.0 (2026-11-17)

First release of `@contentcore/core` and `@contentcore/react`.

- **Page documents:** the `PageDocument` contract with validation (`parsePageDocument`) and versioned migrations (`migratePage`).
- **Sources:**
  - `createStaticSource`.
  - `createApiSource`, with the cache, timeout, retries with backoff and ETag revalidation on by default.
  - `createCachedSource`: an LRU with stale-while-revalidate, stale-if-error and request coalescing.
  - `createFallbackSource`, with failover.
- **React:** `CmsProvider`, `CmsPage`, `defineBlock` (any Standard Schema), `usePage`, `usePrefetch`, `useCapabilities` and `usePageDocument`. Fallbacks cover loading, not found, error with retry, unknown, invalid and crashed blocks.
- **HTML:** the `html` block and `HtmlContent`, covering every HTML element (including the legacy ones browsers still render), SVG and MathML, plus custom elements. Sanitisation happens at render time and `srcdoc` is always removed. Form fields stay editable, and `htmlToNodes` imports existing HTML.
