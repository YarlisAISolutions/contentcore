/**
 * Builds examples/vite-app from the packed tarballs and drives it in real Chromium, Firefox and
 * WebKit (Safari's engine) with Playwright: rendering, rich HTML/SVG/MathML, sanitisation,
 * client navigation, embedded sections, locales, capabilities and every fallback state.
 * Flags: --browsers=chromium,firefox,webkit
 */
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { $ } from "bun";
import { assert, installExample, packAll, workDir } from "./lib";

const PLAYWRIGHT = "playwright@1.65.1";
const browsers = (process.argv.find((a) => a.startsWith("--browsers="))?.split("=")[1] ?? "chromium,firefox,webkit").split(",");

const { dir, cleanup } = workDir("browsers");
let server: ReturnType<typeof Bun.serve> | undefined;
try {
  const tarballs = await packAll(dir, false);
  const app = await installExample("vite-app", dir, tarballs, [PLAYWRIGHT]);
  await $`npm run build --silent`.cwd(app).quiet();
  await $`npx playwright install ${browsers}`.cwd(app).quiet();

  // Static hosting with SPA fallback, like any CDN.
  const dist = join(app, "dist");
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname;
      const file = join(dist, path);
      const target = path !== "/" && existsSync(file) ? file : join(dist, "index.html");
      return new Response(readFileSync(target), { headers: { "content-type": types[extname(target)] ?? "application/octet-stream" } });
    },
  });
  const base = `http://127.0.0.1:${server.port}`;

  const { chromium, firefox, webkit } = await import(join(app, "node_modules/playwright/index.mjs"));
  const engines = { chromium, firefox, webkit } as Record<string, { launch: () => Promise<any> }>;

  for (const name of browsers) {
    const browser = await engines[name]!.launch();
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    page.on("dialog", (d: { dismiss: () => Promise<void> }) => {
      errors.push("unexpected dialog (script ran!)");
      void d.dismiss();
    });
    const text = (sel: string) => page.locator(sel).first().textContent();

    // Home: blocks, rich HTML, SVG, MathML, sanitisation, capabilities, editable form field.
    await page.goto(`${base}/`);
    await page.waitForSelector("h1:text('Welcome')");
    assert((await page.locator("main svg rect").count()) === 3, `${name}: SVG not rendered`);
    assert((await page.locator("main math msup").count()) === 1, `${name}: MathML not rendered`);
    assert((await page.locator("main meter").count()) === 1, `${name}: meter not rendered`);
    const unsafe = page.locator("#unsafe-link");
    assert((await unsafe.getAttribute("href")) === null && (await unsafe.getAttribute("onclick")) === null, `${name}: unsafe attributes kept`);
    await unsafe.click();
    assert(await page.locator("button.edit").isVisible(), `${name}: capability-gated edit button missing`);
    const email = page.locator("#email");
    assert((await email.inputValue()) === "you@example.com", `${name}: input initial value`);
    await email.fill("typed@example.com");
    assert((await email.inputValue()) === "typed@example.com", `${name}: input not editable`);

    // Client navigation through a link inside rich content, and a typed block.
    await page.locator("main a", { hasText: "link to pricing" }).click();
    await page.waitForSelector(".plans");
    assert(page.url() === `${base}/pricing`, `${name}: client navigation did not update the URL`);
    assert((await text("table caption")) === "Compare plans", `${name}: table not rendered`);
    assert((await page.locator(".plan").count()) === 2, `${name}: pricing plans`);

    // Resilience: unknown, invalid, blocked and legacy content on one page.
    await page.locator("nav a", { hasText: "Resilience" }).click();
    await page.waitForSelector("text=The rest of the page still renders");
    assert((await page.locator("main .issue").count()) === 2, `${name}: unknown/invalid fallbacks`);
    assert((await page.locator("main font[color='green']").count()) === 1, `${name}: legacy element`);
    assert((await page.locator("main script").count()) === 0, `${name}: script element rendered`);

    // App-owned page embedding a CMS section.
    await page.locator("nav a", { hasText: "Shop" }).click();
    await page.waitForSelector(".promo a");
    assert((await text(".promo a"))?.includes("Spring sale"), `${name}: embedded section`);

    // Locale switch.
    await page.locator("nav a", { hasText: "About" }).click();
    await page.waitForSelector("h1:text('About us')");
    await page.selectOption("header select", "fr");
    await page.waitForSelector("h1:text('À propos')");

    // Not found, and a direct deep link (server returns index.html, app resolves the slug).
    await page.goto(`${base}/missing`);
    await page.waitForSelector("text=No page at /missing");
    await page.goto(`${base}/pricing`);
    await page.waitForSelector(".plans");

    assert(errors.length === 0, `${name}: page errors: ${errors.join("; ")}`);
    console.log(`✓ ${name} ${browser.version()}: all example flows pass`);
    await browser.close();
  }
} finally {
  server?.stop(true);
  cleanup();
}
