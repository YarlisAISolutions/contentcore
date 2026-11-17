import { describe, expect, test } from "bun:test";
import {
  ContentValidationError,
  UnsupportedSchemaVersionError,
  createCapabilities,
  isContentcoreError,
  migratePage,
  normalizeSlug,
  parsePageDocument,
  safeParsePageDocument,
} from "../src";
import { aboutPage, homePage } from "./fixtures";

describe("parsePageDocument", () => {
  test("accepts the documented page shape", () => {
    expect(parsePageDocument(homePage)).toEqual(homePage);
  });

  test("normalises the slug and drops unknown keys", () => {
    const page = parsePageDocument({ ...aboutPage, slug: "about/", extra: true });
    expect(page.slug).toBe("/about");
    expect("extra" in page).toBe(false);
  });

  test("reports every issue with a path", () => {
    const result = safeParsePageDocument({
      id: "",
      slug: 3,
      schemaVersion: 1,
      blocks: [{ id: "a", type: "hero", content: {} }, { id: "a", type: "", content: "x" }, null],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const paths = (result.error as ContentValidationError).issues.map((i) => i.path);
    expect(paths).toEqual(["id", "slug", "blocks.1.id", "blocks.1.type", "blocks.1.content", "blocks.2"]);
    expect(isContentcoreError(result.error)).toBe(true);
  });

  test("rejects non-objects and missing schemaVersion", () => {
    expect(() => parsePageDocument(null)).toThrow(ContentValidationError);
    expect(() => parsePageDocument({ ...homePage, schemaVersion: undefined })).toThrow(/schemaVersion/);
  });

  test("rejects documents newer than this package", () => {
    expect(() => parsePageDocument({ ...homePage, schemaVersion: 99 })).toThrow(UnsupportedSchemaVersionError);
  });
});

describe("migratePage", () => {
  test("runs steps in order up to the target version", () => {
    const v1 = { ...homePage, blocks: [{ id: "b", type: "hero", content: { title: "Old" } }] };
    const out = migratePage(
      v1,
      {
        1: (d) => ({ ...d, schemaVersion: 2, renamed: true }),
        2: (d) => ({ ...d, schemaVersion: 3 }),
      },
      3,
    ) as Record<string, unknown>;
    expect(out.schemaVersion).toBe(3);
    expect(out.renamed).toBe(true);
  });

  test("fails loudly on a missing or wrong step", () => {
    expect(() => migratePage(homePage, {}, 2)).toThrow(/no migration from version 1/);
    expect(() => migratePage(homePage, { 1: (d) => ({ ...d, schemaVersion: 5 }) }, 2)).toThrow(/must return/);
  });
});

describe("normalizeSlug", () => {
  test.each([
    ["", "/"],
    ["/", "/"],
    ["about", "/about"],
    ["//docs//intro/", "/docs/intro"],
    ["/a?x=1#h", "/a"],
  ])("%p -> %p", (input, expected) => {
    expect(normalizeSlug(input)).toBe(expected);
  });
});

describe("createCapabilities", () => {
  test("matches exact, scoped wildcard and global wildcard", () => {
    const caps = createCapabilities(["page:edit"], ["media:*"], undefined);
    expect(caps.can("page:edit")).toBe(true);
    expect(caps.can("page:publish")).toBe(false);
    expect(caps.can("media:upload")).toBe(true);
    expect(createCapabilities(["*"]).can("anything")).toBe(true);
    expect(createCapabilities(["page:edit", "page:edit"]).list).toEqual(["page:edit"]);
  });
});
