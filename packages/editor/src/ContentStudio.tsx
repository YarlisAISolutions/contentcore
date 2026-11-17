import {
  type BlockRegistry,
  CmsPage,
  CmsProvider,
  type ContentStore,
  type HtmlNode,
  type MemoryStore,
  type PageSummary,
  type StoredPage,
  type ValidationIssue,
  validateBlockContent,
} from "@contentcore/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { RichTextEditor } from "./RichTextEditor";
import { JsonField, SchemaForm } from "./SchemaForm";
import { type JsonSchema, defaultValue, jsonSchemaOf, newId } from "./schema";
import { STUDIO_CSS } from "./styles";
import { type DraftPage, useStudio } from "./useStudio";

export interface ContentStudioProps {
  /** Where pages are managed: createMemoryStore (static JSON), createApiStore (API), or your own. */
  store: ContentStore;
  /** The same block registry the site renders with: drives "Add block", forms, validation and preview. */
  blocks: BlockRegistry;
  /** Called after a save, e.g. `(s) => siteSource.invalidate(s.page.slug)`. */
  onSaved?: (stored: StoredPage) => void;
  onDeleted?: (summary: PageSummary) => void;
  /** Heading shown in the studio bar. */
  title?: ReactNode;
  /** Extra controls for the studio bar (e.g. a sign-out button). */
  actions?: ReactNode;
  /** Render without the built-in stylesheet (style the `cc-` classes yourself). */
  unstyled?: boolean;
  /** Override the JSON Schema used to build a block's form, by block type. */
  jsonSchemas?: Record<string, JsonSchema>;
}

const isMemoryStore = (store: ContentStore): store is MemoryStore =>
  typeof (store as MemoryStore).exportPages === "function" && typeof (store as MemoryStore).importPages === "function";

const noSource = { getPage: async () => null };

/**
 * ContentCore Studio: list, create, edit, validate, preview, save and delete pages.
 * Works with any ContentStore, so the same UI edits static JSON and API-backed content.
 */
