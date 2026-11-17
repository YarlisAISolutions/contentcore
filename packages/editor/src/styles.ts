/** Default studio styles. Every selector is prefixed with .cc- so nothing leaks into the host app. */
export const STUDIO_CSS = `
.cc-studio {
  --cc-bg: #ffffff; --cc-panel: #f7f7fb; --cc-border: #e3e3ee; --cc-text: #161629; --cc-muted: #6b6b80;
  --cc-primary: #4f46e5; --cc-primary-text: #ffffff; --cc-danger: #c2410c; --cc-issue: #b42318; --cc-ok: #15803d;
  --cc-radius: 8px;
  display: grid; grid-template-columns: 260px minmax(0, 1fr) minmax(0, 0.9fr); grid-template-rows: auto 1fr;
  grid-template-areas: "bar bar bar" "pages editor preview";
  min-height: 100vh; background: var(--cc-bg); color: var(--cc-text);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark) {
  .cc-studio { --cc-bg: #0f1020; --cc-panel: #17182b; --cc-border: #2a2b45; --cc-text: #ececf6; --cc-muted: #a0a0b8;
    --cc-primary: #7b78ff; --cc-issue: #ff8a7a; --cc-ok: #4ade80; --cc-danger: #fb923c; }
}
@media (max-width: 1100px) {
  .cc-studio { grid-template-columns: 220px minmax(0, 1fr); grid-template-areas: "bar bar" "pages editor" "preview preview"; }
}
@media (max-width: 720px) {
  .cc-studio { grid-template-columns: 1fr; grid-template-areas: "bar" "pages" "editor" "preview"; }
}
.cc-studio *, .cc-studio *::before, .cc-studio *::after { box-sizing: border-box; }
.cc-studio button, .cc-studio .cc-button {
  font: inherit; color: var(--cc-text); background: var(--cc-panel); border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius); padding: 6px 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
}
.cc-studio button:disabled { opacity: .45; cursor: not-allowed; }
.cc-studio button:focus-visible, .cc-studio input:focus-visible, .cc-studio textarea:focus-visible,
.cc-studio select:focus-visible, .cc-studio [contenteditable]:focus-visible { outline: 2px solid var(--cc-primary); outline-offset: 1px; }
.cc-studio .cc-primary { background: var(--cc-primary); border-color: var(--cc-primary); color: var(--cc-primary-text); }
.cc-studio .cc-danger { color: var(--cc-danger); }
.cc-studio input, .cc-studio textarea, .cc-studio select {
  font: inherit; color: var(--cc-text); background: var(--cc-bg); border: 1px solid var(--cc-border);
  border-radius: var(--cc-radius); padding: 6px 8px; width: 100%;
}
.cc-studio input[type="checkbox"] { width: auto; }
.cc-studio [aria-invalid="true"] { border-color: var(--cc-issue); }
.cc-bar { grid-area: bar; display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--cc-border); flex-wrap: wrap; }
.cc-title { font-size: 15px; }
.cc-bar-actions { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; }
.cc-status { min-width: min(140px, 100%); text-align: right; color: var(--cc-muted); }
/* Anything placed in the bar (including app-provided actions) wraps and shrinks on narrow screens. */
.cc-bar > *, .cc-bar-actions > * { max-width: 100%; min-width: 0; }
.cc-studio .cc-button { flex-wrap: wrap; }
.cc-studio select, .cc-studio input, .cc-studio textarea { max-width: 100%; }
.cc-studio img, .cc-studio svg, .cc-studio video, .cc-studio iframe, .cc-studio table { max-width: 100%; }
.cc-preview-frame { overflow-x: auto; }
@media (max-width: 480px) { .cc-bar-actions { margin-left: 0; width: 100%; } .cc-status { text-align: left; } }
.cc-status-saved { color: var(--cc-ok); } .cc-status-error, .cc-status-conflict { color: var(--cc-issue); }
.cc-pages { grid-area: pages; border-right: 1px solid var(--cc-border); background: var(--cc-panel); padding: 12px; overflow: auto; }
.cc-pages-head { display: grid; gap: 8px; margin-bottom: 12px; }
.cc-pages ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.cc-page { width: 100%; display: grid !important; text-align: left; gap: 2px !important; background: transparent !important; border-color: transparent !important; }
.cc-page:hover { background: var(--cc-bg) !important; }
.cc-page-active { background: var(--cc-bg) !important; border-color: var(--cc-border) !important; }
.cc-page-title { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.cc-page-slug { color: var(--cc-muted); font-size: 12px; font-family: ui-monospace, monospace; }
.cc-dot { width: 7px; height: 7px; border-radius: 50%; background: #f59e0b; display: inline-block; }
.cc-editor { grid-area: editor; padding: 16px 20px 48px; overflow: auto; }
.cc-empty { display: grid; place-items: center; min-height: 40vh; color: var(--cc-muted); }
.cc-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; position: sticky; top: 0; background: var(--cc-bg); padding: 4px 0 12px; z-index: 1; }
.cc-issue-count { color: var(--cc-issue); }
.cc-banner { border: 1px solid var(--cc-issue); border-radius: var(--cc-radius); padding: 10px 12px; margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.cc-banner p { margin: 0; flex-basis: 100%; }
.cc-section { margin-bottom: 24px; }
.cc-section h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--cc-muted); margin: 8px 0 12px; }
.cc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.cc-field { display: grid; gap: 4px; margin-bottom: 10px; }
.cc-field-inline { grid-template-columns: auto 1fr; align-items: center; }
.cc-label { font-weight: 600; font-size: 13px; display: grid; }
.cc-hint, .cc-optional { font-weight: 400; color: var(--cc-muted); font-size: 12px; }
.cc-optional { display: inline; }
.cc-issue { color: var(--cc-issue); margin: 2px 0; font-size: 13px; }
.cc-muted { color: var(--cc-muted); }
.cc-blocks { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.cc-block { border: 1px solid var(--cc-border); border-radius: var(--cc-radius); background: var(--cc-panel); }
.cc-block-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--cc-border); }
.cc-block-type { font-weight: 700; }
.cc-block-id { color: var(--cc-muted); font-family: ui-monospace, monospace; font-size: 12px; }
.cc-row-actions { margin-left: auto; display: flex; gap: 4px; }
.cc-row-actions button { padding: 2px 8px; }
.cc-block-body { padding: 10px 12px; background: var(--cc-bg); border-radius: 0 0 var(--cc-radius) var(--cc-radius); }
.cc-tabs { display: flex; gap: 4px; margin-bottom: 10px; }
.cc-tabs [aria-pressed="true"] { border-color: var(--cc-primary); color: var(--cc-primary); font-weight: 600; }
.cc-sr-only { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.cc-file { position: relative; }
.cc-file:focus-within { outline: 2px solid var(--cc-primary); outline-offset: 1px; }
/* Comfortable touch targets (WCAG 2.5.8): every control at least 28px tall. */
.cc-studio button, .cc-studio .cc-button, .cc-studio input, .cc-studio select { min-height: 28px; }
@media (pointer: coarse) { .cc-studio button, .cc-studio .cc-button, .cc-studio input, .cc-studio select { min-height: 40px; } }
@media (prefers-reduced-motion: reduce) { .cc-studio * { transition: none !important; animation: none !important; scroll-behavior: auto !important; } }
@media (forced-colors: active) { .cc-dot { forced-color-adjust: none; border: 1px solid CanvasText; } .cc-studio button:focus-visible { outline: 2px solid Highlight; } }
.cc-object, .cc-array { border: 1px solid var(--cc-border); border-radius: var(--cc-radius); padding: 10px 12px; margin: 0 0 10px; }
.cc-object legend, .cc-array legend { font-weight: 600; font-size: 13px; padding: 0 4px; }
div.cc-object { border: 0; padding: 0; }
.cc-array-item { border-left: 3px solid var(--cc-border); padding-left: 10px; margin-bottom: 8px; }
.cc-add { margin-top: 4px; }
.cc-json { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12.5px; }
.cc-add-block { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; margin-top: 12px; }
.cc-add-block .cc-label { grid-column: 1 / -1; }
.cc-rte { border: 1px solid var(--cc-border); border-radius: var(--cc-radius); }
.cc-rte-toolbar { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px; border-bottom: 1px solid var(--cc-border); background: var(--cc-panel); }
.cc-rte-toolbar button { padding: 2px 8px; font-size: 12.5px; }
.cc-rte-area { min-height: 120px; padding: 10px 12px; }
.cc-preview { grid-area: preview; border-left: 1px solid var(--cc-border); padding: 16px 20px; overflow: auto; }
.cc-preview-title { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--cc-muted); margin: 0 0 12px; }
.cc-preview-frame { border: 1px dashed var(--cc-border); border-radius: var(--cc-radius); padding: 16px; }
`;
