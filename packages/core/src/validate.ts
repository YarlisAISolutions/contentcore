import { type BlockData, CURRENT_SCHEMA_VERSION, type PageDocument } from "./contracts";
import { ContentValidationError, UnsupportedSchemaVersionError, type ValidationIssue } from "./errors";
import { type PageMigrations, migratePage } from "./migrations";
import { normalizeSlug } from "./slug";

export interface ParsePageOptions {
  /** Extra migration steps for documents stored at an older `schemaVersion`. */
  migrations?: PageMigrations;
  /** Prefix for error messages, e.g. the source and slug. */
  context?: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const nonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/**
 * Validates and normalises a raw stored page into a `PageDocument`.
 * Unknown top-level keys are dropped, the slug is normalised, older versions are migrated.
 * Throws `ContentValidationError` (with every issue found) or `UnsupportedSchemaVersionError`.
 */
export function parsePageDocument(input: unknown, options: ParsePageOptions = {}): PageDocument {
  const migrated = migratePage(input, options.migrations);
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  if (!isRecord(migrated)) {
    throw new ContentValidationError([{ path: "", message: "expected an object" }], options.context);
  }
  const raw = migrated;

  if (!nonEmptyString(raw.id)) add("id", "expected a non-empty string");
  if (typeof raw.slug !== "string") add("slug", "expected a string");

  const version = raw.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    add("schemaVersion", "expected a positive integer");
  } else if (version > CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(version, CURRENT_SCHEMA_VERSION);
  }

  if (raw.locale !== undefined && !nonEmptyString(raw.locale)) add("locale", "expected a non-empty string");
  if (raw.title !== undefined && typeof raw.title !== "string") add("title", "expected a string");
  if (raw.meta !== undefined && !isRecord(raw.meta)) add("meta", "expected an object");
  if (raw.capabilities !== undefined) {
    if (!Array.isArray(raw.capabilities)) add("capabilities", "expected an array of strings");
    else
      raw.capabilities.forEach((c, i) => {
        if (!nonEmptyString(c)) add(`capabilities.${i}`, "expected a non-empty string");
      });
  }

  const blocks: BlockData[] = [];
  if (!Array.isArray(raw.blocks)) {
    add("blocks", "expected an array");
  } else {
    const seen = new Set<string>();
    raw.blocks.forEach((block, i) => {
      const at = `blocks.${i}`;
      if (!isRecord(block)) return add(at, "expected an object");
      let ok = true;
      if (!nonEmptyString(block.id)) {
        add(`${at}.id`, "expected a non-empty string");
        ok = false;
      } else if (seen.has(block.id)) {
        add(`${at}.id`, `duplicate block id "${block.id}"`);
        ok = false;
      } else seen.add(block.id);
      if (!nonEmptyString(block.type)) {
        add(`${at}.type`, "expected a non-empty string");
        ok = false;
      }
      if (!isRecord(block.content)) {
        add(`${at}.content`, "expected an object");
        ok = false;
      }
      if (ok) blocks.push({ id: block.id as string, type: block.type as string, content: block.content });
    });
  }

  if (issues.length > 0) throw new ContentValidationError(issues, options.context);

  const page: PageDocument = {
    id: raw.id as string,
    slug: normalizeSlug(raw.slug as string),
    schemaVersion: raw.schemaVersion as number,
    blocks,
  };
  if (raw.locale !== undefined) page.locale = raw.locale as string;
  if (raw.title !== undefined) page.title = raw.title as string;
  if (raw.meta !== undefined) page.meta = raw.meta as Record<string, unknown>;
  if (raw.capabilities !== undefined) page.capabilities = [...(raw.capabilities as string[])];
  return page;
}

/** Non-throwing variant of `parsePageDocument`. */
export function safeParsePageDocument(
  input: unknown,
  options: ParsePageOptions = {},
): { ok: true; page: PageDocument } | { ok: false; error: ContentValidationError | UnsupportedSchemaVersionError } {
  try {
    return { ok: true, page: parsePageDocument(input, options) };
  } catch (error) {
    if (error instanceof ContentValidationError || error instanceof UnsupportedSchemaVersionError) {
      return { ok: false, error };
    }
    throw error;
  }
}
