// An edge worker (Cloudflare Workers, Vercel Edge, Deno Deploy, Netlify Edge): Web APIs only,
// streaming server render, content from your API through the cached, resilient source.
//
// Cloudflare: `wrangler deploy worker.mjs` with CONTENT_API set as a var.
// Bundlers pick React's edge build for "react-dom/server" via the worker/edge export conditions.
import { createElement as h } from "react";
import { renderToReadableStream } from "react-dom/server";
import { z } from "zod";
import { CmsPage, CmsProvider, createApiSource, defineBlock, htmlBlock } from "@contentcore/react";

const hero = defineBlock({
  schema: z.object({ heading: z.string(), description: z.string().optional() }),
  component: ({ content }) =>
    h("section", null, h("h1", null, content.heading), content.description && h("p", null, content.description)),
});
const blocks = { hero, html: htmlBlock };

// One source per isolate: its in-memory cache survives between requests on a warm isolate.
// Public content only (it is shared by every visitor of this isolate).
let source;
const getSource = (env) =>
  (source ??= createApiSource({
    baseUrl: env.CONTENT_API,
    timeoutMs: 3000, // edge budgets are tight: fail fast and fall back to stale content
    retry: { retries: 1 },
  }));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const page = await getSource(env).getPage(url.pathname);
    if (!page) return new Response("Not found", { status: 404 });

    const body = await renderToReadableStream(
      h(
        "html",
        { lang: page.locale ?? "en" },
        h("head", null, h("meta", { charSet: "utf-8" }), h("title", null, page.title ?? "")),
        h("body", null, h(CmsProvider, { source: getSource(env), blocks }, h(CmsPage, { page }))),
      ),
    );
    return new Response(body, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Let the CDN cache the HTML briefly and refresh it in the background.
        "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      },
    });
  },
};
