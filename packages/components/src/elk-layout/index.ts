// opt-in ELK (elkjs) layout engine bundle; loads lazily, tree-shaken for consumers that never import it
import { elkDeclareLayout } from "../oc-declare/elk-declare-layout";
import { layoutTypeGraph } from "../ocel-type-graph/elk-layout";
import { elkLayoutPetriNet } from "../petri/editor/helpers/elk-layout-graph";
import { elkLayoutProcessTree } from "../process-tree/editor/helpers/elk-layout-graph";
import type { LayoutEngine } from "../viewer/viewer-config";
import { createElkDfgLayout, createElkGraphLayout } from "./dfg";

export {
  createElkDfgLayout,
  createElkGraphLayout,
  elkDeclareLayout,
  elkLayoutPetriNet,
  elkLayoutProcessTree,
  layoutTypeGraph,
};

/** Ready ELK `LayoutEngine` covering every graph surface. Pure JS (no backend, no wasm); good default.
 *  No `renderSvg` (SVG image export needs the wasm or a backend renderer). */
export const elkLayout: LayoutEngine = {
  dfg: createElkDfgLayout(),
  ocdfg: createElkGraphLayout("TB"),
  declare: elkDeclareLayout,
  petri: elkLayoutPetriNet,
  processTree: elkLayoutProcessTree,
  typeGraph: layoutTypeGraph,
};
