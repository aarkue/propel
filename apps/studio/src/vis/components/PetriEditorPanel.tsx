import { useCallback, useState } from "react";
import { Editor, nodesToPetriNet, type ArcData, type PetriNetNode } from "@r4pm/components/petri";
import type { PetriNet } from "@r4pm/components";
import type { Edge } from "@xyflow/react";
import { PetriNetActions } from "./PetriNetActions";

const EMPTY_NODES: PetriNetNode[] = [];
const EMPTY_EDGES: Edge<ArcData>[] = [];
const EMPTY_NET: PetriNet = {
  places: [],
  transitions: [],
  arcs: [],
  initial_marking: null,
  final_marking: null,
};

/** Standalone "create new Petri net" panel: blank canvas + PNML import, with backend
 *  Save/Export actions on the live edited net. Image export via the surrounding frame. */
export function PetriEditorPanel() {
  const [net, setNet] = useState<PetriNet>(EMPTY_NET);
  const handleChange = useCallback(
    (nodes: PetriNetNode[], edges: Edge<ArcData>[]) => setNet(nodesToPetriNet(nodes, edges)),
    [],
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
          // Reserve the top-right corner for the export frame's floating download-image button.
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
          initialNodes={EMPTY_NODES}
          initialEdges={EMPTY_EDGES}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
