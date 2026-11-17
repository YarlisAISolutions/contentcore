import { describe, expect, test } from "bun:test";
import {
  type ContentSource,
  ContentSourceError,
  ContentValidationError,
  createApiSource,
  createFallbackSource,
  createStaticSource,
} from "../src";
import { aboutPage, aboutPageFr, homePage } from "./fixtures";

const pages = [homePage, aboutPage, aboutPageFr];

/** A fake content API that serves the same pages over HTTP. */
function fakeFetch(store: unknown[], calls: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    const params = new URL(url, "http://local").searchParams;
    const slug = params.get("slug");
    const locale = params.get("locale") ?? undefined;
    const match =
      store.find((p) => (p as { slug: string }).slug === slug && (p as { locale?: string }).locale === locale) ??
      store.find((p) => (p as { slug: string }).slug === slug && (p as { locale?: string }).locale === undefined);
    return match ? Response.json(match) : new Response("not found", { status: 404 });
  }) as typeof fetch;
}

const sources: Array<[string, () => ContentSource]> = [
  ["static", () => createStaticSource({ pages })],
  ["api", () => createApiSource({ baseUrl: "/api/content", fetch: fakeFetch(pages) })],
  ["api (uncached)", () => createApiSource({ baseUrl: "/api/content", fetch: fakeFetch(pages), cache: false })],
];

describe.each(sources)("%s source (shared contract)", (_name, make) => {
  test("returns the normalised page", async () => {
    expect(await make().getPage("/")).toEqual(homePage);
  });

  test("normalises the requested slug", async () => {
    expect((await make().getPage("about/"))?.id).toBe("about");
  });

  test("resolves the locale and falls back to the locale-less page", async () => {
    const source = make();
    expect((await source.getPage("/about", { locale: "fr" }))?.id).toBe("about-fr");
    expect((await source.getPage("/about", { locale: "de" }))?.id).toBe("about");
  });

  test("returns null for a missing page", async () => {
    expect(await make().getPage("/nope")).toBeNull();
  });

  test("rejects when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(make().getPage("/", { signal: controller.signal })).rejects.toBeDefined();
  });
});

describe("parity", () => {
  test("static and api sources return identical documents", async () => {
    const [a, b] = sources.map(([, make]) => make());
    for (const slug of ["/", "/about"]) {
      expect(await a!.getPage(slug)).toEqual((await b!.getPage(slug))!);
    }
  });

  test("both reject the same invalid content", async () => {
    const bad = [{ ...homePage, blocks: [{ id: "x", type: "hero" }] }];
    await expect(createStaticSource({ pages: bad }).getPage("/")).rejects.toBeInstanceOf(ContentValidationError);
    await expect(
      createApiSource({ baseUrl: "/api", fetch: fakeFetch(bad), retry: false }).getPage("/"),
    ).rejects.toBeInstanceOf(ContentValidationError);
  });
});

describe("createStaticSource", () => {
  test("returns one shared immutable page per document, and peeks synchronously", async () => {
    const source = createStaticSource({ pages });
    const first = await source.getPage("/");
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first!.blocks[0]!.content)).toBe(true);
    expect(() => {
      (first!.blocks as unknown[]).length = 0;
    }).toThrow();
    expect(await source.getPage("/")).toBe(first!);
    expect(source.peek!("/")).toBe(first!);
    expect(source.peek!("/missing")).toBeNull();
    expect(Object.isFrozen(homePage)).toBe(false); // the caller's input is untouched
  });
});

describe("createApiSource", () => {
  test("builds the default URL with slug and locale", async () => {
    const calls: string[] = [];
    await createApiSource({ baseUrl: "/api/content/", fetch: fakeFetch(pages, calls) }).getPage("/about", {
      locale: "fr",
    });
    expect(calls).toEqual(["/api/content/pages?slug=%2Fabout&locale=fr"]);
  });

  test("supports a custom URL, headers and a CMS transform", async () => {
    let seen: Headers | undefined;
    const source = createApiSource({
      baseUrl: "https://cms.example.com",
      url: (slug) => `https://cms.example.com/api/pages?where[slug][equals]=${encodeURIComponent(slug)}`,
      headers: async () => ({ authorization: "Bearer preview" }),
      fetch: (async (_url: RequestInfo | URL, init?: RequestInit) => {
        seen = new Headers(init?.headers);
        return Response.json({ docs: [homePage] });
      }) as typeof fetch,
      transform: (body) => (body as { docs: unknown[] }).docs[0] ?? null,
    });
    expect(await source.getPage("/")).toEqual(homePage);
    expect(seen?.get("authorization")).toBe("Bearer preview");
    expect(seen?.get("accept")).toBe("application/json");
  });

  test("maps failures to ContentSourceError", async () => {
    const failing = (res: () => Response | Promise<Response>) =>
      createApiSource({ baseUrl: "/api", fetch: (async () => res()) as unknown as typeof fetch, retry: false, cache: false });
    const e500 = await failing(() => new Response("boom", { status: 500 }))
      .getPage("/")
      .catch((e) => e);
    expect(e500).toBeInstanceOf(ContentSourceError);
    expect(e500.status).toBe(500);
    await expect(failing(() => new Response("not json")).getPage("/")).rejects.toBeInstanceOf(ContentSourceError);
    await expect(failing(() => Promise.reject(new TypeError("offline"))).getPage("/")).rejects.toBeInstanceOf(
      ContentSourceError,
    );
    expect(await failing(() => Response.json(null)).getPage("/")).toBeNull();
  });
});

describe("createFallbackSource", () => {
  test("returns the first page found", async () => {
    const source = createFallbackSource(createStaticSource({ pages: [aboutPage] }), createStaticSource({ pages }));
    expect((await source.getPage("/"))?.id).toBe("home");
    expect((await source.getPage("/about"))?.id).toBe("about");
    expect(await source.getPage("/missing")).toBeNull();
  });
});
