import { ContextMenu } from "@r4pm/components/ui";
import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import type React from "react";
import { MultiDot } from "./MultiDot";
import type { ActivityNodeData } from "./types";
import { useVizContext } from "./VizContext";

export const ACT_NODE_WIDTH = 150;
export const ACT_NODE_HEIGHT = 58;

type ActivityNodeType = Node<ActivityNodeData, "activity">;

/**
 * Self-contained right-click info menu for an activity node.
 */
function ActivityContextMenu({
  children,
  extraContent,
}: {
  activity: string;
  children: React.ReactNode;
  extraContent?: React.ReactNode;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>{children}</ContextMenu.Trigger>
      <ContextMenu.Content size="1">{extraContent}</ContextMenu.Content>
    </ContextMenu.Root>
  );
}

// Hidden handles: ReactFlow requires them for edge endpoints, but we don't
// want visible connector dots since this graph is read-only. Keeping them as
// 1x1 fully-transparent targets at the four sides lets routed edges
// anchor correctly without showing anything.
const HIDDEN_HANDLE_STYLE: React.CSSProperties = {
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  background: "transparent",
  border: "none",
  opacity: 0,
  pointerEvents: "none",
};

export function ActivityNode({ id, data }: NodeProps<ActivityNodeType>) {
  const { activityColor, objectTypeColor, focusedNodeId, hoveredNodeId, hiddenObjectTypes, eventTypeCounts } =
    useVizContext();
  const isFocused = focusedNodeId === id;
  const isDimmed =
    (focusedNodeId !== null && !isFocused) ||
    (hoveredNodeId !== null && hoveredNodeId !== id && focusedNodeId === null);

  const colorBase = activityColor(data.label, "normal");
  const colorFg = activityColor(data.label, "foreground");

  // Hidden-type filter applied at render time so toggling the filter doesn't
  // invalidate the layout.
  const visibleTypes = data.objectTypes.filter((t) => !hiddenObjectTypes.has(t.name));
  const eventCount = eventTypeCounts[data.label] ?? 0;

  return (
    <ActivityContextMenu
      activity={data.label}
      extraContent={
        <>
          <ContextMenu.Label>
            <span className="text-[11px] font-semibold">{data.label}</span>
          </ContextMenu.Label>
          <ContextMenu.Label>
            <span className="text-[10px] text-[var(--gray-9)]">
              {eventCount.toLocaleString("en")} event{eventCount === 1 ? "" : "s"}
            </span>
          </ContextMenu.Label>
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
        </>
      }
    >
      <div
        className="font-semibold border-2 rounded-2xl flex flex-col items-stretch px-2 pt-0.5 pb-0 shadow-sm box-border transition-opacity text-center leading-tight text-[12px]"
        style={{
          width: ACT_NODE_WIDTH,
          height: ACT_NODE_HEIGHT,
          backgroundColor: `${colorBase}26`,
          borderColor: isFocused ? colorBase : `${colorBase}cc`,
          color: colorFg,
          opacity: isDimmed ? 0.4 : 1,
          boxShadow: isFocused ? `0 2px 10px ${colorBase}40` : undefined,
        }}
        title={data.label}
      >
        <span className="flex-1 min-h-0 flex items-center justify-center truncate">{data.label}</span>
        {visibleTypes.length > 0 && (
          <div
            className="flex flex-wrap items-center justify-center gap-1 pb-[3px]"
            style={{ minHeight: 12 }}
          >
            {visibleTypes.map((t) => {
              const exactlyOne = t.min === 1 && t.max === 1;
              return (
                <MultiDot
                  key={t.name}
                  dot={{
                    objectType: t.name,
                    color: objectTypeColor(t.name),
                    variant: exactlyOne ? "single" : "multi",
                    title: `${t.name}: ${t.min}..${t.max} per event`,
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Invisible handles on all four sides for edge attachment. */}
        <Handle
          type="source"
          position={Position.Top}
          id="s-top"
          style={HIDDEN_HANDLE_STYLE}
          isConnectableStart={false}
        />
        <Handle
          type="source"
          position={Position.Right}
          id="s-right"
          style={HIDDEN_HANDLE_STYLE}
          isConnectableStart={false}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="s-bottom"
          style={HIDDEN_HANDLE_STYLE}
          isConnectableStart={false}
        />
        <Handle
          type="source"
          position={Position.Left}
          id="s-left"
          style={HIDDEN_HANDLE_STYLE}
          isConnectableStart={false}
        />
        <Handle
          type="target"
          position={Position.Top}
          id="t-top"
          style={HIDDEN_HANDLE_STYLE}
          isConnectableStart={false}
        />
        <Handle
          type="target"
          position={Position.Right}
          id="t-right"
          style={HIDDEN_HANDLE_STYLE}
          isConnectableStart={false}
        />
        <Handle
          type="target"
          position={Position.Bottom}
          id="t-bottom"
          style={HIDDEN_HANDLE_STYLE}
          isConnectableStart={false}
        />
        <Handle
          type="target"
          position={Position.Left}
          id="t-left"
          style={HIDDEN_HANDLE_STYLE}
          isConnectableStart={false}
        />
      </div>
    </ActivityContextMenu>
  );
}
