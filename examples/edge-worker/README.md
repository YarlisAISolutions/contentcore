# ContentCore: edge worker

A Workers-style `fetch` handler (`worker.mjs`). It runs on Cloudflare Workers, Vercel Edge, Deno Deploy and Netlify Edge.

- **Content** comes from `env.CONTENT_API` through `createApiSource`, created once per isolate so warm isolates serve from memory. It uses a 3 s timeout and 1 retry, with stale-if-error behind them.
- **Rendering** streams HTML with `renderToReadableStream`, and sends CDN `Cache-Control` headers.

Cloudflare: `wrangler dev worker.mjs --var CONTENT_API:https://example.com/api/content`

CI bundles this worker with the edge export conditions and runs it in an edge runtime VM (`scripts/verify-pack.ts`).
