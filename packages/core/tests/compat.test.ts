import { afterEach, describe, expect, test } from "bun:test";
import { abortError, cloneData, linkedSignal } from "../src/compat";
import { ContentSourceError, createApiSource, createStaticSource } from "../src";
import { homePage } from "./fixtures";

// Simulate runtimes that lack newer globals (older Safari, Hermes, some edge runtimes).
const saved: Record<string, PropertyDescriptor | undefined> = {};
function remove(name: string) {
  saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
  // biome-ignore lint/performance/noDelete: removing the global is the point.
  delete (globalThis as Record<string, unknown>)[name];
}
afterEach(() => {
  for (const [name, descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    delete saved[name];
  }
});

describe("fallbacks without newer globals", () => {
  test("abortError works without DOMException", () => {
    remove("DOMException");
    const error = abortError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AbortError");
  });

  test("cloneData works without structuredClone, and the static source still serves pages", async () => {
    remove("structuredClone");
    const copy = cloneData({ a: [1, { b: 2 }] });
    expect(copy).toEqual({ a: [1, { b: 2 }] });
    expect((await createStaticSource({ pages: [homePage] }).getPage("/"))?.id).toBe("home");
  });

  test("the API source times out and aborts without AbortSignal.any/timeout", async () => {
    const any = Object.getOwnPropertyDescriptor(AbortSignal, "any");
    const timeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
    delete (AbortSignal as unknown as Record<string, unknown>).any;
    delete (AbortSignal as unknown as Record<string, unknown>).timeout;
    try {
      const hang = ((_u: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as unknown as typeof fetch;
      const api = createApiSource({ baseUrl: "/api", cache: false, timeoutMs: 10, retry: false, fetch: hang });
      await expect(api.getPage("/")).rejects.toBeInstanceOf(ContentSourceError);
    } finally {
      if (any) Object.defineProperty(AbortSignal, "any", any);
      if (timeout) Object.defineProperty(AbortSignal, "timeout", timeout);
    }
  });
});

describe("linkedSignal", () => {
  test("follows the parent, reports timeouts separately, and cleans up", async () => {
    const parent = new AbortController();
    const link = linkedSignal(parent.signal, 1_000);
    parent.abort("stop");
    expect(link.signal.aborted).toBe(true);
    expect(link.signal.reason).toBe("stop");
    expect(link.timedOut()).toBe(false);
    link.dispose();

    const timed = linkedSignal(undefined, 5);
    await new Promise((r) => setTimeout(r, 20));
    expect(timed.signal.aborted).toBe(true);
    expect(timed.timedOut()).toBe(true);
    timed.dispose();

    // Disposed before the deadline: the timer never fires.
    const disposed = linkedSignal(undefined, 5);
    disposed.dispose();
    await new Promise((r) => setTimeout(r, 20));
    expect(disposed.signal.aborted).toBe(false);
  });
});

describe("abort versus timeout in the API source", () => {
  const hangingFetch = (calls: { n: number }) =>
    ((_u: string, init: RequestInit) => {
      calls.n++;
      return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    }) as unknown as typeof fetch;

  test("a caller abort is never retried and never reported as a timeout", async () => {
    const calls = { n: 0 };
    const api = createApiSource({ baseUrl: "/api", cache: false, timeoutMs: 1_000, retry: { retries: 3, baseDelayMs: 1 }, fetch: hangingFetch(calls) });
    const controller = new AbortController();
    const pending = api.getPage("/", { signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    const error = await pending.catch((e) => e);
    expect(error).not.toBeInstanceOf(ContentSourceError);
    expect(calls.n).toBe(1);
  });

  test("an abort during backoff rejects with an abort error, even without signal.reason", async () => {
    let calls = 0;
    const api = createApiSource({
      baseUrl: "/api",
      cache: false,
      retry: { retries: 3, baseDelayMs: 200, maxDelayMs: 200 },
      fetch: (async () => {
        calls++;
        return new Response("busy", { status: 503 });
      }) as unknown as typeof fetch,
    });
    // A signal whose reason is undefined, as on runtimes without AbortSignal.reason.
    const listeners: Array<() => void> = [];
    const signal = {
      aborted: false,
      reason: undefined,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: () => {},
    } as unknown as AbortSignal;
    const pending = api.getPage("/", { signal });
    await new Promise((r) => setTimeout(r, 20));
    (signal as unknown as { aborted: boolean }).aborted = true;
    for (const fn of listeners) fn();
    const error = await pending.catch((e) => e);
    expect(error).toBeDefined();
    expect((error as Error).name).toBe("AbortError");
    expect(calls).toBe(1);
  });

  test("timeouts are retried, then surface as ContentSourceError", async () => {
    const calls = { n: 0 };
    const api = createApiSource({ baseUrl: "/api", cache: false, timeoutMs: 5, retry: { retries: 2, baseDelayMs: 1 }, fetch: hangingFetch(calls) });
    const error = await api.getPage("/").catch((e) => e);
    expect(error).toBeInstanceOf(ContentSourceError);
    expect(String(error.message)).toContain("timed out");
    expect(calls.n).toBe(3);
  });
});
