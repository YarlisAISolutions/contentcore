// Content API + studio host. Runs on Node 20+, Bun and Deno:
//   STUDIO_TOKEN=<a long random string> node server.mjs
//
// - /api/content/*  createContentApiHandler over a file store: edits land in content/pages.json,
//                   ready to commit (static content in your repo, edited with a UI).
//                   Public reads (GET pages?slug=) are open; listing and writing need the token.
// - everything else the built studio from dist/ (run `npm run build` first).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createContentApiHandler } from "@contentcore/core";
import { createFileStore } from "@contentcore/core/fs";

const here = fileURLToPath(new URL(".", import.meta.url));
const token = process.env.STUDIO_TOKEN;
if (!token) console.warn("STUDIO_TOKEN is not set: the API is read-only (listing and saving are denied).");

const store = createFileStore(join(here, "content", "pages.json"));
const api = createContentApiHandler(store, {
  // Constant-time comparison of the bearer token.
  authorize: (request) => {
    if (!token) return false;
    const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    if (given.length !== token.length) return false;
    let diff = 0;
    for (let i = 0; i < token.length; i++) diff |= given.charCodeAt(i) ^ token.charCodeAt(i);
    return diff === 0;
  },
  onChange: (event) => console.log(`[content] ${event.type} ${event.slug ?? event.id}`),
});

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

/** node:http request → Web Request (body capped at 2 MiB; the handler enforces its own 1 MiB limit). */
async function toRequest(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(chunk);
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
  const init = { method: req.method, headers };
  if (chunks.length && req.method !== "GET" && req.method !== "HEAD") init.body = Buffer.concat(chunks);
  return new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, init);
}

async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function staticFile(pathname, res) {
  const dist = join(here, "dist");
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let file = join(dist, safe === "/" ? "index.html" : safe);
  if (!file.startsWith(dist)) file = join(dist, "index.html"); // never serve outside dist/
  let body;
  try {
    body = await readFile(file);
  } catch {
    file = join(dist, "index.html");
    body = await readFile(file).catch(() => Buffer.from("Run `npm run build` first."));
  }
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  res.end(body);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      const response = await api(await toRequest(req));
      return send(res, response ?? Response.json({ error: "not found" }, { status: 404 }));
    }
    return staticFile(url.pathname, res);
  } catch (error) {
    res.writeHead(error.status ?? 500, { "content-type": "text/plain" }).end(error.status ? error.message : "Internal error");
    if (!error.status) console.error(error);
  }
});

server.listen(Number(process.env.PORT ?? 8787), "127.0.0.1", () => {
  console.log(`listening on http://127.0.0.1:${server.address().port}`);
});
