import { defineConfig } from "tsup";

// Externalize every bare import (deps/peers); bundle only this package's own `./` source.
export default defineConfig({
  // Per-subpath entries so each published surface (`.`, `/ui`, `/petri`, `/charts`) is its own
  // tree-shaking boundary. `splitting` dedupes shared chunks.
  entry: [
    "src/index.ts",
    "src/ui/index.ts",
    "src/petri/index.ts",
    "src/charts/index.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
  external: [/^[^./]/],
});
