// Re-export the framework-agnostic core so apps need a single import.
// Server-only code (Next.js server components, loaders) should import @contentcore/core directly.
// Named re-exports (not `export *`): Next.js rejects `export *` in a "use client" module.
export {
  BUILTIN_MIGRATIONS,
  canonicalTag,
  ContentcoreError,
  ContentSourceError,
  ContentValidationError,
  createApiSource,
  createCachedSource,
  createCapabilities,
  createFallbackSource,
  createHtmlContentSchema,
  createStaticSource,
  createUncachedApiSource,
  CURRENT_SCHEMA_VERSION,
  deepFreeze,
  DEFAULT_CACHE_OPTIONS,
  HTML_ELEMENTS,
  htmlContentSchema,
  isAbortError,
  isContentcoreError,
  LEGACY_HTML_ELEMENTS,
  MATHML_ELEMENTS,
  migratePage,
  normalizeSlug,
  parsePageDocument,
  safeParsePageDocument,
  STRUCTURAL_ELEMENTS,
  SVG_ELEMENTS,
  UNSAFE_ELEMENTS,
  UnsupportedSchemaVersionError,
  validateBlockContent,
  validateHtmlNodes,
  VOID_ELEMENTS,
} from "@contentcore/core";
export type {
  HtmlBlockContent,
  ApiSourceOptions,
  BlockContentResult,
  BlockData,
  CachedContentSource,
  CacheOptions,
  Capabilities,
  CmsPageDocument,
  ContentcoreErrorCode,
  ContentSource,
  FallbackSourceOptions,
  GetPageOptions,
  HtmlElementNode,
  HtmlLimits,
  HtmlNode,
  PageDocument,
  PageMigration,
  PageMigrations,
  ParsePageOptions,
  RetryOptions,
  StandardSchemaV1,
  StaticSourceOptions,
  ValidationIssue,
} from "@contentcore/core";

export {
  CmsProvider,
  useCms,
  usePageDocument,
  type CmsContextValue,
  type CmsFallbacks,
  type CmsIssue,
  type CmsProviderProps,
} from "./context";
export { CmsPage, type CmsPageProps } from "./page";
export { defineBlock, type BlockDefinition, type BlockProps, type BlockRegistry } from "./define-block";
export { resolveBlocks, resolveBlocksCached, type ResolvedBlock } from "./resolve";
export { usePage, usePrefetch, type PageState } from "./use-page";
export { useCapabilities } from "./use-capabilities";
export {
  HtmlContent,
  createHtmlBlock,
  htmlBlock,
  htmlToNodes,
  isSafeUrl,
  type HtmlContentProps,
  type HtmlRenderOptions,
} from "./html";
