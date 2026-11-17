# Managing and editing content

ContentCore Studio (`@contentcore/editor`) is a React UI to create, edit, preview and publish pages. It works against a **`ContentStore`**, the write side of ContentCore, so one UI covers every kind of content:

| Your content lives in… | Store | Saving does… |
|---|---|---|
| **Static JSON in the repo** (edited in the browser) | `createMemoryStore(pages)` | Keeps edits in the browser; **Export JSON** downloads `pages.json` to commit |
| **Static JSON in the repo** (edited through a local API) | `createApiStore` → `createContentApiHandler(createFileStore("content/pages.json"))` | Writes the file on disk (atomic, serialised), ready to commit |
| **Your content service or database** | `createApiStore` → `createContentApiHandler(yourStore)` | Saves through your API with auth, validation and conflict checks |
| **A third-party CMS** | Your own `ContentStore` (4 methods) | Whatever the CMS API does |

```
Studio (browser) ──ContentStore──▶ createApiStore ──HTTP──▶ createContentApiHandler ──▶ store (file, DB, CMS)
                                                                    │
Website ─────────────────────────── createApiSource ─── GET pages?slug= (public read contract, ETag)
```

## 1. Set up the studio

Use the **same block registry** the site renders with. The studio needs it for "Add block", the forms, validation and the live preview.

```tsx
// studio.tsx (put this route behind your app's sign-in)
import { ContentStudio } from "@contentcore/editor";
import { blocks } from "./blocks";

export function Studio({ store }) {
  return <ContentStudio store={store} blocks={blocks} />;
}
```

## 2a. Static content, edited in the browser

```tsx
import { createMemoryStore } from "@contentcore/react";
import pages from "./content/pages.json";

const store = createMemoryStore(pages);
<ContentStudio store={store} blocks={blocks} />
```

Edits stay in the browser. **Export JSON** downloads the full `pages.json`: replace the file in your repo and commit. **Import JSON** loads a file. It is all-or-nothing, so an invalid file changes nothing. This needs no server, so it suits small sites and content reviewed in pull requests.

## 2b. Static content, saved to the repo file

Run a small local content API over the file store. `examples/studio/server.mjs` does this in about 80 lines, and runs on Node, Bun and Deno:

```js
import { createContentApiHandler } from "@contentcore/core";
import { createFileStore } from "@contentcore/core/fs";

const api = createContentApiHandler(createFileStore("content/pages.json"), {
  authorize: (request) => hasValidToken(request),   // compare with process.env.STUDIO_TOKEN
});
```

The file store:
- keeps pages sorted by slug and locale with stable indentation, so diffs are clean;
- writes atomically (temp file, then rename, retried on Windows file locks);
- serialises saves within its process, so two editors saving through the same server can't lose each other's changes (run one writer process per file);
- picks up edits made to the file by hand.

## 2c. API content

**The server** mounts the handler in your framework:

```ts
// Next.js: app/api/content/[...path]/route.ts
import { createContentApiHandler } from "@contentcore/core";
import { dbStore } from "@/lib/db-store";            // your ContentStore over your database

const handle = createContentApiHandler(dbStore, {
  authorize: async (request, action) => {
    const user = await getUser(request);              // your auth
    return action === "list" ? Boolean(user) : user?.role === "editor";
  },
  onChange: ({ slug }) => slug && revalidatePath(slug), // refresh the site when content changes
});

const route = async (req: Request) => (await handle(req)) ?? new Response(null, { status: 404 });
export { route as GET, route as PUT, route as DELETE };
```

**The browser** points the studio at it:

```tsx
import { createApiStore } from "@contentcore/react";

const store = createApiStore({ baseUrl: "/api/content", headers: () => ({ authorization: `Bearer ${token}` }) });
<ContentStudio store={store} blocks={blocks} onSaved={(s) => siteSource.invalidate(s.page.slug)} />
```

### The management API

| Request | Action | Success | Errors |
|---|---|---|---|
| `GET {base}/pages?slug=&locale=` | read (public by default) | `200` page + `ETag`, `304` | `404` |
| `GET {base}/pages` | list | `200 { pages: PageSummary[] }` | `401`/`403` |
| `GET {base}/pages/:id` | list | `200 { page, revision }` + `ETag` | `404` |
| `PUT {base}/pages/:id` | write | `201` created / `200` updated | `400` bad JSON or id mismatch, `412` stale `If-Match`, `413` too large, `422` invalid page or duplicate slug, `428` missing `If-Match` on update |
| `DELETE {base}/pages/:id` | delete | `204` | `412`, `428` |

