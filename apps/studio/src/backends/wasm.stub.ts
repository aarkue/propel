import type { BackendContext } from "@r4pm/client";

// `@backend-wasm` alias resolves here for tauri/webserver builds so the wasm engine stays unbundled.
// Never called: detectBackend picks the native/HTTP backend there.
export function createWasmBackend(): BackendContext {
  throw new Error("wasm engine is not bundled in this build");
}
