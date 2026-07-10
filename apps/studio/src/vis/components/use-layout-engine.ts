import { useMemo } from "react";
import {
  createRustDeclareLayout,
  createRustDfgLayout,
  createRustOcdfgLayout,
  type LayoutDefaults,
} from "@r4pm/components";
import {
  createElkDfgLayout,
  createElkGraphLayout,
  elkDeclareLayout,
  elkLayoutPetriNet,
} from "@r4pm/components/elk-layout";
import { createRustPetriLayout } from "@r4pm/components/petri";
import { layoutTransport } from "../../backends";
import { usePreferences } from "../../stores";
import { renderGraphSvg } from "./render-graph-svg";

/**
 * The studio's default layout engine bundle for the current `layoutEngine` preference, supplied to
 * every viewer via `ViewerConfig.layout` (see `AppViewerConfig`). Rust layouts run on the active
 * backend (`layoutTransport`); ELK runs in-browser. SVG export always goes through the backend's
 * `export_graph_svg` binding (`renderGraphSvg`), matching the screen under either engine. The
 * components' inlined viz-layout wasm is never imported here, so the app bundles none of it.
 */
export function useLayoutDefaults(): LayoutDefaults {
  const engine = usePreferences((s) => s.layoutEngine);
  const diagonal = usePreferences((s) => s.dfgRouting) === "diagonal";
  return useMemo<LayoutDefaults>(
    () =>
      engine === "rust"
        ? {
            dfg: createRustDfgLayout(layoutTransport, diagonal),
            ocdfg: createRustOcdfgLayout(layoutTransport, diagonal),
            declare: createRustDeclareLayout(layoutTransport),
            petri: createRustPetriLayout(layoutTransport),
            renderSvg: renderGraphSvg,
          }
        : {
            dfg: createElkDfgLayout(),
            ocdfg: createElkGraphLayout("TB"),
            declare: elkDeclareLayout,
            petri: elkLayoutPetriNet,
            renderSvg: renderGraphSvg,
          },
    [engine, diagonal],
  );
}
