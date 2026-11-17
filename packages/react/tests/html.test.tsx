import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CmsPage,
  CmsProvider,
  HTML_ELEMENTS,
  type HtmlNode,
  HtmlContent,
  MATHML_ELEMENTS,
  SVG_ELEMENTS,
  UNSAFE_ELEMENTS,
  VOID_ELEMENTS,
  createHtmlBlock,
  createStaticSource,
  htmlBlock,
  htmlToNodes,
  isSafeUrl,
} from "../src";

const html = (nodes: HtmlNode[], props: Partial<Parameters<typeof HtmlContent>[0]> = {}) =>
  renderToStaticMarkup(<HtmlContent nodes={nodes} {...props} />);

describe("HtmlContent", () => {
  test("renders every safe HTML element", () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      for (const tag of HTML_ELEMENTS) {
        if (UNSAFE_ELEMENTS.has(tag) || ["html", "head", "body"].includes(tag)) continue;
        const out = html([{ tag, children: VOID_ELEMENTS.has(tag) ? undefined : ["x"] }]);
        expect(out.startsWith(`<${tag}`)).toBe(true);
      }
    } finally {
      console.error = original;
    }
  });

  test("renders SVG and MathML with canonical names and camelCased attributes", () => {
    const svg = html([
      {
        tag: "svg",
        attrs: { viewbox: "0 0 10 10", xmlns: "http://www.w3.org/2000/svg" },
        children: [
          { tag: "lineargradient", attrs: { id: "g" }, children: [{ tag: "stop", attrs: { offset: "0" } }] },
          { tag: "path", attrs: { d: "M0 0", "stroke-width": 2, "fill-opacity": "0.5" } },
        ],
      },
    ]);
    expect(svg).toBe(
      '<svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><linearGradient id="g"><stop offset="0"></stop></linearGradient><path d="M0 0" stroke-width="2" fill-opacity="0.5"></path></svg>',
    );
    for (const [root, list] of [["svg", SVG_ELEMENTS], ["math", MATHML_ELEMENTS]] as const) {
      for (const tag of list) {
        if (UNSAFE_ELEMENTS.has(tag) || tag === root) continue;
        expect(html([{ tag: root, children: [{ tag }] }])).toContain(`<${tag}`);
      }
    }
    expect(html([{ tag: "math", children: [{ tag: "mfrac", children: [{ tag: "mi", children: ["a"] }, { tag: "mn", children: ["2"] }] }] }])).toBe(
      "<math><mfrac><mi>a</mi><mn>2</mn></mfrac></math>",
    );
  });

  test("maps attributes to React props", () => {
    expect(
      html([
        {
          tag: "label",
          attrs: { class: "c", for: "i", "data-x": "1", "aria-label": "L", style: "color: red; --gap: 2px; background-color:blue" },
          children: ["x"],
        },
        { tag: "input", attrs: { id: "i", tabindex: 2, readonly: true, maxlength: 5, disabled: false, value: null } },
        { tag: "td", attrs: { colspan: 2 } },
      ]),
    ).toMatch(
      // React 18 and 19 differ only in the casing of SSR boolean attributes (readonly / readOnly).
      /^<label class="c" for="i" data-x="1" aria-label="L" style="color:red;--gap:2px;background-color:blue">x<\/label><input id="i" tabindex="2" readonly="" maxLength="5"\/><td colSpan="2"><\/td>$/i,
    );
  });

  test("strips event handlers, script URLs and dangerous props", () => {
    const out = html([
      { tag: "a", attrs: { href: "java\tscript:alert(1)", onclick: "alert(1)", ONMOUSEOVER: "x" }, children: ["a"] },
      { tag: "a", attrs: { href: "https://example.com", target: "_blank", rel: "noopener" }, children: ["b"] },
      { tag: "img", attrs: { src: "data:image/png;base64,AAAA", alt: "" } },
      { tag: "a", attrs: { href: "data:text/html,<script>alert(1)</script>" }, children: ["c"] },
      { tag: "div", attrs: { dangerouslySetInnerHTML: "<b>x</b>", style: "background:url(javascript:alert(1))" } },
    ]);
    expect(out).toBe(
      '<a>a</a><a href="https://example.com" target="_blank" rel="noopener">b</a><img src="data:image/png;base64,AAAA" alt=""/><a>c</a><div></div>',
    );
    expect(isSafeUrl(" JAVASCRIPT:x", "a")).toBe(false);
    expect(isSafeUrl("/relative", "a")).toBe(true);
  });

  test("blocks script-capable elements unless allowed", () => {
    const nodes: HtmlNode[] = [
      { tag: "script", children: ["alert(1)"] },
      { tag: "iframe", attrs: { src: "https://example.com/embed" } },
      { tag: "p", children: ["kept"] },
    ];
    expect(html(nodes)).toBe("<p>kept</p>");
    expect(html(nodes, { allowElements: ["iframe"] })).toBe('<iframe src="https://example.com/embed"></iframe><p>kept</p>');
    expect(html(nodes, { denyElements: ["p"] })).toBe("");
  });

  test("unwraps unknown and document-level tags, renders custom elements", () => {
    expect(
      html([
        { tag: "html", children: [{ tag: "body", children: [{ tag: "blink", children: ["old"] }] }] },
        { tag: "my-widget", attrs: { class: "w", "some-prop": "v" }, children: ["c"] },
      ]),
    ).toBe('old<my-widget class="w" some-prop="v">c</my-widget>');
  });

  test("handles tables, textarea and component overrides", () => {
    expect(
      html([
        { tag: "table", children: ["\n  ", { tag: "tbody", children: [{ tag: "tr", children: [{ tag: "td", children: ["1"] }] }] }] },
        { tag: "textarea", children: ["hello"] },
        { tag: "a", attrs: { href: "/x" }, children: ["link"] },
      ], { components: { a: ({ href, children }: { href: string; children: React.ReactNode }) => <span data-link={href}>{children}</span> } }),
    ).toBe('<table><tbody><tr><td>1</td></tr></tbody></table><textarea>hello</textarea><span data-link="/x">link</span>');
  });
});

