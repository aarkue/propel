// A mapping is a node on the canvas, not a row in a side panel. It reads exactly one node's rows
// (`Mapping.node`), which is an edge; and what it produces (an event, an object, a relation) is the
// point of the whole blueprint, so it gets the same visual weight as the tables feeding it. This
// mirrors OCPQ's `ExtractorNode`, which is what the previous editor got right.
import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { IconType } from "react-icons";
import { PiArrowsLeftRight, PiCalendarDots, PiCube, PiListNumbers } from "react-icons/pi";
import { useEditContext } from "../edit/edit-context";
import { entryTargetKind } from "../model";
import { categoryOf, mappingSummaryLines, mappingTitle, TARGET_LABEL } from "../node-summary";
import { KIND_ACCENT, NodeShell, SummaryRows } from "./NodeShell";
import { NODE_SIZE, type MappingNodeData } from "./types";

const TARGET_ICON: Record<string, IconType> = {
  event: PiCalendarDots,
  object: PiCube,
  e2o: PiArrowsLeftRight,
  o2o: PiArrowsLeftRight,
};

export function MappingNode({ id, data, selected }: NodeProps & { data: MappingNodeData }) {
  const { mapping, errorCount, hasSource } = data;
  const edit = useEditContext();
  const entry = mapping.entry;
  const kind = entryTargetKind(entry);
  const category = categoryOf(kind);
  const Icon = entry.type === "ordered" ? PiListNumbers : (kind && TARGET_ICON[kind]) || PiCube;
  const accent = KIND_ACCENT[category];

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!size-3 !border-2"
        style={{ background: `var(--${accent}-9)`, borderColor: "var(--color-panel-solid)" }}
      />
      <NodeShell
        id={id}
        kind={category}
        icon={<Icon size={13} />}
        title={mappingTitle(entry)}
        subtitle={entry.type === "ordered" ? "ordered group" : kind ? TARGET_LABEL[kind] : undefined}
        selected={selected}
        errorCount={errorCount}
        warning={hasSource ? undefined : "No source connected"}
        width={NODE_SIZE.mapping.width}
        deleteLabel="Delete mapping"
        onEdit={edit ? () => edit.onEditMapping(id) : undefined}
      >
        <SummaryRows lines={mappingSummaryLines(entry)} />
      </NodeShell>
    </>
  );
}
