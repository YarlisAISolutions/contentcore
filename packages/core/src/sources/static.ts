import type { ContentSource, GetPageOptions, PageDocument } from "../contracts";
import { throwIfAborted } from "../errors";
import { deepFreeze } from "../freeze";
import type { PageMigrations } from "../migrations";
import { normalizeSlug } from "../slug";
import { parsePageDocument } from "../validate";

export interface StaticSourceOptions {
  /** Raw page documents, e.g. imported JSON. Validated once, when first requested. */
  pages: readonly unknown[];
  /** Locale used when a request names none and no locale-less page exists. */
  defaultLocale?: string;
  migrations?: PageMigrations;
}

const slugOf = (raw: unknown): string | undefined => {
  const slug = (raw as { slug?: unknown } | null)?.slug;
  return typeof slug === "string" ? normalizeSlug(slug) : undefined;
};

const localeOf = (raw: unknown): string | undefined => {
  const locale = (raw as { locale?: unknown } | null)?.locale;
  return typeof locale === "string" ? locale : undefined;
};

/**
 * A source over in-memory pages: JSON in the repo, fixtures in tests, or a build-time export.
 * Lookups are O(1); each page is validated once and then shared as an immutable (frozen) object.
 *
 * Locale resolution for a slug: the exact requested locale, then a page with no locale,
 * then `defaultLocale`. Validation errors surface on request, the same way the API source reports them.
 */
export function createStaticSource(options: StaticSourceOptions): ContentSource {
  const bySlug = new Map<string, unknown[]>();
  for (const raw of options.pages) {
    const slug = slugOf(raw);
    if (slug === undefined) continue;
    const list = bySlug.get(slug) ?? [];
    list.push(raw);
    bySlug.set(slug, list);
  }
  const parsed = new Map<unknown, PageDocument>();

  const pick = (candidates: unknown[], locale: string | undefined): unknown => {
    const byLocale = (l: string | undefined) => candidates.find((c) => localeOf(c) === l);
    return (
      (locale !== undefined ? byLocale(locale) : undefined) ??
      byLocale(undefined) ??
      (options.defaultLocale !== undefined ? byLocale(options.defaultLocale) : undefined)
    );
  };

  const load = (slug: string, locale: string | undefined): PageDocument | null => {
    const normalized = normalizeSlug(slug);
    const raw = pick(bySlug.get(normalized) ?? [], locale);
    if (raw === undefined) return null;
    const cached = parsed.get(raw);
    if (cached) return cached;
    const page = deepFreeze(
      parsePageDocument(structuredClone(raw), {
        migrations: options.migrations,
        context: `static source "${normalized}"`,
      }),
    );
    parsed.set(raw, page);
    return page;
  };

  return {
    async getPage(slug: string, opts: GetPageOptions = {}) {
      throwIfAborted(opts.signal);
      return load(slug, opts.locale);
    },
    peek(slug, opts = {}) {
      try {
        return load(slug, opts.locale);
      } catch {
        return undefined; // Invalid content: let getPage report it.
      }
    },
    async prefetch() {},
  };
}
