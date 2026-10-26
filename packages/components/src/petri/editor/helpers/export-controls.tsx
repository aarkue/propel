import { useReactFlow } from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import type { ArcData, PetriNetNode } from "../Editor";
import type { VizTransport } from "../../../viz";
import { useViewerConfig } from "../../../viewer/viewer-config";
import { downloadSvg, downloadSvgAsPng } from "./petri-svg";
import type { PetriElements } from "./viz-layout";
import { type PetriVizNet, vizNetSvg } from "./viz-net";

/** PNG/SVG export of the net as rust4pm draws it at the on-screen positions. PNG is the same SVG
 *  rasterized client-side. `netOf` gives the net to draw. */
export function ExportControls({
  viz,
  netOf,
}: {
  viz: VizTransport;
  netOf: (elements: PetriElements) => PetriVizNet;
}) {
  const { getNodes, getEdges } = useReactFlow();
  const { colorOf } = useViewerConfig({});

  const run = async (format: "png" | "svg") => {
    const elements = { nodes: getNodes() as PetriNetNode[], edges: getEdges() as Edge<ArcData>[] };
    const svg = await vizNetSvg(viz, netOf(elements), elements, (type) => colorOf?.("objectType", type));
    if (!svg) return;
    if (format === "svg") downloadSvg(svg, "petri-net.svg");
    else await downloadSvgAsPng(svg, "petri-net.png");
  };

  return (
    <div className="pn-export">
      <button type="button" className="pn-export-btn" title="Download PNG" onClick={() => void run("png")}>
        PNG
      </button>
      <button type="button" className="pn-export-btn" title="Download SVG" onClick={() => void run("svg")}>
        SVG
      </button>
    </div>
  );
}
