import { CURRENT_SCHEMA_VERSION } from "./contracts";
import { ContentValidationError, UnsupportedSchemaVersionError } from "./errors";

/**
 * Upgrades for stored documents, keyed by the version they upgrade FROM:
 * `{ 1: (doc) => ({ ...doc, schemaVersion: 2, … }) }` turns a v1 document into v2.
 * Each step must return a document whose `schemaVersion` is exactly one higher.
 *
 * ContentCore ships the steps for its own format changes (`BUILTIN_MIGRATIONS`); apps
 * can pass extra steps to a source to upgrade their own block content the same way.
 */
export type PageMigration = (doc: Record<string, unknown>) => Record<string, unknown>;
export type PageMigrations = Readonly<Record<number, PageMigration>>;

/** Steps for ContentCore's own format changes. Empty while v1 is the only version. */
export const BUILTIN_MIGRATIONS: PageMigrations = Object.freeze({});

/**
 * Brings a raw stored document up to `CURRENT_SCHEMA_VERSION`. Documents without
 * a `schemaVersion` are rejected rather than guessed at.
 */
export function migratePage(
  raw: unknown,
  migrations: PageMigrations = {},
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
  let doc = raw as Record<string, unknown>;
  const stored = doc.schemaVersion;
  if (typeof stored !== "number" || !Number.isInteger(stored) || stored < 1) return raw;
  let version: number = stored;
  if (version > targetVersion) throw new UnsupportedSchemaVersionError(version, targetVersion);

  const steps = { ...BUILTIN_MIGRATIONS, ...migrations };
  while (version < targetVersion) {
    const step = steps[version];
    if (!step) {
      throw new ContentValidationError([
        { path: "schemaVersion", message: `no migration from version ${version} to ${version + 1}` },
      ]);
    }
    const next = step(doc);
    if (next.schemaVersion !== version + 1) {
      throw new ContentValidationError([
        {
          path: "schemaVersion",
          message: `migration from version ${version} must return schemaVersion ${version + 1}, got ${String(next.schemaVersion)}`,
        },
      ]);
    }
    doc = next;
    version = version + 1;
  }
  return doc;
}
