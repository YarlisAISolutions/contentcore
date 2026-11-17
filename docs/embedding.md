# Embedding ContentCore in your app

ContentCore works the same way everywhere:

1. **Content** is stored as `PageDocument`s (see [content model](content-model.md)).
2. **A source** loads it (see [sources and caching](sources-and-caching.md)).
3. **A block registry** maps each block `type` to a React component (see [blocks](blocks.md)).
4. **`<CmsProvider>` + `<CmsPage>`** render it.

What changes between apps is **where** each piece runs. This guide covers the common app types, then the patterns for putting content into pages.

| App type | Loads content on | Renders on | Example | Verified in CI |
|---|---|---|---|---|
| [Single-page app (Vite, CRA, Parcel)](#single-page-app-vite) | client | client | [`examples/vite-app`](../examples/vite-app) | ✅ Chromium, Firefox, WebKit |
| [Next.js App Router](#nextjs-app-router) | server (RSC) | server + client | [`examples/nextjs-app`](../examples/nextjs-app) | ✅ `next build` + `next start` |
| [Next.js Pages Router](#nextjs-pages-router) | server (`getStaticProps`) | server + client | n/a | pattern only |
| [React Router / Remix (framework mode)](#react-router--remix) | server (`loader`) | server + client | n/a | pattern only |
| [Node, Bun or Deno server (Express, Fastify, Hono, node:http)](#nodebundeno-server-rendering) | server | server (+ optional hydrate) | [`examples/node-server`](../examples/node-server) | ✅ Node 20/22/24, Bun, Deno |
| [Edge (Cloudflare Workers, Vercel Edge, Deno Deploy)](#edge-runtimes) | edge | edge (streaming) | [`examples/edge-worker`](../examples/edge-worker) | ✅ edge runtime VM |
| [Astro, or islands in any server-rendered site](#astro-and-islands) | server | client island | n/a | pattern only |
| [React Native](#react-native) | client | client (native views) | n/a | not run |

---

## Single-page app (Vite)

The whole app is client-side: the source fetches content in the browser.

```tsx
// src/content.ts: create sources once, at module scope
import { createApiSource, createFallbackSource, createStaticSource } from "@contentcore/react";
import snapshot from "./content/pages.json";

export const source = createFallbackSource(
  createApiSource({ baseUrl: import.meta.env.VITE_CONTENT_API }), // cached + retried by default
  createStaticSource({ pages: snapshot }),                          // bundled copy if the API is down
  { onError: "next" },
);
```

```tsx
// src/App.tsx
import { CmsPage, CmsProvider } from "@contentcore/react";
import { blocks } from "./blocks";            // module-level registry
import { source } from "./content";

export function App() {
  const path = usePath();                      // from your router
  return (
    <CmsProvider source={source} blocks={blocks} fallbacks={fallbacks}>
      <Layout>
        <CmsPage slug={path} />
      </Layout>
    </CmsProvider>
  );
}
```

- **Routing.** With React Router, TanStack Router or Wouter, read the current path from the router and pass it as `slug`; nothing else changes. The example ships a 30-line router so it has no dependencies.
- **Instant navigation.** Call `usePrefetch()` in your `Link` component on hover and focus. The next page is then already cached and renders on the first frame.
- **Deep links.** Configure your host to serve `index.html` for unknown paths (the standard SPA fallback).
- **SEO.** A pure SPA renders content in the browser only. If search ranking matters, use one of the server-rendered setups below.

## Next.js (App Router)

Load content in **server components** with `@contentcore/core`, and render it in a **client component** with `@contentcore/react`.

```ts
// lib/content.ts: server only
import { createApiSource } from "@contentcore/core";
import { cache } from "react";

export const source = createApiSource({ baseUrl: process.env.CONTENT_API! });
export const getPage = cache((slug: string, locale?: string) => source.getPage(slug, { locale }));
```

```tsx
// app/[[...slug]]/page.tsx: server component, catch-all CMS route
export const revalidate = 60; // ISR

export async function generateMetadata({ params }) {
  const page = await getPage(slugFromParams((await params).slug));
  return page ? { title: page.title, description: page.meta?.description } : {};
}

export default async function Page({ params }) {
  const page = await getPage(slugFromParams((await params).slug));
  if (!page) notFound();
  return <ContentPage page={page} />;
}
```

```tsx
// components/ContentPage.tsx: the client boundary
"use client";
import { CmsPage, CmsProvider } from "@contentcore/react";
import { blocks } from "./blocks";

export function ContentPage({ page }) {
  return (
    <CmsProvider source={browserSource} blocks={blocks}>
      <CmsPage page={page} />
    </CmsProvider>
  );
}
```

Rules that matter in Next.js:

- **Server code imports `@contentcore/core` only.** `@contentcore/react` is a `"use client"` module, so a function imported from it into a server component becomes a client reference and can't be called there.
- **Don't pass the source or the registry across the server/client boundary.** They contain functions, which can't be serialised. Create them in client modules, and pass only the `page` (plain JSON).
- **Use `React.cache`** so `generateMetadata` and the page share one fetch per request.
- **Updates on publish:**
  - ISR (`revalidate`) bounds how stale a page can get.
  - A publish webhook that calls `revalidatePath` updates it immediately; see `app/api/revalidate/route.ts`.
- **Content API for the browser:** `app/api/content/pages/route.ts` implements the [API contract](sources-and-caching.md#the-content-api-contract), with ETags and CDN headers. The client source reads from it.
- **Prime the client cache** with the server-loaded page (`browserSource.prime(page)`). A client-side `<CmsPage slug>` for that page then renders instantly.

## Next.js (Pages Router)

```tsx
// pages/[[...slug]].tsx
import { CmsPage, CmsProvider } from "@contentcore/react";
import { createApiSource } from "@contentcore/core";

const serverSource = createApiSource({ baseUrl: process.env.CONTENT_API! });

export async function getStaticProps({ params }) {
  const page = await serverSource.getPage("/" + (params.slug ?? []).join("/"));
  return page ? { props: { page }, revalidate: 60 } : { notFound: true, revalidate: 60 };
}
export const getStaticPaths = async () => ({ paths: [], fallback: "blocking" });

export default function Page({ page }) {
  return (
    <CmsProvider source={browserSource} blocks={blocks}>
      <CmsPage page={page} />
    </CmsProvider>
  );
}
```

## React Router / Remix

In framework mode, load in the `loader` and render in the route component:

```tsx
// app/routes/$.tsx
import { createApiSource } from "@contentcore/core";
const source = createApiSource({ baseUrl: process.env.CONTENT_API! });

export async function loader({ params }) {
  const page = await source.getPage("/" + (params["*"] ?? ""));
  if (!page) throw new Response("Not found", { status: 404 });
  return { page };
}

export default function ContentRoute({ loaderData }) {
  return (
    <CmsProvider source={browserSource} blocks={blocks}>
      <CmsPage page={loaderData.page} />
    </CmsProvider>
  );
}

export const meta = ({ data }) => [{ title: data?.page.title }];
```

## Node/Bun/Deno server rendering

Any server that can run React can render pages: Express, Fastify, Hono or plain `node:http`. [`examples/node-server`](../examples/node-server) contains both halves, and runs unchanged on Node 20+, Bun and Deno:

- **A content API** implementing the contract `createApiSource` expects: `GET /api/content/pages?slug=&locale=`, with an `ETag`, `304 Not Modified`, a `404` body of `null`, and `Cache-Control` for CDNs.
- **A server-rendering frontend:**
  - `renderToString(<CmsProvider …><CmsPage page={page} /></CmsProvider>)`.
  - Embeds the page JSON for hydration with `<` escaped, so content can't break out of the `<script>` tag.
  - Escapes values placed in `<title>` and `<meta>`.

To hydrate, the client reads the embedded JSON and calls `hydrateRoot(el, <CmsProvider …><CmsPage page={page} /></CmsProvider>)` with the same registry.

## Edge runtimes

[`examples/edge-worker`](../examples/edge-worker) is a Workers-style `fetch` handler. It runs anywhere that has Web APIs: Cloudflare Workers, Vercel Edge Functions, Deno Deploy and Netlify Edge.

- **Per-isolate cache.** It creates one source per isolate, so a warm isolate serves repeat requests from memory with no origin call. This is verified in CI.
- **Streaming.** It renders with `renderToReadableStream` and streams HTML.
- **Edge-sized limits.** Use short timeouts (`timeoutMs: 3000`) and one retry. When the origin is slow, stale-if-error keeps pages up.
- **CDN caching.** Send `Cache-Control: s-maxage, stale-while-revalidate` so the CDN absorbs most traffic.

ContentCore's core uses only Web-standard APIs (`fetch`, `AbortController`, `setTimeout`, `TextEncoder`), with fallbacks for anything newer.

## Astro and islands

Inside a mostly static site, render ContentCore as an island. Load the page in the Astro frontmatter on the server, and hydrate one React component:

```astro
---
import { createApiSource } from "@contentcore/core";
import ContentPage from "../components/ContentPage"; // the same client component as Next.js
const page = await createApiSource({ baseUrl: import.meta.env.CONTENT_API }).getPage(Astro.url.pathname);
if (!page) return Astro.redirect("/404");
---
<ContentPage client:load page={page} />
```

The same idea works with any server-rendered site (Rails, Django, Laravel, PHP). Mount a small React bundle on a placeholder element and give it either a slug, so it loads on the client, or the page JSON, which renders immediately.

## React Native

- **`@contentcore/core` should work.** It is plain TypeScript with fallbacks for globals that Hermes lacks (`structuredClone`, `DOMException`, `AbortSignal.any`). This has **not** been run on a device or in Hermes.
- **`CmsProvider`, `CmsPage` and the hooks** have no DOM dependency. Register blocks that render React Native components (`View`, `Text`).
- **The built-in `html` block renders DOM elements, so don't use it in React Native.** Either map `HtmlContent` tags to native components with `components`, or store native-friendly block types.

---

# Patterns for putting content into pages

### 1. Whole pages: a catch-all CMS route

Every URL without its own route is a content page. Editors can create pages without a deploy.

```tsx
<Route path="*" element={<CmsPage slug={location.pathname} />} />
```

Next.js: `app/[[...slug]]/page.tsx`. Explicit routes such as `/shop` and `/api/*` still take precedence.

### 2. A CMS section inside an app-owned page

The page is code, such as a checkout, a dashboard or a product listing. One region of it is editable content: a promo, a banner or help text. Store sections as pages under a reserved prefix (`/sections/…`) and leave them out of routing and sitemaps.

```tsx
function ShopPage() {
  return (
    <>
      <ProductGrid />                        {/* code */}
      <aside>
        <CmsPage slug="/sections/promo" fallbacks={{ notFound: null, error: () => null }} />
      </aside>
    </>
  );
}
```

Override the fallbacks so a missing or failed section **renders nothing** instead of an error message inside your page. With a server framework, load the section on the server like any other data (see `examples/nextjs-app/app/shop/page.tsx`).

### 3. Several regions on one page

One provider, many `<CmsPage>`s. Each region loads independently: they are cached and fetched in parallel, with in-flight requests coalesced.

```tsx
<CmsProvider source={source} blocks={blocks}>
  <CmsPage slug="/sections/header-banner" />
  <Article />
  <CmsPage slug="/sections/footer-links" />
</CmsProvider>
```

### 4. Shared layout content (header, footer, navigation)

Put the provider at the root of the layout and the global sections in it. They are fetched once and cached for every page.

### 5. Modals, drawers and tooltips

Render `<CmsPage slug="/help/billing" />` inside the modal, and call `usePrefetch()("/help/billing")` when the trigger is hovered or focused, so the modal opens with content already loaded.

### 6. Localised pages

Store one document per `(slug, locale)`, and pass `locale` on the provider (app-wide) or on `CmsPage` (per region). A missing translation falls back to the page with no locale.

```tsx
<CmsProvider source={source} blocks={blocks} locale={userLocale}>
```

### 7. Preview and drafts

Use a separate source for previews, with the CMS preview token and **no shared cache**, created per request or per editor session:

```ts
const preview = createApiSource({
  baseUrl: CMS_URL,
  headers: () => ({ authorization: `Bearer ${previewToken}` }),
  cache: false,
});
```

Don't put draft or per-user content behind a module-level cached source: that cache is shared by every user of that instance.

### 8. Experiments (A/B)

Choose the variant in your app (`/landing` vs `/landing-b`) and pass the chosen slug. Content stays plain data, and your experiment tool stays in charge of assignment.

### 9. Editor affordances

Show edit controls only when the viewer can edit, using capabilities from your session merged with the page's own:

```tsx
const { can } = useCapabilities();
{can("page:edit") && <a href={cmsEditUrl(page.id)}>Edit</a>}
```

The backend must still check permissions. Capabilities only decide what the UI shows.

---

Next: [Best practices](best-practices.md) · [Blocks](blocks.md) · [Sources and caching](sources-and-caching.md)
