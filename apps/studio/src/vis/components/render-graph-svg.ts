import type { StyledGraph } from "@r4pm/client";
import { backend } from "../../backends";

/**
 * Draw a caller-built on-screen `StyledGraph` to a standalone SVG via the generic `export_graph_svg`
 * binding. Pure draw (no re-layout), so the export matches the screen under any layout engine, and it
 * runs on whichever backend is active. Stable identity, so passing it as `renderSvg` never churns the
 * viewer's export registration.
 */
export const renderGraphSvg = (graph: StyledGraph): Promise<string> =>
  backend.callBinding("app_bindings::viz::export_graph_svg", { graph, palette: null });
