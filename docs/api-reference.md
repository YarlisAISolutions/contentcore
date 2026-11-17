# API reference

`@contentcore/react` re-exports everything from `@contentcore/core`. Server code should import from `@contentcore/core`.

## Components (`@contentcore/react`)

### `<CmsProvider>`

| Prop | Type | Default | |
|---|---|---|---|
| `source` | `ContentSource` | required | Where pages come from. Create it once |
| `blocks` | `BlockRegistry` | required | `{ [type]: BlockDefinition }`. Create it once |
| `locale` | `string` | none | Default locale for every page below |
| `capabilities` | `string[]` | `[]` | Viewer capabilities, merged with each page's |
| `fallbacks` | `CmsFallbacks` | renders nothing | See below |
| `onIssue` | `(issue: CmsIssue) => void` | `console.warn` outside production | Load errors and unknown, invalid or crashed blocks |

### `<CmsPage>`

Takes either `slug` (load from the source) or `page` (render a page you already have). It also accepts `locale` (with `slug`) and `fallbacks`, which override the provider's for this region.

### `CmsFallbacks`

| Key | Signature | Shown when |
|---|---|---|
| `loading` | `ReactNode` | Nothing is cached and the page is loading |
| `notFound` | `ReactNode \| (slug) => ReactNode` | The source returned `null` |
| `error` | `(error, retry) => ReactNode` | Loading failed and no content is on screen |
| `unknownBlock` | `(block) => ReactNode` | A block `type` isn't registered |
| `invalidBlock` | `(block, issues) => ReactNode` | Content failed the block schema |
| `blockError` | `(block, error) => ReactNode` | A block component threw |

### `<HtmlContent nodes allowElements? denyElements? components? />`

Renders an `HtmlNode[]` tree with sanitisation. See [blocks](blocks.md#rich-content-the-html-block).

## Hooks (`@contentcore/react`)

| Hook | Returns |
|---|---|
| `usePage(slug, { locale })` | `{ status: "loading" \| "ready" \| "not-found" \| "error", page?, blocks?, error?, retry }` |
| `usePrefetch()` | `(slug, { locale }?) => void` |
| `useCapabilities()` | `{ list, can(action) }` |
| `usePageDocument()` | The current `PageDocument`, or `null` |
| `useCms()` | Provider context (source, blocks, locale, fallbacks, onIssue) |

## Blocks (`@contentcore/react`)

| Function | |
|---|---|
| `defineBlock({ schema, component })` | Typed block from any Standard Schema |
| `htmlBlock` | Built-in rich-content block with safe defaults |
| `createHtmlBlock({ allowElements, denyElements, components, maxDepth, maxNodes })` | Configured html block |
| `htmlToNodes(html)` | Convert an HTML string to `HtmlNode[]` (needs a DOMParser) |
| `isSafeUrl(url, tag)` | The URL check the sanitiser uses |
| `resolveBlocks(page, registry)` / `resolveBlocksCached` | Match and validate blocks (sync when possible) |

## Sources (`@contentcore/core`)

| Function | Returns |
|---|---|
| `createStaticSource({ pages, defaultLocale?, migrations? })` | `ContentSource` with `peek` |
| `createApiSource(options)` | `CachedContentSource` (or `ContentSource` with `cache: false`) |
| `createUncachedApiSource(options)` | `ContentSource` |
| `createCachedSource(source, CacheOptions)` | `CachedContentSource` |
| `createFallbackSource(...sources, { onError?: "throw" \| "next", onFailover? })` | `ContentSource` |
| `DEFAULT_CACHE_OPTIONS` | The cache defaults |

All options are listed in [sources and caching](sources-and-caching.md).

## Documents (`@contentcore/core`)

| | |
|---|---|
| `parsePageDocument(raw, { migrations?, context? })` | Validate and normalise; throws `ContentValidationError` / `UnsupportedSchemaVersionError` |
| `safeParsePageDocument(raw, opts)` | `{ ok: true, page } \| { ok: false, error }` |
| `migratePage(raw, migrations?, targetVersion?)` | Upgrade an older document |
| `CURRENT_SCHEMA_VERSION`, `BUILTIN_MIGRATIONS` | Format version and built-in steps |
| `normalizeSlug(slug)` | Canonical slug |
| `validateBlockContent(schema, content)` | Run a Standard Schema (sync or async) |
| `createCapabilities(...lists)` | `{ list, can }` with `*` and `scope:*` wildcards |
| `deepFreeze(value)` | What sources use to make pages immutable |

## HTML catalogue (`@contentcore/core`)

`HTML_ELEMENTS`, `LEGACY_HTML_ELEMENTS`, `SVG_ELEMENTS`, `MATHML_ELEMENTS`, `VOID_ELEMENTS`, `UNSAFE_ELEMENTS` and `STRUCTURAL_ELEMENTS`, plus these:

- `canonicalTag(tag)`
- `validateHtmlNodes(nodes, { maxDepth, maxNodes })`
- `htmlContentSchema` and `createHtmlContentSchema(limits)`
- Types: `HtmlNode`, `HtmlElementNode`, `HtmlBlockContent`

## Errors (`@contentcore/core`)

| Class | `code` | Extra |
|---|---|---|
| `ContentValidationError` | `VALIDATION` | `issues: { path, message }[]` |
| `UnsupportedSchemaVersionError` | `UNSUPPORTED_SCHEMA_VERSION` | `schemaVersion` |
| `ContentSourceError` | `SOURCE` | `status?`, `url?`, `cause` |

All extend `ContentcoreError`. Use `isContentcoreError(e)` and `isAbortError(e)` rather than `instanceof` across bundles.

## Types

`PageDocument` (alias `CmsPageDocument`), `BlockData`, `ContentSource`, `GetPageOptions`, `CachedContentSource`, `CacheOptions`, `ApiSourceOptions`, `RetryOptions`, `FallbackSourceOptions`, `BlockDefinition`, `BlockProps`, `BlockRegistry`, `CmsFallbacks`, `CmsIssue`, `PageState`, `Capabilities`, `ValidationIssue`, `PageMigrations`, `StandardSchemaV1`.
