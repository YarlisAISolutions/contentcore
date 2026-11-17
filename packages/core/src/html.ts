import type { ValidationIssue } from "./errors";
import type { StandardSchemaV1 } from "./standard-schema";

/**
 * Rich content as a tree of elements: a string is a text node, an object is an element.
 * Stored as data (never as an HTML string), so it is validated, sanitised at render time
 * and safe to move between sources.
 *
 *   { tag: "p", children: ["Hello ", { tag: "strong", children: ["world"] }] }
 */
export type HtmlNode = string | HtmlElementNode;

export interface HtmlElementNode {
  tag: string;
  attrs?: Record<string, string | number | boolean | null>;
  children?: HtmlNode[];
}

/** Every element in the WHATWG HTML Living Standard. */
export const HTML_ELEMENTS: readonly string[] = Object.freeze(
  (
    "a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col " +
    "colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form " +
    "h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link main map mark " +
    "menu meta meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp " +
    "script search section select selectedcontent slot small source span strong style sub summary sup table tbody td template " +
    "textarea tfoot th thead time title tr track u ul var video wbr"
  ).split(" "),
);

/**
 * Obsolete elements that browsers still render (font, center, marquee, …), so imported
 * legacy HTML keeps its formatting.
 */
export const LEGACY_HTML_ELEMENTS: readonly string[] = Object.freeze(
  "acronym big center dir font marquee nobr noembed noframes rb rtc strike tt".split(" "),
);

/** Every SVG 2 element (case-sensitive names). */
export const SVG_ELEMENTS: readonly string[] = Object.freeze(
  (
    "svg a animate animateMotion animateTransform circle clipPath defs desc ellipse feBlend feColorMatrix " +
    "feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight " +
    "feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode " +
    "feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence filter foreignObject " +
    "g image line linearGradient marker mask metadata mpath path pattern polygon polyline radialGradient rect " +
    "script set stop style switch symbol text textPath title tspan use view"
  ).split(" "),
);

/** Every MathML Core element. */
export const MATHML_ELEMENTS: readonly string[] = Object.freeze(
  (
    "math annotation annotation-xml maction menclose merror mfenced mfrac mi mmultiscripts mn mo mover mpadded " +
    "mphantom mprescripts mroot mrow ms mspace msqrt mstyle msub msubsup msup mtable mtd mtext mtr munder " +
    "munderover semantics"
  ).split(" "),
);

/** Elements that never have children. */
export const VOID_ELEMENTS: ReadonlySet<string> = new Set(
  "area base br col embed hr img input link meta source track wbr".split(" "),
);

/**
 * Elements that can run script, load other documents, change the page's base URL or
 * inject global styles. They render only when listed in `allowElements`.
 */
export const UNSAFE_ELEMENTS: ReadonlySet<string> = new Set([
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "base",
  "meta",
  "link",
  "style",
  "noscript",
  "template",
  // SVG animation elements can rewrite href attributes to javascript: URLs.
  "animate",
  "animateMotion",
  "animateTransform",
  "set",
]);

/** Document-level elements: inside a block only their children render. */
export const STRUCTURAL_ELEMENTS: ReadonlySet<string> = new Set(["html", "head", "body"]);

const CANONICAL = new Map<string, string>();
for (const name of [...HTML_ELEMENTS, ...LEGACY_HTML_ELEMENTS, ...SVG_ELEMENTS, ...MATHML_ELEMENTS]) CANONICAL.set(name.toLowerCase(), name);

const CUSTOM_ELEMENT = /^[a-z][a-z0-9._]*-[a-z0-9._-]*$/;

/**
 * The canonical element name for a tag ("lineargradient" → "linearGradient"),
 * the tag itself for a valid custom element ("my-widget"), or undefined if unknown.
 */
export function canonicalTag(tag: string): string | undefined {
  const known = CANONICAL.get(tag.toLowerCase());
  if (known) return known;
  return CUSTOM_ELEMENT.test(tag) ? tag : undefined;
}

export interface HtmlLimits {
  /** Maximum nesting depth. Default 64. */
  maxDepth?: number;
  /** Maximum total nodes. Default 20 000. */
  maxNodes?: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Checks the structure of an HtmlNode tree (sanitisation happens when rendering). */
export function validateHtmlNodes(nodes: unknown, limits: HtmlLimits = {}): ValidationIssue[] {
  const maxDepth = limits.maxDepth ?? 64;
  const maxNodes = limits.maxNodes ?? 20_000;
  const issues: ValidationIssue[] = [];
  let count = 0;

  const walk = (value: unknown, path: string, depth: number) => {
    if (issues.length >= 20) return;
    if (++count > maxNodes) {
      if (count === maxNodes + 1) issues.push({ path, message: `more than ${maxNodes} nodes` });
      return;
    }
    if (typeof value === "string") return;
    if (!isRecord(value)) return void issues.push({ path, message: "expected a string or an element object" });
    if (typeof value.tag !== "string" || value.tag.length === 0) issues.push({ path: `${path}.tag`, message: "expected a tag name" });
    if (value.attrs !== undefined) {
      if (!isRecord(value.attrs)) issues.push({ path: `${path}.attrs`, message: "expected an object" });
      else
        for (const [name, v] of Object.entries(value.attrs)) {
          if (v !== null && !["string", "number", "boolean"].includes(typeof v)) {
            issues.push({ path: `${path}.attrs.${name}`, message: "expected a string, number, boolean or null" });
          }
        }
    }
    if (value.children !== undefined) {
      if (!Array.isArray(value.children)) return void issues.push({ path: `${path}.children`, message: "expected an array" });
      if (depth >= maxDepth) return void issues.push({ path: `${path}.children`, message: `nested deeper than ${maxDepth}` });
      value.children.forEach((child, i) => walk(child, `${path}.children.${i}`, depth + 1));
    }
  };

  if (!Array.isArray(nodes)) return [{ path: "", message: "expected an array of nodes" }];
  nodes.forEach((n, i) => walk(n, String(i), 1));
  return issues;
}

export interface HtmlBlockContent {
  nodes: HtmlNode[];
}

/** @deprecated Use `HtmlBlockContent` (renamed so it does not clash with the React `HtmlContent` component). */
export type HtmlContent = HtmlBlockContent;

/**
 * Standard Schema for `{ nodes: HtmlNode[] }`, the content of the built-in "html" block.
 * Works anywhere a Zod schema would, without depending on Zod.
 */
export function createHtmlContentSchema(limits: HtmlLimits = {}): StandardSchemaV1<unknown, HtmlBlockContent> {
  return {
    "~standard": {
      version: 1,
      vendor: "contentcore",
      validate(value) {
        if (!isRecord(value)) return { issues: [{ message: "expected an object with nodes" }] };
        const issues = validateHtmlNodes(value.nodes, limits);
        if (issues.length > 0) {
          return {
            issues: issues.map((i) => ({ message: i.message, path: ["nodes", ...(i.path ? i.path.split(".") : [])] })),
          };
        }
        return { value: { nodes: value.nodes as HtmlNode[] } };
      },
    },
  };
}

export const htmlContentSchema = createHtmlContentSchema();
