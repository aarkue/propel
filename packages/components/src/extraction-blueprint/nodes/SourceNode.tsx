import { Handle, type NodeProps, Position } from "@xyflow/react";
import { useMemo, useState } from "react";
import { PiCaretDown, PiCaretUp, PiTable } from "react-icons/pi";
import { useEditContext } from "../edit/edit-context";
import { declaredKind, previewSamples, type ValueKind } from "../schema-resolution";
import { NodeShell } from "./NodeShell";
import { NODE_SIZE, type BlueprintNodeData } from "./types";

const MAX_VISIBLE_COLS = 8;

/** Short marker plus color per resolved value kind, so a column list reads as a schema rather than
 *  as a wall of source-specific type spellings (`int4`, `INTEGER`, `NUMBER(10)` all show `int`).
 *  The verbatim `col_type` stays in the row's tooltip. */
const KIND_MARK: Record<ValueKind, { label: string; color: string }> = {
  boolean: { label: "bool", color: "var(--amber-11)" },
  integer: { label: "int", color: "var(--blue-11)" },
  float: { label: "num", color: "var(--blue-11)" },
  timestamp: { label: "time", color: "var(--orange-11)" },
  text: { label: "abc", color: "var(--gray-10)" },
};

/** `Source { source_id, table }`: no incoming edges, one source handle. Shows the table's columns
 *  the way OCPQ's TableNode did -- the schema is what a user needs in front of them while wiring
 *  mappings, so it belongs on the node face, not behind a click. */
export function SourceNode({ id, data, selected }: NodeProps & { data: BlueprintNodeData }) {
  const { node, errorCount, columns } = data;
  const edit = useEditContext();
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);
  // Narrowed rather than early-returned, so every hook below still runs unconditionally.
  const op = node.op.type === "source" ? node.op : undefined;
  const preview = op && edit?.catalog.previews?.[op.source_id]?.[op.table];
  const connected = !op || !edit || !!edit.connections[op.source_id];
  // One pass for the whole node; `previewSamples` per column rescans every preview row.
  const sampleByColumn = useMemo(() => {
    const out = new Map<string, string>();
    if (!preview) return out;
    for (const name of preview.columns) {
      const sample = previewSamples(preview, name, 1)?.[0];
      if (sample !== undefined) out.set(name, sample);
    }
    return out;
  }, [preview]);

  if (!op) return null;

  const entries = columns ? Object.entries(columns) : [];
  const visible =
    showAll || entries.length <= MAX_VISIBLE_COLS ? entries : entries.slice(0, MAX_VISIBLE_COLS);
  const hidden = entries.length - visible.length;

  return (
    <>
      <NodeShell
        id={id}
        kind="source"
        icon={<PiTable size={13} />}
        title={node.label || op.table || node.id}
        subtitle={op.source_id}
        selected={selected}
        errorCount={errorCount}
        // The most common reason a table has no columns is that its source was never connected,
        // which "Schema not discovered" did not say and the canvas did not show at all.
        warning={!connected ? "No connection" : entries.length === 0 ? "Schema not discovered" : undefined}
        onWarningClick={!connected ? edit?.onOpenConnections : undefined}
        width={NODE_SIZE.source.width}
        deleteLabel="Remove table"
        onEdit={edit ? () => edit.onEditNode(id) : undefined}
        onAddChild={edit ? () => edit.onAddChild(id) : undefined}
      >
        {entries.length > 0 && (
          <button
            type="button"
            className="nodrag -mx-0.5 flex cursor-pointer items-center gap-1 rounded border-none bg-transparent px-0.5 py-px text-[9px] uppercase tracking-wide opacity-55 transition-opacity hover:opacity-90"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          >
            {expanded ? <PiCaretUp size={9} /> : <PiCaretDown size={9} />}
            {entries.length} columns
          </button>
        )}
        {expanded &&
          visible.map(([name, col]) => {
            const kind = declaredKind(col.col_type);
            const mark = kind ? KIND_MARK[kind] : undefined;
            const sample = sampleByColumn.get(name);
            return (
              <div
                key={name}
                className="flex min-w-0 items-baseline gap-1.5"
                title={`${name}: ${col.col_type}${col.nullable ? " (nullable)" : ""}${
                  sample ? ` -- e.g. ${sample}` : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate font-mono text-[10px]">{name}</span>
                {sample && (
                  <span
                    className="min-w-0 max-w-[45%] shrink truncate font-mono text-[9px]"
                    style={{ color: "var(--gray-10)" }}
                  >
                    {sample}
                  </span>
                )}
                <span
                  className="shrink-0 text-[9px] tabular-nums"
                  style={{ color: mark?.color ?? "var(--gray-10)" }}
                >
                  {mark?.label ?? col.col_type}
                </span>
              </div>
            );
          })}
        {expanded && (hidden > 0 || (showAll && entries.length > MAX_VISIBLE_COLS)) && (
          <button
            type="button"
            className="nodrag cursor-pointer border-none bg-transparent p-0 text-left text-[9px] underline decoration-dotted opacity-55 transition-opacity hover:opacity-90"
            onClick={(e) => {
              e.stopPropagation();
              setShowAll(hidden > 0);
            }}
          >
            {hidden > 0 ? `+ ${hidden} more` : "Show fewer"}
          </button>
        )}
      </NodeShell>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="!size-3 !border-2"
        style={{ background: "var(--jade-9)", borderColor: "var(--color-panel-solid)" }}
      />
    </>
  );
}
