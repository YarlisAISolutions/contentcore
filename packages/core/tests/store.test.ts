import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ContentStore,
  ContentConflictError,
  ContentForbiddenError,
  ContentValidationError,
  createApiSource,
  createApiStore,
  createContentApiHandler,
  createMemoryStore,
} from "../src";
import { createFileStore } from "../src/fs";
import { aboutPage, aboutPageFr, homePage } from "./fixtures";

const clone = <T>(v: T): T => structuredClone(v);

/** The same contract tests run against every store. */
function contract(name: string, make: () => ContentStore | Promise<ContentStore>) {
  describe(`${name}: ContentStore contract`, () => {
    test("list, get, create, update with revision, delete", async () => {
      const store = await make();
      expect((await store.list()).map((s) => s.id).sort()).toEqual(["about", "about-fr", "home"]);
      const home = (await store.get("home"))!;
      expect(home.page.blocks).toHaveLength(1);

      const updated = await store.save({ ...home.page, title: "Start" }, { expectedRevision: home.revision });
      expect(updated.page.title).toBe("Start");
      expect(updated.revision).not.toBe(home.revision);

      const created = await store.save({ id: "new", slug: "new-page/", schemaVersion: 1, blocks: [] });
      expect(created.page.slug).toBe("/new-page");
      expect((await store.list()).some((s) => s.id === "new")).toBe(true);

      await store.delete("new", { expectedRevision: created.revision });
      expect(await store.get("new")).toBeNull();
    });

    test("rejects stale revisions with ContentConflictError", async () => {
      const store = await make();
      const home = (await store.get("home"))!;
      await store.save({ ...home.page, title: "First" }, { expectedRevision: home.revision });
      await expect(store.save({ ...home.page, title: "Second" }, { expectedRevision: home.revision })).rejects.toBeInstanceOf(
        ContentConflictError,
      );
      await expect(store.delete("home", { expectedRevision: home.revision })).rejects.toBeInstanceOf(ContentConflictError);
    });

    test("validates pages and keeps (slug, locale) unique", async () => {
      const store = await make();
      await expect(store.save({ id: "x", slug: "/x", schemaVersion: 1, blocks: [{ id: "a", type: "hero" }] })).rejects.toBeInstanceOf(
        ContentValidationError,
      );
      const dup = await store.save({ id: "dup", slug: "/about", schemaVersion: 1, blocks: [] }).catch((e) => e);
      expect(dup).toBeInstanceOf(ContentValidationError);
      expect(dup.issues[0].path).toBe("slug");
      // Same slug, different locale is fine.
      await store.save({ id: "about-de", slug: "/about", locale: "de", schemaVersion: 1, blocks: [] });
    });
  });
}

contract("memory store", () => createMemoryStore([homePage, aboutPage, aboutPageFr]));

const dirs: string[] = [];
const tempFile = () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "cc-store-"));
  dirs.push(dir);
  return join(dir, "content", "pages.json");
};
contract("file store", async () => {
  const path = tempFile();
  const store = createFileStore(path);
  for (const p of [homePage, aboutPage, aboutPageFr]) await store.save(clone(p));
  return store;
});

describe("memory store extras", () => {
  test("is a ContentSource, exports and imports, and notifies on change", async () => {
    const store = createMemoryStore([homePage, aboutPage, aboutPageFr]);
    expect((await store.getPage("/about", { locale: "fr" }))?.id).toBe("about-fr");
    let changes = 0;
    store.onChange(() => changes++);
    const home = (await store.get("home"))!;
    await store.save({ ...home.page, title: "x" }, { expectedRevision: home.revision });
    expect(changes).toBe(1);
    const exported = store.exportPages();
    expect(exported.map((p) => p.slug)).toEqual(["/", "/about", "/about"]);
    store.importPages([aboutPage]);
    expect((await store.list()).map((s) => s.id)).toEqual(["about"]);
    expect(() => store.importPages([homePage, homePage])).toThrow(ContentValidationError);
    expect((await store.list()).map((s) => s.id)).toEqual(["about"]); // all-or-nothing
  });
});

describe("file store", () => {
  test("writes a sorted, diff-friendly file atomically and serialises concurrent saves", async () => {
    const path = tempFile();
    const store = createFileStore(path);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.save({ id: `p${i}`, slug: `/p${String(i).padStart(2, "0")}`, schemaVersion: 1, blocks: [] })),
    );
    const onDisk = JSON.parse(readFileSync(path, "utf8")) as { slug: string }[];
    expect(onDisk).toHaveLength(20);
    expect(onDisk.map((p) => p.slug)).toEqual([...onDisk.map((p) => p.slug)].sort());
    expect(readdirSync(join(path, "..")).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    expect(readFileSync(path, "utf8").endsWith("]\n")).toBe(true);
  });

  test("picks up edits made to the file outside the store", async () => {
    const path = tempFile();
    const store = createFileStore(path);
    await store.save(clone(homePage));
    writeFileSync(path, JSON.stringify([{ ...homePage, title: "Edited by hand" }]));
    expect((await store.get("home"))?.page.title).toBe("Edited by hand");
  });

  test("a missing file is an empty store; a malformed file is a clear error", async () => {
    const path = tempFile();
    expect(await createFileStore(path).list()).toEqual([]);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify({ not: "an array" }));
    await expect(createFileStore(path).list()).rejects.toThrow(/JSON array/);
  });
});

