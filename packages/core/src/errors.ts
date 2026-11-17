import { abortError } from "./compat";

export interface ValidationIssue {
  /** Dotted path into the document, e.g. "blocks.2.type". Empty for the root. */
  path: string;
  message: string;
}

export type ContentcoreErrorCode = "VALIDATION" | "SOURCE" | "UNSUPPORTED_SCHEMA_VERSION";

/** Base class for every error ContentCore throws. Check `code` rather than `instanceof` across bundles. */
export class ContentcoreError extends Error {
  readonly code: ContentcoreErrorCode;
  constructor(code: ContentcoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ContentcoreError";
    this.code = code;
  }
}

/** Stored content did not match the page document contract. */
export class ContentValidationError extends ContentcoreError {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[], context?: string) {
    const head = issues
      .slice(0, 3)
      .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
      .join("; ");
    const more = issues.length > 3 ? ` (+${issues.length - 3} more)` : "";
    super("VALIDATION", `${context ? `${context}: ` : ""}invalid page document: ${head}${more}`);
    this.name = "ContentValidationError";
    this.issues = issues;
  }
}

/** The document says it is newer than this package understands. Upgrade @contentcore/*. */
export class UnsupportedSchemaVersionError extends ContentcoreError {
  readonly schemaVersion: number;
  constructor(schemaVersion: number, supported: number) {
    super(
      "UNSUPPORTED_SCHEMA_VERSION",
      `page document schemaVersion ${schemaVersion} is newer than the supported version ${supported}; upgrade @contentcore packages`,
    );
    this.name = "UnsupportedSchemaVersionError";
    this.schemaVersion = schemaVersion;
  }
}

/** A source failed to load content (network error, non-2xx response, bad JSON). */
export class ContentSourceError extends ContentcoreError {
  readonly status?: number;
  readonly url?: string;
  constructor(message: string, details: { status?: number; url?: string; cause?: unknown } = {}) {
    super("SOURCE", message, { cause: details.cause });
    this.name = "ContentSourceError";
    this.status = details.status;
    this.url = details.url;
  }
}

export function isContentcoreError(error: unknown): error is ContentcoreError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    ["VALIDATION", "SOURCE", "UNSUPPORTED_SCHEMA_VERSION"].includes((error as { code: string }).code)
  );
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError";
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason ?? abortError();
  }
}
