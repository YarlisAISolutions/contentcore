// Where content comes from. Components never know which source is in use.
import {
  type CachedContentSource,
  type ContentSource,
  createApiSource,
  createFallbackSource,
  createStaticSource,
} from "@contentcore/react";
import pages from "./content/pages.json";

/** The JSON bundled with the app: always available, used as the last-resort snapshot. */
export const snapshot = createStaticSource({ pages });

const apiUrl = import.meta.env.VITE_CONTENT_API as string | undefined;

/** The live API (cached, retried, ETag-revalidated by default), if configured. */
export const api: CachedContentSource | undefined = apiUrl
  ? createApiSource({ baseUrl: apiUrl, cache: { ttl: 30_000 } })
  : undefined;

/**
 * Highly available chain: the API first; if it fails (outage, timeout), the bundled snapshot.
 * Without VITE_CONTENT_API the app runs entirely from the snapshot.
 */
export const source: ContentSource = api
  ? createFallbackSource(api, snapshot, {
      onError: "next",
      onFailover: (error) => console.warn("[content] API unavailable, serving snapshot", error),
    })
  : snapshot;
