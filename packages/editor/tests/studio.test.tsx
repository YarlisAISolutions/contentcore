import { afterEach, describe, expect, test } from "bun:test";
import {
  ContentConflictError,
  type ContentStore,
  createApiStore,
  createContentApiHandler,
  createMemoryStore,
  defineBlock,
  htmlBlock,
} from "@contentcore/react";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { z } from "zod";
import { ContentStudio, cleanNodes, defaultValue, jsonSchemaOf } from "../src";

const hero = defineBlock({
  schema: z.object({ heading: z.string().min(1, "Heading is required"), description: z.string().optional() }),
  component: ({ content }) => (
    <section>
      <h1>{content.heading}</h1>
      {content.description && <p>{content.description}</p>}
    </section>
  ),
});
const plans = defineBlock({
  schema: z.object({
    currency: z.enum(["USD", "EUR"]),
    highlighted: z.boolean().default(false),
    items: z.array(z.object({ name: z.string(), price: z.number() })),
  }),
  component: ({ content }) => <ul>{content.items.map((i) => <li key={i.name}>{i.name}</li>)}</ul>,
});
const blocks = { hero, plans, html: htmlBlock };

const pages = [
  { id: "home", slug: "/", schemaVersion: 1, title: "Home", blocks: [{ id: "welcome", type: "hero", content: { heading: "Welcome" } }] },
  { id: "about", slug: "/about", schemaVersion: 1, title: "About", blocks: [] },
];

let root: Root | undefined;
let el: HTMLElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  el?.remove();
});

async function mount(store: ContentStore, props: Partial<Parameters<typeof ContentStudio>[0]> = {}) {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root!.render(<ContentStudio store={store} blocks={blocks} {...props} />));
  await flush();
  return el;
}
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const button = (name: string | RegExp) =>
  [...el.querySelectorAll("button")].find((b) => (typeof name === "string" ? b.textContent?.trim() === name || b.getAttribute("aria-label") === name : name.test(b.textContent ?? ""))) as HTMLButtonElement;
const click = (b: HTMLElement) => act(async () => b.click());
/** Set a React-controlled input's value the way a user would. */
async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value);
  await act(async () => void input.dispatchEvent(new Event("input", { bubbles: true })));
}
const field = (label: string) => {
  const l = [...el.querySelectorAll("label")].find((x) => x.textContent?.startsWith(label));
  return el.querySelector(`#${CSS.escape(l!.htmlFor)}`) as HTMLInputElement;
};

describe("schema helpers", () => {
  test("reads the input JSON Schema from a Standard Schema and builds defaults", () => {
    const schema = jsonSchemaOf(plans.schema)!;
    expect(schema.properties?.currency?.enum).toEqual(["USD", "EUR"]);
    expect(defaultValue(schema)).toEqual({ currency: "USD", items: [] });
  });

  test("cleanNodes strips script, handlers, script URLs and editor attributes", () => {
    expect(
      cleanNodes([
        { tag: "p", attrs: { onclick: "x", contenteditable: "true", style: "color:red" }, children: ["a", { tag: "span", children: ["b"] }] },
        { tag: "script", children: ["alert(1)"] },
        { tag: "a", attrs: { href: "javascript:alert(1)", title: "t" }, children: ["l"] },
      ]),
    ).toEqual([{ tag: "p", children: ["ab"] }, { tag: "a", attrs: { title: "t" }, children: ["l"] }]);
  });
});

