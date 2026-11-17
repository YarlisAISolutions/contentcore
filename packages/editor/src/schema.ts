import {
  type HtmlNode,
  STRUCTURAL_ELEMENTS,
  type StandardSchemaV1,
  UNSAFE_ELEMENTS,
  canonicalTag,
  isSafeUrl,
} from "@contentcore/react";

/** The subset of JSON Schema the form builder understands. Anything else gets a JSON field. */
export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  description?: string;
  title?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  [key: string]: unknown;
}

type WithJsonSchema = StandardSchemaV1 & {
  "~standard": { jsonSchema?: { input?: (options: { target: string }) => unknown } };
};

/**
 * The block's *input* JSON Schema, when its schema library implements Standard JSON Schema
 * (Zod 4.2+, and others). Undefined otherwise: the editor then falls back to a JSON editor.
 */
export function jsonSchemaOf(schema: StandardSchemaV1): JsonSchema | undefined {
  const generate = (schema as WithJsonSchema)["~standard"].jsonSchema?.input;
  if (typeof generate !== "function") return undefined;
  try {
    const result = generate({ target: "draft-2020-12" });
    return result && typeof result === "object" ? (result as JsonSchema) : undefined;
  } catch {
    return undefined;
  }
}

export const typeOf = (schema: JsonSchema | undefined): string | undefined => {
  if (!schema) return undefined;
  if (Array.isArray(schema.type)) return schema.type.find((t) => t !== "null");
  return schema.type;
};

/** A starting value for a new block: defaults where given, empty values for required fields. */
export function defaultValue(schema: JsonSchema | undefined): unknown {
  if (!schema) return {};
  if (schema.default !== undefined) return structuredClone(schema.default);
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length) return schema.enum[0];
  switch (typeOf(schema)) {
    case "object": {
      const out: Record<string, unknown> = {};
      for (const key of schema.required ?? []) out[key] = defaultValue(schema.properties?.[key]);
      return out;
    }
    case "array":
      return [];
    case "string":
      return "";
    case "number":
    case "integer":
      return schema.minimum ?? 0;
    case "boolean":
      return false;
    default:
      return undefined;
  }
}

export function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

const URL_ATTRS = new Set(["href", "src", "action", "formaction", "xlink:href", "poster", "cite", "srcset"]);

/**
 * Cleans HTML nodes as they enter the editor (paste, typing, import), so stored content never
 * holds script, event handlers or script URLs, even though the renderer would remove them anyway.
 * Also drops editor-only attributes browsers add (contenteditable, spellcheck, data-*-from-paste).
 */
export function cleanNodes(nodes: readonly HtmlNode[]): HtmlNode[] {
  const out: HtmlNode[] = [];
  for (const node of nodes) {
    if (typeof node === "string") {
      if (node !== "") out.push(node);
      continue;
    }
    const tag = canonicalTag(node.tag);
    const children = cleanNodes(node.children ?? []);
    if (!tag || STRUCTURAL_ELEMENTS.has(tag) || tag === "span" && !node.attrs) {
      out.push(...children);
      continue;
    }
    if (UNSAFE_ELEMENTS.has(tag)) continue;
    const attrs: Record<string, string | number | boolean | null> = {};
    for (const [name, value] of Object.entries(node.attrs ?? {})) {
      const lower = name.toLowerCase();
      if (lower.startsWith("on") || ["contenteditable", "spellcheck", "srcdoc", "style"].includes(lower)) continue;
      if (URL_ATTRS.has(lower) && typeof value === "string" && !isSafeUrl(value, tag)) continue;
      if (value !== null && value !== undefined) attrs[name] = value;
    }
    const element: HtmlNode = { tag };
    if (Object.keys(attrs).length) element.attrs = attrs;
    if (children.length) element.children = children;
    out.push(element);
  }
  // Merge adjacent text nodes.
  return out.reduce<HtmlNode[]>((acc, n) => {
    const last = acc[acc.length - 1];
    if (typeof n === "string" && typeof last === "string") acc[acc.length - 1] = last + n;
    else acc.push(n);
    return acc;
  }, []);
}

/**
 * Content accessibility checks for rich text (WCAG 1.1.1 non-text content, 2.4.4 link purpose):
 * images need alt text (alt="" marks a decorative image) and links need text or a label.
 */
export function accessibilityIssues(nodes: readonly HtmlNode[], path = "nodes"): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];
  const textOf = (n: HtmlNode): string =>
    typeof n === "string" ? n : (n.attrs?.["aria-label"] as string) || (n.attrs?.alt as string) || (n.children ?? []).map(textOf).join("");
  nodes.forEach((node, i) => {
    if (typeof node === "string") return;
    const at = `${path}.${i}`;
    const tag = node.tag.toLowerCase();
    if (tag === "img" && typeof node.attrs?.alt !== "string") {
      issues.push({ path: at, message: 'Image needs alt text (use alt="" if it is decorative)' });
    }
    if (tag === "a" && node.attrs?.href !== undefined && textOf(node).trim() === "") {
      issues.push({ path: at, message: "Link needs text that says where it goes" });
    }
    issues.push(...accessibilityIssues(node.children ?? [], `${at}.children`));
  });
  return issues;
}