export function ContentStudio({ store, blocks, onSaved, onDeleted, title = "ContentCore Studio", actions, unstyled, jsonSchemas }: ContentStudioProps) {
  const studio = useStudio(store, { onSaved, onDeleted });
  const { current, selected } = studio;
  const [filter, setFilter] = useState("");

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && selected) {
        e.preventDefault();
        void studio.save(selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, studio.save]);

  const blockIssues = useBlockIssues(current?.draft, blocks);
  const issueCount = studio.pageIssues.length + [...blockIssues.values()].reduce((n, m) => n + m.length, 0);

  const visible = studio.summaries.filter((s) =>
    `${s.title ?? ""} ${s.slug} ${s.locale ?? ""} ${s.id}`.toLowerCase().includes(filter.toLowerCase()),
  );
  const unsavedNew = Object.values(studio.entries).filter((e) => !e.base);

  return (
    <div className="cc-studio">
      {!unstyled && <style>{STUDIO_CSS}</style>}
      <header className="cc-bar">
        <strong className="cc-title">{title}</strong>
        <div className="cc-bar-actions">
          {isMemoryStore(store) && <StaticControls store={store} onImported={studio.refresh} onError={(m) => studio.setStatus({ kind: "error", message: m })} />}
          {actions}
        </div>
        <output className={`cc-status cc-status-${studio.status.kind}`} aria-live="polite">
          {studio.status.kind === "saving" ? "Saving…" : studio.status.message}
        </output>
      </header>

      <nav className="cc-pages" aria-label="Pages">
        <div className="cc-pages-head">
          <input type="search" placeholder="Filter pages" aria-label="Filter pages" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button type="button" className="cc-primary" onClick={studio.create}>
            + New page
          </button>
        </div>
        {studio.loading && <p className="cc-muted">Loading…</p>}
        <ul>
          {[...unsavedNew.map((e) => ({ id: e.draft.id, slug: e.draft.slug, title: e.draft.title, locale: e.draft.locale, isNew: true })), ...visible].map((p) => {
            const dirty = studio.entries[p.id]?.dirty;
            return (
              <li key={p.id}>
                <button type="button" className={p.id === selected ? "cc-page cc-page-active" : "cc-page"} aria-current={p.id === selected || undefined} onClick={() => void studio.open(p.id)}>
                  <span className="cc-page-title">
                    {p.title || p.id}
                    {dirty && <span className="cc-dot" title="Unsaved changes" aria-label="unsaved" />}
                  </span>
                  <span className="cc-page-slug">
                    {p.slug}
                    {p.locale ? ` · ${p.locale}` : ""}
                    {"isNew" in p ? " · new" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {!studio.loading && studio.summaries.length === 0 && unsavedNew.length === 0 && <p className="cc-muted">No pages yet.</p>}
      </nav>

      <main className="cc-editor">
        {!current ? (
          <div className="cc-empty">
            <p>Select a page, or create a new one.</p>
          </div>
        ) : (
          <>
            {current.conflict && (
              <div className="cc-banner" role="alert">
                <p>{current.conflict}</p>
                <button type="button" onClick={() => void studio.reload(current.draft.id)}>
                  Discard mine and reload
                </button>
                <button type="button" onClick={() => void studio.save(current.draft.id, { overwrite: true })}>
                  Overwrite with mine
                </button>
              </div>
            )}
            <div className="cc-toolbar">
              <button type="button" className="cc-primary" disabled={!current.dirty || issueCount > 0 || studio.status.kind === "saving"} onClick={() => void studio.save(current.draft.id)}>
                {current.base ? "Save" : "Create page"}
              </button>
              <button type="button" disabled={!current.dirty} onClick={() => void studio.reload(current.draft.id)}>
                Revert
              </button>
              <button type="button" className="cc-danger" onClick={() => void studio.remove(current.draft.id)}>
                Delete page
              </button>
              {issueCount > 0 && <span className="cc-issue-count">{issueCount} problem{issueCount === 1 ? "" : "s"} to fix before saving</span>}
            </div>
            <PageFields draft={current.draft} isNew={!current.base} issues={studio.pageIssues} onChange={(d) => studio.update(current.draft.id, () => d)} />
            <BlockList
              draft={current.draft}
              blocks={blocks}
              issues={blockIssues}
              jsonSchemas={jsonSchemas}
              onChange={(next) => studio.update(current.draft.id, (d) => ({ ...d, blocks: next }))}
            />
          </>
        )}
      </main>

      <aside className="cc-preview" aria-label="Preview">
        <h2 className="cc-preview-title">Preview</h2>
        {current && studio.parsed?.ok ? (
          <div className="cc-preview-frame">
            <CmsProvider
              source={noSource}
              blocks={blocks}
              onIssue={() => {}}
              fallbacks={{
                unknownBlock: (b) => <p className="cc-issue">Unknown block type "{b.type}"</p>,
                invalidBlock: (b) => <p className="cc-issue">Block "{b.id}" has invalid content</p>,
                blockError: (b) => <p className="cc-issue">Block "{b.id}" failed to render</p>,
              }}
            >
              <CmsPage page={studio.parsed.page} />
            </CmsProvider>
          </div>
        ) : (
          <p className="cc-muted">{current ? "Fix the page settings to see a preview." : "Nothing selected."}</p>
        )}
      </aside>
    </div>
  );
}

function StaticControls({ store, onImported, onError }: { store: MemoryStore; onImported: () => void; onError: (message: string) => void }) {
  return (
    <>
      <label className="cc-button">
        Import JSON
        <input
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              store.importPages(JSON.parse(await file.text()) as unknown[]);
              onImported();
            } catch (error) {
              onError(`Import failed: ${(error as Error).message}`);
            }
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => {
          const blob = new Blob([`${JSON.stringify(store.exportPages(), null, 2)}\n`], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "pages.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Export JSON
      </button>
    </>
  );
}

function PageFields({ draft, isNew, issues, onChange }: { draft: DraftPage; isNew: boolean; issues: ValidationIssue[]; onChange: (d: DraftPage) => void }) {
  const issue = (path: string) => issues.find((i) => i.path === path || i.path.startsWith(`${path}.`))?.message;
  const description = typeof draft.meta?.description === "string" ? draft.meta.description : "";
  const set = <K extends keyof DraftPage>(key: K, value: DraftPage[K] | undefined) => {
    const next = { ...draft };
    if (value === undefined || value === "") delete next[key];
    else next[key] = value as DraftPage[K];
    onChange(next);
  };
  const other = issues.filter((i) => !["id", "slug", "locale", "title"].some((p) => i.path === p) && !i.path.startsWith("blocks"));
  return (
    <section className="cc-section" aria-label="Page settings">
      <h2>Page</h2>
      <div className="cc-grid">
        <Text label="Title" value={draft.title ?? ""} onChange={(v) => set("title", v)} error={issue("title")} />
        <Text label="Slug (URL path)" value={draft.slug} onChange={(v) => onChange({ ...draft, slug: v })} error={issue("slug")} placeholder="/about" />
        <Text label="Locale" value={draft.locale ?? ""} onChange={(v) => set("locale", v)} error={issue("locale")} placeholder="default" />
        <Text label="ID" value={draft.id} readOnly={!isNew} onChange={(v) => onChange({ ...draft, id: v })} error={issue("id")} hint={isNew ? "Permanent once created" : "Permanent"} />
      </div>
      <Text
        label="Description (SEO)"
        value={description}
        multiline
        onChange={(v) => {
          const meta = { ...(draft.meta ?? {}) };
          if (v) meta.description = v;
          else delete meta.description;
          set("meta", Object.keys(meta).length ? meta : undefined);
        }}
      />
      {other.map((i) => (
        <p key={i.path + i.message} className="cc-issue" role="alert">
          {i.path ? `${i.path}: ` : ""}
          {i.message}
        </p>
      ))}
    </section>
  );
}

function Text(props: { label: string; value: string; onChange: (v: string) => void; error?: string; placeholder?: string; readOnly?: boolean; hint?: string; multiline?: boolean }) {
  const id = useMemo(() => newId("cc-field"), []);
  return (
    <div className="cc-field">
      <label className="cc-label" htmlFor={id}>
        {props.label}
      </label>
      {props.hint && (
        <span className="cc-hint" id={`${id}-hint`}>
          {props.hint}
        </span>
      )}
      {props.multiline ? (
        <textarea id={id} rows={2} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <input
          id={id}
          value={props.value}
          placeholder={props.placeholder}
          readOnly={props.readOnly}
          onChange={(e) => props.onChange(e.target.value)}
          aria-invalid={Boolean(props.error) || undefined}
          aria-describedby={props.hint ? `${id}-hint` : undefined}
        />
      )}
      {props.error && (
        <p className="cc-issue" role="alert">
          {props.error}
        </p>
      )}
    </div>
  );
}

/** Validates every block's content with its schema (sync or async) whenever the draft changes. */
function useBlockIssues(draft: DraftPage | undefined, blocks: BlockRegistry) {
  const [issues, setIssues] = useState(new Map<string, ValidationIssue[]>());
  useEffect(() => {
    if (!draft) return setIssues(new Map());
    let live = true;
    Promise.all(
      draft.blocks.map(async (block): Promise<[string, ValidationIssue[]]> => {
        const definition = Object.prototype.hasOwnProperty.call(blocks, block.type) ? blocks[block.type] : undefined;
        if (!definition) return [block.id, [{ path: "", message: `No block type "${block.type}" is registered` }]];
        const result = await validateBlockContent(definition.schema, block.content);
        return [block.id, result.ok ? [] : result.issues];
      }),
    ).then((pairs) => live && setIssues(new Map(pairs)));
    return () => {
      live = false;
    };
  }, [draft, blocks]);
  return issues;
}

function BlockList({
  draft,
  blocks,
  issues,
  jsonSchemas,
  onChange,
}: {
  draft: DraftPage;
  blocks: BlockRegistry;
  issues: Map<string, ValidationIssue[]>;
  jsonSchemas?: Record<string, JsonSchema>;
  onChange: (blocks: DraftPage["blocks"]) => void;
}) {
  const types = Object.keys(blocks);
  const [addType, setAddType] = useState(types[0] ?? "");
  const schemaFor = (type: string) => jsonSchemas?.[type] ?? (blocks[type] ? jsonSchemaOf(blocks[type].schema) : undefined);
  const list = draft.blocks;
  const replace = (i: number, block: DraftPage["blocks"][number]) => onChange(list.map((b, j) => (j === i ? block : b)));
  const move = (from: number, to: number) => {
    const copy = [...list];
    const [b] = copy.splice(from, 1);
    if (b) copy.splice(to, 0, b);
    onChange(copy);
  };

  return (
    <section className="cc-section" aria-label="Blocks">
      <h2>Blocks</h2>
      {list.length === 0 && <p className="cc-muted">This page has no blocks yet.</p>}
      <ol className="cc-blocks">
        {list.map((block, i) => (
          <li key={block.id} className="cc-block">
            <div className="cc-block-head">
              <span className="cc-block-type">{block.type}</span>
              <span className="cc-block-id">{block.id}</span>
              <div className="cc-row-actions">
                <button type="button" aria-label={`Move ${block.type} block up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                  ↑
                </button>
                <button type="button" aria-label={`Move ${block.type} block down`} disabled={i === list.length - 1} onClick={() => move(i, i + 1)}>
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Duplicate ${block.type} block`}
                  onClick={() => {
                    const copy = [...list];
                    copy.splice(i + 1, 0, { ...structuredClone(block), id: newId(block.type) });
                    onChange(copy);
                  }}
                >
                  ⧉
                </button>
                <button type="button" aria-label={`Remove ${block.type} block`} onClick={() => onChange(list.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            </div>
            <BlockEditor block={block} schema={schemaFor(block.type)} issues={issues.get(block.id) ?? []} onChange={(content) => replace(i, { ...block, content })} />
          </li>
        ))}
      </ol>
      <div className="cc-add-block">
        <label className="cc-label" htmlFor="cc-add-type">
          Add a block
        </label>
        <select id="cc-add-type" value={addType} onChange={(e) => setAddType(e.target.value)}>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!addType}
          onClick={() => {
            const content = addType === "html" ? { nodes: [{ tag: "p", children: ["New paragraph"] }] } : defaultValue(schemaFor(addType));
            onChange([...list, { id: newId(addType), type: addType, content: content ?? {} }]);
          }}
        >
          + Add {addType}
        </button>
      </div>
    </section>
  );
}

function BlockEditor({ block, schema, issues, onChange }: { block: DraftPage["blocks"][number]; schema?: JsonSchema; issues: ValidationIssue[]; onChange: (content: unknown) => void }) {
  const isHtml = block.type === "html" && typeof block.content === "object" && block.content !== null && Array.isArray((block.content as { nodes?: unknown }).nodes);
  const canForm = Boolean(schema?.properties);
  const [mode, setMode] = useState<"form" | "json">(isHtml || canForm ? "form" : "json");
  const issueMap = useMemo(() => new Map(issues.map((i) => [i.path, i.message])), [issues]);
  const unplaced = issues.filter((i) => mode === "json" || !schema || (!issueMap.has(i.path) && i.path !== "")).length ? issues : [];

  return (
    <div className="cc-block-body">
      {(isHtml || canForm) && (
        <div className="cc-tabs" role="tablist" aria-label={`${block.type} editor mode`}>
          <button type="button" role="tab" aria-selected={mode === "form"} onClick={() => setMode("form")}>
            {isHtml ? "Rich text" : "Form"}
          </button>
          <button type="button" role="tab" aria-selected={mode === "json"} onClick={() => setMode("json")}>
            JSON
          </button>
        </div>
      )}
      {mode === "json" ? (
        <JsonField key={`${block.id}-json`} value={block.content} onChange={onChange} label="" path="" issues={new Map()} />
      ) : isHtml ? (
        <RichTextEditor
          nodes={(block.content as { nodes: HtmlNode[] }).nodes}
          label={`${block.type} content`}
          onChange={(nodes) => onChange({ ...(block.content as object), nodes })}
        />
      ) : (
        <SchemaForm schema={schema as JsonSchema} value={block.content} onChange={onChange} issues={issueMap} />
      )}
      {(mode === "json" || isHtml ? issues : unplaced).map((i) => (
        <p key={i.path + i.message} className="cc-issue" role="alert">
          {i.path ? `${i.path}: ` : ""}
          {i.message}
        </p>
      ))}
    </div>
  );
}
