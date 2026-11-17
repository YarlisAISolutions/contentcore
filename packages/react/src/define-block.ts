import type { PageDocument, StandardSchemaV1 } from "@contentcore/core";
import type { ComponentType } from "react";

export interface BlockProps<TContent> {
  /** The block's content, already validated and parsed by its schema. */
  content: TContent;
  block: { id: string; type: string };
  page: PageDocument;
}

export interface BlockDefinition<TContent = unknown> {
  schema: StandardSchemaV1<unknown, TContent>;
  component: ComponentType<BlockProps<TContent>>;
}

/** Map of block `type` (as stored) to its definition. */
// biome-ignore lint/suspicious/noExplicitAny: registries hold blocks of different content types.
export type BlockRegistry = Readonly<Record<string, BlockDefinition<any>>>;

/**
 * Connects a block's content schema to the component that renders it.
 * Any Standard Schema works (Zod 3.24+/4, Valibot, ArkType); `content` is typed from the schema.
 */
export function defineBlock<S extends StandardSchemaV1>(definition: {
  schema: S;
  component: ComponentType<BlockProps<StandardSchemaV1.InferOutput<S>>>;
}): BlockDefinition<StandardSchemaV1.InferOutput<S>> {
  return Object.freeze({ schema: definition.schema, component: definition.component }) as BlockDefinition<
    StandardSchemaV1.InferOutput<S>
  >;
}
