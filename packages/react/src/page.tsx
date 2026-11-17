import type { PageDocument } from "@contentcore/core";
import { Fragment, memo, useEffect, useMemo, useState } from "react";
import { BlockBoundary } from "./block-boundary";
import { type CmsFallbacks, PageContext, useCms } from "./context";
import { type ResolvedBlock, resolveBlocks, resolveBlocksCached } from "./resolve";
import { usePage } from "./use-page";

interface CommonProps {
  /** Per-page overrides for the provider's fallbacks. */
  fallbacks?: CmsFallbacks;
}

export type CmsPageProps = CommonProps &
  (
    | {
        /** Load this page from the provider's source. */
        slug: string;
        locale?: string;
        page?: never;
      }
    | {
        /** Render an already-loaded page (from a server component, loader or getStaticProps). */
        page: PageDocument;
        slug?: never;
        locale?: never;
      }
  );

/** Loads (or takes) a page and renders its blocks with the registered components. Unstyled. */
export function CmsPage(props: CmsPageProps) {
  if (props.page) return <PageFromDocument page={props.page} fallbacks={props.fallbacks} />;
  return <PageFromSource slug={props.slug as string} locale={props.locale} fallbacks={props.fallbacks} />;
}

function useFallbacks(overrides: CmsFallbacks | undefined): CmsFallbacks {
  const { fallbacks } = useCms();
  return useMemo(() => ({ ...fallbacks, ...overrides }), [fallbacks, overrides]);
}

function PageFromSource({ slug, locale, fallbacks }: { slug: string; locale?: string; fallbacks?: CmsFallbacks }) {
  const merged = useFallbacks(fallbacks);
  const state = usePage(slug, { locale });
  switch (state.status) {
    case "loading":
      return <>{merged.loading ?? null}</>;
    case "not-found":
      return <>{typeof merged.notFound === "function" ? merged.notFound(slug) : (merged.notFound ?? null)}</>;
    case "error":
      return <>{merged.error?.(state.error, state.retry) ?? null}</>;
    case "ready":
      return <PageBlocks page={state.page} blocks={state.blocks} fallbacks={merged} />;
  }
}

function PageFromDocument({ page, fallbacks }: { page: PageDocument; fallbacks?: CmsFallbacks }) {
  const { blocks: registry, onIssue } = useCms();
  const merged = useFallbacks(fallbacks);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs validation on retry.
  const initial = useMemo(
    () => (attempt === 0 ? resolveBlocksCached(page, registry) : resolveBlocks(page, registry)),
    [page, registry, attempt],
  );
  const [late, setLate] = useState<{ from: unknown; blocks?: ResolvedBlock[]; error?: unknown } | null>(null);

  useEffect(() => {
    if (!(initial instanceof Promise)) return;
    let live = true;
    initial.then(
      (blocks) => live && setLate({ from: initial, blocks }),
      (error) => {
        if (!live) return;
        onIssue({ kind: "load-error", slug: page.slug, error });
        setLate({ from: initial, error });
      },
    );
    return () => {
      live = false;
    };
  }, [initial, onIssue, page.slug]);

  if (Array.isArray(initial)) return <PageBlocks page={page} blocks={initial} fallbacks={merged} />;
  if (late?.from !== initial) return <>{merged.loading ?? null}</>;
  if (late.blocks) return <PageBlocks page={page} blocks={late.blocks} fallbacks={merged} />;
  return <>{merged.error?.(late.error, () => setAttempt((n) => n + 1)) ?? null}</>;
}

function PageBlocks({ page, blocks, fallbacks }: { page: PageDocument; blocks: ResolvedBlock[]; fallbacks: CmsFallbacks }) {
  const { onIssue } = useCms();

  useEffect(() => {
    for (const r of blocks) {
      if (r.kind === "unknown") onIssue({ kind: "unknown-block", page, block: r.block });
      else if (r.kind === "invalid") onIssue({ kind: "invalid-block", page, block: r.block, issues: r.issues });
    }
  }, [blocks, page, onIssue]);

  return (
    <PageContext.Provider value={page}>
      {blocks.map((r) => (
        <BlockItem key={r.block.id} resolved={r} page={page} fallbacks={fallbacks} />
      ))}
    </PageContext.Provider>
  );
}

/** One block. Memoised: unchanged blocks are skipped when the page updates. */
const BlockItem = memo(function BlockItem({
  resolved: r,
  page,
  fallbacks,
}: {
  resolved: ResolvedBlock;
  page: PageDocument;
  fallbacks: CmsFallbacks;
}) {
  const { onIssue } = useCms();
  const { block } = r;
  if (r.kind === "unknown") return <Fragment>{fallbacks.unknownBlock?.(block) ?? null}</Fragment>;
  if (r.kind === "invalid") return <Fragment>{fallbacks.invalidBlock?.(block, r.issues) ?? null}</Fragment>;
  const Block = r.definition.component;
  return (
    <BlockBoundary
      block={block}
      fallback={(b, error) => fallbacks.blockError?.(b, error) ?? null}
      onError={(error) => onIssue({ kind: "block-error", page, block, error })}
    >
      <Block content={r.content} block={{ id: block.id, type: block.type }} page={page} />
    </BlockBoundary>
  );
});
