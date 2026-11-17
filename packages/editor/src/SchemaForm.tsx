import { useId, useState } from "react";
import { type JsonSchema, defaultValue, typeOf } from "./schema";

interface FieldProps {
  schema: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  label: string;
  required: boolean;
  path: string;
  issues: Map<string, string>;
}

const humanize = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

const isLong = (key: string, schema: JsonSchema) =>
  (schema.maxLength ?? 0) > 120 || schema.format === "textarea" || /description|body|text|summary|content|bio/i.test(key);

/** A form for one JSON value, generated from its JSON Schema. */
export function SchemaForm({
  schema,
  value,
  onChange,
  issues,
}: {
  schema: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  issues: Map<string, string>;
}) {
  return <Field schema={schema} value={value} onChange={onChange} label="" required path="" issues={issues} />;
}

function Field(props: FieldProps) {
  const { schema } = props;
  const type = typeOf(schema);
  if (schema.enum && schema.enum.every((v) => typeof v === "string" || typeof v === "number")) return <EnumField {...props} />;
  if (type === "object" && schema.properties) return <ObjectField {...props} />;
  if (type === "array" && schema.items) return <ArrayField {...props} />;
  if (type === "string") return <StringField {...props} />;
  if (type === "number" || type === "integer") return <NumberField {...props} />;
  if (type === "boolean") return <BooleanField {...props} />;
  return <JsonField {...props} />;
}

function Label({ htmlFor, label, required, schema }: { htmlFor: string; label: string; required: boolean; schema: JsonSchema }) {
  if (!label) return null;
  return (
    <>
      <label className="cc-label" htmlFor={htmlFor}>
        {schema.title ?? label}
        {!required && <span className="cc-optional"> (optional)</span>}
      </label>
      {schema.description && (
        <span className="cc-hint" id={`${htmlFor}-hint`}>
          {schema.description}
        </span>
      )}
    </>
  );
}

/** aria-describedby for a field's hint, when its schema has a description. */
const describedBy = (id: string, schema: JsonSchema) => (schema.description ? `${id}-hint` : undefined);

const Issue = ({ issues, path }: { issues: Map<string, string>; path: string }) => {
  const message = issues.get(path);
  return message ? (
    <p className="cc-issue" role="alert">
      {message}
    </p>
  ) : null;
};

function StringField({ schema, value, onChange, label, required, path, issues }: FieldProps) {
  const id = useId();
  const text = typeof value === "string" ? value : "";
  // An optional field cleared by the editor is removed, not stored as "".
  const set = (next: string) => onChange(next === "" && !required ? undefined : next);
  const key = path.split(".").pop() ?? "";
  return (
    <div className="cc-field">
      <Label htmlFor={id} label={label} required={required} schema={schema} />
      {isLong(key, schema) ? (
        <textarea id={id} value={text} rows={3} onChange={(e) => set(e.target.value)} aria-invalid={issues.has(path) || undefined} aria-describedby={describedBy(id, schema)} />
      ) : (
        <input
          id={id}
          type={schema.format === "uri" || schema.format === "url" ? "url" : schema.format === "email" ? "email" : "text"}
          value={text}
          onChange={(e) => set(e.target.value)}
          aria-invalid={issues.has(path) || undefined}
          aria-describedby={describedBy(id, schema)}
        />
      )}
      <Issue issues={issues} path={path} />
    </div>
  );
}

function NumberField({ schema, value, onChange, label, required, path, issues }: FieldProps) {
  const id = useId();
  return (
    <div className="cc-field">
      <Label htmlFor={id} label={label} required={required} schema={schema} />
      <input
        id={id}
        type="number"
        value={typeof value === "number" ? value : ""}
        min={schema.minimum}
        max={schema.maximum}
        step={typeOf(schema) === "integer" ? 1 : "any"}
        onChange={(e) => onChange(e.target.value === "" ? (required ? 0 : undefined) : Number(e.target.value))}
        aria-invalid={issues.has(path) || undefined}
        aria-describedby={describedBy(id, schema)}
      />
      <Issue issues={issues} path={path} />
    </div>
  );
}

function BooleanField({ schema, value, onChange, label, path, issues }: FieldProps) {
  const id = useId();
  return (
    <div className="cc-field cc-field-inline">
      <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      <label className="cc-label" htmlFor={id}>
        {schema.title ?? label}
      </label>
      {schema.description && <span className="cc-hint">{schema.description}</span>}
      <Issue issues={issues} path={path} />
    </div>
  );
}

