import { type HtmlNode, HtmlContent, htmlToNodes } from "@contentcore/react";
import { useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanNodes } from "./schema";

const toHtml = (nodes: readonly HtmlNode[]) => renderToStaticMarkup(<HtmlContent nodes={nodes} />);

const ACTIONS: Array<{ label: string; title: string; run: () => void }> = [
  { label: "B", title: "Bold text", run: () => document.execCommand("bold") },
  { label: "I", title: "Italic text", run: () => document.execCommand("italic") },
  { label: "H2", title: "Format as heading 2", run: () => document.execCommand("formatBlock", false, "h2") },
  { label: "H3", title: "Format as heading 3", run: () => document.execCommand("formatBlock", false, "h3") },
  { label: "¶", title: "Format as paragraph", run: () => document.execCommand("formatBlock", false, "p") },
  { label: "• List", title: "Bulleted list", run: () => document.execCommand("insertUnorderedList") },
  { label: "1. List", title: "Numbered list", run: () => document.execCommand("insertOrderedList") },
  { label: "❝", title: "Format as quote", run: () => document.execCommand("formatBlock", false, "blockquote") },
  {
    label: "Link",
    title: "Insert link",
    run: () => {
      const url = window.prompt("Link URL (https://… or /path)");
      if (url) document.execCommand("createLink", false, url);
    },
  },
  { label: "Unlink", title: "Remove link", run: () => document.execCommand("unlink") },
  { label: "Clear", title: "Clear formatting", run: () => document.execCommand("removeFormat") },
];

/**
 * A small WYSIWYG editor for the `html` block. It edits real markup in a contentEditable area,
 * and stores it as cleaned HtmlNode data. Pasted HTML is cleaned before it is inserted, so script,
 * handlers and script URLs never reach the content.
 */
export function RichTextEditor({
  nodes,
  onChange,
  label,
}: {
  nodes: readonly HtmlNode[];
  onChange: (nodes: HtmlNode[]) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string>("");

  // Sync from outside (initial load, JSON edits, revert) without disturbing the caret while typing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = toHtml(nodes);
    if (html !== lastEmitted.current) {
      el.innerHTML = html;
      lastEmitted.current = html;
    }
  }, [nodes]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const cleaned = cleanNodes(htmlToNodes(el.innerHTML));
    lastEmitted.current = toHtml(cleaned);
    onChange(cleaned);
  };

  return (
    <div className="cc-rte">
      <div className="cc-rte-toolbar" role="toolbar" aria-label={`${label} formatting`}>
        {ACTIONS.map((action) => (
          <button
            key={action.title}
            type="button"
            title={action.title}
            aria-label={action.title}
            onMouseDown={(e) => e.preventDefault() /* keep the selection */}
            onClick={() => {
              action.run();
              emit();
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        className="cc-rte-area"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        tabIndex={0}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          const html = e.clipboardData.getData("text/html");
          const text = e.clipboardData.getData("text/plain");
          e.preventDefault();
          if (html) document.execCommand("insertHTML", false, toHtml(cleanNodes(htmlToNodes(html))));
          else document.execCommand("insertText", false, text);
          emit();
        }}
      />
    </div>
  );
}
