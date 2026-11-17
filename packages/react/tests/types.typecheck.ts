// Compile-time check (run by `tsc` in `bun run typecheck`): every public core type is also
// importable from @contentcore/react. A missing type re-export fails the typecheck.
import type * as Core from "@contentcore/core";
import type * as React from "../src";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type Checks = [
  Assert<Same<Core.PageDocument, React.PageDocument>>,
  Assert<Same<Core.CmsPageDocument, React.CmsPageDocument>>,
  Assert<Same<Core.BlockData, React.BlockData>>,
  Assert<Same<Core.ContentSource, React.ContentSource>>,
  Assert<Same<Core.GetPageOptions, React.GetPageOptions>>,
  Assert<Same<Core.CachedContentSource, React.CachedContentSource>>,
  Assert<Same<Core.CacheOptions, React.CacheOptions>>,
  Assert<Same<Core.ApiSourceOptions, React.ApiSourceOptions>>,
  Assert<Same<Core.RetryOptions, React.RetryOptions>>,
  Assert<Same<Core.FallbackSourceOptions, React.FallbackSourceOptions>>,
  Assert<Same<Core.StaticSourceOptions, React.StaticSourceOptions>>,
  Assert<Same<Core.ParsePageOptions, React.ParsePageOptions>>,
  Assert<Same<Core.PageMigration, React.PageMigration>>,
  Assert<Same<Core.PageMigrations, React.PageMigrations>>,
  Assert<Same<Core.ValidationIssue, React.ValidationIssue>>,
  Assert<Same<Core.ContentcoreErrorCode, React.ContentcoreErrorCode>>,
  Assert<Same<Core.BlockContentResult<string>, React.BlockContentResult<string>>>,
  Assert<Same<Core.Capabilities, React.Capabilities>>,
  Assert<Same<Core.HtmlNode, React.HtmlNode>>,
  Assert<Same<Core.HtmlElementNode, React.HtmlElementNode>>,
  Assert<Same<Core.HtmlBlockContent, React.HtmlBlockContent>>,
  Assert<Same<Core.HtmlLimits, React.HtmlLimits>>,
  Assert<Same<Core.StandardSchemaV1, React.StandardSchemaV1>>,
];
