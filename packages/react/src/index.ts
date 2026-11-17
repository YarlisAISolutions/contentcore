// Re-export the framework-agnostic core so apps need a single import.
// Server-only code (Next.js server components, loaders) should import @contentcore/core directly.
export * from "@contentcore/core";

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
