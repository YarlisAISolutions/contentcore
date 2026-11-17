/** Shared helpers for the verify-* scripts: pack the packages, install them like a consumer would. */
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { $ } from "bun";

export const root = resolve(import.meta.dir, "..");
export const isWindows = process.platform === "win32";

export function workDir(name: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), `contentcore-${name}-`));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) };
}

const allowed = /^package\/(dist\/.+|README\.md|LICENSE|package\.json)$/;
const required = ["package/README.md", "package/LICENSE", "package/dist/index.js", "package/dist/index.cjs", "package/dist/index.d.ts", "package/dist/index.d.cts"];
// dist/ may also hold subpath entries (core/fs) and shared chunks.

/** `npm pack` both packages into `dir`, checking the tarball contents. Returns tarball paths. */
export type Tarballs = { core: string; react: string; editor: string };

export async function packAll(dir: string, log = true): Promise<Tarballs> {
  const out: Record<string, string> = {};
  for (const pkg of ["core", "react", "editor"]) {
    const result = (await $`npm pack --json --pack-destination ${dir}`.cwd(join(root, "packages", pkg)).quiet().json()) as Array<{
      filename: string;
      files: { path: string }[];
      size: number;
    }>;
    const info = result[0]!;
    const paths = info.files.map((f) => `package/${f.path}`);
    const bad = paths.filter((p) => !allowed.test(p));
    if (bad.length) throw new Error(`@contentcore/${pkg} tarball has unexpected files: ${bad.join(", ")}`);
    for (const r of required) if (!paths.includes(r)) throw new Error(`@contentcore/${pkg} tarball is missing ${r}`);
    out[pkg] = join(dir, info.filename);
    if (log) console.log(`✓ @contentcore/${pkg}: ${info.files.length} files, ${(info.size / 1024).toFixed(1)} kB packed`);
  }
  return out as Tarballs;
}

/** Copy an example into `dir` and install it with the packed tarballs instead of the registry versions. */
export async function installExample(example: string, dir: string, tarballs: Tarballs, extra: string[] = []) {
  const app = join(dir, example);
  cpSync(join(root, "examples", example), app, {
    recursive: true,
    filter: (src) => !src.split(sep).some((part) => ["node_modules", "dist", ".next"].includes(part)),
  });
  // Install the packed packages this example depends on (plus core/react, which the others need).
  const pkg = JSON.parse(readFileSync(join(app, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  const wanted = new Set(["core", "react"]);
  if (pkg.dependencies?.["@contentcore/editor"]) wanted.add("editor");
  const local = [...wanted].map((name) => tarballs[name as keyof Tarballs]);
  await $`npm install --no-audit --no-fund --loglevel=error ${local} ${extra}`.cwd(app).quiet();
  await $`npm install --no-audit --no-fund --loglevel=error`.cwd(app).quiet();
  return app;
}

/** Start a server process, wait for "listening on <url>", return the URL and a stop function. */
export async function startServer(cmd: string[], cwd: string, env: Record<string, string> = {}) {
  const proc = Bun.spawn(cmd, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "inherit" });
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
    const match = buffer.match(/listening on (http:\/\/\S+)/);
    if (match) {
      reader.releaseLock();
      return { url: match[1]!, stop: () => proc.kill() };
    }
  }
  proc.kill();
  throw new Error(`${cmd.join(" ")} did not start:\n${buffer}`);
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
