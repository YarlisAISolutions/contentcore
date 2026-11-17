/**
 * Verifies what would be published, the way a consumer gets it:
 * 1. `npm pack` each package and check the tarball holds only dist, README, LICENSE, package.json;
 * 2. install the tarballs into a clean copy of examples/vite-app and type-check + build it;
 * 3. import both packages with Node (ESM and CommonJS) and render the README example.
 */
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { $ } from "bun";

const root = resolve(import.meta.dir, "..");
const work = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "contentcore-pack-"));
const allowed = /^package\/(dist\/.+|README\.md|LICENSE|package\.json)$/;

try {
  const tarballs: Record<string, string> = {};
  for (const pkg of ["core", "react"]) {
    const dir = join(root, "packages", pkg);
    const out = await $`npm pack --json --pack-destination ${work}`.cwd(dir).quiet().json();
    const [info] = out as Array<{ filename: string; files: { path: string }[]; size: number }>;
    const bad = info!.files.map((f) => `package/${f.path}`).filter((p) => !allowed.test(p));
    if (bad.length) throw new Error(`@contentcore/${pkg} tarball has unexpected files: ${bad.join(", ")}`);
    for (const required of ["package/README.md", "package/LICENSE", "package/dist/index.js", "package/dist/index.cjs", "package/dist/index.d.ts"]) {
      if (!info!.files.some((f) => `package/${f.path}` === required)) throw new Error(`@contentcore/${pkg} is missing ${required}`);
    }
    tarballs[pkg] = join(work, info!.filename);
    console.log(`✓ @contentcore/${pkg}: ${info!.files.length} files, ${(info!.size / 1024).toFixed(1)} kB packed`);
  }

  // Consumer app from the tarballs.
  const app = join(work, "vite-app");
  cpSync(join(root, "examples/vite-app"), app, {
    recursive: true,
    filter: (src) => !src.includes("node_modules") && !src.includes("/dist"),
  });
  await $`npm install --no-audit --no-fund --loglevel=error ${tarballs.core} ${tarballs.react}`.cwd(app).quiet();
  await $`npm install --no-audit --no-fund --loglevel=error`.cwd(app).quiet();
  await $`npm run build --silent`.cwd(app).quiet();
  if (!existsSync(join(app, "dist/index.html"))) throw new Error("example app build produced no dist/index.html");
  console.log("✓ examples/vite-app type-checks and builds against the packed tarballs");

  // Node ESM + CJS smoke tests.
  writeFileSync(
    join(app, "smoke.mjs"),
    `import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import { CmsProvider, CmsPage, createStaticSource, defineBlock, htmlBlock } from "@contentcore/react";
import { createApiSource, parsePageDocument } from "@contentcore/core";
const hero = defineBlock({ schema: z.object({ heading: z.string() }), component: ({ content }) => createElement("h1", null, content.heading) });
const page = parsePageDocument({ id: "home", slug: "/", schemaVersion: 1, blocks: [
  { id: "w", type: "hero", content: { heading: "Welcome" } },
  { id: "h", type: "html", content: { nodes: [{ tag: "p", children: ["hi"] }] } } ] });
const out = renderToString(createElement(CmsProvider, { source: createStaticSource({ pages: [page] }), blocks: { hero, html: htmlBlock } }, createElement(CmsPage, { page })));
if (out !== "<h1>Welcome</h1><p>hi</p>") throw new Error("ESM render mismatch: " + out);
if (typeof createApiSource({ baseUrl: "/x" }).peek !== "function") throw new Error("cache not on by default");
console.log("esm ok");
`,
  );
  writeFileSync(
    join(app, "smoke.cjs"),
    `const core = require("@contentcore/core");
const react = require("@contentcore/react");
for (const name of ["createStaticSource", "createApiSource", "createCachedSource", "parsePageDocument"]) {
  if (typeof core[name] !== "function") throw new Error("core missing " + name);
}
for (const name of ["CmsProvider", "CmsPage", "defineBlock", "useCapabilities", "HtmlContent"]) {
  if (!react[name]) throw new Error("react missing " + name);
}
console.log("cjs ok");
`,
  );
  await $`node smoke.mjs`.cwd(app);
  await $`node smoke.cjs`.cwd(app);
  console.log("✓ Node ESM and CommonJS imports work");
} finally {
  rmSync(work, { recursive: true, force: true });
}
