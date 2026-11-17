import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/fs.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2020",
});