describe("content API handler", () => {
  const token = "test-token";
  const authorize = (req: Request) => req.headers.get("authorization") === `Bearer ${token}`;
  const setup = (opts: Parameters<typeof createContentApiHandler>[1] = { authorize }) => {
    const store = createMemoryStore([homePage, aboutPage, aboutPageFr]);
    const handler = createContentApiHandler(store, opts);
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) =>
      (await handler(new Request(new URL(String(input), "http://site.local"), init))) ??
      new Response("not mine", { status: 404 })) as typeof fetch;
    return { store, handler, fetchImpl };
  };
  const auth = { authorization: `Bearer ${token}` };

  test("serves the public read contract that createApiSource consumes (ETag, 304, 404)", async () => {
    const { fetchImpl } = setup();
    const source = createApiSource({ baseUrl: "/api/content", fetch: fetchImpl, cache: false });
    expect((await source.getPage("/about", { locale: "fr" }))?.id).toBe("about-fr");
    expect(await source.getPage("/missing")).toBeNull();
    const first = await fetchImpl("/api/content/pages?slug=/");
    const etag = first.headers.get("etag")!;
    expect(first.headers.get("cache-control")).toContain("s-maxage");
    expect((await fetchImpl("/api/content/pages?slug=/", { headers: { "if-none-match": etag } })).status).toBe(304);
  });

  test("denies listing and writes by default", async () => {
    const { fetchImpl } = setup({});
    expect((await fetchImpl("/api/content/pages")).status).toBe(403);
    expect((await fetchImpl("/api/content/pages/home", { method: "PUT", body: "{}" })).status).toBe(403);
    expect((await fetchImpl("/api/content/pages/home", { method: "DELETE" })).status).toBe(403);
    expect((await fetchImpl("/api/content/pages?slug=/")).status).toBe(200);
  });

  test("publicRead: false puts reads behind authorize too", async () => {
    const { fetchImpl } = setup({ authorize, publicRead: false });
    expect((await fetchImpl("/api/content/pages?slug=/")).status).toBe(403);
    expect((await fetchImpl("/api/content/pages?slug=/", { headers: auth })).status).toBe(200);
  });

  test("an authorize hook can answer 401", async () => {
    const { fetchImpl } = setup({
      authorize: () => {
        throw new ContentForbiddenError("sign in", 401);
      },
    });
    expect((await fetchImpl("/api/content/pages")).status).toBe(401);
  });

  test("the API store round-trips through the handler: list, get, save with If-Match, conflicts, delete", async () => {
    const { fetchImpl } = setup();
    const store = createApiStore({ baseUrl: "/api/content", fetch: fetchImpl, headers: auth });
    expect((await store.list()).length).toBe(3);
    const home = (await store.get("home"))!;
    const saved = await store.save({ ...home.page, title: "Via API" }, { expectedRevision: home.revision });
    expect(saved.page.title).toBe("Via API");
    await expect(store.save({ ...home.page, title: "stale" }, { expectedRevision: home.revision })).rejects.toBeInstanceOf(ContentConflictError);
    const created = await store.save({ id: "new", slug: "/new", schemaVersion: 1, blocks: [] });
    expect(created.page.id).toBe("new");
    await store.delete("new");
    expect(await store.get("new")).toBeNull();
    const unauthorised = createApiStore({ baseUrl: "/api/content", fetch: fetchImpl });
    await expect(unauthorised.list()).rejects.toBeInstanceOf(ContentForbiddenError);
  });

  test("validates writes: 422 with issues, 400 for bad JSON or id mismatch, 428 without If-Match, 413 for large bodies", async () => {
    const { fetchImpl } = setup({ authorize, maxBodyBytes: 2_000 });
    const put = (id: string, body: string, headers: Record<string, string> = {}) =>
      fetchImpl(`/api/content/pages/${id}`, { method: "PUT", body, headers: { ...auth, ...headers } });
    const invalid = await put("x", JSON.stringify({ id: "x", slug: "/x", schemaVersion: 1, blocks: [{ id: 1 }] }));
    expect(invalid.status).toBe(422);
    expect(((await invalid.json()) as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
    expect((await put("x", "{nope")).status).toBe(400);
    expect((await put("x", JSON.stringify({ ...homePage, id: "y" }))).status).toBe(400);
    expect((await put("home", JSON.stringify(homePage))).status).toBe(428);
    expect((await put("big", JSON.stringify({ id: "big", slug: "/big", schemaVersion: 1, blocks: [], meta: { pad: "x".repeat(5_000) } }))).status).toBe(413);
    expect((await fetchImpl("/api/content/pages/home", { method: "DELETE", headers: auth })).status).toBe(428);
    expect((await fetchImpl("/api/content/pages", { method: "POST", headers: auth })).status).toBe(405);
  });

  test("ignores paths outside its base and reports changes", async () => {
    const events: string[] = [];
    const store = createMemoryStore([homePage]);
    const handler = createContentApiHandler(store, { authorize: () => true, onChange: (e) => void events.push(`${e.type}:${e.id}`) });
    expect(await handler(new Request("http://x/other"))).toBeNull();
    const home = (await store.get("home"))!;
    await handler(
      new Request("http://x/api/content/pages/home", {
        method: "PUT",
        body: JSON.stringify({ ...home.page, title: "t" }),
        headers: { "if-match": `"${home.revision}"` },
      }),
    );
    expect(events).toEqual(["save:home"]);
  });
});

process.on("exit", () => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
