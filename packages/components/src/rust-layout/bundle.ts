import { createRustDeclareLayout } from "../oc-declare/rust-declare-layout";
import { createRustPetriLayout } from "../petri/editor/helpers/layout-graph";
import type { LayoutEngine } from "../viewer/viewer-config";
import { createRustDfgLayout, createRustOcdfgLayout, type LayoutTransport } from "./index";

/**
 * Assemble a full Rust `LayoutEngine` (all graph surfaces) bound to one `LayoutTransport`. `renderSvg`
 * is left unset: use `wasmLayout` from `@r4pm/components/rust-layout/wasm` for the in-browser wasm
 * renderer, or add your backend's `export_graph_svg` renderer. Call this only when running the engine
 * on your own transport (e.g. a backend binding); for in-browser wasm, prefer the ready `wasmLayout`.
 */
export function createRustLayout(
  transport: LayoutTransport,
  opts?: { diagonal?: boolean },
): LayoutEngine {
  const diagonal = opts?.diagonal ?? true;
  return {
    dfg: createRustDfgLayout(transport, diagonal),
    ocdfg: createRustOcdfgLayout(transport, diagonal),
    declare: createRustDeclareLayout(transport),
    petri: createRustPetriLayout(transport),
  };
}