describe("html block", () => {
  test("renders through CmsPage and flags invalid content", () => {
    const page = {
      id: "p",
      slug: "/",
      schemaVersion: 1,
      blocks: [
        { id: "a", type: "html", content: { nodes: [{ tag: "h2", children: ["Title"] }, "text"] } },
        { id: "b", type: "html", content: { nodes: [{ tag: 3 }] } },
      ],
    };
    const out = renderToStaticMarkup(
      <CmsProvider
        source={createStaticSource({ pages: [] })}
        blocks={{ html: htmlBlock }}
        fallbacks={{ invalidBlock: (b) => <i>invalid {b.id}</i> }}
        onIssue={() => {}}
      >
        <CmsPage page={page} />
      </CmsProvider>,
    );
    expect(out).toBe("<h2>Title</h2>text<i>invalid b</i>");
  });

  test("createHtmlBlock passes options through", () => {
    const block = createHtmlBlock({ allowElements: ["iframe"] });
    const page = { id: "p", slug: "/", schemaVersion: 1, blocks: [{ id: "a", type: "html", content: { nodes: [{ tag: "iframe", attrs: { src: "/e" } }] } }] };
    expect(
      renderToStaticMarkup(
        <CmsProvider source={createStaticSource({ pages: [] })} blocks={{ html: block }}>
          <CmsPage page={page} />
        </CmsProvider>,
      ),
    ).toBe('<iframe src="/e"></iframe>');
  });

  test("htmlToNodes converts an HTML string and round-trips safely", () => {
    const nodes = htmlToNodes('<p class="a">Hi <b>there</b><img src="x.png" onerror="alert(1)"></p><script>alert(1)</script>');
    expect(nodes[0]).toEqual({
      tag: "p",
      attrs: { class: "a" },
      children: ["Hi ", { tag: "b", children: ["there"] }, { tag: "img", attrs: { src: "x.png", onerror: "alert(1)" } }],
    });
    // React 19 may hoist an image preload <link>; the content itself must be clean.
    const out = html(nodes);
    expect(out).toContain('<p class="a">Hi <b>there</b><img src="x.png"/></p>');
    expect(out).not.toContain("onerror");
    expect(out).not.toContain("script");
  });
});

describe("hardening", () => {
  test("srcdoc is removed even when iframe is allowed", () => {
    expect(
      html([{ tag: "iframe", attrs: { srcdoc: "<script>alert(1)</script>", src: "https://e.com" } }], { allowElements: ["iframe"] }),
    ).toBe('<iframe src="https://e.com"></iframe>');
  });

  test("form fields from content stay editable in the browser", async () => {
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <HtmlContent
            nodes={[
              { tag: "input", attrs: { name: "q", value: "initial" } },
              { tag: "input", attrs: { type: "checkbox", checked: true } },
              { tag: "select", attrs: { value: "b" }, children: [{ tag: "option", attrs: { value: "a" } }, { tag: "option", attrs: { value: "b" } }] },
            ]}
          />,
        ),
      );
      const [text, box] = container.querySelectorAll("input");
      expect(text!.value).toBe("initial");
      expect(box!.checked).toBe(true);
      expect(container.querySelector("select")!.value).toBe("b");
      // Uncontrolled: a user's edit sticks after React re-renders.
      text!.value = "typed";
      await act(async () => root.render(<HtmlContent nodes={[{ tag: "input", attrs: { name: "q", value: "initial" } }]} />));
      expect(container.querySelector("input")!.value).toBe("typed");
      expect(errors.filter((e) => String(e).includes("controlled"))).toEqual([]);
    } finally {
      await act(async () => root.unmount());
      console.error = original;
    }
  });

  test("unwrapped children never produce duplicate keys", () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const out = html([
        { tag: "p", children: ["a"] },
        { tag: "blink", children: [{ tag: "p", children: ["b"] }, { tag: "p", children: ["c"] }] },
        { tag: "p", children: ["d"] },
      ]);
      expect(out).toBe("<p>a</p><p>b</p><p>c</p><p>d</p>");
      expect(errors.filter((e) => String(e).includes("same key"))).toEqual([]);
    } finally {
      console.error = original;
    }
  });

  test("legacy elements browsers still render are kept", () => {
    expect(html([{ tag: "center", children: [{ tag: "font", attrs: { color: "red" }, children: ["old"] }] }])).toBe(
      '<center><font color="red">old</font></center>',
    );
  });
});
