import { type BlockData, type PageDocument, type ValidationIssue, validateBlockContent } from "@contentcore/core";
import type { BlockDefinition, BlockRegistry } from "./define-block";

export type ResolvedBlock =
  | { kind: "ok"; block: BlockData; definition: BlockDefinition; content: unknown }
  | { kind: "unknown"; block: BlockData }
  | { kind: "invalid"; block: BlockData; issues: ValidationIssue[] };

/**
 * Matches each block to its registered definition and validates its content.
 * Synchronous when every schema is; a Promise when any schema validates asynchronously.
 */
export function resolveBlocks(page: PageDocument, registry: BlockRegistry): ResolvedBlock[] | Promise<ResolvedBlock[]> {
  let pending = false;
  const results = page.blocks.map((block): ResolvedBlock | Promise<ResolvedBlock> => {
    const definition = Object.hasOwn(registry, block.type) ? registry[block.type] : undefined;
    if (!definition) return { kind: "unknown", block };
    const finish = (r: Awaited<ReturnType<typeof validateBlockContent>>): ResolvedBlock =>
      r.ok ? { kind: "ok", block, definition, content: r.value } : { kind: "invalid", block, issues: r.issues };
    const result = validateBlockContent(definition.schema, block.content);
    if (result instanceof Promise) {
      pending = true;
      return result.then(finish);
    }
    return finish(result);
  });
  return pending ? Promise.all(results) : (results as ResolvedBlock[]);
}

// page object -> registry -> resolved blocks. Pages from the cache and static sources are
// shared immutable objects, so validation runs once per page version instead of every render.
const resolvedCache = new WeakMap<PageDocument, WeakMap<BlockRegistry, ResolvedBlock[] | Promise<ResolvedBlock[]>>>();

/** `resolveBlocks`, memoised per (page object, registry). */
export function resolveBlocksCached(
  page: PageDocument,
  registry: BlockRegistry,
): ResolvedBlock[] | Promise<ResolvedBlock[]> {
  let byRegistry = resolvedCache.get(page);
  if (!byRegistry) {
    byRegistry = new WeakMap();
    resolvedCache.set(page, byRegistry);
  }
  const hit = byRegistry.get(registry);
  if (hit) return hit;
  const result = resolveBlocks(page, registry);
  byRegistry.set(registry, result);
  if (result instanceof Promise) {
    // Swap in the settled array so later renders are synchronous; forget failures so they can retry.
    result.then(
      (blocks) => byRegistry.set(registry, blocks),
      () => byRegistry.delete(registry),
    );
  }
  return result;
}
