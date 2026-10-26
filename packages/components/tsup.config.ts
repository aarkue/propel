import { defineConfig } from "tsup";

// Externalize every bare import (deps/peers); bundle only this package's own `./` source.
export default defineConfig({
  // Per-subpath entries so each published surface (`.`, `/ui`, `/petri`, `/process-tree`, `/charts`,
  // `/extraction-blueprint`, `/viz/wasm`) is its own tree-shaking boundary. `splitting` dedupes shared
  // chunks, so the viz wasm (base64) only lands in the `/viz/wasm` chunk, never the core entry.
  // Must stay in sync with the `exports` map below one-for-one. tsup does not read `exports` itself.
  entry: [
    "src/index.ts",
    "src/ui/index.ts",
    "src/petri/index.ts",
    "src/process-tree/index.ts",
    "src/charts/index.ts",
    "src/extraction-blueprint/index.tsx",
    "src/viz/wasm.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
  external: [/^[^./]/],
});
