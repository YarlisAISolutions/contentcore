<img src="https://raw.githubusercontent.com/YarlisAISolutions/contentcore/main/brand/logo-512.png" alt="ContentCore logo" width="72" height="72" align="right">

# @contentcore/editor

**ContentCore Studio**: a React UI to manage and edit [ContentCore](https://github.com/YarlisAISolutions/contentcore) pages. One component edits **static content** (JSON in your repo) and **API content** (your content service), because it works against any `ContentStore`.

```bash
npm i @contentcore/editor @contentcore/react react react-dom
```

## What you get

- **Pages:** list, filter, create, delete. Unsaved edits are kept per page while you switch between them.
- **Page settings:** title, slug, locale, SEO description and id. A slug already used by another page is flagged before you save.
- **Blocks:** add any registered block type, reorder, duplicate and remove.
- **Forms generated from your schemas:** text, long text, number, toggle, choice list, nested objects and repeatable lists. This works for any schema library that exposes JSON Schema through Standard Schema (Zod 4.2+ does). Everything else gets a JSON editor, and each block can switch between **Form** and **JSON**.
- **Rich text** for the `html` block: bold, italic, headings, lists, quotes and links. Pasted HTML is cleaned as it comes in, so script, event handlers and script URLs never reach your content.
- **Live validation** with your block schemas, shown on the field. Save is disabled until the page is valid. The server validates again on every write.
- **Live preview** rendered by your real block components.
- **Safe saving:** revisions guard every save. If someone else saved first, you choose between *Discard mine and reload* and *Overwrite with mine*. Ctrl/Cmd+S saves.
- **Static JSON:** *Import JSON* and *Export JSON* for content kept in your repo.
- **Accessibility and theming:** labelled controls, keyboard support, light and dark themes. The styles are scoped to `.cc-` classes, or pass `unstyled` and style them yourself.

## Static content (JSON in your repo)

```tsx
import { createMemoryStore } from "@contentcore/react";
import { ContentStudio } from "@contentcore/editor";
import { blocks } from "./blocks";              // the registry your site renders with
import pages from "./content/pages.json";

const store = createMemoryStore(pages);         // edit in the browser, then Export JSON → commit

export function Studio() {
  return <ContentStudio store={store} blocks={blocks} />;
}
```

To have saves write `content/pages.json` directly, serve a local content API over the file store. See the next section and [`examples/studio`](https://github.com/YarlisAISolutions/contentcore/tree/main/examples/studio).

## API content

**The browser** uses the studio with an API store:

```tsx
import { createApiStore } from "@contentcore/react";

const store = createApiStore({
  baseUrl: "/api/content",
  headers: () => ({ authorization: `Bearer ${session.token}` }),
});

<ContentStudio store={store} blocks={blocks} onSaved={(s) => siteSource.invalidate(s.page.slug)} />
```

**The server** runs one `Request → Response` handler for any runtime: Next.js route handlers, Hono, Bun, Deno, Workers, or Node through an adapter.

```ts
import { createContentApiHandler } from "@contentcore/core";
import { createFileStore } from "@contentcore/core/fs";   // or your own ContentStore over a database

const handle = createContentApiHandler(createFileStore("content/pages.json"), {
  authorize: (request, action) => isEditor(request),       // list / write / delete; denied by default
});

// Next.js: app/api/content/[...path]/route.ts
export const GET = async (req: Request) => (await handle(req)) ?? new Response(null, { status: 404 });
export const PUT = GET;
export const DELETE = GET;
```

The handler serves:
- **The public read contract** that sites use through `createApiSource`, with ETag and 304. Reads are open by default; pass `publicRead: false` to put them behind `authorize`.
- **The management endpoints** the studio uses:
  - `GET /pages` and `GET /pages/:id`.
  - `PUT /pages/:id`, which requires `If-Match` to update an existing page.
  - `DELETE /pages/:id`, which requires `If-Match`.
- **Its guarantees:**
  - Every write is validated.
  - Each slug and locale pair stays unique.
  - Bodies are capped (1 MiB by default).
  - A stale revision gets a 412.

## Props

| Prop | |
|---|---|
| `store` | Any `ContentStore`: `createMemoryStore`, `createApiStore`, `createFileStore` (server), or your own |
| `blocks` | Your block registry |
| `onSaved(stored)`, `onDeleted(summary)` | For example, to invalidate the site's cache |
| `title`, `actions` | Content for the studio bar |
| `jsonSchemas` | `{ [type]: JSONSchema }` to override or supply form schemas |
| `unstyled` | Skip the built-in stylesheet |

## Limits (v0.2)

There are no revision history, roles or approval workflow, media library, or real-time co-editing yet. Changes are guarded by revisions, not merged. Put the studio behind your app's authentication, and enforce permissions in `authorize` on the server.

[Editing guide](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/editing.md) · [All docs](https://github.com/YarlisAISolutions/contentcore/blob/main/docs/README.md)

## Licence

MIT
