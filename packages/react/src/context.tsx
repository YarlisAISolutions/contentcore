import type { BlockData, ContentSource, PageDocument, ValidationIssue } from "@contentcore/core";
import { type ReactNode, createContext, useContext, useMemo } from "react";
import type { BlockRegistry } from "./define-block";

/** Something worth knowing went wrong while loading or rendering content. */
export type CmsIssue =
  | { kind: "load-error"; slug: string; error: unknown }
  | { kind: "unknown-block"; page: PageDocument; block: BlockData }
  | { kind: "invalid-block"; page: PageDocument; block: BlockData; issues: ValidationIssue[] }
  | { kind: "block-error"; page: PageDocument; block: BlockData; error: unknown };

/** What to render in each state. Everything is unstyled and defaults to rendering nothing. */
export interface CmsFallbacks {
  loading?: ReactNode;
  notFound?: ReactNode | ((slug: string) => ReactNode);
  error?: (error: unknown, retry: () => void) => ReactNode;
  unknownBlock?: (block: BlockData) => ReactNode;
  invalidBlock?: (block: BlockData, issues: ValidationIssue[]) => ReactNode;
  /** A block component threw while rendering. The rest of the page still renders. */
  blockError?: (block: BlockData, error: unknown) => ReactNode;
}

export interface CmsContextValue {
  source: ContentSource;
  blocks: BlockRegistry;
  locale?: string;
  capabilities: readonly string[];
  fallbacks: CmsFallbacks;
  onIssue: (issue: CmsIssue) => void;
}

export interface CmsProviderProps {
  /** Where pages come from. Create it once (module scope or useMemo): a new source refetches. */
  source: ContentSource;
  /** Block registry, keyed by the block `type` stored in content. */
  blocks: BlockRegistry;
  /** Default locale for every page in this tree. */
  locale?: string;
  /** App-wide capabilities for the viewer (UI hints only), merged with each page's own. */
  capabilities?: readonly string[];
  fallbacks?: CmsFallbacks;
  /** Report content problems to your logger. Defaults to console.warn outside production. */
  onIssue?: (issue: CmsIssue) => void;
  children?: ReactNode;
}

const CmsContext = createContext<CmsContextValue | null>(null);
export const PageContext = createContext<PageDocument | null>(null);

const EMPTY: readonly string[] = Object.freeze([]);

function defaultOnIssue(issue: CmsIssue) {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  if (env?.NODE_ENV === "production") return;
  const where = "slug" in issue ? issue.slug : `${issue.page.slug} block "${issue.block.id}" (${issue.block.type})`;
  console.warn(`[contentcore] ${issue.kind} at ${where}`, issue);
}

export function CmsProvider({
  source,
  blocks,
  locale,
  capabilities,
  fallbacks,
  onIssue,
  children,
}: CmsProviderProps) {
  const value = useMemo<CmsContextValue>(
    () => ({
      source,
      blocks,
      locale,
      capabilities: capabilities ?? EMPTY,
      fallbacks: fallbacks ?? {},
      onIssue: onIssue ?? defaultOnIssue,
    }),
    [source, blocks, locale, capabilities, fallbacks, onIssue],
  );
  return <CmsContext.Provider value={value}>{children}</CmsContext.Provider>;
}

export function useCms(): CmsContextValue {
  const ctx = useContext(CmsContext);
  if (!ctx) throw new Error("ContentCore: wrap your tree in <CmsProvider source={…} blocks={…}>");
  return ctx;
}

/** The page currently being rendered, for use inside block components. Null outside a page. */
export function usePageDocument(): PageDocument | null {
  return useContext(PageContext);
}
