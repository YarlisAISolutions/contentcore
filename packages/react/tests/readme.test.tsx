// Keeps the "Static and dynamic content" examples in the root README.md honest:
// the same blocks, pages, backend handler and sources, run for real.
import { describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import {
  CmsPage,
  CmsProvider,
  createApiSource,
  createFallbackSource,
  createStaticSource,
  defineBlock,
  htmlBlock,
} from "../src";

// --- blocks.tsx (README) -------------------------------------------------------------
const hero = defineBlock({
  schema: z.object({ heading: z.string(), description: z.string().optional() }),
  component: ({ content }) => (
    <section>
      <h1>{content.heading}</h1>
      {content.description && <p>{content.description}</p>}
    </section>
  ),
});
const blocks = { hero, html: htmlBlock };

// --- content/pages.json (README) -----------------------------------------------------
const pages = [
  {
    id: "home",
    slug: "/",
    schemaVersion: 1,
    title: "Home",
    blocks: [
      { id: "welcome", type: "hero", content: { heading: "Welcome", description: "Explore our products" } },
      {
        id: "intro",
        type: "html",
        content: { nodes: [{ tag: "p", children: ["Built with ", { tag: "strong", children: ["ContentCore"] }, "."] }] },
      },
    ],
  },
  {
    id: "about",
    slug: "/about",
    schemaVersion: 1,
    title: "About",
    blocks: [{ id: "intro", type: "hero", content: { heading: "About us" } }],
  },
];

const HOME_HTML =
  "<section><h1>Welcome</h1><p>Explore our products</p></section><p>Built with <strong>ContentCore</strong>.</p>";

// --- api/content/pages.ts (README backend), over an in-memory "database" ---------------
const db = {
  rows: pages.map((p) => ({ ...p, updatedAt: "2026-11-17T00:00:00Z" })),
  down: false,
  async find({ slug }: { slug: string; locale: string | null }) {
    if (this.down) throw new Error("database unavailable");
    return this.rows.find((p) => p.slug === slug);
  },
};

async function GET(request: Request) {
  const url = new URL(request.url);
  const page = await db.find({ slug: url.searchParams.get("slug") ?? "/", locale: url.searchParams.get("locale") });
  if (!page) return Response.json(null, { status: 404 });
  const body = JSON.stringify(page);
  const etag = `"${page.updatedAt}"`;
  const headers = { etag, "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { ...headers, "content-type": "application/json" } });
}

/** fetch that routes to the handler above, recording each request. */
function backend(log: string[] = [], delayMs = 0): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const request = new Request(new URL(String(input), "http://app.local"), init);
    try {
      const response = await GET(request);
      log.push(`${new URL(request.url).searchParams.get("slug")} ${response.status}`);
      return response;
    } catch {
      log.push("500");
      return new Response("error", { status: 500 });
    }
  }) as typeof fetch;
}

async function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  const root = createRoot(el);
  await act(async () => root.render(node));
  return { el, unmount: () => act(() => root.unmount()) };
}
const settle = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe("README: static content", () => {
  test("renders on the first render with no loading state", () => {
    const source = createStaticSource({ pages });
    expect(source.peek?.("/")?.id).toBe("home");
    const html = renderToString(
      <CmsProvider source={source} blocks={blocks} fallbacks={{ notFound: (slug) => <p>No page at {slug}</p> }}>
        <CmsPage slug="/" />
      </CmsProvider>,
    );
    expect(html).toBe(HOME_HTML);
  });

  test("shows the notFound fallback for a missing slug", async () => {
    const { el, unmount } = await mount(
      <CmsProvider source={createStaticSource({ pages })} blocks={blocks} fallbacks={{ notFound: (slug) => <p>No page at {slug}</p> }}>
        <CmsPage slug="/nope" />
      </CmsProvider>,
    );
    await settle();
    expect(el.textContent).toBe("No page at /nope");
    await unmount();
  });
});

