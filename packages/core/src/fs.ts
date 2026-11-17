/**
 * `@contentcore/core/fs`: a ContentStore backed by a JSON file, for Node 20+, Bun and Deno.
 * Use it to edit static content that lives in your repo (content/pages.json) through the
 * editor and a local content API, then commit the file. Not for browsers or edge runtimes.
 */
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PageDocument } from "./contracts";
import { ContentValidationError } from "./errors";
import {
  type ContentStore,
  type PageSummary,
  type StoredPage,
  checkRevision,
  prepareForSave,
  revisionOf,
  summarize,
} from "./store";

export interface FileStoreOptions {
  /** JSON indentation. Default 2 (diff-friendly). */
  indent?: number;
}

export interface FileStore extends ContentStore {
  readonly path: string;
}

/**
 * Pages are kept as a JSON array, sorted by slug and locale for stable diffs.
 * Writes are serialised (one at a time) and atomic (write a temp file, then rename),
 * so a crash or two editors saving at once never leaves a half-written file.
 */
export function createFileStore(path: string, options: FileStoreOptions = {}): FileStore {
  const indent = options.indent ?? 2;
  let queue: Promise<unknown> = Promise.resolve();
  let cache: { mtimeMs: number; size: number; pages: StoredPage[] } | undefined;

  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  };

  async function read(): Promise<StoredPage[]> {
    let info: { mtimeMs: number; size: number };
    try {
      info = await stat(path);
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return [];
      throw error;
    }
    if (cache && cache.mtimeMs === info.mtimeMs && cache.size === info.size) return cache.pages;
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!Array.isArray(raw)) {
      throw new ContentValidationError([{ path: "", message: `${path} must contain a JSON array of pages` }], "file store");
    }
    const pages: StoredPage[] = [];
    for (const item of raw) {
      const page = prepareForSave(item, pages.map((p) => p.page));
      pages.push({ page, revision: revisionOf(page) });
    }
    cache = { ...info, pages };
    return pages;
  }

  async function write(pages: PageDocument[]) {
    const sorted = [...pages].sort((a, b) => a.slug.localeCompare(b.slug) || (a.locale ?? "").localeCompare(b.locale ?? ""));
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temp, `${JSON.stringify(sorted, null, indent)}\n`, "utf8");
      // Windows can briefly lock the target (antivirus, indexers): retry the atomic rename.
      for (let attempt = 0; ; attempt++) {
        try {
          await rename(temp, path);
          break;
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (attempt >= 5 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw error;
          await new Promise((r) => setTimeout(r, 20 * 2 ** attempt));
        }
      }
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    cache = undefined;
  }

  return {
    path,
    async list(): Promise<PageSummary[]> {
      return (await read()).map(summarize).sort((a, b) => a.slug.localeCompare(b.slug));
    },
    async get(id) {
      const found = (await read()).find((s) => s.page.id === id);
      return found ? structuredClone(found) : null;
    },
    save(input, opts = {}) {
      return serial(async () => {
        const pages = await read();
        const page = prepareForSave(input, pages.map((s) => s.page));
        checkRevision(
          pages.find((s) => s.page.id === page.id),
          opts.expectedRevision,
          page.id,
        );
        const next = pages.filter((s) => s.page.id !== page.id).map((s) => s.page);
        next.push(page);
        await write(next);
        return { page, revision: revisionOf(page), updatedAt: new Date().toISOString() };
      });
    },
    delete(id, opts = {}) {
      return serial(async () => {
        const pages = await read();
        checkRevision(
          pages.find((s) => s.page.id === id),
          opts.expectedRevision,
          id,
        );
        if (!pages.some((s) => s.page.id === id)) return;
        await write(pages.filter((s) => s.page.id !== id).map((s) => s.page));
      });
    },
  };
}
