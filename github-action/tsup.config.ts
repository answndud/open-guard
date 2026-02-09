import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "github-action/index.ts",
  },
  format: ["esm"],
  target: "node20",
  outDir: "github-action/dist",
  dts: false,
  sourcemap: true,
  splitting: false,
  clean: true,
});
