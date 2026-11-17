# Accessibility and responsive design

ContentCore targets **WCAG 2.2 level AA**, and is responsive down to **320 CSS px** (WCAG 1.4.10 Reflow). This page covers:
- what the packages guarantee and how CI verifies it;
- what block authors must do, since your components render the markup;
- what editors are prompted to do.

## Verified on every pull request

`scripts/verify-browsers.ts` runs in **Chromium, Firefox and WebKit** at **320 px (phone), 768 px (tablet) and 1440 px (desktop)**:

| Checked | Where | How |
|---|---|---|
| WCAG 2.0, 2.1 and 2.2 A/AA rules | Site example: every page and every fallback (`/`, `/pricing`, `/about`, `/shop`, `/legacy`, not found) | axe-core (`@axe-core/playwright`); any violation fails CI |
| WCAG 2.0, 2.1 and 2.2 A/AA rules | Studio: page list, editing (forms and rich text), validation errors | axe-core; any violation fails CI |
| No horizontal scrolling (reflow) | All of the above, at all three widths | Page width compared with the viewport, naming the elements that stick out |
| Keyboard operation | Studio: reach **+ New page** with Tab, activate it with Enter, and focus lands on the new page's Title field | Playwright keyboard |

Automated checks find about half of all WCAG issues. Screen-reader passes (VoiceOver, NVDA) and manual zoom checks at 200% and 400% are still recommended before major releases.

## What the packages do for you

**`@contentcore/react` (rendering):**
- **Unstyled output.** It adds no wrappers, landmarks or ARIA of its own, so your block components decide the semantics.
- **Your fallbacks.** You write the loading, not-found and error states. Give them roles: `aria-busy` for loading, `role="alert"` for errors, and a focusable retry button (see `examples/vite-app/src/App.tsx`).
- **The `html` block** renders real semantic elements (headings, lists, tables, `figure`/`figcaption`, `details`, MathML, SVG) and keeps `aria-*` and `role` attributes. It never rewrites the structure editors chose.
- **Embedded sections and other regions** render in place, so they don't disturb heading order or focus.

**`@contentcore/editor` (ContentCore Studio):**
- **Labels.** Every control has a visible label, or an accessible name where a visible one would be redundant (JSON editors, toolbar buttons). Field hints are linked with `aria-describedby`.
- **Errors** are shown next to their field and announced (`role="alert"`). Invalid fields are marked `aria-invalid`. Save status is announced through a polite live region.
- **Landmarks:** the page list is a `nav`, the editor is `main`, and the preview is a labelled `aside`.
- **Keyboard:**
  - every action is a native button or input, with visible focus rings;
  - Ctrl/Cmd+S saves;
  - Import JSON is keyboard-reachable;
  - after **+ New page**, focus moves to the Title field.
- **States are not shown by colour alone.** Unsaved pages show a dot plus screen-reader text, the editor mode toggles use `aria-pressed`, and problem counts are written out.
- **Touch targets** are at least 28 px tall, or 40 px on touch screens (WCAG 2.5.8).
- **Layout** reflows from three columns to two, then to one at 720 px, with no horizontal scroll at 320 px.
- **User settings:** it honours `prefers-color-scheme` (light/dark), `prefers-reduced-motion` and Windows High Contrast (`forced-colors`).
- **Content checks:** rich text with an **image without alt text** or a **link without text** is flagged and can't be saved (WCAG 1.1.1, 2.4.4). `alt=""` marks a decorative image.

## What block authors should do

- **Headings:**
  - Use real heading elements in order.
  - Each page should have one `h1`, usually from a hero block.
  - Sections inside blocks start at `h2`.
- **Images:**
  - Put an `alt` field in the block schema, and make it required: `z.object({ src: z.string(), alt: z.string() })`. Then editors can't forget it.
  - Use `alt=""` only for decorative images.
- **Links and buttons:** links navigate, buttons act. Link text must make sense on its own; avoid "click here".
- **Colour:** at least 4.5:1 contrast for text (3:1 for large text and UI parts). Never use colour as the only signal.
- **Motion:** respect `prefers-reduced-motion` in animated blocks, and don't auto-play media with sound.
- **Embeds** (video, maps): give iframes a `title`, and provide captions or transcripts.
- **Layout:** test blocks at 320 px wide and at 200% zoom. Use relative units and wrapping layouts (`flex-wrap`, `grid` with `minmax`), and avoid fixed widths.
- **Fallbacks:** loading `aria-busy="true"`; errors `role="alert"` with a retry button; not-found pages with a heading and a way back.

Example: an accessible image block.

```tsx
const image = defineBlock({
  schema: z.object({
    src: z.string().url(),
    alt: z.string().describe('Describe the image; use "" only if it is decorative'),
    caption: z.string().optional(),
  }),
  component: ({ content }) => (
    <figure>
      <img src={content.src} alt={content.alt} loading="lazy" style={{ maxWidth: "100%", height: "auto" }} />
      {content.caption && <figcaption>{content.caption}</figcaption>}
    </figure>
  ),
});
```

## What editors are prompted to do

The studio blocks saving rich text that has images without alt text or links without text. Beyond that, editors should:
- write descriptive link text;
- keep heading levels in order (H2 then H3, from the rich-text toolbar);
- avoid putting text in images.
