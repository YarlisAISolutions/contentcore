# ContentCore Studio example

A content editing UI for both kinds of content, switched from the studio bar:

| Content source | Store | Saving |
|---|---|---|
| **Static JSON (in browser)** | `createMemoryStore(content/pages.json)` | Edits stay in the browser; **Export JSON** downloads `pages.json` to commit |
| **Content API** | `createApiStore("/api/content")` → `server.mjs` | Writes `content/pages.json` on disk through `createContentApiHandler` + `createFileStore` |

## Run it

The API needs a token, read from the environment:

```bash
npm install
export STUDIO_TOKEN="$(openssl rand -hex 16)"
echo "$STUDIO_TOKEN"   # paste it into the studio's API token field
npm start              # builds the studio, then serves it and the API
```

Then open the printed URL.

- **Development with hot reload:** run `npm run server` in one terminal and `npm run dev` in another. Vite proxies `/api` to the server.
- **Bun:** `bun server.mjs`.
- **Deno:** `deno run --allow-read --allow-write --allow-env --allow-net server.mjs`.

## What to try

- **Edit a page:** open **Home**, change the hero heading, and watch the preview update. Then save with Ctrl/Cmd+S.
- **Edit rich text:** in the `html` block, type, format, or paste from a web page; script and handlers are removed as you paste.
- **Validation:** **Resilience** contains an unknown block type and invalid content. The studio flags both, and you can't save until they're fixed.
- **New pages:** use **+ New page** and **Add a block** (`pricingTable` shows nested lists and choice fields).
- **API mode:** switch to **Content API** and enter the token, then save. `git diff content/pages.json` shows the change.
- **Conflicts:** open the same page in two tabs and save in both. The second save offers *reload* or *overwrite*.

Files: `src/blocks.tsx` (registry), `src/main.tsx` (studio and mode switch), `server.mjs` (API and hosting).
