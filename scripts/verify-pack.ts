/**
 * Verifies the packed packages the way consumers get them, across runtimes:
 *  1. tarball contents, publint and "are the types wrong" (ESM/CJS/types resolution);
 *  2. examples/vite-app type-checks and builds against the tarballs;
 *  3. ESM + CommonJS imports and a server render on Node (and Bun, Deno when installed);
 *  4. examples/node-server (content API + SSR) on Node, Bun and Deno;
 *  5. examples/edge-worker inside an edge runtime (Web APIs only, no Node built-ins).
 * Flags: --skip-vite, --runtimes=node,bun,deno
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { assert, installExample, packAll, startServer, workDir } from "./lib";

const args = new Set(process.argv.slice(2));
const runtimesArg = process.argv.find((a) => a.startsWith("--runtimes="))?.split("=")[1];
const has = async (bin: string) => (await $`${bin} --version`.quiet().nothrow()).exitCode === 0;
const runtimes = runtimesArg
  ? runtimesArg.split(",")
  : ["node", "bun", ...((await has("deno")) ? ["deno"] : [])];

const { dir, cleanup } = workDir("pack");
try {
  const tarballs = await packAll(dir);

  // 1. Package-quality linters on the tarballs.
  for (const tgz of [tarballs.core, tarballs.react]) {
    await $`npx -y publint@0.3.25 ${tgz} --strict`.quiet();
    await $`npx -y @arethetypeswrong/cli@0.18.5 ${tgz} --profile node16`.quiet();
  }
  console.log("✓ publint and arethetypeswrong pass for both packages");

  // 2. Vite app.
  if (!args.has("--skip-vite")) {
    const app = await installExample("vite-app", dir, tarballs);
    await $`npm run build --silent`.cwd(app).quiet();
    console.log("✓ examples/vite-app type-checks and builds against the packed tarballs");
  }

  // 3. Import smoke tests per runtime.
  const smokeDir = await installExample("node-server", dir, tarballs);
  writeFileSync(
    join(smokeDir, "smoke.mjs"),
    `import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import { CmsProvider, CmsPage, createStaticSource, createApiSource, defineBlock, htmlBlock } from "@contentcore/react";
import { parsePageDocument } from "@contentcore/core";
const hero = defineBlock({ schema: z.object({ heading: z.string() }), component: ({ content }) => h("h1", null, content.heading) });
const page = parsePageDocument({ id: "home", slug: "/", schemaVersion: 1, blocks: [
  { id: "w", type: "hero", content: { heading: "Welcome" } },
  { id: "h", type: "html", content: { nodes: [{ tag: "p", children: ["hi"] }, { tag: "a", attrs: { href: "javascript:x" }, children: ["l"] }] } } ] });
const out = renderToString(h(CmsProvider, { source: createStaticSource({ pages: [page] }), blocks: { hero, html: htmlBlock } }, h(CmsPage, { page })));
if (out !== "<h1>Welcome</h1><p>hi</p><a>l</a>") throw new Error("render mismatch: " + out);
if (typeof createApiSource({ baseUrl: "/x" }).peek !== "function") throw new Error("cache not on by default");
console.log("esm ok");
`,
  );
  writeFileSync(
    join(smokeDir, "smoke.cjs"),
    `const core = require("@contentcore/core");
const react = require("@contentcore/react");
for (const n of ["createStaticSource", "createApiSource", "createCachedSource", "parsePageDocument"]) if (typeof core[n] !== "function") throw new Error("core missing " + n);
for (const n of ["CmsProvider", "CmsPage", "defineBlock", "useCapabilities", "HtmlContent", "createApiSource"]) if (!react[n]) throw new Error("react missing " + n);
console.log("cjs ok");
`,
  );
  const run = {
    node: (f: string) => ["node", f],
    bun: (f: string) => ["bun", f],
    deno: (f: string) => ["deno", "run", "--allow-read", "--allow-env", "--allow-net", "--allow-sys", f],
  } as Record<string, (f: string) => string[]>;
  for (const rt of runtimes) {
    for (const file of rt === "deno" ? ["smoke.mjs"] : ["smoke.mjs", "smoke.cjs"]) {
      const cmd = run[rt]!(file);
      await $`${cmd}`.cwd(smokeDir).quiet();
    }
    console.log(`✓ ${rt}: ESM${rt === "deno" ? "" : " + CommonJS"} imports and server render`);
  }

  // 4. Node server example (content API contract + SSR) per runtime.
  for (const rt of runtimes) {
    const cmd = rt === "deno" ? ["deno", "run", "--allow-read", "--allow-env", "--allow-net", "--allow-sys", "server.mjs"] : [rt, "server.mjs"];
    const server = await startServer(cmd, smokeDir, { PORT: "0" });
    try {
      const api = await fetch(`${server.url}/api/content/pages?slug=/`);
      assert(api.status === 200, `${rt}: content API status ${api.status}`);
      const etag = api.headers.get("etag");
      assert(etag, `${rt}: content API sent no ETag`);
      const again = await fetch(`${server.url}/api/content/pages?slug=/`, { headers: { "if-none-match": etag } });
      assert(again.status === 304, `${rt}: expected 304 for a matching ETag, got ${again.status}`);
      const html = await (await fetch(`${server.url}/`)).text();
      assert(html.includes("<h1>Welcome</h1>") && html.includes("<strong>HTML</strong>"), `${rt}: SSR output wrong:\n${html}`);
      const missing = await fetch(`${server.url}/nope`);
      assert(missing.status === 404, `${rt}: expected 404 for a missing page`);
      console.log(`✓ ${rt}: examples/node-server API (ETag/304/404) and server render`);
    } finally {
      server.stop();
    }
  }

  // 5. Edge runtime: bundle the worker for the edge conditions and run it in an edge VM.
  const edge = await installExample("edge-worker", dir, tarballs, ["@edge-runtime/vm@5.0.0"]);
  writeFileSync(join(edge, "harness.mjs"), `import worker from "./worker.mjs";\nglobalThis.__worker = worker;\n`);
  await $`bun build harness.mjs --target=browser --format=iife --conditions=worker --conditions=edge-light --outfile=bundle.js`.cwd(edge).quiet();
  writeFileSync(
    join(edge, "run-edge.mjs"),
    `import { readFileSync } from "node:fs";
import { EdgeVM } from "@edge-runtime/vm";
const vm = new EdgeVM();
// Real edge runtimes (Cloudflare Workers, Vercel Edge) provide MessageChannel, which React's
// scheduler needs; this test VM does not, so give it a minimal one.
vm.evaluate(\`
  if (typeof MessageChannel === "undefined") {
    globalThis.MessageChannel = class {
      constructor() {
        const port1 = { onmessage: null }, port2 = { onmessage: null };
        port1.postMessage = (data) => setTimeout(() => port2.onmessage && port2.onmessage({ data }));
        port2.postMessage = (data) => setTimeout(() => port1.onmessage && port1.onmessage({ data }));
        this.port1 = port1; this.port2 = port2;
      }
    };
  }\`);
// A fake content origin inside the edge realm.
vm.evaluate(\`
  globalThis.__origin = 0;
  globalThis.fetch = async (url, init) => {
    globalThis.__origin++;
    const slug = new URL(url).searchParams.get("slug");
    if (slug !== "/") return new Response("null", { status: 404 });
    return new Response(JSON.stringify({ id: "home", slug: "/", schemaVersion: 1, title: "Edge",
      blocks: [{ id: "w", type: "hero", content: { heading: "Hello from the edge" } }] }),
      { headers: { "content-type": "application/json", etag: '"v1"' } });
  };\`);
vm.evaluate(readFileSync("bundle.js", "utf8"));
const env = { CONTENT_API: "https://content.example.com/api/content" };
const res = await vm.evaluate("__worker.fetch(new Request('https://site.example/'), " + JSON.stringify(env) + ")");
const html = await res.text();
if (!html.includes("<h1>Hello from the edge</h1>")) throw new Error("edge render wrong: " + html);
await vm.evaluate("__worker.fetch(new Request('https://site.example/'), " + JSON.stringify(env) + ")");
if (vm.evaluate("__origin") !== 1) throw new Error("edge cache miss: origin called " + vm.evaluate("__origin") + " times");
const missing = await vm.evaluate("__worker.fetch(new Request('https://site.example/nope'), " + JSON.stringify(env) + ")");
if (missing.status !== 404) throw new Error("edge 404 expected");
console.log("edge ok");
`,
  );
  await $`node run-edge.mjs`.cwd(edge).quiet();
  console.log("✓ edge runtime: examples/edge-worker streams a render, caches content, 404s missing pages");
} finally {
  cleanup();
}
