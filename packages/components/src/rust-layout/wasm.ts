// The ONLY module that imports the viz-layout wasm (`./pkg/*`). Import it explicitly - one of the
// pre-bound `wasm*Layout` fns, `wasmTransport`, or `wasmRenderStyledGraph` - to run the bundled Rust
// layout/SVG engine in-browser. Consumers that never import this file bundle no wasm.
import { createRustDeclareLayout } from "../oc-declare/rust-declare-layout";
import type { StyledGraphRenderer } from "../graph-svg/styled-graph";
import { createRustPetriLayout } from "../petri/editor/helpers/layout-graph";
import { createRustDfgLayout, createRustOcdfgLayout, type LayoutTransport } from "./index";

// Lazy wasm loader: the ~460KB layout engine is only instantiated when a Rust layout is actually
// requested (dynamic import gives it its own chunk, tree-shaken away for consumers that never call it).
type WasmMod = typeof import("./pkg/viz_layout_wasm.js");
let modPromise: Promise<WasmMod> | null = null;

/** Where the viz-layout wasm is loaded from. wasm-bindgen's init accepts any of these. */
export type RustLayoutWasmSource =
  | string
  | URL
  | Request
  | Response
  | Promise<Response>
  | BufferSource
  | WebAssembly.Module;

let wasmSourceOverride: RustLayoutWasmSource | undefined;

/**
 * Override where the viz-layout wasm is loaded from. By default the wasm is embedded (base64) in the
 * JS, so this module works in any bundler or runtime (Vite, webpack, esbuild, Node, Deno, Workers)
 * with zero asset-resolution config.
 *
 * Bundle-size-conscious consumers can instead ship the wasm as a separate, cacheable asset and point
 * this at it, e.g. in a Vite app:
 * ```ts
 * import wasmUrl from "@r4pm/components/rust-layout/viz_layout_wasm_bg.wasm?url";
 * setRustLayoutWasm(wasmUrl);
 * ```
 * or with raw bytes / a precompiled `WebAssembly.Module`. Must be called before the first layout.
 */
export function setRustLayoutWasm(source: RustLayoutWasmSource): void {
  if (modPromise) {
    throw new Error("setRustLayoutWasm() must be called before the first Rust layout request.");
  }
  wasmSourceOverride = source;
}

/** Decode the embedded base64 wasm into bytes. Uses `atob` (browsers, Node 16+, Deno, Workers) with a
 *  `Buffer` fallback for exotic runtimes. Imported lazily so it only lands in the async chunk. */
async function embeddedWasmBytes(): Promise<Uint8Array> {
  const { wasmBase64 } = await import("./pkg/wasm-inline.js");
  const g = globalThis as {
    atob?: (s: string) => string;
    Buffer?: { from(s: string, e: string): Uint8Array };
  };
  if (typeof g.atob === "function") return Uint8Array.from(g.atob(wasmBase64), (c) => c.charCodeAt(0));
  if (g.Buffer) return new Uint8Array(g.Buffer.from(wasmBase64, "base64"));
  throw new Error("No base64 decoder (atob/Buffer) available to load the viz-layout wasm.");
}

async function loadWasm(): Promise<WasmMod> {
  if (!modPromise) {
    modPromise = (async () => {
      try {
        const mod = await import("./pkg/viz_layout_wasm.js");
        const source = wasmSourceOverride ?? (await embeddedWasmBytes());
        await mod.default({ module_or_path: source });
        return mod;
      } catch (err) {
        modPromise = null; // don't cache the failure: a later call may retry
        throw new Error(
          `viz-layout wasm failed to load: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();
  }
  return modPromise;
}

/** Transport that runs the bundled Rust engine in-browser via wasm. */
export const wasmTransport: LayoutTransport = {
  async layoutGraph(spec) {
    const mod = await loadWasm();
    return JSON.parse(mod.layout_graph(JSON.stringify(spec)));
  },
  async rerouteGraph(spec) {
    const mod = await loadWasm();
    return JSON.parse(mod.reroute_graph(JSON.stringify(spec)));
  },
};

/** Draws a laid-out, styled `StyledGraph` to SVG via the bundled wasm `export_graph_svg` (the SAME
 *  renderer as the backend binding). Pass as a viewer's `renderSvg` for standalone SVG export. */
export const wasmRenderStyledGraph: StyledGraphRenderer = async (graph) => {
  const mod = await loadWasm();
  return mod.export_graph_svg(JSON.stringify(graph), "");
};

// DFG / OC-DFG / declare / Petri layout fns pre-bound to `wasmTransport`. Lazy: the wasm loads on the
// first call, so importing one you don't invoke costs nothing at runtime.
export const wasmDfgLayout = createRustDfgLayout(wasmTransport);
export const wasmOcdfgLayout = createRustOcdfgLayout(wasmTransport);
export const wasmDeclareLayout = createRustDeclareLayout(wasmTransport);
export const wasmPetriLayout = createRustPetriLayout(wasmTransport);
