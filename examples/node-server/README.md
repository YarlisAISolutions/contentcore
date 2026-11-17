# ContentCore: Node, Bun and Deno server

One file, no build step. It runs unchanged on all three runtimes:

```bash
npm i
npm start            # Node 20+
npm run start:bun    # Bun
npm run start:deno   # Deno 2
```

- **`GET /api/content/pages?slug=/&locale=`** is the content API contract that `createApiSource` reads. It returns the page JSON with an `ETag`, `304` when the ETag matches, `404` with `null` for a missing page, and CDN `Cache-Control` headers.
- **`GET /<slug>`** is a server-rendered page. It reads the API through a cached, retried source, escapes values in `<title>` and `<meta>`, and embeds the page JSON for hydration with `<` escaped.

Port this to Express, Fastify or Hono by moving the two handlers into routes.
