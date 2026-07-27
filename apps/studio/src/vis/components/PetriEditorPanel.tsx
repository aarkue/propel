import { useCallback, useMemo } from "react";
import { Editor, nodesToPetriNet, type ArcData, type PetriNetNode } from "@r4pm/components/petri";
import type { IDockviewPanelProps } from "dockview";
import type { Edge } from "@xyflow/react";
import { usePanelDraft } from "../../panels/panel-state";
import { PetriNetActions } from "./PetriNetActions";

interface EditorGraph {
  nodes: PetriNetNode[];
  edges: Edge<ArcData>[];
}
const EMPTY_GRAPH: EditorGraph = { nodes: [], edges: [] };

/** Persist the editor graph (nodes/edges with layout), not the collapsed net: nodesToPetriNet drops positions. */
export function PetriEditorPanel(props: IDockviewPanelProps) {
  const [graph, setGraph] = usePanelDraft<EditorGraph>(props, "graph", EMPTY_GRAPH);
  const net = useMemo(() => nodesToPetriNet(graph.nodes, graph.edges), [graph]);
  const handleChange = useCallback(
    (nodes: PetriNetNode[], edges: Edge<ArcData>[]) => setGraph({ nodes, edges }),
    [setGraph],
  );
  return (
    <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column" }}>
      <div
        data-export-ignore
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          padding: 4,
          // Reserve top-right for the export frame's floating download-image button.
          paddingRight: 48,
          borderBottom: "1px solid var(--gray-5)",
        }}
      >
        <PetriNetActions net={net} />
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <Editor
          editable
          showExportControls={false}
          initialNodes={graph.nodes}
          initialEdges={graph.edges}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
