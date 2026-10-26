import { useState, type ReactNode } from "react";
import { SegmentedControl, Switch, Text } from "@r4pm/components/ui";
import { PetriNetViewer, type PetriNet } from "./petri-net";
import { PetriNetSimulator, type SimTrace } from "./petri-net-simulator";
import { useWorkbench, type WorkbenchMode } from "./shared/use-workbench";
import type { ViewerProps } from "./viewer/viewer-config";

export type PetriNetMode = WorkbenchMode;

export interface PetriNetWorkbenchProps extends ViewerProps<PetriNet> {
  /** Mode shown on mount. Defaults to "view". */
  initialMode?: PetriNetMode;
  /** Fired whenever the current (possibly edited) net changes. */
  onNetChange?: (net: PetriNet) => void;
  /** Host-supplied buttons (e.g. backend PNML export); receive the current net. */
  toolbar?: (net: PetriNet) => ReactNode;
  /** Host handler to turn the recorded replay traces into an event-log dataset. When
   *  set, the replay view shows a "Save as log" button. */
  onSaveTraceAsLog?: (traces: SimTrace[]) => void;
  /** Initial state of the replay view's "Force fire" toggle (force-fire not-enabled
   *  transitions, token-replay style). Defaults to off; the user can flip it in the toolbar. */
  allowForcedFiring?: boolean;
}

/** View / Replay / Edit toggle over one Petri net. Pure. */
export function PetriNetWorkbench({
  data,
  initialMode = "view",
  onNetChange,
  toolbar,
  onSaveTraceAsLog,
  allowForcedFiring = false,
}: PetriNetWorkbenchProps) {
  const { mode, setMode, currentNet, editSeed, handleEdit, enterEdit } = useWorkbench(
    data,
    onNetChange,
    initialMode,
  );
  const [forceFire, setForceFire] = useState(allowForcedFiring);

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
            setMode(v as PetriNetMode);
          }}
        >
          <SegmentedControl.Item value="view">View</SegmentedControl.Item>
          <SegmentedControl.Item value="simulate">Replay</SegmentedControl.Item>
          <SegmentedControl.Item value="edit">Edit</SegmentedControl.Item>
        </SegmentedControl.Root>
        {mode === "simulate" && (
          <Text
            as="label"
            size="1"
            color="gray"
            title="Allow firing not-enabled transitions; missing tokens are counted (token replay)"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Switch size="1" checked={forceFire} onCheckedChange={setForceFire} />
            Force fire
          </Text>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>{toolbar?.(currentNet)}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {mode === "view" && <PetriNetViewer data={currentNet} />}
        {mode === "simulate" && (
          <PetriNetSimulator data={currentNet} onSaveAsLog={onSaveTraceAsLog} allowForcedFiring={forceFire} />
        )}
        {mode === "edit" && <PetriNetViewer data={editSeed} editable onChange={handleEdit} />}
      </div>
    </div>
  );
}
