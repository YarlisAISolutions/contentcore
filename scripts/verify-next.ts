/**
 * Builds examples/nextjs-app (App Router, React Server Components) against the packed tarballs,
 * then starts it and checks prerendered pages, the embedded section, metadata and the content API.
 */
import { $ } from "bun";
import { assert, installExample, packAll, startServer, workDir } from "./lib";

const { dir, cleanup } = workDir("next");
try {
  const tarballs = await packAll(dir, false);
  const app = await installExample("nextjs-app", dir, tarballs);
  const build = await $`npx next build`.cwd(app).env({ ...process.env, NEXT_TELEMETRY_DISABLED: "1" }).quiet().nothrow();
  if (build.exitCode !== 0) throw new Error(`next build failed:\n${build.stdout}\n${build.stderr}`);
  console.log("✓ next build (server components import @contentcore/core, client components @contentcore/react)");

  const server = await startServer(["node", "-e", `
    const { spawn } = require("node:child_process");
    const p = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", "0", "-H", "127.0.0.1"], { stdio: ["ignore", "pipe", "inherit"] });
    p.stdout.on("data", (d) => { const m = String(d).match(/(http:\\/\\/127\\.0\\.0\\.1:\\d+)/); if (m) console.log("listening on " + m[1]); });
    process.on("SIGTERM", () => { p.kill(); process.exit(0); });
  `], app, { NEXT_TELEMETRY_DISABLED: "1", REVALIDATE_SECRET: "verify-only-secret" });
  try {
    const home = await (await fetch(`${server.url}/`)).text();
    assert(home.includes("Welcome") && home.includes("<title>Home</title>"), "home page or its metadata missing");
    // The raw page data (including the unsafe link) is in the RSC payload as inert JSON; what
    // matters is that no rendered element carries the script URL or the handler.
    assert(!/href="javascript:/i.test(home) && !/onclick=/i.test(home), "unsafe attribute rendered");
    const about = await (await fetch(`${server.url}/about`)).text();
    assert(about.includes("About us"), "about page missing");
    const shop = await (await fetch(`${server.url}/shop`)).text();
    assert(shop.includes("Spring sale"), "embedded section missing on /shop");
    const studio = await fetch(`${server.url}/studio`);
    assert(studio.status === 200 && (await studio.text()).includes("ContentCore Studio"), "studio route missing");
    const missing = await fetch(`${server.url}/does-not-exist`);
    assert(missing.status === 404, `expected 404, got ${missing.status}`);
    const api = await fetch(`${server.url}/api/content/pages?slug=/about&locale=fr`);
    const body = (await api.json()) as { id: string };
    assert(api.status === 200 && body.id === "about-fr", "content API route");
    const etag = api.headers.get("etag")!;
    const again = await fetch(`${server.url}/api/content/pages?slug=/about&locale=fr`, { headers: { "if-none-match": etag } });
    assert(again.status === 304, "content API ETag/304");
    const webhook = await fetch(`${server.url}/api/revalidate`, { method: "POST", body: JSON.stringify({ slug: "/" }) });
    assert(webhook.status === 401, "revalidate webhook must reject requests without the secret");
    const wrong = await fetch(`${server.url}/api/revalidate`, { method: "POST", headers: { "x-revalidate-secret": "nope" }, body: JSON.stringify({ slug: "/" }) });
    assert(wrong.status === 401, "revalidate webhook must reject a wrong secret");
    const ok = await fetch(`${server.url}/api/revalidate`, { method: "POST", headers: { "x-revalidate-secret": "verify-only-secret" }, body: JSON.stringify({ slug: "/" }) });
    assert(ok.status === 200, `revalidate webhook with the right secret returned ${ok.status}`);
    console.log("✓ next start: prerendered pages, metadata, embedded section, studio route, 404, content API (ETag), webhook auth");
  } finally {
    server.stop();
  }
} finally {
  cleanup();
}
