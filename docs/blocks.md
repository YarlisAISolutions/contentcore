# Blocks

A block is a **schema** (what content is valid) plus a **component** (how it renders). The registry maps each stored `type` to its block.

## defineBlock

```tsx
import { defineBlock } from "@contentcore/react";
import { z } from "zod";

export const pricingTable = defineBlock({
  schema: z.object({
    currency: z.string().length(3),
    plans: z.array(z.object({
      name: z.string(),
      price: z.number().nonnegative(),
      features: z.array(z.string()),
      highlighted: z.boolean().default(false), // defaults and transforms apply
    })).min(1),
  }),
  component: ({ content, block, page }) => (  // content: the schema's *output* type
    <div className="plans">{/* … */}</div>
  ),
});
```

A block component receives these props:

| Prop | Type | Notes |
|---|---|---|
| `content` | inferred from the schema | Already validated and parsed: defaults filled in, transforms applied |
| `block` | `{ id, type }` | Use `id` for anchors, analytics and edit links |
| `page` | `PageDocument` | The page this block is on |

**Any Standard Schema works**, so Zod 3.24+/4, Valibot and ArkType can all be used:

```ts
import * as v from "valibot";
const quote = defineBlock({
  schema: v.object({ text: v.string(), by: v.string() }),
  component: ({ content }) => <blockquote>{content.text}<cite>{content.by}</cite></blockquote>,
});
```

**Async schemas**, for example a refinement that checks something remotely, are supported. The block shows `fallbacks.loading` until validation finishes. Sync schemas render on the first pass, including on the server.

## The registry

```ts
export const blocks = { hero, featureList, pricingTable, html: htmlBlock };
```

- **Define it at module scope.** Validation results are memoised per (page, registry), so an inline `{ … }` object in JSX throws that memo away on every render.
- **Treat keys as stored data.** Renaming a key orphans existing content. If you rename one, keep the old key as an alias (`{ hero, banner: hero }`) or migrate the content.
- **Split per area** if you like. A marketing registry and a docs registry can live in different providers.

## When content and code disagree

| Situation | What renders | `onIssue` kind |
|---|---|---|
| A block `type` that isn't registered (old content, or a block added in the CMS before the deploy) | `fallbacks.unknownBlock(block)` (nothing by default) | `unknown-block` |
| Content that fails the schema | `fallbacks.invalidBlock(block, issues)` (nothing by default) | `invalid-block` |
| A component that throws while rendering | `fallbacks.blockError(block, error)` (nothing by default); the rest of the page renders | `block-error` |

Send `onIssue` to your error tracker. It is your signal that content and code have drifted.

## Hooks inside blocks

| Hook | Use |
|---|---|
| `usePageDocument()` | The current page (id, locale, meta) |
| `useCapabilities()` | `can("page:edit")`, to show or hide editor controls |
| `usePrefetch()` | Warm the cache for a linked page on hover |
| `useCms()` | The provider's source, registry and locale (advanced) |

## Rich content: the `html` block

For editorial text that needs arbitrary markup, register the built-in `html` block. Its content is an **element tree stored as data**, never as an HTML string:

```json
{ "type": "html", "content": { "nodes": [
  { "tag": "h2", "children": ["Title"] },
  { "tag": "p", "attrs": { "class": "lead" }, "children": ["Text with ", { "tag": "a", "attrs": { "href": "/pricing" }, "children": ["a link"] }] },
  { "tag": "img", "attrs": { "src": "/hero.png", "alt": "", "loading": "lazy" } }
] } }
```

### What it renders

- **HTML:** every element in the HTML Living Standard (`HTML_ELEMENTS`), and the obsolete ones browsers still render, such as `font`, `center` and `marquee` (`LEGACY_HTML_ELEMENTS`).
- **SVG 2 and MathML Core:** all elements, with case restored automatically (`lineargradient` → `linearGradient`).
- **Custom elements and web components** (`<my-widget>`): attributes are passed verbatim.
- **Structure:** unknown and document-level wrappers (`html`, `body`, made-up tags) are unwrapped, so only their children render.
- **Attributes:** mapped to React automatically (`class`, `for`, `tabindex`, `colspan`, `style="a:b"`, `stroke-width`, `viewbox`, `aria-*`, `data-*`).
- **Form fields:** `value` and `checked` become *initial* values, so the fields stay editable.

### What it removes (always)

- Event handler attributes (`onclick`, `onerror`, …).
- `javascript:` and `vbscript:` URLs, and `data:` URLs outside media elements.
- `srcdoc`, `dangerouslySetInnerHTML` and `innerHTML`.
- `expression()` and `javascript:` inside `style`.

### What needs opting in

These elements are blocked unless you list them in `allowElements`: `script`, `iframe`, `frame`, `object`, `embed`, `base`, `meta`, `link`, `style`, `noscript`, `template`, and the SVG animation elements (which can rewrite links).

```tsx
import { createHtmlBlock, HtmlContent, htmlToNodes } from "@contentcore/react";
import NextLink from "next/link";

// A configured html block
export const html = createHtmlBlock({
  allowElements: ["iframe"],                  // e.g. trusted video embeds
  denyElements: ["form"],                     // never render these
  components: {                               // swap elements for your components
    a: ({ href, ...p }) => href?.startsWith("/") ? <NextLink href={href} {...p} /> : <a href={href} rel="noopener" {...p} />,
    img: (p) => <OptimisedImage {...p} />,
  },
  maxDepth: 64, maxNodes: 20_000,             // limits checked during validation
});

// Render a tree anywhere (not only inside CmsPage)
<HtmlContent nodes={nodes} />

// Import legacy HTML once, then store the nodes (needs a DOMParser: browser, jsdom, happy-dom)
const nodes = htmlToNodes("<p>Legacy <b>HTML</b></p>");
```

Validate trees anywhere with `validateHtmlNodes(nodes)` or `htmlContentSchema` (a Standard Schema).
