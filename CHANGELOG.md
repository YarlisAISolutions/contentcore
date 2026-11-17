# Changelog

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