describe("ContentStudio", () => {
  test("lists pages, edits a block with a generated form, previews live, and saves what was typed", async () => {
    const store = createMemoryStore(pages);
    const saved: string[] = [];
    await mount(store, { onSaved: (s) => saved.push(s.page.slug) });
    expect([...el.querySelectorAll(".cc-page-title")].map((n) => n.textContent)).toEqual(["Home", "About"]);

    await click(button(/Home/));
    await flush();
    expect(el.querySelector(".cc-preview h1")?.textContent).toBe("Welcome");

    await type(field("Heading"), "Hello there");
    await flush();
    expect(el.querySelector(".cc-preview h1")?.textContent).toBe("Hello there");
    expect(el.querySelector(".cc-dot")).not.toBeNull();

    await click(button("Save"));
    await flush();
    expect((await store.get("home"))?.page.blocks[0]?.content).toEqual({ heading: "Hello there" });
    expect(saved).toEqual(["/"]);
    expect(el.querySelector(".cc-status")?.textContent).toBe("Saved /");
  });

  test("shows schema issues on the field and blocks saving until they are fixed", async () => {
    await mount(createMemoryStore(pages));
    await click(button(/Home/));
    await flush();
    await type(field("Heading"), "");
    await flush();
    expect(el.textContent).toContain("Heading is required");
    expect(button("Save").disabled).toBe(true);
    await type(field("Heading"), "Back");
    await flush();
    expect(button("Save").disabled).toBe(false);
  });

  test("creates a page with blocks (defaults from the schema), reorders and removes blocks", async () => {
    const store = createMemoryStore(pages);
    await mount(store);
    await click(button("+ New page"));
    await type(field("Title"), "Pricing");
    await type(field("Slug"), "/pricing");
    const select = el.querySelector("#cc-add-type") as HTMLSelectElement;
    await act(async () => {
      select.value = "plans";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(button("+ Add plans"));
    await act(async () => {
      select.value = "hero";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await click(button("+ Add hero"));
    await flush();
    await type(field("Heading"), "Plans");
    await click(button("Move hero block up"));
    await click(button("+ Add items"));
    await flush();
    await type(field("Name"), "Starter");
    await flush();
    expect([...el.querySelectorAll(".cc-block-type")].map((n) => n.textContent)).toEqual(["hero", "plans"]);

    await click(button("Create page"));
    await flush();
    const created = (await store.list()).find((s) => s.slug === "/pricing")!;
    const page = (await store.get(created.id))!.page;
    expect(page.blocks.map((b) => b.type)).toEqual(["hero", "plans"]);
    // What the editor typed is stored: the schema default for `highlighted` is not written back.
    expect(page.blocks[1]?.content).toEqual({ currency: "USD", items: [{ name: "Starter", price: 0 }] });

    await click(button("Remove plans block"));
    expect([...el.querySelectorAll(".cc-block-type")].map((n) => n.textContent)).toEqual(["hero"]);
  });

  test("flags a slug already used by another page", async () => {
    await mount(createMemoryStore(pages));
    await click(button("+ New page"));
    await type(field("Slug"), "/about");
    await flush();
    expect(el.textContent).toContain('Already used by "About"');
    expect(button("Create page").disabled).toBe(true);
  });

  test("handles a conflicting save: reload or overwrite", async () => {
    const store = createMemoryStore(pages);
    await mount(store);
    await click(button(/Home/));
    await flush();
    // Someone else saves first.
    const current = (await store.get("home"))!;
    await store.save({ ...current.page, title: "Theirs" }, { expectedRevision: current.revision });
    await type(field("Title"), "Mine");
    await click(button("Save"));
    await flush();
    expect(el.querySelector(".cc-banner")?.textContent).toContain("changed by someone else");
    await click(button("Overwrite with mine"));
    await flush();
    expect((await store.get("home"))?.page.title).toBe("Mine");
  });

  test("deletes a page", async () => {
    const store = createMemoryStore(pages);
    await mount(store);
    await click(button(/About/));
    await flush();
    await click(button("Delete page"));
    await flush();
    expect((await store.list()).map((s) => s.id)).toEqual(["home"]);
  });

  test("edits rich text in the html block and stores cleaned nodes", async () => {
    const store = createMemoryStore([{ id: "p", slug: "/p", schemaVersion: 1, title: "Story", blocks: [{ id: "b", type: "html", content: { nodes: [{ tag: "p", children: ["Hi"] }] } }] }]);
    await mount(store);
    await click(button(/Story/));
    await flush();
    const area = el.querySelector(".cc-rte-area") as HTMLElement;
    expect(area.innerHTML).toBe("<p>Hi</p>");
    area.innerHTML = '<p>Hi <b onclick="x">there</b></p><script>alert(1)</script>';
    await act(async () => void area.dispatchEvent(new Event("input", { bubbles: true })));
    await flush();
    expect(el.querySelector(".cc-preview b")?.textContent).toBe("there");
    await click(button("Save"));
    await flush();
    expect((await store.get("p"))?.page.blocks[0]?.content).toEqual({
      nodes: [{ tag: "p", children: ["Hi ", { tag: "b", children: ["there"] }] }],
    });
  });

  test("works against the content API (createApiStore + createContentApiHandler), including auth errors", async () => {
    const backing = createMemoryStore(pages);
    const handler = createContentApiHandler(backing, { authorize: (r) => r.headers.get("authorization") === "Bearer t" });
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) =>
      (await handler(new Request(new URL(String(input), "http://x"), init)))!) as typeof fetch;
    await mount(createApiStore({ baseUrl: "/api/content", fetch: fetchImpl, headers: { authorization: "Bearer t" } }));
    await click(button(/About/));
    await flush();
    await type(field("Title"), "About (API)");
    await click(button("Save"));
    await flush();
    expect((await backing.get("about"))?.page.title).toBe("About (API)");

    await act(async () => root!.unmount());
    root = undefined;
    el.remove();
    await mount(createApiStore({ baseUrl: "/api/content", fetch: fetchImpl }));
    expect(el.querySelector(".cc-status")?.textContent).toBe("forbidden");
  });

  test("offers Import/Export only for static (memory) stores", async () => {
    await mount(createMemoryStore(pages));
    expect(button("Export JSON")).toBeDefined();
    expect(el.textContent).toContain("Import JSON");
    await act(async () => root!.unmount());
    root = undefined;
    el.remove();
    const api = createApiStore({ baseUrl: "/x", fetch: (async () => Response.json({ pages: [] })) as unknown as typeof fetch });
    await mount(api);
    expect(button("Export JSON")).toBeUndefined();
  });
});

test("ContentConflictError is exported for custom stores", () => {
  expect(new ContentConflictError("x").code).toBe("CONFLICT");
});
