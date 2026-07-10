import { useMemo } from "react";
import { createRustLayout, type LayoutEngine } from "@r4pm/components";
import { elkLayout } from "@r4pm/components/elk-layout";
import { layoutTransport } from "../../backends";
import { usePreferences } from "../../stores";
import { renderGraphSvg } from "./render-graph-svg";

/**
 * The studio's layout engine for the current `layoutEngine` preference, supplied to every viewer via
 * `ViewerConfig.layout` (see `AppViewerConfig`). Rust runs on the active backend (`layoutTransport`);
 * ELK runs in-browser. SVG export always goes through the backend's `export_graph_svg` binding
 * (`renderGraphSvg`), matching the screen under either engine. No viz-layout wasm is imported here,
 * so the app bundles none of it.
 */
export function useLayoutDefaults(): LayoutEngine {
  const engine = usePreferences((s) => s.layoutEngine);
  const diagonal = usePreferences((s) => s.dfgRouting) === "diagonal";
  return useMemo<LayoutEngine>(
    () =>
      engine === "rust"
        ? { ...createRustLayout(layoutTransport, { diagonal }), renderSvg: renderGraphSvg }
        : { ...elkLayout, renderSvg: renderGraphSvg },
    [engine, diagonal],
  );
}
