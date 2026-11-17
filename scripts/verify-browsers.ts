/**
 * Builds examples/vite-app from the packed tarballs and drives it in real Chromium, Firefox and
 * WebKit (Safari's engine) with Playwright: rendering, rich HTML/SVG/MathML, sanitisation,
 * client navigation, embedded sections, locales, capabilities and every fallback state.
 * Flags: --browsers=chromium,firefox,webkit
 */
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { extname, join } from "node:path";
import { $ } from "bun";
import { assert, installExample, packAll, startServer, workDir } from "./lib";

const PLAYWRIGHT = "playwright@1.65.1";
const AXE = "@axe-core/playwright@4.14.0";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"];
const VIEWPORTS = [
  { name: "phone", width: 320, height: 640 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];
const report = process.env.A11Y_REPORT === "1"; // print every violation instead of failing on the first page
const problems: string[] = [];

/** WCAG 2.2 AA audit (axe) plus a no-horizontal-scroll check at the current viewport. */
async function audit(AxeBuilder: any, page: any, label: string) {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  for (const v of result.violations) {
    problems.push(`${label}: [${v.impact}] ${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n: any) => n.target.join(" ")).join(" | ")}`);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) {
    const culprits = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(-4)
        .map((el) => `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ").join(".")}` : ""} (right ${Math.round(el.getBoundingClientRect().right)})`),
    );
    problems.push(`${label}: page scrolls horizontally by ${overflow}px; widest: ${culprits.join(", ")}`);
  }
  if (!report && problems.length) throw new Error(`Accessibility/responsive problems:\n${problems.join("\n")}`);
}
const browsers = (process.argv.find((a) => a.startsWith("--browsers="))?.split("=")[1] ?? "chromium,firefox,webkit").split(",");

const { dir, cleanup } = workDir("browsers");
let server: ReturnType<typeof Bun.serve> | undefined;
let studioServer: { url: string; stop: () => void } | undefined;
try {
  const tarballs = await packAll(dir, false);
  const app = await installExample("vite-app", dir, tarballs, [PLAYWRIGHT, AXE]);
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
  const { default: AxeBuilder } = await import(join(app, "node_modules/@axe-core/playwright/dist/index.mjs"));
  const engines = { chromium, firefox, webkit } as Record<string, { launch: () => Promise<any> }>;

  for (const name of browsers) {
    const browser = await engines[name]!.launch();
    const page = await (await browser.newContext()).newPage();
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

    // Accessibility (WCAG 2.2 AA) and responsive layout, every page at every viewport.
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      for (const path of ["/", "/pricing", "/about", "/shop", "/legacy", "/missing"]) {
        await page.goto(`${base}${path}`);
        await page.locator("main").waitFor();
        await page.waitForTimeout(50);
        await audit(AxeBuilder, page, `${name} site ${path} @${vp.name}`);
      }
    }
    await page.setViewportSize({ width: 1280, height: 800 });

    assert(errors.length === 0, `${name}: page errors: ${errors.join("; ")}`);
    console.log(`✓ ${name} ${browser.version()}: all example flows pass; WCAG 2.2 AA + no horizontal scroll at 320/768/1440px`);
    await browser.close();
  }

  // ContentCore Studio (examples/studio): static JSON mode and content API mode.
  const studio = await installExample("studio", dir, tarballs, [PLAYWRIGHT, AXE]);
  await $`npm run build --silent`.cwd(studio).quiet();
  const token = randomBytes(16).toString("hex");
  studioServer = await startServer(["node", "server.mjs"], studio, { PORT: "0", STUDIO_TOKEN: token });
  const sbase = studioServer.url;

  for (const name of browsers) {
    const browser = await engines[name]!.launch();
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    const fieldByLabel = (label: string) => page.getByRole("textbox", { name: label, exact: true }).first();

    // Static mode: edit, preview, save, export.
    await page.goto(`${sbase}/`);
    await page.getByRole("button", { name: /^Home/ }).click();
    await fieldByLabel("Heading").waitFor();
    await fieldByLabel("Heading").fill(`Hello from ${name}`);
    await page.locator(".cc-preview h1", { hasText: `Hello from ${name}` }).waitFor();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.locator(".cc-status", { hasText: "Saved /" }).waitFor();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export JSON" }).click()]);
    const exported = readFileSync(await download.path(), "utf8");
    assert(exported.includes(`Hello from ${name}`), `${name}: exported JSON lacks the edit`);

    // Rich text: Home's html block holds markup rich text would drop, so it opens as JSON.
    assert((await page.locator(".cc-json").count()) > 0, `${name}: embed-like html block should open in JSON mode`);
    // The Pricing page's table block is clean rich text: type into it and see it in the preview.
    await page.getByRole("button", { name: /^Pricing/ }).click();
    const area = page.locator(".cc-rte-area").first();
    await area.waitFor();
    await area.click();
    await page.keyboard.press("End");
    await page.keyboard.type(` typed-${name}`);
    await page.locator(".cc-preview", { hasText: `typed-${name}` }).waitFor();

    // API mode: wrong token is refused; the right token lists, saves to disk and is served publicly.
    await page.getByLabel("Content source").selectOption("api");
    const tokenInput = page.getByLabel("API token");
    await tokenInput.fill("wrong-token");
    await tokenInput.press("Enter");
    await page.locator(".cc-status", { hasText: "forbidden" }).waitFor();
    await tokenInput.fill(token);
    await tokenInput.press("Enter");
    await page.getByRole("button", { name: /^About/ }).first().click();
    await fieldByLabel("Title").waitFor();
    await fieldByLabel("Title").fill(`About (${name})`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.locator(".cc-status", { hasText: "Saved /about" }).waitFor();
    const onDisk = readFileSync(join(studio, "content", "pages.json"), "utf8");
    assert(onDisk.includes(`About (${name})`), `${name}: save did not reach content/pages.json`);
    const served = (await (await fetch(`${sbase}/api/content/pages?slug=/about`)).json()) as { title: string };
    assert(served.title === `About (${name})`, `${name}: public read endpoint not updated`);

    // Accessibility and responsive layout of the studio: empty, with a page open (form + rich text), at every width.
    await page.getByLabel("Content source").selectOption("static");
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${sbase}/`);
      await page.getByRole("button", { name: /^Home/ }).waitFor();
      await audit(AxeBuilder, page, `${name} studio (list) @${vp.name}`);
      await page.getByRole("button", { name: /^Home/ }).click();
      await fieldByLabel("Heading").waitFor();
      await audit(AxeBuilder, page, `${name} studio (editing) @${vp.name}`);
      await page.getByRole("button", { name: /^Resilience/ }).click();
      await page.locator(".cc-issue").first().waitFor();
      await audit(AxeBuilder, page, `${name} studio (validation errors) @${vp.name}`);
    }
    // Keyboard: reach "+ New page" with Tab and create a page with Enter.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${sbase}/`);
    await page.getByRole("button", { name: /^Home/ }).waitFor();
    let reached = false;
    for (let i = 0; i < 15 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() => document.activeElement?.textContent?.includes("+ New page") ?? false);
    }
    assert(reached, `${name}: "+ New page" is not reachable with the keyboard`);
    await page.keyboard.press("Enter");
    await fieldByLabel("Title").waitFor();

    assert(errors.length === 0, `${name}: studio page errors: ${errors.join("; ")}`);
    console.log(`✓ ${name}: studio edits static JSON (export) and API content (auth, save to disk, public read); WCAG 2.2 AA, responsive, keyboard`);
    await browser.close();
  }
  if (problems.length) throw new Error(`Accessibility/responsive problems:\n${problems.join("\n")}`);
} finally {
  studioServer?.stop();
  server?.stop(true);
  cleanup();
}
