import type { BackendContext } from "@r4pm/client";
import { setBackend } from "../shell/backend-singleton";
import { createWasmBackend } from "@backend-wasm";
import { createHttpBackend } from "./http";
import { createTauriBackend } from "./tauri";

export { createWasmBackend, createHttpBackend, createTauriBackend };

/**
 * Pick the backend for this build/runtime, first match wins:
 *  1. Tauri injects `__TAURI_INTERNALS__` -> desktop app;
 *  2. `VITE_BACKEND=http` (webserver build/dev mode) -> axum over HTTP;
 *  3. else the in-process WASM engine.
 */
export function detectBackend(): BackendContext {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return createTauriBackend();
  }
  if (import.meta.env.VITE_BACKEND === "http") {
    return createHttpBackend(import.meta.env.VITE_API_URL ?? "/api");
  }
  return createWasmBackend();
}

/** The single backend instance for this build/runtime, selected once at module load. */
export const backend: BackendContext = detectBackend();

// Expose on the shell singleton, reached via `getBackend()`.
setBackend(backend);
