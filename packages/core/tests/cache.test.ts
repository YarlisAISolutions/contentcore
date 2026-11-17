import { describe, expect, test } from "bun:test";
import {
  type ContentSource,
  ContentSourceError,
  type PageDocument,
  createApiSource,
  createCachedSource,
  createFallbackSource,
  createStaticSource,
} from "../src";
import { aboutPage, homePage } from "./fixtures";

/** A controllable upstream: counts calls and can be switched to fail. */
function upstream(initial: PageDocument[] = [structuredClone(homePage) as PageDocument]) {
  const state = { pages: initial, calls: 0, fail: false as boolean | Error, delayMs: 0 };
  const source: ContentSource = {
    async getPage(slug) {
      state.calls += 1;
      if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
      if (state.fail) throw state.fail instanceof Error ? state.fail : new Error("upstream down");
      const page = state.pages.find((p) => p.slug === slug);
      return page ? structuredClone(page) : null;
    },
  };
  return { state, source };
}

function clock(start = 1_000_000) {
  const c = { t: start, now: () => c.t, advance: (ms: number) => (c.t += ms) };
  return c;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("createCachedSource", () => {
  test("serves fresh hits from memory as the same frozen object", async () => {
    const { state, source } = upstream();
    const cache = createCachedSource(source);
    const a = await cache.getPage("/");
    const b = await cache.getPage("/");
    expect(a).toBe(b!);
    expect(Object.isFrozen(a)).toBe(true);
    expect(state.calls).toBe(1);
  });

  test("coalesces concurrent requests into one upstream call", async () => {
    const { state, source } = upstream();
    state.delayMs = 5;
    const cache = createCachedSource(source);
    const results = await Promise.all(Array.from({ length: 50 }, () => cache.getPage("/")));
    expect(state.calls).toBe(1);
    expect(new Set(results).size).toBe(1);
  });

  test("stale-while-revalidate: serves stale instantly, refreshes once in the background", async () => {
    const c = clock();
    const { state, source } = upstream();
    const cache = createCachedSource(source, { ttl: 1000, staleWhileRevalidate: 5000, now: c.now });
    const first = await cache.getPage("/");
    state.pages = [{ ...(structuredClone(homePage) as PageDocument), title: "v2" }];
    c.advance(1500);
    const changes: string[] = [];
    cache.subscribe((slug) => changes.push(slug));
    expect(await cache.getPage("/")).toBe(first!); // stale, instant
    await settle();
    expect(state.calls).toBe(2);
    expect(changes).toEqual(["/"]);
    expect((await cache.getPage("/"))?.title).toBe("v2");
  });

  test("an unchanged refresh keeps the same object and notifies nobody", async () => {
    const c = clock();
    const { source } = upstream();
    const cache = createCachedSource(source, { ttl: 1000, now: c.now });
    const first = await cache.getPage("/");
    const changes: string[] = [];
    cache.subscribe((slug) => changes.push(slug));
    c.advance(1500);
    await cache.getPage("/");
    await settle();
    expect(await cache.getPage("/")).toBe(first!);
    expect(changes).toEqual([]);
  });

  test("stale-if-error: keeps serving the last good page while upstream is down", async () => {
    const c = clock();
    const { state, source } = upstream();
    const errors: unknown[] = [];
    const cache = createCachedSource(source, {
      ttl: 1000,
      staleWhileRevalidate: 0,
      staleIfError: 60_000,
      now: c.now,
      onRevalidateError: (e) => errors.push(e),
    });
    const good = await cache.getPage("/");
    state.fail = true;
    c.advance(10_000);
    expect(await cache.getPage("/")).toBe(good!);
    expect(errors).toHaveLength(1);
    c.advance(60_000);
    await expect(cache.getPage("/")).rejects.toThrow("upstream down");
  });

  test("errors with nothing cached propagate and are not cached", async () => {
    const { state, source } = upstream();
    state.fail = true;
    const cache = createCachedSource(source);
    await expect(cache.getPage("/")).rejects.toThrow();
    state.fail = false;
    expect((await cache.getPage("/"))?.id).toBe("home");
  });

  test("caches not-found briefly", async () => {
    const c = clock();
    const { state, source } = upstream();
    const cache = createCachedSource(source, { negativeTtl: 1000, now: c.now });
    expect(await cache.getPage("/missing")).toBeNull();
    expect(await cache.getPage("/missing")).toBeNull();
    expect(state.calls).toBe(1);
    expect(cache.peek("/missing")).toBeNull();
    c.advance(1500);
    await cache.getPage("/missing");
    expect(state.calls).toBe(2);
  });

  test("evicts least-recently-used pages beyond maxEntries", async () => {
    const pages = Array.from({ length: 5 }, (_, i) => ({ ...(structuredClone(homePage) as PageDocument), id: `p${i}`, slug: `/p${i}` }));
    const { state, source } = upstream(pages);
    const cache = createCachedSource(source, { maxEntries: 3 });
    for (const p of pages.slice(0, 3)) await cache.getPage(p.slug);
    await cache.getPage("/p0"); // touch p0, so p1 is the oldest
    await cache.getPage("/p3");
    expect(cache.size).toBe(3);
    expect(cache.peek("/p1")).toBeUndefined();
    expect(cache.peek("/p0")?.id).toBe("p0");
    const before = state.calls;
    await cache.getPage("/p1");
    expect(state.calls).toBe(before + 1);
  });

  test("peek, prefetch, prime and invalidate", async () => {
    const { state, source } = upstream();
    const cache = createCachedSource(source);
    expect(cache.peek("/")).toBeUndefined();
    await cache.prefetch("/");
    expect(cache.peek("/")?.id).toBe("home");
    cache.invalidate("/");
    expect(cache.peek("/")).toBeUndefined();
    cache.prime(structuredClone(aboutPage) as PageDocument);
    expect(cache.peek("/about")?.id).toBe("about");
    cache.invalidate();
    expect(cache.size).toBe(0);
    state.fail = true;
    await cache.prefetch("/"); // never throws
  });

  test("invalidate notifies subscribers so mounted pages reload", async () => {
    const { source } = upstream([structuredClone(homePage) as PageDocument, structuredClone(aboutPage) as PageDocument]);
    const cache = createCachedSource(source);
    await cache.getPage("/");
    await cache.getPage("/about");
    const seen: string[] = [];
    cache.subscribe((slug) => seen.push(slug));
    cache.invalidate("/about");
    expect(seen).toEqual(["/about"]);
    cache.invalidate();
    expect(seen).toEqual(["/about", "/"]);
    expect(cache.size).toBe(0);
  });

  test("a caller's abort does not cancel the shared request", async () => {
    const { state, source } = upstream();
    state.delayMs = 10;
    const cache = createCachedSource(source);
    const controller = new AbortController();
    const aborted = cache.getPage("/", { signal: controller.signal });
    const other = cache.getPage("/");
    controller.abort();
    await expect(aborted).rejects.toBeDefined();
    expect((await other)?.id).toBe("home");
    expect(state.calls).toBe(1);
  });
});

describe("createApiSource resilience", () => {
  test("cache is on by default", async () => {
    let calls = 0;
    const api = createApiSource({
      baseUrl: "/api",
      fetch: (async () => {
        calls += 1;
        return Response.json(homePage);
      }) as unknown as typeof fetch,
    });
    await api.getPage("/");
    await api.getPage("/");
    expect(calls).toBe(1);
    expect(typeof api.invalidate).toBe("function");
  });

  test("retries transient failures with backoff, honouring Retry-After", async () => {
    const statuses = [503, 429, 200];
    let calls = 0;
    const started = Date.now();
    const api = createApiSource({
      baseUrl: "/api",
      cache: false,
      retry: { retries: 2, baseDelayMs: 1, maxDelayMs: 50 },
      fetch: (async () => {
        const status = statuses[calls++]!;
        if (status === 200) return Response.json(homePage);
        return new Response("busy", { status, headers: status === 429 ? { "retry-after": "0" } : {} });
      }) as unknown as typeof fetch,
    });
    expect((await api.getPage("/"))?.id).toBe("home");
    expect(calls).toBe(3);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test("does not retry client errors, and gives up after the retry budget", async () => {
    let calls = 0;
    const make = (status: number) =>
      createApiSource({
        baseUrl: "/api",
        cache: false,
        retry: { retries: 2, baseDelayMs: 1 },
        fetch: (async () => {
          calls += 1;
          return new Response("x", { status });
        }) as unknown as typeof fetch,
      });
    await expect(make(403).getPage("/")).rejects.toBeInstanceOf(ContentSourceError);
    expect(calls).toBe(1);
    calls = 0;
    const err = await make(502)
      .getPage("/")
      .catch((e) => e);
    expect(calls).toBe(3);
    expect(err).toBeInstanceOf(ContentSourceError);
    expect(err.status).toBe(502);
  });

  test("times out a hung request and retries it", async () => {
    let calls = 0;
    const api = createApiSource({
      baseUrl: "/api",
      cache: false,
      timeoutMs: 20,
      retry: { retries: 1, baseDelayMs: 1 },
      fetch: ((_url: string, init: RequestInit) => {
        calls += 1;
        if (calls === 1) {
          return new Promise((_, reject) =>
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))),
          );
        }
        return Promise.resolve(Response.json(homePage));
      }) as unknown as typeof fetch,
    });
    expect((await api.getPage("/"))?.id).toBe("home");
    expect(calls).toBe(2);
  });

  test("revalidates with ETag and reuses the parsed page on 304", async () => {
    const seen: (string | null)[] = [];
    const api = createApiSource({
      baseUrl: "/api",
      cache: false,
      fetch: (async (_url: string, init: RequestInit) => {
        const inm = new Headers(init.headers).get("if-none-match");
        seen.push(inm);
        if (inm === '"v1"') return new Response(null, { status: 304 });
        return Response.json(homePage, { headers: { etag: '"v1"' } });
      }) as unknown as typeof fetch,
    });
    const first = await api.getPage("/");
    const second = await api.getPage("/");
    expect(seen).toEqual([null, '"v1"']);
    expect(second).toBe(first!);
  });
});

describe("createFallbackSource failover", () => {
  test("onError: next fails over to the next source", async () => {
    const down: ContentSource = { getPage: async () => Promise.reject(new Error("primary down")) };
    const failovers: number[] = [];
    const source = createFallbackSource(down, createStaticSource({ pages: [homePage] }), {
      onError: "next",
      onFailover: (_e, i) => failovers.push(i),
    });
    expect((await source.getPage("/"))?.id).toBe("home");
    expect(failovers).toEqual([0]);
  });

  test("rejects with the last error when every source fails, and throws by default", async () => {
    const down = (m: string): ContentSource => ({ getPage: async () => Promise.reject(new Error(m)) });
    await expect(createFallbackSource(down("a"), down("b"), { onError: "next" }).getPage("/")).rejects.toThrow("b");
    await expect(createFallbackSource(down("a"), createStaticSource({ pages: [homePage] })).getPage("/")).rejects.toThrow("a");
  });

  test("peek reads through to the first source with the page", async () => {
    const source = createFallbackSource(createStaticSource({ pages: [] }), createStaticSource({ pages: [homePage] }));
    expect(source.peek?.("/")?.id).toBe("home");
  });
});
