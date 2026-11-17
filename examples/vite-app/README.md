# ContentCore: Vite feature tour

A single-page app that uses every ContentCore feature. Run it with `npm i && npm run dev`, then open the pages listed below.

| Page | Shows |
|---|---|
| `/` | Typed blocks, rich HTML with SVG, MathML, `details`, `meter`, an editable form field, a sanitised unsafe link, and an "Edit page" button gated by a capability |
| `/pricing` | A block with schema defaults, and an HTML table. You get here through a link inside rich text, routed by the client router |
| `/about` | Locales: switch the selector to Français |
| `/shop` | An app-owned page that embeds the CMS section `/sections/promo` |
| `/legacy` | Resilience: an unknown block type, invalid content, legacy `<font>`/`<center>` and a blocked `<script>`, while the rest of the page still renders |
| `/missing` | The not-found fallback |

By default content comes from `src/content/pages.json`. Set `VITE_CONTENT_API=https://…/api/content` to read from an API instead, with the bundled JSON as an automatic failover snapshot. The Refresh button then clears the cache.

Files: `src/blocks.tsx` (registry), `src/content.ts` (sources), `src/App.tsx` (provider, fallbacks, embedded section), `src/router.tsx` (links with prefetch).
