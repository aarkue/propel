// The only module that imports the viz wasm. Consumers that never import this file bundle no wasm.
import type { VizTransport } from "./index";

type WasmMod = typeof import("./pkg/viz_wasm.js");
let modPromise: Promise<WasmMod> | null = null;

/** Where the viz wasm is loaded from. wasm-bindgen's init accepts any of these. */
export type VizWasmSource =
  | string
  | URL
  | Request
  | Response
  | Promise<Response>
  | BufferSource
  | WebAssembly.Module;

let wasmSourceOverride: VizWasmSource | undefined;

/** Override where the viz wasm loads from (default: embedded base64). Must be called before the first call. */
export function setVizWasm(source: VizWasmSource): void {
  if (modPromise) {
    throw new Error("setVizWasm() must be called before the first viz call.");
  }
  wasmSourceOverride = source;
}

/** Decode the embedded base64 wasm into bytes, via `atob` with a `Buffer` fallback for exotic runtimes. */
async function embeddedWasmBytes(): Promise<Uint8Array> {
  const { wasmBase64 } = await import("./pkg/wasm-inline.js");
  const g = globalThis as {
    atob?: (s: string) => string;
    Buffer?: { from(s: string, e: string): Uint8Array };
  };
  if (typeof g.atob === "function") return Uint8Array.from(g.atob(wasmBase64), (c) => c.charCodeAt(0));
  if (g.Buffer) return new Uint8Array(g.Buffer.from(wasmBase64, "base64"));
  throw new Error("No base64 decoder (atob/Buffer) available to load the viz wasm.");
}

async function loadWasm(): Promise<WasmMod> {
  if (!modPromise) {
    modPromise = (async () => {
      try {
        const mod = await import("./pkg/viz_wasm.js");
        const source = wasmSourceOverride ?? (await embeddedWasmBytes());
        await mod.default({ module_or_path: source });
        return mod;
      } catch (err) {
        modPromise = null; // don't cache the failure: a later call may retry
        throw new Error(`viz wasm failed to load: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
  }
  return modPromise;
}

/** rust4pm's visualization in the browser, through the embedded wasm (loaded on first use). */
export const wasmViz: VizTransport = {
  async call(fn, args) {
    const mod = await loadWasm();
    return JSON.parse(mod.call(fn, JSON.stringify(args)));
  },
};
