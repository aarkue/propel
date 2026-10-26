import { Card } from "@r4pm/components/ui";
import {
  Handle,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useIsDarkMode } from "../viewer/dark-mode";
import { useRegisterExport, type VectorExportSource } from "../viewer/export";
import { useViewSetting } from "../viewer/view-state";
import { colorForKey, type ViewerAction, type ViewerTarget } from "../viewer/viewer-config";
import type { Point, VizTransport } from "../viz";
import { DFG_EDGE_TYPES, type DfgEdgeType } from "./DfgEdge";
import DfgSettings from "./DfgSettings";
import { DEFAULT_ARC_COLOR, flattenColor, mix } from "./util/colors";
import type { DfgArc, DfgMetric } from "./util/dfg-model";
import {
  type ArcLook,
  arcLooks,
  type DfgRouting,
  type DfgSource,
  dfgBuildOptions,
  dfgOverrides,
  dfgSvg,
  type EdgeRoute,
  edgeRoutes,
  type LaidDfg,
  layoutDfg,
  rerouteDfg,
  type ShownDfg,
  selectArcs,
  shownModel,
  shownRoute,
  sourceCounter,
} from "./viz-layout";

type ActivityNodeData = { activity: string; count: number };
/** `group` is the object type of an OC-DFG terminal. */
type TerminalNodeData = { kind: "start" | "end"; group?: string };
type DfgActivityNode = Node<ActivityNodeData, "activity">;
type DfgTerminalNode = Node<TerminalNodeData, "terminal">;
type DfgFlowNode = DfgActivityNode | DfgTerminalNode;

/** ReactFlow node components can't take arbitrary props, so their color resolver + click/menu
 *  handlers arrive through context. */
interface DfgNodeContextValue {
  activityColor: (act: string) => string;
  activityForeground: (act: string) => string;
  typeColor?: (objectType: string) => string;
  onActivityClick?: (act: string) => void;
  onActivityContextMenu?: (act: string, e: { clientX: number; clientY: number }) => void;
}
const DfgNodeContext = createContext<DfgNodeContextValue>({
  activityColor: () => "#9ca3af",
  activityForeground: () => "#374151",
});

const hiddenHandles = (
  <>
    <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} isConnectableStart={false} />
    <Handle type="target" position={Position.Top} style={{ opacity: 0 }} isConnectableStart={false} />
  </>
);

