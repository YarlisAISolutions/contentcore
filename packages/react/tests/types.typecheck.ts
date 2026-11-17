// Compile-time check (run by `tsc` in `bun run typecheck`): every public core type is also
// importable from @contentcore/react. A missing type re-export fails the typecheck.
import type * as Core from "@contentcore/core";
import type * as React from "../src";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type Checks = [
  Assert<Same<Core.ApiSourceOptions, React.ApiSourceOptions>>,
  Assert<Same<Core.ApiStoreOptions, React.ApiStoreOptions>>,
  Assert<Same<Core.BlockContentResult<string>, React.BlockContentResult<string>>>,
  Assert<Same<Core.BlockData, React.BlockData>>,
  Assert<Same<Core.CachedContentSource, React.CachedContentSource>>,
  Assert<Same<Core.CacheOptions, React.CacheOptions>>,
  Assert<Same<Core.Capabilities, React.Capabilities>>,
  Assert<Same<Core.CmsPageDocument, React.CmsPageDocument>>,
  Assert<Same<Core.ContentAction, React.ContentAction>>,
  Assert<Same<Core.ContentApiHandlerOptions, React.ContentApiHandlerOptions>>,
  Assert<Same<Core.ContentcoreErrorCode, React.ContentcoreErrorCode>>,
  Assert<Same<Core.ContentSource, React.ContentSource>>,
  Assert<Same<Core.ContentStore, React.ContentStore>>,
  Assert<Same<Core.FallbackSourceOptions, React.FallbackSourceOptions>>,
  Assert<Same<Core.GetPageOptions, React.GetPageOptions>>,
  Assert<Same<Core.HtmlBlockContent, React.HtmlBlockContent>>,
  Assert<Same<Core.HtmlElementNode, React.HtmlElementNode>>,
  Assert<Same<Core.HtmlLimits, React.HtmlLimits>>,
  Assert<Same<Core.HtmlNode, React.HtmlNode>>,
  Assert<Same<Core.MemoryStore, React.MemoryStore>>,
  Assert<Same<Core.PageDocument, React.PageDocument>>,
  Assert<Same<Core.PageMigration, React.PageMigration>>,
  Assert<Same<Core.PageMigrations, React.PageMigrations>>,
  Assert<Same<Core.PageSummary, React.PageSummary>>,
  Assert<Same<Core.ParsePageOptions, React.ParsePageOptions>>,
  Assert<Same<Core.RetryOptions, React.RetryOptions>>,
  Assert<Same<Core.SaveOptions, React.SaveOptions>>,
  Assert<Same<Core.StandardSchemaV1, React.StandardSchemaV1>>,
  Assert<Same<Core.StaticSourceOptions, React.StaticSourceOptions>>,
  Assert<Same<Core.StoredPage, React.StoredPage>>,
  Assert<Same<Core.ValidationIssue, React.ValidationIssue>>,
];