- **Closed by default.** `authorize` is called for list, write and delete, and the default denies all three. Reads stay public unless you pass `publicRead: false`.
- **Validated on the server.** Every write runs `parsePageDocument`, which checks the shape and migrates older versions, and checks that the slug and locale pair is unique. Never trust the browser's validation alone.
- **Protected against lost updates.** Updates must send `If-Match` with the revision they started from, and a stale revision gets `412`. The studio then offers *Discard mine and reload* or *Overwrite with mine*.

## 3. Writing your own store

Back the studio with any database or CMS by implementing four methods:

```ts
import { type ContentStore, checkRevision, prepareForSave, revisionOf } from "@contentcore/core";

export const dbStore: ContentStore = {
  async list() { /* SELECT id, slug, locale, title, … → PageSummary[] */ },
  async get(id) { const row = await db.page(id); return row && { page: row.doc, revision: revisionOf(row.doc) }; },
  async save(input, { expectedRevision } = {}) {
    const page = prepareForSave(input, await db.allPages());          // validate + unique slug/locale
    const current = await this.get(page.id);
    checkRevision(current ?? undefined, expectedRevision, page.id);   // optimistic concurrency
    await db.upsert(page);                                            // ideally in a transaction
    return { page, revision: revisionOf(page) };
  },
  async delete(id, { expectedRevision } = {}) { checkRevision((await this.get(id)) ?? undefined, expectedRevision, id); await db.remove(id); },
};
```

## How the editor builds forms

- **Generated forms.** For each block, the studio asks the schema for its **input JSON Schema** through Standard Schema. Zod 4.2+ implements this, and so do other libraries that support Standard JSON Schema. It then renders:

  | JSON Schema | Field |
  |---|---|
  | `string` | Text input (a text area for long or "description"-like fields; `url`/`email` formats) |
  | `number` / `integer` | Number input (honours `minimum`/`maximum`) |
  | `boolean` | Checkbox |
  | `enum` | Select |
  | `object` | Fieldset of its properties (optional ones are marked) |
  | `array` | Repeatable items with add, move and remove |
  | Anything else (unions, records…) | JSON editor for that value |

- **Descriptions** from the schema (`z.string().describe("…")`) appear as hints, linked to the field for screen readers.
- **Overrides.** Pass `jsonSchemas={{ hero: {...} }}` to supply or replace a block's form schema.
- **JSON fallback.** Blocks whose schema exposes no JSON Schema get a JSON editor. Every block can switch between **Form** and **JSON**.
- **Raw values are saved.** The editor stores **what the user typed**, not the schema's parsed output, so defaults and transforms are applied at render time and never written back.

## Rich text

The `html` block opens in a rich-text editor:

- **Toolbar:** bold, italic, H2/H3, paragraph, lists, quote, link, unlink, clear formatting.
- **Storage:** content is kept as `HtmlNode` data.
- **Cleaning on the way in:**
  - Pasted HTML is cleaned before insertion: no `script`, `iframe` or other blocked elements, no `on*` handlers, no `javascript:` URLs, and no inline `style` or editor attributes.
  - Typed content is cleaned again before it is stored.
- **Cleaning on the way out:** the renderer sanitises again at display time.

## Previews

The right-hand pane renders the draft with your real block components. Unknown and invalid blocks are flagged there, and page-level problems (slug, id) are shown on their fields. Save is disabled until the page is valid.

## Security checklist

- [ ] The studio route is behind your app's sign-in.
- [ ] `authorize` checks the user on **every** management request. It defaults to deny.
- [ ] Tokens and secrets come from the environment, never from source code.
- [ ] `maxBodyBytes` suits your largest page (default 1 MiB).
- [ ] `onChange` invalidates caches or revalidates paths, so the site shows saved content.
- [ ] Only trusted editors are allowed to opt in to `script`, `iframe` and similar elements in `createHtmlBlock({ allowElements })`.

## Limits in v0.2

These are not built in yet: revision history and rollback, drafts with scheduled publishing, per-page roles and approval workflows, a media library, and real-time co-editing. Concurrent edits are guarded by revisions, not merged.

Runnable: [`examples/studio`](../examples/studio) (both modes) and [`examples/nextjs-app/app/studio`](../examples/nextjs-app/app/studio).
