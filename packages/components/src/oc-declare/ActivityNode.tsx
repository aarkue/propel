import { ContextMenu } from "@r4pm/components/ui";
import { Handle, type Node, type NodeProps, Position, useConnection } from "@xyflow/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useEditContext } from "./edit/edit-context";
import { type DeclareNode, parseNodeName } from "./model";
import { MultiDot } from "./MultiDot";
import type { ActivityNodeData } from "./types";
import { useVizContext } from "./VizContext";

export const ACT_NODE_WIDTH = 150;
export const ACT_NODE_HEIGHT = 58;

/** Width of the outer connect band in edit mode; kept slim so moving stays the easy default. */
const CONNECT_RING = 10;

type ActivityNodeType = Node<ActivityNodeData, "activity">;

/** Display prefix per node kind. Exported for the SVG exporter (`styled-graph.ts`). */
export const PREFIX: Record<DeclareNode["kind"], string> = { activity: "", init: "<init> ", exit: "<exit> " };

/** Collapse an involvement (min,max) into one of the four cardinality classes. */
function cardClass(min: number, max: number): "0..1" | "0..*" | "1..1" | "1..*" {
  return `${min >= 1 ? "1" : "0"}..${max > 1 ? "*" : "1"}` as "0..1" | "0..*" | "1..1" | "1..*";
}

// Petri-style: the invisible handle covers the whole node; a center "move" overlay carves out the middle for dragging instead. Read-only: inert, just an edge anchor.
function fullCoverHandle(edit: boolean): React.CSSProperties {
  return {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    height: "100%",
    transform: "none",
    borderRadius: 16,
    background: "transparent",
    border: "none",
    opacity: 0,
    zIndex: 0,
    pointerEvents: edit ? "auto" : "none",
    cursor: "crosshair",
  };
}

