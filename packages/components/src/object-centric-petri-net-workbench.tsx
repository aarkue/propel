import type { ReactNode } from "react";
import { SegmentedControl } from "@r4pm/components/ui";
import { ObjectCentricPetriNetViewer, type ObjectCentricPetriNet } from "./object-centric-petri-net";
import { ObjectCentricPetriNetSimulator } from "./object-centric-petri-net-simulator";
import { useWorkbench, type WorkbenchMode } from "./shared/use-workbench";
import type { OcSequenceStep } from "./shared/ObjectCentricSequence";
import type { ViewerProps } from "./viewer/viewer-config";

export type OcpnMode = WorkbenchMode;

export interface ObjectCentricPetriNetWorkbenchProps extends ViewerProps<ObjectCentricPetriNet> {
  /** Mode shown on mount. Defaults to "view". */
  initialMode?: OcpnMode;
  /** Fired whenever the current (possibly edited) net changes. */
  onNetChange?: (net: ObjectCentricPetriNet) => void;
  /** Host-supplied buttons (e.g. backend PNML export); receive the current net. */
  toolbar?: (net: ObjectCentricPetriNet) => ReactNode;
  /** Host handler to turn a simulation trace into an OCEL. When set, the simulator shows a
   *  "Save as OCEL" button. */
  onSaveTraceAsLog?: (trace: OcSequenceStep[]) => void;
}

/** View / Replay / Edit toggle over one object-centric Petri net. Pure. */
export function ObjectCentricPetriNetWorkbench({
  data,
  initialMode = "view",
  onNetChange,
  toolbar,
  onSaveTraceAsLog,
}: ObjectCentricPetriNetWorkbenchProps) {
  const { mode, setMode, currentNet, editSeed, handleEdit, enterEdit } = useWorkbench(
    data,
    onNetChange,
    initialMode,
  );

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* paddingRight reserves the top-right corner for the frame's floating export button. */}
      <div
        data-export-ignore
        style={{
          display: "flex",
          gap: 8,
          padding: 4,
          paddingRight: 48,
          alignItems: "center",
          borderBottom: "1px solid var(--gray-5)",
        }}
      >
        <SegmentedControl.Root
          size="1"
          value={mode}
          onValueChange={(v) => {
            if (v === "edit") enterEdit();
            setMode(v as OcpnMode);
          }}
        >
          <SegmentedControl.Item value="view">View</SegmentedControl.Item>
          <SegmentedControl.Item value="simulate">Replay</SegmentedControl.Item>
          <SegmentedControl.Item value="edit">Edit</SegmentedControl.Item>
        </SegmentedControl.Root>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>{toolbar?.(currentNet)}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {mode === "view" && <ObjectCentricPetriNetViewer data={currentNet} />}
        {mode === "simulate" && (
          <ObjectCentricPetriNetSimulator data={currentNet} onSaveAsLog={onSaveTraceAsLog} />
        )}
        {mode === "edit" && <ObjectCentricPetriNetViewer data={editSeed} editable onChange={handleEdit} />}
      </div>
    </div>
  );
}
