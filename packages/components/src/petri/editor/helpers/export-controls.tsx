import { useReactFlow } from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import type { ArcData, PetriNetNode } from "../Editor";
import { buildPetriNetSvg, downloadSvg, downloadSvgAsPng } from "./petri-svg";

/** PNG/SVG export of the net as vector SVG (real circles/rects/paths,
 *  not a DOM snapshot); PNG is the same SVG rasterized client-side. */
export function ExportControls() {
  const { getNodes, getEdges } = useReactFlow();

  const run = async (format: "png" | "svg") => {
    const svg = buildPetriNetSvg(getNodes() as PetriNetNode[], getEdges() as Edge<ArcData>[]);
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
