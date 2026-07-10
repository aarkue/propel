// Opt-in ELK (elkjs) layout engine bundle. Import `elkLayout` and pass it through
// `ViewerConfigProvider value={{ layout: elkLayout }}`, or use a single fn via a viewer's
// `layoutOverride` prop. elkjs loads lazily on first layout, tree-shaken away for consumers that
// never import this module.
import { elkDeclareLayout } from "../oc-declare/elk-declare-layout";
import { elkLayoutPetriNet } from "../petri/editor/helpers/elk-layout-graph";
import type { LayoutEngine } from "../viewer/viewer-config";
import { createElkDfgLayout, createElkGraphLayout } from "./dfg";

export { createElkDfgLayout, createElkGraphLayout, elkDeclareLayout, elkLayoutPetriNet };

/** Ready ELK `LayoutEngine` covering every graph surface. Pure JS (no backend, no wasm); good default.
 *  No `renderSvg` (SVG image export needs the wasm or a backend renderer). */
export const elkLayout: LayoutEngine = {
  dfg: createElkDfgLayout(),
  ocdfg: createElkGraphLayout("TB"),
  declare: elkDeclareLayout,
  petri: elkLayoutPetriNet,
};