export function ActivityNode({ id, data }: NodeProps<ActivityNodeType>) {
  const {
    activityColor,
    objectTypeColor,
    focusedNodeId,
    hoveredNodeId,
    hiddenObjectTypes,
    eventTypeCounts,
    showTextLabels,
  } = useVizContext();
  const edit = useEditContext();
  const kind = (data.kind as DeclareNode["kind"] | undefined) ?? "activity";
  const isObject = kind !== "activity";
  const isFocused = focusedNodeId === id;
  const isHovered = hoveredNodeId === id;
  const isDimmed =
    (focusedNodeId !== null && !isFocused) ||
    (hoveredNodeId !== null && hoveredNodeId !== id && focusedNodeId === null);

  const colorBase = isObject ? objectTypeColor(data.label, "normal") : activityColor(data.label, "normal");
  const colorFg = isObject
    ? objectTypeColor(data.label, "foreground")
    : activityColor(data.label, "foreground");

  const visibleTypes = data.objectTypes.filter((t) => !hiddenObjectTypes.has(t.name));
  const eventCount = eventTypeCounts[data.label] ?? 0;
  const display = `${PREFIX[kind]}${data.label}`;

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(display);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [renaming]);

  const beginRename = () => {
    setDraft(display);
    setRenaming(true);
  };
  const commitRename = () => {
    setRenaming(false);
    const { type, kind: newKind } = parseNodeName(draft);
    if (!type || !edit) return;
    edit.mutate((m) => ({
      ...m,
      nodes: m.nodes.map((n) => (n.id === id ? { ...n, type, kind: newKind } : n)),
    }));
  };
  const deleteNode = () => {
    edit?.mutate((m) => ({
      nodes: m.nodes.filter((n) => n.id !== id),
      edges: m.edges.filter((e) => e.source !== id && e.target !== id),
    }));
  };

  const connectable = !!edit;
  // Must let pointer events through during a drag: xyflow validates the drop via elementFromPoint, which only accepts a handle element.
  const connecting = useConnection((c) => c.inProgress);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <div
          // Label + involvement strip center together as one block, including wrapped rows.
          className="font-semibold border-2 rounded-2xl flex flex-col justify-center items-stretch px-2 shadow-sm box-border transition-opacity text-center leading-tight text-[12px]"
          style={{
            width: ACT_NODE_WIDTH,
            height: ACT_NODE_HEIGHT,
            backgroundColor: `${colorBase}26`,
            borderColor: isFocused ? colorBase : `${colorBase}cc`,
            borderStyle: isObject ? "dashed" : "solid",
            color: colorFg,
            opacity: isDimmed ? 0.4 : 1,
            // Edit-mode hover: a ring cue that the node is a connection grip (drag its border).
            boxShadow:
              edit && isHovered
                ? "0 0 0 3px var(--accent-a8)"
                : isFocused
                  ? `0 2px 10px ${colorBase}40`
                  : undefined,
            transition: "box-shadow 120ms",
          }}
          title={display}
        >
          {renaming ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                else if (e.key === "Escape") setRenaming(false);
                e.stopPropagation();
              }}
              className="min-w-0 w-full bg-transparent text-center outline-none"
              style={{ color: colorFg }}
            />
          ) : (
            <span className="min-w-0 flex items-center justify-center">
              <span className="truncate">{display}</span>
            </span>
          )}
          {visibleTypes.length > 0 && (
            <div
              className="mt-0.5 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5"
              style={{ minHeight: 12 }}
            >
              {visibleTypes.map((t) =>
                showTextLabels ? (
                  <span
                    key={t.name}
                    className="inline-flex items-center gap-0.5 text-[9px] leading-none font-semibold"
                    title={`${t.name}: ${t.min}..${t.max} per event`}
                  >
                    <span style={{ color: objectTypeColor(t.name) }} className="truncate max-w-[52px]">
                      {t.name}
                    </span>
                    <span className="text-(--gray-9) font-normal">{cardClass(t.min, t.max)}</span>
                  </span>
                ) : (
                  <MultiDot
                    key={t.name}
                    dot={{
                      objectType: t.name,
                      color: objectTypeColor(t.name),
                      card: cardClass(t.min, t.max),
                      title: `${t.name}: ${t.min}..${t.max} per event`,
                    }}
                  />
                ),
              )}
            </div>
          )}

          {/* Full-cover handles make the whole node a connection grip; the center overlay (above them) carves out the middle for moving + rename. */}
          <Handle
            type="target"
            position={Position.Left}
            id="left"
            isConnectable={connectable}
            style={fullCoverHandle(!!edit)}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="right"
            isConnectable={connectable}
            style={fullCoverHandle(!!edit)}
          />
          {edit && !renaming && (
            <div
              style={{
                position: "absolute",
                inset: CONNECT_RING,
                zIndex: 1,
                pointerEvents: connecting ? "none" : undefined,
                cursor: "move",
                borderRadius: 16 - CONNECT_RING,
                // Hover: outline the move zone so move-vs-connect is visible, not guessed.
                border: `1.5px dashed ${isHovered ? "var(--accent-a8)" : "transparent"}`,
                background: isHovered ? "var(--accent-a2)" : undefined,
                transition: "border-color 120ms, background-color 120ms",
              }}
              onDoubleClick={beginRename}
              title="Drag center to move · double-click to rename · drag the border to connect"
            />
          )}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Content size="1">
        <ContextMenu.Label>
          <span className="text-[11px] font-semibold">{display}</span>
        </ContextMenu.Label>
        <ContextMenu.Label>
          <span className="text-[10px] text-[var(--gray-9)]">
            {eventCount.toLocaleString("en")} event{eventCount === 1 ? "" : "s"}
          </span>
        </ContextMenu.Label>
        {edit && (
          <>
            <ContextMenu.Separator />
            <ContextMenu.Item onSelect={beginRename}>Rename</ContextMenu.Item>
            {!isObject && edit.callbacks.onActivityStatistics && (
              <ContextMenu.Item onSelect={() => edit.openStats({ kind: "activity", activity: data.label })}>
                View statistics
              </ContextMenu.Item>
            )}
            <ContextMenu.Item color="red" onSelect={deleteNode}>
              Delete node
            </ContextMenu.Item>
          </>
        )}
        {data.objectTypes.length > 0 && (
          <>
            <ContextMenu.Separator />
            <ContextMenu.Label>
              <span className="text-[10px] text-[var(--gray-8)] uppercase tracking-wide">Object types</span>
            </ContextMenu.Label>
            {data.objectTypes.map((t) => (
              <ContextMenu.Label key={t.name}>
                <span className="text-[10px]">
                  <span style={{ color: objectTypeColor(t.name) }}>{t.name}</span>
                  <span className="text-[var(--gray-8)] ml-1">
                    {t.min === t.max ? t.min : `${t.min}-${t.max}`} per event
                  </span>
                </span>
              </ContextMenu.Label>
            ))}
          </>
        )}
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}
