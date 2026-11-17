import type { ValidationIssue } from "./errors";
import type { StandardSchemaV1 } from "./standard-schema";

export type BlockContentResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

function toIssues(issues: ReadonlyArray<StandardSchemaV1.Issue>): ValidationIssue[] {
  return issues.map((issue) => ({
    message: issue.message,
    path: (issue.path ?? [])
      .map((seg) => String(typeof seg === "object" && seg !== null ? seg.key : seg))
      .join("."),
  }));
}

function toResult<T>(result: StandardSchemaV1.Result<T>): BlockContentResult<T> {
  return result.issues ? { ok: false, issues: toIssues(result.issues) } : { ok: true, value: result.value };
}

/**
 * Validates block content with any Standard Schema (Zod, Valibot, ArkType, …).
 * Returns synchronously when the schema validates synchronously, so server and first
 * client render can show content without a loading state; returns a Promise otherwise.
 */
export function validateBlockContent<S extends StandardSchemaV1>(
  schema: S,
  content: unknown,
): BlockContentResult<StandardSchemaV1.InferOutput<S>> | Promise<BlockContentResult<StandardSchemaV1.InferOutput<S>>> {
  const result = schema["~standard"].validate(content) as
    | StandardSchemaV1.Result<StandardSchemaV1.InferOutput<S>>
    | Promise<StandardSchemaV1.Result<StandardSchemaV1.InferOutput<S>>>;
  return result instanceof Promise ? result.then(toResult) : toResult(result);
}
