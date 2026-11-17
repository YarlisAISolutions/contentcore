# Content model

## PageDocument

This is the one shape that is stored, and so the one that has to outlive your code.

```ts
interface PageDocument {
  id: string;                  // stable identifier (CMS id)
  slug: string;                // "/" or "/a/b"; normalised: leading slash, no trailing slash
  schemaVersion: number;       // format version, currently 1
  locale?: string;             // "fr", "en-GB"…; omit for the default
  title?: string;              // for <title>, navigation…
  meta?: Record<string, unknown>; // anything else: description, og:image, noindex… (never interpreted)
  capabilities?: string[];     // what the current viewer may do (UI hints)
  blocks: BlockData[];
}

interface BlockData {
  id: string;                  // unique within the page, stable across edits
  type: string;                // key in the block registry
  content: object;             // validated by that block's schema
}
```

`parsePageDocument(raw)` validates a raw document and normalises it:

- The slug is normalised and unknown top-level keys are dropped.
- Older versions are migrated.
- On failure it throws `ContentValidationError`, with **every** issue and its path (`blocks.2.type`).

Every source runs it, so components only ever see valid pages.

### Rules for stable content

- **Block ids are forever.** They are React keys, and the anchor for editing, analytics and comments. Generate them once (in the CMS), and never derive them from position.
- **Slugs are URLs.** `normalizeSlug("about/")` and `normalizeSlug("/about")` are both `"/about"`.
- **Sections are pages.** Content embedded inside app pages lives under a reserved prefix such as `/sections/promo`. See the [embedding patterns](embedding.md#2-a-cms-section-inside-an-app-owned-page).
- **Locale variants share a slug.** A lookup tries the exact locale, then the page without a locale, then the source's `defaultLocale`.

## Versioning and migrations

`schemaVersion` versions the **document envelope**:

- When ContentCore changes the envelope, it bumps `CURRENT_SCHEMA_VERSION` and ships a migration in `BUILTIN_MIGRATIONS`.
- Old stored documents are upgraded as they are read, so you never rewrite your database in a hurry.
- A document **newer** than the installed package throws `UnsupportedSchemaVersionError` instead of rendering wrongly. Upgrade the package.

Your own block content evolves the same way. Pass `migrations` to any source, keyed by the version each one upgrades **from**:

```ts
const source = createApiSource({
  baseUrl: "/api/content",
  migrations: {
    // v1 → v2: hero.title was renamed to hero.heading
    1: (doc) => ({
      ...doc,
      schemaVersion: 2,
      blocks: doc.blocks.map((b) =>
        b.type === "hero" ? { ...b, content: { heading: b.content.title, ...b.content } } : b,
      ),
    }),
  },
});
```

Each step must return exactly the next version, otherwise loading fails loudly. Keep migrations in your repo for as long as old documents might exist.

## Immutability

Pages returned by sources are **deep-frozen** and **shared**: one object per page version, given to every caller.

- Reads are O(1).
- React memoisation works by reference, so unchanged pages and blocks don't re-render.
- Mutating a page throws in strict mode. Copy it first if you need a modified version (`structuredClone(page)`).
