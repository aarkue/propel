// only module that imports the viz-layout wasm; consumers that never import this file bundle no wasm
import { createRustDeclareLayout } from "../oc-declare/rust-declare-layout";
import type { StyledGraphRenderer } from "../graph-svg/styled-graph";
import { createRustTypeGraphLayout } from "../ocel-type-graph/rust-layout";
import { createRustPetriLayout } from "../petri/editor/helpers/layout-graph";
import { createRustProcessTreeLayout } from "../process-tree/editor/helpers/layout-graph";
import type { LayoutEngine } from "../viewer/viewer-config";
import { createRustDfgLayout, createRustOcdfgLayout, type LayoutTransport } from "./index";

// lazy wasm loader: the ~460KB engine only loads when a Rust layout is actually requested
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

/** Override where the viz-layout wasm loads from (default: embedded base64). Must be called before the first layout. */
export function setRustLayoutWasm(source: RustLayoutWasmSource): void {
  if (modPromise) {
    throw new Error("setRustLayoutWasm() must be called before the first Rust layout request.");
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

/** Draws a laid-out, styled `StyledGraph` to SVG via the bundled wasm `export_graph_svg`; pass as a viewer's `renderSvg`. */
export const wasmRenderStyledGraph: StyledGraphRenderer = async (graph) => {
  const mod = await loadWasm();
  return mod.export_graph_svg(JSON.stringify(graph), "");
};

// layout fns pre-bound to wasmTransport; lazy, so importing one you don't invoke costs nothing
export const wasmDfgLayout = createRustDfgLayout(wasmTransport);
export const wasmOcdfgLayout = createRustOcdfgLayout(wasmTransport);
export const wasmDeclareLayout = createRustDeclareLayout(wasmTransport);
export const wasmPetriLayout = createRustPetriLayout(wasmTransport);
export const wasmProcessTreeLayout = createRustProcessTreeLayout(wasmTransport);
export const wasmTypeGraphLayout = createRustTypeGraphLayout(wasmTransport);

/** Ready wasm `LayoutEngine` covering every graph surface plus the SVG renderer; pass via `ViewerConfigProvider`. */
export const wasmLayout: LayoutEngine = {
  dfg: wasmDfgLayout,
  ocdfg: wasmOcdfgLayout,
  declare: wasmDeclareLayout,
  petri: wasmPetriLayout,
  processTree: wasmProcessTreeLayout,
  typeGraph: wasmTypeGraphLayout,
  renderSvg: wasmRenderStyledGraph,
};
