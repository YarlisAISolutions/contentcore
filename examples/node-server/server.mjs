// One process, two roles, no build step. Runs on Node 20+, Bun and Deno:
//   1. a content API that implements the contract createApiSource expects (ETag, 304, Cache-Control);
//   2. a server-rendering frontend that reads that API through a cached, retried source.
// In production these are usually separate services; the code stays the same.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import { CmsPage, CmsProvider, createApiSource, defineBlock, htmlBlock, parsePageDocument } from "@contentcore/react";

const pages = JSON.parse(readFileSync(new URL("./content/pages.json", import.meta.url), "utf8")).map((p) =>
  parsePageDocument(p),
);

// ---------------------------------------------------------------------------------------------
// 1. Content API: GET /api/content/pages?slug=/about&locale=fr
// ---------------------------------------------------------------------------------------------
async function etagOf(text) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return `"${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}"`;
}

async function contentApi(url, req, res) {
  const slug = url.searchParams.get("slug") ?? "/";
  const locale = url.searchParams.get("locale") ?? undefined;
  const page =
    pages.find((p) => p.slug === slug && p.locale === locale) ?? pages.find((p) => p.slug === slug && !p.locale);
  if (!page) {
    res.writeHead(404, { "content-type": "application/json" }).end("null");
    return;
  }
  const body = JSON.stringify(page);
  const etag = await etagOf(body);
  const headers = {
    etag,
    // Shared caches (CDN) keep it 60 s and may serve stale for 5 min while revalidating.
    "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    vary: "Accept-Language",
  };
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers).end();
    return;
  }
  res.writeHead(200, { ...headers, "content-type": "application/json" }).end(body);
}

// ---------------------------------------------------------------------------------------------
// 2. Frontend: server-render any slug with the same blocks the browser would use.
// ---------------------------------------------------------------------------------------------
const hero = defineBlock({
  schema: z.object({ heading: z.string(), description: z.string().optional() }),
  component: ({ content }) =>
    h("section", null, h("h1", null, content.heading), content.description && h("p", null, content.description)),
});
const blocks = { hero, html: htmlBlock };

let source; // created once the port is known; module-level so its cache is shared across requests

/** JSON that is safe inside <script>: no "</script>" or HTML comment breakouts. */
const safeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function frontend(url, res) {
  // Public content only: this source and its cache are shared by every visitor.
  const page = await source.getPage(url.pathname, { locale: url.searchParams.get("locale") ?? undefined });
  if (!page) {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" }).end("<h1>Not found</h1>");
    return;
  }
  const app = renderToString(h(CmsProvider, { source, blocks }, h(CmsPage, { page })));
  const description = typeof page.meta?.description === "string" ? page.meta.description : "";
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(`<!doctype html>
<html lang="${escapeHtml(page.locale ?? "en")}">
<head>
<meta charset="utf-8"><title>${escapeHtml(page.title ?? "")}</title>
<meta name="description" content="${escapeHtml(description)}">
</head>
<body>
<div id="root">${app}</div>
<!-- The client hydrates with the same page: hydrateRoot(root, <CmsProvider…><CmsPage page={page} /></CmsProvider>) -->
<script id="__CONTENT__" type="application/json">${safeJson(page)}</script>
</body>
</html>`);
}

function start(port = Number(process.env.PORT ?? 3000)) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (url.pathname === "/api/content/pages") return await contentApi(url, req, res);
      if (url.pathname === "/healthz") return void res.writeHead(200).end("ok");
      return await frontend(url, res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end("Internal error");
    }
  });
  server.listen(port, () => {
    const { port: actual } = server.address();
    source = createApiSource({ baseUrl: `http://127.0.0.1:${actual}/api/content`, timeoutMs: 3000 });
    console.log(`listening on http://127.0.0.1:${actual}`);
  });
  return server;
}

start();
