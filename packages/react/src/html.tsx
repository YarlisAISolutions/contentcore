import {
  type HtmlLimits,
  type HtmlNode,
  STRUCTURAL_ELEMENTS,
  UNSAFE_ELEMENTS,
  VOID_ELEMENTS,
  canonicalTag,
  createHtmlContentSchema,
} from "@contentcore/core";
import { type ComponentType, Fragment, type ReactNode, createElement, memo } from "react";
import { defineBlock } from "./define-block";

export interface HtmlRenderOptions {
  /** Opt in to elements that are blocked by default (script, iframe, embed, object, style, …). */
  allowElements?: readonly string[];
  /** Never render these elements (or their children). */
  denyElements?: readonly string[];
  /**
   * Render an element with your own component, e.g. `{ a: Link, img: Image }` for a router
   * link or an optimised image. Receives the sanitised React props.
   */
  // biome-ignore lint/suspicious/noExplicitAny: components accept arbitrary element props.
  components?: Readonly<Record<string, ComponentType<any>>>;
}

// HTML attribute (lowercase) -> React prop name.
const ATTR_MAP: Record<string, string> = Object.fromEntries(
  (
    "acceptCharset accessKey allowFullScreen autoCapitalize autoComplete autoFocus autoPlay cellPadding cellSpacing " +
    "charSet colSpan contentEditable controlsList crossOrigin dateTime encType enterKeyHint fetchPriority formAction " +
    "formEncType formMethod formNoValidate formTarget frameBorder hrefLang httpEquiv imageSizes imageSrcSet inputMode " +
    "itemID itemProp itemRef itemScope itemType marginHeight marginWidth maxLength minLength noModule noValidate " +
    "playsInline popoverTarget popoverTargetAction readOnly referrerPolicy rowSpan spellCheck srcDoc srcLang srcSet " +
    "tabIndex useMap " +
    // SVG
    "attributeName baseFrequency clipPathUnits diffuseConstant edgeMode filterUnits gradientTransform gradientUnits " +
    "kernelMatrix kernelUnitLength keyPoints keySplines keyTimes lengthAdjust limitingConeAngle markerHeight " +
    "markerUnits markerWidth maskContentUnits maskUnits numOctaves pathLength patternContentUnits patternTransform " +
    "patternUnits pointsAtX pointsAtY pointsAtZ preserveAlpha preserveAspectRatio primitiveUnits refX refY " +
    "repeatCount repeatDur specularConstant specularExponent spreadMethod startOffset stdDeviation stitchTiles " +
    "surfaceScale systemLanguage tableValues targetX targetY textLength viewBox xChannelSelector yChannelSelector zoomAndPan"
  )
    .split(" ")
    .map((name) => [name.toLowerCase(), name]),
);
Object.assign(ATTR_MAP, {
  class: "className",
  for: "htmlFor",
  "accept-charset": "acceptCharset",
  "http-equiv": "httpEquiv",
  "xlink:href": "xlinkHref",
  "xlink:title": "xlinkTitle",
  "xml:lang": "xmlLang",
  "xml:space": "xmlSpace",
  "xmlns:xlink": "xmlnsXlink",
});

// srcdoc is dropped even when iframe is allowed: a srcdoc document runs script with this page's origin.
const DROPPED_ATTRS = new Set(["dangerouslysetinnerhtml", "innerhtml", "outerhtml", "ref", "key", "children", "srcdoc"]);
const FORM_FIELDS = new Set(["input", "textarea", "select"]);

const URL_ATTRS = new Set([
  "href",
  "src",
  "action",
  "formaction",
  "xlink:href",
  "poster",
  "cite",
  "background",
  "data",
  "ping",
  "manifest",
  "codebase",
  "longdesc",
]);
const MEDIA_TAGS = new Set(["img", "source", "video", "audio", "picture", "image", "track", "input"]);
const TABLE_TAGS = new Set(["table", "thead", "tbody", "tfoot", "tr", "colgroup"]);

// Remove characters browsers ignore inside a URL scheme ("java\tscript:").
// biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point.
const IGNORED_IN_SCHEME = /[\u0000- \u007f-\u009f]/g;

/** True when a URL is safe to render for this element. Blocks javascript:, vbscript: and (except media) data:. */
export function isSafeUrl(value: string, tag: string): boolean {
  const compact = value.replace(IGNORED_IN_SCHEME, "").toLowerCase();
  if (compact.startsWith("javascript:") || compact.startsWith("vbscript:")) return false;
  if (compact.startsWith("data:")) return MEDIA_TAGS.has(tag) && /^data:(image|video|audio)\//.test(compact);
  return true;
}

const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function styleToObject(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const colon = decl.indexOf(":");
    if (colon <= 0) continue;
    const prop = decl.slice(0, colon).trim();
    const value = decl.slice(colon + 1).trim();
    if (!prop || !value || /expression\s*\(|javascript:/i.test(value)) continue;
    out[prop.startsWith("--") ? prop : camel(prop.toLowerCase().replace(/^-ms-/, "ms-"))] = value;
  }
  return out;
}

