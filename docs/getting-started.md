# Getting started

Ten minutes from install to a rendered, cached, validated page.

## 1. Install

```bash
npm i @contentcore/react zod        # or: pnpm add / yarn add / bun add
```

- **Peer dependency:** React 18.2 or newer (React 18 and 19 are tested).
- **Schemas:** Zod is optional. Any [Standard Schema](https://standardschema.dev) library works, such as Valibot or ArkType.
- **Server-only code** (Next.js server components, loaders, workers) can use `@contentcore/core` instead, which has no React and no dependencies.

## 2. Write a page

A page is a list of blocks. Each block has a stable `id`, a `type`, and `content` for that type:

```json
{
  "id": "home",
  "slug": "/",
  "schemaVersion": 1,
  "title": "Home",
  "blocks": [
    { "id": "welcome", "type": "hero", "content": { "heading": "Welcome", "description": "Explore our products" } },
    { "id": "body", "type": "html", "content": { "nodes": [{ "tag": "p", "children": ["Hello ", { "tag": "strong", "children": ["world"] }] }] } }
  ]
}
```

## 3. Define blocks

```tsx
// blocks.tsx
import { defineBlock, htmlBlock } from "@contentcore/react";
import { z } from "zod";

export const hero = defineBlock({
  schema: z.object({ heading: z.string(), description: z.string().optional() }),
  component: ({ content }) => (       // content is typed from the schema
    <section>
      <h1>{content.heading}</h1>
      {content.description && <p>{content.description}</p>}
    </section>
  ),
});

export const blocks = { hero, html: htmlBlock }; // keys are the stored block `type`s
```

## 4. Choose a source

```ts
// content.ts
import { createApiSource, createStaticSource } from "@contentcore/react";
import pages from "./pages.json";

export const source = createStaticSource({ pages });                 // JSON in your repo
// or
export const source = createApiSource({ baseUrl: "/api/content" }); // your API: cached, retried, ETag
```

## 5. Render

```tsx
import { CmsPage, CmsProvider } from "@contentcore/react";
import { blocks } from "./blocks";
import { source } from "./content";

export function App() {
  return (
    <CmsProvider
      source={source}
      blocks={blocks}
      fallbacks={{ loading: <p>Loading…</p>, notFound: (slug) => <p>No page at {slug}</p> }}
    >
      <CmsPage slug={window.location.pathname} />
    </CmsProvider>
  );
}
```

That gives you:

- Validated content, with an invalid block replaced by its fallback while the rest of the page still renders.
- Cached loading: a repeat visit renders on the first frame.
- Every HTML element available through the `html` block.
- Loading, not-found and error states.

## Next steps

- [Embed it in your kind of app](embedding.md): Next.js, a server, the edge, an SPA, sections inside existing pages.
- [Write blocks](blocks.md), including rich HTML content.
- [Tune sources and caching](sources-and-caching.md), and implement the content API on your backend.
- [Best practices](best-practices.md).
