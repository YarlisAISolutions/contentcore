import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { z } from "zod";
import {
  type CmsIssue,
  CmsPage,
  CmsProvider,
  type ContentSource,
  createApiSource,
  createStaticSource,
  defineBlock,
  useCapabilities,
  usePageDocument,
} from "../src";

// The example from the design note, verbatim: `content.heading` must be inferred as string.
const hero = defineBlock({
  schema: z.object({
    heading: z.string(),
    description: z.string().optional(),
  }),
  component: ({ content }) => (
    <section>
      <h1>{content.heading}</h1>
      <p>{content.description}</p>
    </section>
  ),
});

const homePage = {
  id: "home",
  slug: "/",
  schemaVersion: 1,
  blocks: [{ id: "welcome", type: "hero", content: { heading: "Welcome", description: "Explore our products" } }],
};

const fallbacks = {
  loading: <p>loading</p>,
  notFound: (slug: string) => <p>missing {slug}</p>,
  error: (error: unknown, retry: () => void) => (
    <button type="button" onClick={retry}>
      error: {(error as Error).message}
    </button>
  ),
  unknownBlock: (b: { type: string }) => <p>unknown {b.type}</p>,
  invalidBlock: (b: { id: string }, issues: { path: string }[]) => (
    <p>
      invalid {b.id} at {issues.map((i) => i.path).join(",")}
    </p>
  ),
  blockError: (b: { id: string }) => <p>crashed {b.id}</p>,
};

let root: Root | undefined;
let container: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  container?.remove();
});

async function render(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(node));
  return container;
}

const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

describe("CmsPage", () => {
  test("renders a page from a static source", async () => {
    const issues: CmsIssue[] = [];
    const el = await render(
      <CmsProvider source={createStaticSource({ pages: [homePage] })} blocks={{ hero }} onIssue={(i) => issues.push(i)}>
        <CmsPage slug="/" />
      </CmsProvider>,
    );
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("Welcome");
    expect(el.querySelector("p")?.textContent).toBe("Explore our products");
    expect(issues).toEqual([]);
  });

  test("renders the same output from an API source", async () => {
    const api = createApiSource({ baseUrl: "/api", fetch: (async () => Response.json(homePage)) as unknown as typeof fetch });
    const el = await render(
      <CmsProvider source={api} blocks={{ hero }}>
        <CmsPage slug="/" />
      </CmsProvider>,
    );
    await flush();
    expect(el.innerHTML).toBe("<section><h1>Welcome</h1><p>Explore our products</p></section>");
  });

  test("shows loading, then not-found", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const slow: ContentSource = { getPage: async () => (await gate, null) };
    const el = await render(
      <CmsProvider source={slow} blocks={{ hero }} fallbacks={fallbacks}>
        <CmsPage slug="/x" />
      </CmsProvider>,
    );
    expect(el.textContent).toBe("loading");
    release();
    await flush();
    expect(el.textContent).toBe("missing /x");
  });

  test("shows the error fallback and retries", async () => {
    let calls = 0;
    const flaky: ContentSource = {
      getPage: async () => {
        calls += 1;
        if (calls === 1) throw new Error("offline");
        return { ...homePage };
      },
    };
    const issues: CmsIssue[] = [];
    const el = await render(
      <CmsProvider source={flaky} blocks={{ hero }} fallbacks={fallbacks} onIssue={(i) => issues.push(i)}>
        <CmsPage slug="/" />
      </CmsProvider>,
    );
    await flush();
    expect(el.textContent).toBe("error: offline");
    expect(issues.map((i) => i.kind)).toEqual(["load-error"]);
    await act(async () => el.querySelector("button")!.click());
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("Welcome");
  });

  test("isolates unknown, invalid and crashing blocks", async () => {
    const boom = defineBlock({
      schema: z.object({}),
      component: () => {
        throw new Error("kaboom");
      },
    });
    const page = {
      ...homePage,
      blocks: [
        { id: "a", type: "hero", content: { heading: "Kept" } },
        { id: "b", type: "carousel", content: {} },
        { id: "c", type: "hero", content: { heading: 42 } },
        { id: "d", type: "boom", content: {} },
      ],
    };
    const issues: CmsIssue[] = [];
    const originalError = console.error;
    console.error = () => {}; // React logs the caught render error.
    try {
      const el = await render(
        <CmsProvider
          source={createStaticSource({ pages: [page] })}
          blocks={{ hero, boom }}
          fallbacks={fallbacks}
          onIssue={(i) => issues.push(i)}
        >
          <CmsPage slug="/" />
        </CmsProvider>,
      );
      await flush();
      expect([...el.children].map((c) => c.textContent)).toEqual([
        "Kept",
        "unknown carousel",
        "invalid c at heading",
        "crashed d",
      ]);
    } finally {
      console.error = originalError;
    }
    expect(issues.map((i) => i.kind).sort()).toEqual(["block-error", "invalid-block", "unknown-block"]);
  });

  test("renders a pre-loaded page synchronously (SSR)", () => {
    const html = renderToString(
      <CmsProvider source={createStaticSource({ pages: [] })} blocks={{ hero }}>
        <CmsPage page={{ ...homePage }} />
      </CmsProvider>,
    );
    expect(html).toBe("<section><h1>Welcome</h1><p>Explore our products</p></section>");
  });

  test("supports async schemas", async () => {
    const asyncHero = defineBlock({
      schema: z.object({ heading: z.string().refine(async (v) => v.length > 0) }),
      component: ({ content }) => <h2>{content.heading}</h2>,
    });
    const el = await render(
      <CmsProvider source={createStaticSource({ pages: [] })} blocks={{ hero: asyncHero }} fallbacks={fallbacks}>
        <CmsPage page={{ ...homePage }} />
      </CmsProvider>,
    );
    await flush();
    expect(el.innerHTML).toBe("<h2>Welcome</h2>");
  });
});