function toProps(tag: string, attrs: Record<string, unknown> | undefined, custom: boolean): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (!attrs) return props;
  for (const [rawName, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    const lower = rawName.toLowerCase();
    if (lower.startsWith("on") || DROPPED_ATTRS.has(lower)) continue;
    if (URL_ATTRS.has(lower) && typeof value === "string" && !isSafeUrl(value, tag)) continue;
    if (lower === "srcset" && typeof value === "string" && value.split(",").some((c) => !isSafeUrl(c.trim(), tag))) continue;
    if (lower === "style") {
      if (typeof value === "string") props.style = styleToObject(value);
      continue;
    }
    let name: string;
    // Custom elements take attributes verbatim; `class` (not className) works on React 18 and 19.
    if (custom) name = lower === "class" ? "class" : rawName;
    else if (lower.startsWith("aria-") || lower.startsWith("data-")) name = lower;
    else name = ATTR_MAP[lower] ?? (rawName.includes("-") ? camel(lower) : rawName);
    // Content sets a field's initial state; the user must still be able to edit it.
    if (FORM_FIELDS.has(tag) && name === "value") name = "defaultValue";
    else if (tag === "input" && name === "checked") name = "defaultChecked";
    props[name] = value === true ? true : value;
  }
  return props;
}

interface RenderContext {
  allow: Set<string>;
  deny: Set<string>;
  components: HtmlRenderOptions["components"];
}

function renderNodes(nodes: readonly HtmlNode[], ctx: RenderContext, parentTag: string | undefined): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as HtmlNode;
    if (typeof node === "string") {
      if (parentTag && TABLE_TAGS.has(parentTag) && node.trim() === "") continue;
      out.push(node);
      continue;
    }
    const tag = canonicalTag(node.tag);
    const children = node.children ?? [];
    // Unknown and document-level tags: keep their content, drop the wrapper.
    if (!tag || STRUCTURAL_ELEMENTS.has(tag)) {
      // Keyed fragment: the unwrapped children's keys stay scoped and never collide with siblings.
      out.push(createElement(Fragment, { key: out.length }, ...renderNodes(children, ctx, parentTag)));
      continue;
    }
    if (ctx.deny.has(tag) || (UNSAFE_ELEMENTS.has(tag) && !ctx.allow.has(tag))) continue;

    const props = toProps(tag, node.attrs, tag.includes("-"));
    props.key = out.length;
    const type = ctx.components?.[tag] ?? tag;
    if (VOID_ELEMENTS.has(tag)) {
      out.push(createElement(type, props));
    } else if (tag === "textarea") {
      props.defaultValue = children.filter((c): c is string => typeof c === "string").join("");
      out.push(createElement(type, props));
    } else {
      out.push(createElement(type, props, ...renderNodes(children, ctx, tag)));
    }
  }
  return out;
}

export interface HtmlContentProps extends HtmlRenderOptions {
  nodes: readonly HtmlNode[];
}

/**
 * Renders an HtmlNode tree as real elements: every HTML, SVG and MathML element plus custom
 * elements. Event-handler attributes and script URLs are removed, and script-capable elements
 * render only when opted in with `allowElements`.
 */
export const HtmlContent = memo(function HtmlContent({ nodes, allowElements, denyElements, components }: HtmlContentProps) {
  const ctx: RenderContext = {
    allow: new Set(allowElements),
    deny: new Set(denyElements),
    components,
  };
  return <>{renderNodes(nodes, ctx, undefined)}</>;
});

/** Builds an "html" block with your own options: `blocks={{ html: createHtmlBlock({ components: { a: Link } }) }}`. */
export function createHtmlBlock(options: HtmlRenderOptions & HtmlLimits = {}) {
  const { maxDepth, maxNodes, ...render } = options;
  return defineBlock({
    schema: createHtmlContentSchema({ maxDepth, maxNodes }),
    component: ({ content }) => <HtmlContent nodes={content.nodes} {...render} />,
  });
}

/** The built-in "html" block with safe defaults. Register it as `blocks={{ html: htmlBlock }}`. */
export const htmlBlock = createHtmlBlock();

/**
 * Converts an HTML string into HtmlNode data, e.g. when importing legacy content.
 * Needs a DOMParser (browsers, happy-dom, jsdom); store the result, not the string.
 */
export function htmlToNodes(html: string): HtmlNode[] {
  const Parser = (globalThis as { DOMParser?: typeof DOMParser }).DOMParser;
  if (!Parser) throw new Error("htmlToNodes needs a DOMParser (run it in a browser, or with jsdom/happy-dom)");
  const doc = new Parser().parseFromString(`<!doctype html><body>${html}`, "text/html");
  const convert = (node: Node): HtmlNode | undefined => {
    if (node.nodeType === 3) return node.textContent ?? "";
    if (node.nodeType !== 1) return undefined;
    const el = node as Element;
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) attrs[attr.name] = attr.value;
    const source = el.localName === "template" ? (el as HTMLTemplateElement).content : el;
    const children = Array.from(source.childNodes)
      .map(convert)
      .filter((c): c is HtmlNode => c !== undefined);
    const out: HtmlNode = { tag: el.localName };
    if (Object.keys(attrs).length > 0) out.attrs = attrs;
    if (children.length > 0) out.children = children;
    return out;
  };
  return Array.from(doc.body.childNodes)
    .map(convert)
    .filter((c): c is HtmlNode => c !== undefined);
}
