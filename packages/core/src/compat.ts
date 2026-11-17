/**
 * Small fallbacks so the core runs on every JavaScript platform: Node 20+, Bun, Deno,
 * browsers back to Safari 15, edge runtimes (Cloudflare Workers, Vercel Edge) and
 * React Native's Hermes, which lack some newer globals. Browser baseline: Safari 15+, Chrome/Edge 90+, Firefox 90+.
 */

/** An abort error that works without `DOMException` (React Native, some edge runtimes). */
export function abortError(message = "The operation was aborted."): Error {
  if (typeof DOMException === "function") return new DOMException(message, "AbortError");
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

/** Deep copy of JSON-like data. `structuredClone` where available, JSON otherwise. */
export function cloneData<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/**
 * A signal that aborts when `parent` aborts or after `timeoutMs`, without
 * `AbortSignal.any`/`AbortSignal.timeout` (Safari < 17.4, Hermes). Call `dispose`
 * when done so no timer outlives the request (important in serverless runtimes).
 */
export function linkedSignal(
  parent: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; timedOut: () => boolean; dispose: () => void } {
  const controller = new AbortController();
  let didTimeOut = false;
  const onAbort = () => controller.abort(parent?.reason ?? abortError());
  if (parent?.aborted) onAbort();
  else parent?.addEventListener("abort", onAbort, { once: true });
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          didTimeOut = true;
          controller.abort(abortError(`timed out after ${timeoutMs}ms`));
        }, timeoutMs)
      : undefined;
  return {
    signal: controller.signal,
    timedOut: () => didTimeOut,
    dispose: () => {
      if (timer !== undefined) clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}
