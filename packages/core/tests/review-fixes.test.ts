import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ContentConflictError, createApiStore, createContentApiHandler, createMemoryStore } from "../src";
import { createFileStore } from "../src/fs";
import { aboutPage, homePage } from "./fixtures";

const require = createRequire(import.meta.url);
const tempDir = () => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "cc-fix-"));

describe("built CommonJS bundles: errors from the fs subpath map to the right status", () => {
  test("stale If-Match → 412, invalid page → 422, duplicate slug → 422 (not 500)", async () => {
    const core = require("../dist/index.cjs");
    const { createFileStore: cjsFileStore } = require("../dist/fs.cjs");
    const dir = tempDir();
    try {
      const store = cjsFileStore(join(dir, "pages.json"));
      await store.save(structuredClone(homePage));
      await store.save(structuredClone(aboutPage));
      const handle = core.createContentApiHandler(store, { authorize: () => true, onError: () => {} });
      const put = (id: string, body: unknown, headers: Record<string, string> = {}) =>
        handle(new Request(`http://x/api/content/pages/${id}`, { method: "PUT", body: JSON.stringify(body), headers }));
      expect((await put("home", homePage, { "if-match": '"stale"' })).status).toBe(412);
      expect((await put("bad", { id: "bad", slug: "/bad", schemaVersion: 1, blocks: [{ id: 1 }] })).status).toBe(422);
      expect((await put("dup", { id: "dup", slug: "/about", schemaVersion: 1, blocks: [] })).status).toBe(422);
      const del = await handle(new Request("http://x/api/content/pages/home", { method: "DELETE", headers: { "if-match": '"stale"' } }));
      expect(del.status).toBe(412);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("content API handler hardening", () => {
  const all = { authorize: () => true, onError: () => {} };

  test("a malformed percent-escape in the id is a 400, not a crash", async () => {
    const handle = createContentApiHandler(createMemoryStore([homePage]), all);
    const res = await handle(new Request("http://x/api/content/pages/%E0%A4%A"));
    expect(res?.status).toBe(400);
  });

  test("the body cap holds without Content-Length (streamed body)", async () => {
    const handle = createContentApiHandler(createMemoryStore([]), { ...all, maxBodyBytes: 1_000 });
    const chunk = new TextEncoder().encode("x".repeat(600));
    const body = new ReadableStream({
      start(c) {
        c.enqueue(chunk);
        c.enqueue(chunk);
        c.close();
      },
    });
    const res = await handle(new Request("http://x/api/content/pages/big", { method: "PUT", body, duplex: "half" } as RequestInit));
    expect(res?.status).toBe(413);
  });

  test("store failures on public reads return a generic 500 without internal details", async () => {
    const errors: unknown[] = [];
    const broken = { ...createMemoryStore([]), list: async () => { throw new Error("ENOENT /secret/path/pages.json"); } };
    const handle = createContentApiHandler(broken, { onError: (e) => void errors.push(e) });
    const res = (await handle(new Request("http://x/api/content/pages?slug=/")))!;
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("/secret/path");
    expect(errors).toHaveLength(1);
  });

  test("concurrent creates of the same id: exactly one wins", async () => {
    const store = createMemoryStore([]);
    const api = createApiStore({
      baseUrl: "/api/content",
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) =>
        (await createContentApiHandler(store, all)(new Request(new URL(String(input), "http://x"), init)))!) as typeof fetch,
    });
    const page = { id: "new", slug: "/new", schemaVersion: 1, blocks: [] };
    const results = await Promise.allSettled([
      api.save({ ...page, title: "A" }, { mustNotExist: true }),
      api.save({ ...page, title: "B" }, { mustNotExist: true }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ContentConflictError);
  });

  test("If-None-Match: * on an existing page is a 412", async () => {
    const handle = createContentApiHandler(createMemoryStore([homePage]), all);
    const res = await handle(
      new Request("http://x/api/content/pages/home", { method: "PUT", body: JSON.stringify(homePage), headers: { "if-none-match": "*" } }),
    );
    expect(res?.status).toBe(412);
  });
});

test("the file store rejects a file with duplicate ids", async () => {
  const dir = tempDir();
  try {
    const path = join(dir, "pages.json");
    await Bun.write(path, JSON.stringify([homePage, { ...homePage, slug: "/other" }]));
    await expect(createFileStore(path).list()).rejects.toThrow(/duplicate page id/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
