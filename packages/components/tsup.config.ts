import { defineConfig } from "tsup";

// Externalize every bare import (deps/peers); bundle only this package's own `./` source.
export default defineConfig({
  // Per-subpath entries so each published surface (`.`, `/ui`, `/petri`, `/charts`, `/elk-layout`,
  // `/rust-layout/wasm`) is its own tree-shaking boundary. `splitting` dedupes shared chunks, so the
  // viz-layout wasm (base64) only lands in the `/rust-layout/wasm` chunk, never the core entry.
  entry: [
    "src/index.ts",
    "src/ui/index.ts",
    "src/petri/index.ts",
    "src/charts/index.ts",
    "src/elk-layout/index.ts",
    "src/rust-layout/wasm.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
  external: [/^[^./]/],
});
