import { defineConfig } from "tsup";

// Externalize every bare import (deps/peers); bundle only this package's own `./` source.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: [/^[^.]/],
});
