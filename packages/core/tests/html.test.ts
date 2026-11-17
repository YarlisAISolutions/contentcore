import { describe, expect, test } from "bun:test";
import {
  HTML_ELEMENTS,
  MATHML_ELEMENTS,
  SVG_ELEMENTS,
  canonicalTag,
  htmlContentSchema,
  validateHtmlNodes,
} from "../src";

describe("element catalogue", () => {
  test("covers the full HTML, SVG and MathML element sets", () => {
    expect(HTML_ELEMENTS.length).toBeGreaterThanOrEqual(113);
    expect(SVG_ELEMENTS.length).toBeGreaterThanOrEqual(60);
    expect(MATHML_ELEMENTS.length).toBeGreaterThanOrEqual(30);
    for (const tag of ["dialog", "search", "picture", "template", "slot", "details", "meter", "wbr"]) {
      expect(HTML_ELEMENTS).toContain(tag);
    }
  });

  test("canonicalTag fixes case and accepts custom elements", () => {
    expect(canonicalTag("DIV")).toBe("div");
    expect(canonicalTag("lineargradient")).toBe("linearGradient");
    expect(canonicalTag("foreignobject")).toBe("foreignObject");
    expect(canonicalTag("my-widget")).toBe("my-widget");
    expect(canonicalTag("blink")).toBeUndefined();
    expect(canonicalTag("Bad-Tag")).toBeUndefined();
  });
});

describe("validateHtmlNodes", () => {
  test("accepts well-formed trees", () => {
    expect(
      validateHtmlNodes(["text", { tag: "p", attrs: { class: "x", hidden: true, tabindex: 0, title: null }, children: ["hi"] }]),
    ).toEqual([]);
  });

  test("reports malformed nodes with paths", () => {
    const issues = validateHtmlNodes([{ tag: "" }, 4, { tag: "p", attrs: { x: {} } }, { tag: "p", children: "no" }]);
    expect(issues.map((i) => i.path)).toEqual(["0.tag", "1", "2.attrs.x", "3.children"]);
    expect(validateHtmlNodes("nope")).toHaveLength(1);
  });

  test("enforces depth and size limits", () => {
    let deep: unknown = "leaf";
    for (let i = 0; i < 10; i++) deep = { tag: "div", children: [deep] };
    expect(validateHtmlNodes([deep], { maxDepth: 5 })[0]?.message).toMatch(/deeper than 5/);
    const wide = Array.from({ length: 50 }, () => "x");
    expect(validateHtmlNodes(wide, { maxNodes: 10 })[0]?.message).toMatch(/more than 10/);
  });

  test("htmlContentSchema is a Standard Schema", async () => {
    const ok = await htmlContentSchema["~standard"].validate({ nodes: [{ tag: "b", children: ["x"] }] });
    expect(ok.issues).toBeUndefined();
    const bad = await htmlContentSchema["~standard"].validate({ nodes: [{ tag: 1 }] });
    expect(bad.issues?.[0]?.path).toEqual(["nodes", "0", "tag"]);
  });
});