function ActivityNode({ data, width, height }: NodeProps<DfgActivityNode>) {
  const ctx = useContext(DfgNodeContext);
  const base = ctx.activityColor(data.activity);
  return (
    <div
      className="font-semibold border-2 rounded-lg px-2 shadow-sm flex flex-col items-center justify-center box-border overflow-hidden"
      style={{
        backgroundColor: `${base}26`,
        borderColor: `${base}cc`,
        color: "CanvasText",
        width,
        height,
        cursor: ctx.onActivityClick ? "pointer" : undefined,
      }}
      title={data.activity}
      onClick={() => ctx.onActivityClick?.(data.activity)}
      onContextMenu={
        ctx.onActivityContextMenu
          ? (e) => {
              e.preventDefault();
              ctx.onActivityContextMenu?.(data.activity, { clientX: e.clientX, clientY: e.clientY });
            }
          : undefined
      }
    >
      <div
        className="text-center leading-tight font-bold text-[12px]"
        style={{
          color: ctx.activityForeground(data.activity),
          wordBreak: "break-word",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {data.activity}
      </div>
      <span className="text-[10px] opacity-80 tabular-nums">{data.count.toLocaleString("en")}</span>
      {hiddenHandles}
    </div>
  );
}

/** rust4pm's DFG terminal fills. An OC-DFG's are its object type's color. */
const START_FILL = "#4B9969";
const END_FILL = "#D4001F";

/** rust4pm's terminal: a filled box with a play triangle (start) or a stop square (end). */
function TerminalNode({ data, width, height }: NodeProps<DfgTerminalNode>) {
  const ctx = useContext(DfgNodeContext);
  const start = data.kind === "start";
  let fill = start ? START_FILL : END_FILL;
  let mark = "#ffffff";
  if (data.group !== undefined) {
    fill = ctx.typeColor?.(data.group) ?? colorForKey("objectType", data.group) ?? "#888888";
    mark = mix(flattenColor(fill), "#ffffff", 0.86);
  }
  const r = (height ?? 36) / 4;
  return (
    <div
      title={`${start ? "Start" : "End"}${data.group !== undefined ? `: ${data.group}` : ""}`}
      className="flex items-center justify-center shadow-sm"
      style={{ width, height, backgroundColor: fill, borderRadius: 4 }}
    >
      <svg width={2 * r} height={2 * r} viewBox={`${-r} ${-r} ${2 * r} ${2 * r}`} aria-hidden="true">
        {start ? (
          <polygon points={`${-r},${-r} ${-r},${r} ${r},0`} fill={mark} />
        ) : (
          <rect x={-r} y={-r} width={2 * r} height={2 * r} fill={mark} />
        )}
      </svg>
      {hiddenHandles}
    </div>
  );
}

const DFG_NODE_TYPES = { activity: ActivityNode, terminal: TerminalNode };

export interface DfgGraphProps {
  source: DfgSource;
  /** Every arc of the source (of the shown object types), ranked by the edge slider. */
  arcs: DfgArc[];
  /** How often each activity occurred: shown under its name and the base of `pct_source`. */
  activityCounts: Record<string, number>;
  metric: DfgMetric;
  setMetric: (m: DfgMetric) => void;
  hasPerformanceData: boolean;
  /** Recolor arcs with a duration heatmap (blue->red) under a performance metric. */
  heatmap?: boolean;
  /** Resolves the base color (`#rrggbb`) for an activity node. */
  activityColor: (act: string) => string;
  /** Resolves the foreground/text color for an activity node. */
  activityForeground: (act: string) => string;
  /** An OC-DFG object type's color, for its arcs and terminals. */
  typeColor?: (objectType: string) => string;
  /** Duration formatter for performance metric labels (from shared `format.duration`). */
  formatDuration?: (ms: number) => string;
  /** Extra UI in the top-right settings card, e.g., the OC-DFG object-type chips. */
  topRightExtra?: React.ReactNode;
  onSelect?: (s: ViewerTarget) => void;
  /** Right-click actions shown on activity nodes (declarative; viewer renders the menu). */
  actions?: ViewerAction[];
  /** Escape hatch: report a right-click and let the host build a fully custom menu. */
  onElementContextMenu?: (t: ViewerTarget, e: { clientX: number; clientY: number }) => void;
  viz?: VizTransport;
  routing?: DfgRouting;
}

/** A laid-out model and what it was laid out from. `routes` are the edges' current routes. `fresh`
 *  counts full layouts, so a re-route keeps the nodes where they are. */
interface Shown {
  model: ShownDfg;
  options: Record<string, unknown>;
  looks: Map<string, ArcLook>;
  laid: LaidDfg;
  routes: EdgeRoute[];
  fresh: number;
}

function flowNodes(laid: LaidDfg, activityCounts: Record<string, number>): DfgFlowNode[] {
  return laid.nodes.map((n, i): DfgFlowNode => {
    const { center, size } = laid.layout.nodes[i];
    const common = {
      id: n.id,
      position: { x: center.x - size.width / 2, y: center.y - size.height / 2 },
      width: size.width,
      height: size.height,
    };
    if (n.kind === "activity") {
      return { ...common, type: "activity", data: { activity: n.name, count: activityCounts[n.name] ?? 0 } };
    }
    return {
      ...common,
      type: "terminal",
      data: { kind: n.kind === "end" ? "end" : "start", group: n.group },
    };
  });
}

const centreOf = (n: { position: Point; width?: number; height?: number }): Point => ({
  x: n.position.x + (n.width ?? 0) / 2,
  y: n.position.y + (n.height ?? 0) / 2,
});

/** The full DFG render shell: ReactFlow graph + settings card, advertising a vector export via `useRegisterExport`. */
export function DfgGraph(props: DfgGraphProps) {
  return (
    <ReactFlowProvider>
      <DfgGraphInner {...props} />
    </ReactFlowProvider>
  );
}

function DfgGraphInner({
  source,
  arcs,
  activityCounts,
  metric,
  setMetric,
  hasPerformanceData,
  heatmap,
  activityColor,
  activityForeground,
  typeColor,
  formatDuration,
  topRightExtra,
  onSelect,
  actions,
  onElementContextMenu,
  viz,
  routing,
}: DfgGraphProps) {
  const { fitView, getNodes } = useReactFlow<DfgFlowNode, DfgEdgeType>();
  const [direction, setDirection] = useViewSetting<"TB" | "LR">("direction", "TB");
  const [userEdgeSlider, setUserEdgeSlider] = useViewSetting<number | null>("edgeSlider", null);

  const selection = useMemo(
    () => selectArcs(arcs, userEdgeSlider, activityCounts),
    [arcs, userEdgeSlider, activityCounts],
  );
  const sourceCount = useMemo(() => sourceCounter(arcs, activityCounts), [arcs, activityCounts]);
  const looks = useMemo(
    () => arcLooks(selection.kept, metric, sourceCount, { formatDuration, heatmap }),
    [selection.kept, metric, sourceCount, formatDuration, heatmap],
  );
  const model = useMemo(() => shownModel(source, selection.kept), [source, selection.kept]);
  const options = useMemo(
    () => dfgBuildOptions(model, selection.kept, looks, activityCounts, { direction, routing }),
    [model, selection.kept, looks, activityCounts, direction, routing],
  );
  const requestKey = useMemo(() => JSON.stringify([model, options]), [model, options]);

  const [shown, setShown] = useState<Shown | null>(null);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const [nodes, setNodes, onNodesChange] = useNodesState<DfgFlowNode>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: requestKey captures model and options; relayout only when they change.
  useEffect(() => {
    if (selection.kept.length === 0) {
      setShown(null);
      return;
    }
    let cancelled = false;
    layoutDfg(viz, model, options, selection.kept)
      .then((laid) => {
        if (cancelled) return;
        setShown((prev) => ({
          model,
          options,
          looks,
          laid,
          routes: edgeRoutes(laid, laid.layout),
          fresh: (prev?.fresh ?? 0) + 1,
        }));
      })
      .catch((e: unknown) => console.error("[DfgGraph] layout failed:", e));
    return () => {
      cancelled = true;
    };
  }, [requestKey, viz]);

  // A full layout places every node anew. A re-route after a drag leaves them where they are.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new layout (`fresh`) resets the nodes.
  useEffect(() => {
    if (!shown) {
      setNodes([]);
      return;
    }
    setNodes(flowNodes(shown.laid, activityCounts));
    requestAnimationFrame(() => fitView());
  }, [shown?.fresh]);

  const edges = useMemo<DfgEdgeType[]>(() => {
    if (!shown) return [];
    return shown.laid.edges.map((e, i) => {
      const look = shown.looks.get(e.key);
      const color =
        look?.heat ??
        (e.group !== undefined ? (typeColor?.(e.group) ?? DEFAULT_ARC_COLOR) : DEFAULT_ARC_COLOR);
      return {
        id: `e${i}`,
        source: e.source,
        target: e.target,
        type: "dfg",
        data: { route: shown.routes[i], label: look?.label ?? "", color, width: look?.width ?? 1.5 },
      };
    });
  }, [shown, typeColor]);

  // After a drop, rust4pm re-routes every edge over the current centres. The nodes stay where they
  // were dropped.
  const onNodeDragStop = useCallback(() => {
    const s = shownRef.current;
    if (!s || !viz) return;
    const byId = new Map(getNodes().map((n) => [n.id, n]));
    const centres = s.laid.nodes.map((n, i) => {
      const f = byId.get(n.id);
      return f ? centreOf(f) : s.laid.layout.nodes[i].center;
    });
    rerouteDfg(viz, s.laid, centres)
      .then((layout) => {
        if (!layout || shownRef.current !== s) return;
        setShown({ ...s, routes: edgeRoutes(s.laid, layout) });
      })
      .catch((e: unknown) => console.error("[DfgGraph] reroute failed:", e));
  }, [viz, getNodes]);

  const [menu, setMenu] = useState<{ x: number; y: number; act: string } | null>(null);
  const activityActions = useMemo(
    () => (actions ?? []).filter((a) => !a.scope || a.scope === "activity"),
    [actions],
  );

  const nodeContext = useMemo<DfgNodeContextValue>(
    () => ({
      activityColor,
      activityForeground,
      typeColor,
      onActivityClick: onSelect ? (act: string) => onSelect({ scope: "activity", key: act }) : undefined,
      onActivityContextMenu:
        activityActions.length || onElementContextMenu
          ? (act, e) => {
              onElementContextMenu?.({ scope: "activity", key: act }, e);
              if (activityActions.length) setMenu({ x: e.clientX, y: e.clientY, act });
            }
          : undefined,
    }),
    [activityColor, activityForeground, typeColor, onSelect, activityActions, onElementContextMenu],
  );

  // rust4pm's drawing over the shown positions and polylines, with the screen's colors as overrides.
  // Read live at export time through a ref, so the registered source stays stable.
  const toSvg = async (): Promise<string | null> => {
    const s = shownRef.current;
    if (!s || !viz) return null;
    const byId = new Map(getNodes().map((n) => [n.id, n]));
    const centres = s.laid.nodes.map((n, i) => {
      const f = byId.get(n.id);
      return f ? centreOf(f) : s.laid.layout.nodes[i].center;
    });
    const index = new Map(s.laid.nodes.map((n, i) => [n.id, i]));
    const shownEdges = s.laid.edges.map((e, i) =>
      shownRoute(s.routes[i], centres[index.get(e.source) ?? 0], centres[index.get(e.target) ?? 0]),
    );
    const overrides = dfgOverrides(s.laid, {
      activityColor,
      typeColor: (t) => {
        const color = typeColor?.(t);
        return color && color !== colorForKey("objectType", t) ? color : undefined;
      },
      heat: (key) => s.looks.get(key)?.heat,
    });
    return dfgSvg(viz, s.model, s.options, s.laid, { centres, edges: shownEdges }, overrides);
  };
  const toSvgRef = useRef(toSvg);
  toSvgRef.current = toSvg;
  const exportSource = useMemo<VectorExportSource>(
    () => ({ label: "Directly-follows graph", toSvg: () => toSvgRef.current() }),
    [],
  );
  useRegisterExport("dfg", exportSource);
  const colorMode = useIsDarkMode() ? "dark" : "light";

  return (
    <DfgNodeContext.Provider value={nodeContext}>
      <div
        style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 256 }}
      >
        <div
          className="inner-flow relative"
          style={{ flex: "1 1 auto", width: "100%", height: "100%", minHeight: 0 }}
        >
          <ReactFlow
            colorMode={colorMode}
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            nodeTypes={DFG_NODE_TYPES}
            edgeTypes={DFG_EDGE_TYPES}
            onBeforeDelete={async () => false}
            onNodeDragStop={onNodeDragStop}
            nodesConnectable={false}
            className="node-dfg"
            proOptions={{ hideAttribution: true }}
          >
            <Panel position="top-right">
              <Card
                className=" mt-4 p-1! bg-(--color-panel-translucent) backdrop-blur-sm"
                style={{ width: topRightExtra ? 180 : 100 }}
              >
                {topRightExtra}
                <DfgSettings
                  metric={metric}
                  onMetricChange={setMetric}
                  edgeSlider={selection.slider}
                  setEdgeSlider={(v) =>
                    setUserEdgeSlider((prev) => {
                      const current = prev ?? selection.slider;
                      return typeof v === "function" ? v(current) : v;
                    })
                  }
                  coverage={selection.coverage}
                  hasPerformanceData={hasPerformanceData}
                  direction={direction}
                  onDirectionChange={setDirection}
                />
              </Card>
            </Panel>
          </ReactFlow>
        </div>
        {menu && (
          <>
            <div
              style={{ position: "fixed", inset: 0, zIndex: 999 }}
              onClick={() => setMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu(null);
              }}
            />
            <div
              style={{
                position: "fixed",
                top: menu.y,
                left: menu.x,
                zIndex: 1000,
                minWidth: 160,
                padding: 4,
                borderRadius: 8,
                border: "1px solid var(--gray-a5)",
                background: "var(--color-panel-solid)",
                boxShadow: "0 6px 24px rgba(0,0,0,0.15)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {activityActions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    a.run({ scope: "activity", key: menu.act });
                    setMenu(null);
                  }}
                  style={{
                    textAlign: "left",
                    padding: "5px 8px",
                    borderRadius: 4,
                    border: "none",
                    background: "transparent",
                    color: "var(--gray-12)",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </DfgNodeContext.Provider>
  );
}
