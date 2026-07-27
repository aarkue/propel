import { SegmentedControl } from "@r4pm/components/ui";
import type { ReactNode } from "react";
import type { StyledGraphRenderer } from "./graph-svg/styled-graph";
import { ProcessTreeViewer } from "./process-tree";
import type { ProcessTree } from "./process-tree/tree";
import { useWorkbench, type WorkbenchMode } from "./shared/use-workbench";
import type { ViewerProps } from "./viewer/viewer-config";

export type ProcessTreeMode = Extract<WorkbenchMode, "view" | "edit">;

export interface ProcessTreeWorkbenchProps extends ViewerProps<ProcessTree> {
  /** Mode shown on mount. Defaults to "view". */
  initialMode?: ProcessTreeMode;
  /** Fired whenever the current (possibly edited) tree changes. */
  onTreeChange?: (tree: ProcessTree) => void;
  /** Host-supplied buttons; receive the current tree. */
  toolbar?: (tree: ProcessTree) => ReactNode;
  renderSvg?: StyledGraphRenderer;
}

/** View / Edit toggle over one process tree. Pure. */
export function ProcessTreeWorkbench({
  data,
  initialMode = "view",
  onTreeChange,
  toolbar,
  renderSvg,
}: ProcessTreeWorkbenchProps) {
  const {
    mode,
    setMode,
    currentNet: currentTree,
    editSeed,
    handleEdit,
    enterEdit,
  } = useWorkbench(data, onTreeChange, initialMode);

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
            setMode(v as ProcessTreeMode);
          }}
        >
          <SegmentedControl.Item value="view">View</SegmentedControl.Item>
          <SegmentedControl.Item value="edit">Edit</SegmentedControl.Item>
        </SegmentedControl.Root>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>{toolbar?.(currentTree)}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {mode === "view" && <ProcessTreeViewer data={currentTree} renderSvg={renderSvg} />}
        {mode === "edit" && (
          <ProcessTreeViewer data={editSeed} editable onChange={handleEdit} renderSvg={renderSvg} />
        )}
      </div>
    </div>
  );
}