describe("hooks", () => {
  test("useCapabilities merges provider and page capabilities; usePageDocument exposes the page", async () => {
    const Toolbar = defineBlock({
      schema: z.object({}),
      component: () => {
        const { can } = useCapabilities();
        const page = usePageDocument();
        return (
          <p>
            {page?.id}:{can("page:edit") ? "edit" : "-"}:{can("media:upload") ? "upload" : "-"}:
            {can("page:delete") ? "delete" : "-"}
          </p>
        );
      },
    });
    const page = { ...homePage, capabilities: ["page:edit"], blocks: [{ id: "t", type: "toolbar", content: {} }] };
    const el = await render(
      <CmsProvider source={createStaticSource({ pages: [] })} blocks={{ toolbar: Toolbar }} capabilities={["media:*"]}>
        <CmsPage page={page} />
      </CmsProvider>,
    );
    expect(el.textContent).toBe("home:edit:upload:-");
  });

  test("throws a helpful error without a provider", () => {
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(() => renderToString(<CmsPage slug="/" />)).toThrow(/CmsProvider/);
    } finally {
      console.error = originalError;
    }
  });
});

describe("caching and live updates", () => {
  test("a cached page renders on the first render with no loading state", async () => {
    let calls = 0;
    const api = createApiSource({
      baseUrl: "/api",
      fetch: (async () => {
        calls += 1;
        return Response.json(homePage);
      }) as unknown as typeof fetch,
    });
    await api.prefetch("/");
    const html = renderToString(
      <CmsProvider source={api} blocks={{ hero }} fallbacks={fallbacks}>
        <CmsPage slug="/" />
      </CmsProvider>,
    );
    expect(html).toBe("<section><h1>Welcome</h1><p>Explore our products</p></section>");
    expect(calls).toBe(1);
  });

  test("re-renders when the cache gets new content, and keeps content when a refresh fails", async () => {
    let version = 1;
    let fail = false;
    let now = 0;
    const api = createApiSource({
      baseUrl: "/api",
      retry: false,
      cache: { ttl: 10, staleWhileRevalidate: 1_000, now: () => now },
      fetch: (async () => {
        if (fail) return new Response("down", { status: 500 });
        return Response.json({ ...homePage, blocks: [{ id: "welcome", type: "hero", content: { heading: `v${version}` } }] });
      }) as unknown as typeof fetch,
    });
    const el = await render(
      <CmsProvider source={api} blocks={{ hero }} fallbacks={fallbacks} onIssue={() => {}}>
        <CmsPage slug="/" />
      </CmsProvider>,
    );
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("v1");

    version = 2;
    now = 100; // stale: next read serves v1 and refreshes in the background
    await act(async () => void (await api.getPage("/")));
    await flush();
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("v2");

    fail = true;
    api.invalidate("/");
    await act(async () => void (await api.prefetch("/")));
    await flush();
    expect(el.querySelector("h1")?.textContent).toBe("v2");
  });

  test("usePrefetch warms the cache", async () => {
    const { usePrefetch } = await import("../src");
    let calls = 0;
    const api = createApiSource({
      baseUrl: "/api",
      fetch: (async () => {
        calls += 1;
        return Response.json(homePage);
      }) as unknown as typeof fetch,
    });
    let prefetch: ((slug: string) => void) | undefined;
    const Grab = () => {
      prefetch = usePrefetch();
      return null;
    };
    await render(
      <CmsProvider source={api} blocks={{ hero }}>
        <Grab />
      </CmsProvider>,
    );
    prefetch!("/");
    await flush();
    expect(api.peek("/")?.id).toBe("home");
    expect(calls).toBe(1);
  });
});
