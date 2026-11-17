import type { ContentSource } from "../contracts";
import { isAbortError } from "../errors";

export interface FallbackSourceOptions {
  /**
   * What to do when a source fails. "throw" (default) surfaces the outage;
   * "next" fails over to the next source (e.g. primary API → replica → static snapshot)
   * and only rejects with the last error if every source fails.
   */
  onError?: "throw" | "next";
  /** Called for every failure that was failed over. */
  onFailover?: (error: unknown, sourceIndex: number) => void;
}

/**
 * Tries each source in order and returns the first page found: preview before published,
 * or, with `onError: "next"`, a highly available chain of replicas.
 */
export function createFallbackSource(...args: Array<ContentSource | FallbackSourceOptions>): ContentSource {
  const sources = args.filter((a): a is ContentSource => typeof (a as ContentSource).getPage === "function");
  const options = (args.find((a) => typeof (a as ContentSource).getPage !== "function") ?? {}) as FallbackSourceOptions;
  if (sources.length === 0) throw new TypeError("createFallbackSource needs at least one source");
  const failover = options.onError === "next";

  return {
    async getPage(slug, opts) {
      let lastError: unknown;
      let failed = false;
      for (const [i, source] of sources.entries()) {
        try {
          const page = await source.getPage(slug, opts);
          if (page) return page;
        } catch (error) {
          if (!failover || isAbortError(error) || opts?.signal?.aborted) throw error;
          options.onFailover?.(error, i);
          lastError = error;
          failed = true;
        }
      }
      if (failed) throw lastError;
      return null;
    },
    peek(slug, opts) {
      for (const source of sources) {
        const page = source.peek?.(slug, opts);
        if (page) return page;
      }
      return undefined;
    },
    async prefetch(slug, opts) {
      await Promise.all(sources.map((s) => s.prefetch?.(slug, opts)));
    },
    subscribe(listener) {
      const offs = sources.map((s) => s.subscribe?.(listener));
      return () => {
        for (const off of offs) off?.();
      };
    },
  };
}
