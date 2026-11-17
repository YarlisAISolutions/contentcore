// Server-side content access. Imports @contentcore/core only (no client code), so it is safe in
// server components, route handlers, generateMetadata and generateStaticParams.
import { type ContentSource, createApiSource, createStaticSource, normalizeSlug } from "@contentcore/core";
import { cache } from "react";
import pages from "../content/pages.json";

/**
 * Public content: one shared source per server process. With CONTENT_API set it reads your
 * content service (cached, retried, ETag-revalidated); otherwise the bundled JSON.
 * Never put per-user content behind a module-level cached source.
 */
export const source: ContentSource = process.env.CONTENT_API
  ? createApiSource({ baseUrl: process.env.CONTENT_API, timeoutMs: 5000 })
  : createStaticSource({ pages });

/** Deduplicated per request: generateMetadata and the page share one lookup. */
export const getPage = cache((slug: string, locale?: string) => source.getPage(slug, { locale }));

export const slugFromParams = (segments: string[] | undefined) => normalizeSlug((segments ?? []).join("/"));

/** Slugs to prerender at build time. Sections are embedded, not routed. */
export const staticSlugs = () =>
  [...new Set(pages.map((p) => p.slug))].filter((slug) => !slug.startsWith("/sections/"));

/** Used by the content API route: the bundled pages as stored. */
export const rawPages = pages;