describe("README: dynamic content", () => {
  test("loading, then the page; repeat views come from the cache; ETag revalidation returns 304", async () => {
    const log: string[] = [];
    let now = 0;
    const source = createApiSource({ baseUrl: "/api/content", cache: { ttl: 30_000, now: () => now }, fetch: backend(log, 5) });
    const fallbacks = { loading: <p>Loading…</p> };

    const first = await mount(
      <CmsProvider source={source} blocks={blocks} fallbacks={fallbacks}>
        <CmsPage slug="/" />
      </CmsProvider>,
    );
    expect(first.el.textContent).toBe("Loading…");
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(first.el.innerHTML).toBe(HOME_HTML);
    await first.unmount();

    // Revisit: instant from cache, no request.
    const second = await mount(
      <CmsProvider source={source} blocks={blocks} fallbacks={fallbacks}>
        <CmsPage slug="/" />
      </CmsProvider>,
    );
    expect(second.el.innerHTML).toBe(HOME_HTML);
    await second.unmount();
    expect(log).toEqual(["/ 200"]);

    // After the ttl: served instantly, refreshed in the background with If-None-Match → 304.
    now = 31_000;
    await source.getPage("/");
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    expect(log).toEqual(["/ 200", "/ 304"]);
  });

  test("published changes appear after a refresh, and the API being down keeps the last good page", async () => {
    const source = createApiSource({ baseUrl: "/api/content", retry: false, fetch: backend() });
    const { el, unmount } = await mount(
      <CmsProvider source={source} blocks={blocks}>
        <CmsPage slug="/about" />
      </CmsProvider>,
    );
    await settle();
    expect(el.querySelector("h1")?.textContent).toBe("About us");

    // An editor publishes; the app's "Refresh content" button invalidates the cache.
    const about = db.rows.find((p) => p.slug === "/about")!;
    about.blocks = [{ id: "intro", type: "hero", content: { heading: "About us (updated)" } }];
    about.updatedAt = "2026-11-17T01:00:00Z";
    await act(async () => {
      source.invalidate();
      await source.prefetch("/about");
    });
    await settle();
    expect(el.querySelector("h1")?.textContent).toBe("About us (updated)");

    // The API goes down: the page on screen stays.
    db.down = true;
    await act(async () => {
      source.invalidate();
      await source.prefetch("/about");
    });
    await settle();
    expect(el.querySelector("h1")?.textContent).toBe("About us (updated)");
    db.down = false;
    await unmount();
  });

  test("with nothing cached, an API error shows the error fallback with a working retry", async () => {
    db.down = true;
    const source = createApiSource({ baseUrl: "/api/content", retry: false, fetch: backend() });
    const { el, unmount } = await mount(
      <CmsProvider
        source={source}
        blocks={blocks}
        onIssue={() => {}}
        fallbacks={{
          error: (_e, retry) => (
            <button type="button" onClick={retry}>
              Couldn't load. Try again
            </button>
          ),
        }}
      >
        <CmsPage slug="/" />
      </CmsProvider>,
    );
    await settle();
    expect(el.textContent).toBe("Couldn't load. Try again");
    db.down = false;
    await act(async () => el.querySelector("button")!.click());
    await settle();
    expect(el.innerHTML).toBe(HOME_HTML);
    await unmount();
  });
});

describe("README: dynamic with a static safety net", () => {
  test("serves the bundled snapshot when the API fails", async () => {
    db.down = true;
    const source = createFallbackSource(
      createApiSource({ baseUrl: "/api/content", retry: false, fetch: backend() }),
      createStaticSource({ pages }),
      { onError: "next" },
    );
    expect((await source.getPage("/about"))?.blocks[0]?.content).toEqual({ heading: "About us" });
    db.down = false;
  });
});

describe("README: server-rendered dynamic content", () => {
  test("<CmsPage page> renders a page loaded on the server, synchronously", async () => {
    const serverSource = createApiSource({ baseUrl: "http://cms.local/api/content", fetch: backend() });
    const page = await serverSource.getPage("/");
    const html = renderToString(
      <CmsProvider source={createStaticSource({ pages: [] })} blocks={blocks}>
        <CmsPage page={page!} />
      </CmsProvider>,
    );
    expect(html).toBe(HOME_HTML);
  });
});
