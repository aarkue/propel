import { createRustDeclareLayout } from "../oc-declare/rust-declare-layout";
import { createRustTypeGraphLayout } from "../ocel-type-graph/rust-layout";
import { createRustPetriLayout } from "../petri/editor/helpers/layout-graph";
import { createRustProcessTreeLayout } from "../process-tree/editor/helpers/layout-graph";
import type { LayoutEngine } from "../viewer/viewer-config";
import { createRustDfgLayout, createRustOcdfgLayout, type LayoutTransport } from "./index";

/** Assemble a full Rust `LayoutEngine` (all graph surfaces) bound to one `LayoutTransport`; `renderSvg` is left unset. For in-browser wasm, prefer the ready `wasmLayout`. */
export function createRustLayout(transport: LayoutTransport, opts?: { diagonal?: boolean }): LayoutEngine {
  const diagonal = opts?.diagonal ?? true;
  return {
    dfg: createRustDfgLayout(transport, diagonal),
    ocdfg: createRustOcdfgLayout(transport, diagonal),
    declare: createRustDeclareLayout(transport),
    petri: createRustPetriLayout(transport),
    processTree: createRustProcessTreeLayout(transport),
    typeGraph: createRustTypeGraphLayout(transport, { diagonal }),
  };
}
