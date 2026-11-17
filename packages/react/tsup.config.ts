import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  external: ["react", "@contentcore/core"],
  // Everything here uses hooks or context, so mark the entry as a client module for
  // React Server Components (Next.js). Server code imports @contentcore/core directly.
  banner: { js: '"use client";' },
});
