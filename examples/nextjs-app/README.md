# ContentCore: Next.js App Router

Run it with `npm i && npm run dev`.

- **`lib/content.ts`:** server-only content access through `@contentcore/core`. `React.cache` deduplicates lookups per request. Set `CONTENT_API` to read from an API; otherwise the bundled JSON is used.
- **`app/[[...slug]]/page.tsx`:** the catch-all CMS route, with `generateStaticParams`, `generateMetadata`, ISR (`revalidate = 60`) and `notFound()`.
- **`components/ContentPage.tsx`:** the `"use client"` boundary. It receives the server-loaded page, primes the browser cache and renders `<CmsPage page>`.
- **`components/blocks.tsx`:** the block registry. Internal links in rich text use `next/link`.
- **`app/shop/page.tsx`:** an app-owned page with an embedded CMS section, loaded on the server.
- **`app/api/content/pages/route.ts`:** the content API (ETag, 304, CDN headers) for browser-side sources.
- **`app/api/revalidate/route.ts`:** the publish webhook. Set `REVALIDATE_SECRET`, and have the CMS POST `{ "slug": "/about" }` with header `x-revalidate-secret`.

See the [embedding guide](../../docs/embedding.md#nextjs-app-router) for the rules behind this layout.