function EnumField({ schema, value, onChange, label, required, path, issues }: FieldProps) {
  const id = useId();
  const options = schema.enum as Array<string | number>;
  return (
    <div className="cc-field">
      <Label htmlFor={id} label={label} required={required} schema={schema} />
      <select
        id={id}
        aria-describedby={describedBy(id, schema)}
        value={value === undefined ? "" : String(value)}
        onChange={(e) => {
          if (e.target.value === "") return onChange(undefined);
          const match = options.find((o) => String(o) === e.target.value);
          onChange(match);
        }}
      >
        {!required && <option value="">-</option>}
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {String(o)}
          </option>
        ))}
      </select>
      <Issue issues={issues} path={path} />
    </div>
  );
}

function ObjectField({ schema, value, onChange, label, required, path, issues }: FieldProps) {
  const object = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  const requiredKeys = new Set(schema.required ?? []);
  const body = (
    <>
      {Object.entries(schema.properties ?? {}).map(([key, child]) => (
        <Field
          key={key}
          schema={child}
          value={object[key]}
          label={humanize(key)}
          required={requiredKeys.has(key)}
          path={path ? `${path}.${key}` : key}
          issues={issues}
          onChange={(next) => {
            const copy = { ...object };
            if (next === undefined) delete copy[key];
            else copy[key] = next;
            onChange(copy);
          }}
        />
      ))}
      <Issue issues={issues} path={path} />
    </>
  );
  if (!label) return <div className="cc-object">{body}</div>;
  return (
    <fieldset className="cc-object">
      <legend>
        {schema.title ?? label}
        {!required && <span className="cc-optional"> (optional)</span>}
      </legend>
      {body}
    </fieldset>
  );
}

function ArrayField({ schema, value, onChange, label, required, path, issues }: FieldProps) {
  const items = Array.isArray(value) ? value : [];
  const itemSchema = schema.items as JsonSchema;
  const set = (next: unknown[]) => onChange(next.length === 0 && !required ? undefined : next);
  const move = (from: number, to: number) => {
    const copy = [...items];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    set(copy);
  };
  return (
    <fieldset className="cc-array">
      <legend>
        {schema.title ?? label}
        {!required && <span className="cc-optional"> (optional)</span>}
      </legend>
      {items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: list items have no identity of their own.
        <div key={i} className="cc-array-item">
          <Field
            schema={itemSchema}
            value={item}
            label={`${humanize(label || "Item")} ${i + 1}`}
            required
            path={`${path}.${i}`}
            issues={issues}
            onChange={(next) => {
              const copy = [...items];
              copy[i] = next;
              set(copy);
            }}
          />
          <div className="cc-row-actions">
            <button type="button" aria-label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
              ↑
            </button>
            <button type="button" aria-label={`Move item ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
              ↓
            </button>
            <button type="button" aria-label={`Remove item ${i + 1}`} onClick={() => set(items.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="cc-add" onClick={() => set([...items, defaultValue(itemSchema)])}>
        + Add {humanize(label || "item").toLowerCase()}
      </button>
      <Issue issues={issues} path={path} />
    </fieldset>
  );
}

/** Raw JSON for values the form doesn't model (unions, records, unknown types). */
export function JsonField({
  value,
  onChange,
  label,
  path,
  issues,
}: Pick<FieldProps, "value" | "onChange" | "label" | "path" | "issues">) {
  const id = useId();
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [error, setError] = useState<string>();
  return (
    <div className="cc-field">
      {label && (
        <label className="cc-label" htmlFor={id}>
          {label} <span className="cc-hint">JSON</span>
        </label>
      )}
      <textarea
        id={id}
        className="cc-json"
        value={text}
        rows={Math.min(16, Math.max(3, text.split("\n").length))}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError(undefined);
          } catch (err) {
            setError(`Invalid JSON: ${(err as Error).message}`);
          }
        }}
        aria-invalid={Boolean(error) || issues.has(path) || undefined}
      />
      {error && (
        <p className="cc-issue" role="alert">
          {error}
        </p>
      )}
      <Issue issues={issues} path={path} />
    </div>
  );
}
