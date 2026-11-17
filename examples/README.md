# Examples

Each example is a standalone app that depends on the published packages. CI installs the **packed** packages into a clean copy of each one and runs it, so these examples always work with the current code.

| Example | Kind of app | Run it | Verified by |
|---|---|---|---|
| [vite-app](vite-app) | Single-page app; tour of every feature | `npm i && npm run dev` | `scripts/verify-browsers.ts` (Chromium, Firefox, WebKit) |
| [nextjs-app](nextjs-app) | Next.js 16 App Router | `npm i && npm run dev` | `scripts/verify-next.ts` |
| [node-server](node-server) | Content API and SSR on Node, Bun or Deno | `npm i && npm start` (or `start:bun`, `start:deno`) | `scripts/verify-pack.ts` |
| [studio](studio) | ContentCore Studio for static JSON and the content API | `npm i && npm start` (with `STUDIO_TOKEN`) | `scripts/verify-browsers.ts` (both modes, three engines) |
| [edge-worker](edge-worker) | Cloudflare Workers / Vercel Edge / Deno Deploy | `wrangler dev worker.mjs` | `scripts/verify-pack.ts` (edge VM) |

## Feature map

| Feature | Where to look |
|---|---|
| `defineBlock` with Zod, inferred `content` | `vite-app/src/blocks.tsx`, `nextjs-app/components/blocks.tsx` |
| Schema defaults and transforms (`highlighted.default(false)`) | `vite-app/src/blocks.tsx` (`pricingTable`) |
| `html` block: HTML, SVG, MathML, tables, forms, details/meter | `vite-app/src/content/pages.json` (`/`, `/pricing`) |
| Sanitisation (script URL, `onclick`, `<script>`) | `vite-app/src/content/pages.json` (`#unsafe-link`, `/legacy`) |
| `createHtmlBlock({ components })`: router links in rich text | `vite-app/src/blocks.tsx`, `nextjs-app/components/blocks.tsx` |
| Static source, API source, failover chain | `vite-app/src/content.ts` |
| Cache: `invalidate`, `prime`, per-isolate cache | `vite-app/src/App.tsx`, `nextjs-app/components/ContentPage.tsx`, `edge-worker/worker.mjs` |
| `usePrefetch` on links | `vite-app/src/router.tsx` |
| `useCapabilities`, `usePageDocument` | `vite-app/src/blocks.tsx` (`EditButton`) |
| All fallbacks and `onIssue` | `vite-app/src/App.tsx` |
| Unknown, invalid and legacy content | `vite-app/src/content/pages.json` (`/legacy`) |
| Embedding a CMS section in an app page | `vite-app/src/App.tsx` (`ShopPage`), `nextjs-app/app/shop/page.tsx` |
| Locales | `vite-app` (`/about` + locale switch), `nextjs-app/app/api/content/pages/route.ts` |
| Server components + client boundary | `nextjs-app/lib/content.ts`, `nextjs-app/app/[[...slug]]/page.tsx`, `nextjs-app/components/ContentPage.tsx` |
| Metadata from content, ISR, publish webhook | `nextjs-app/app/[[...slug]]/page.tsx`, `nextjs-app/app/api/revalidate/route.ts` |
| Content API contract (ETag, 304, 404, CDN headers) | `node-server/server.mjs`, `nextjs-app/app/api/content/pages/route.ts` |
| SSR with safe hydration data | `node-server/server.mjs` |
| Streaming edge render | `edge-worker/worker.mjs` |
| Editing UI (`ContentStudio`), static JSON import/export | `studio/src/main.tsx`, `nextjs-app/app/studio` |
| Content API with auth, validation, If-Match, file store | `studio/server.mjs` |
