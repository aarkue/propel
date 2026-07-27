import {
  type Connection,
  ConnectionLineType,
  ConnectionMode,
  type Edge,
  type Node,
  type OnConnectEnd,
  type OnConnectStart,
  Panel,
  ReactFlow,
  type ReactFlowProps,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ACT_NODE_HEIGHT, ACT_NODE_WIDTH, ActivityNode } from "./ActivityNode";
import { ConstraintEdge } from "./ConstraintEdge";
import { type DeclareLayoutFn, noopDeclareLayout, roundedPointsToSvgPath } from "./layout-util";
import { ocDeclareModelToStyledGraph } from "./styled-graph";
import type { ActivityNodeData, ConstraintEdgeData } from "./types";
import { collapseFlowEdges } from "./collapse";
import { type ColorResolver, VizProvider } from "./VizContext";
import { normalizeLabel } from "./arc-convert";
import { defaultConnectLabel, defaultTemplate } from "./auto-label";
import {
  type DeclareEdge,
  type DeclareEdgeRoute,
  type DeclareFlowModel,
  type DeclareNode,
  TEMPLATE_TO_ARC,
  arcsToModel,
  mergeArcs,
  parseNodeName,
  templateCounts,
  toArcs,
} from "./model";
import {
  CLIPBOARD_MIME,
  type Selection as ClipSelection,
  parseClipboard,
  serializeSelection,
} from "./clipboard";
import {
  EditContext,
  type EditCallbacks,
  type EditContextValue,
  type StatsRequest,
  type SupportCtx,
} from "./edit/edit-context";
import type { ObjectTypeAssociation, OCDeclareArc } from "./index";
import { EditToolbar } from "./edit/EditToolbar";
import { StatsSheet } from "./edit/StatsSheet";
import { uid } from "../shared/id";
import { ControlsCard } from "./ControlsCard";
import { colorForKey } from "../viewer/viewer-config";
import { shadeHex } from "../dfg/util/colors";

// Same OKLCH mapping the ViewerConfig contract uses.
const defaultColor =
  (scope: string): ColorResolver =>
  (name, mode = "normal") =>
    shadeHex(colorForKey(scope, name) ?? "#888888", mode);
const defaultActivityColor = defaultColor("activity");
const defaultObjectTypeColor = defaultColor("objectType");
import { useRegisterExport, type VectorExportSource } from "../viewer/export";
import { useIsDarkMode } from "../viewer/dark-mode";
import { useViewerConfig } from "../viewer/viewer-config";
import type { StyledGraphRenderer } from "../graph-svg/styled-graph";

export interface OCDeclareVizProps {
  /** Constraint model to render; read-only hosts build it via `arcsToModel`, edit mode passes the controlled model. */
  value?: DeclareFlowModel;
  /** Collapse complementary EF/EP (and DF/DP) pairs into one both-ended arc (display-only). Default on. */
  combineEfEp?: boolean;
  editable?: boolean;
  onChange?: (next: DeclareFlowModel) => void;
  /** Palette + support sources (from the host OCEL info). */
  eventTypes?: string[];
  objectTypes?: string[];
  /** Object types related to an activity, used for drag-connect auto-labels. */
  relatedTypes?: (activity: string) => Record<string, number>;
  getSupport?: (assoc: ObjectTypeAssociation, ctx: SupportCtx) => number | undefined;
  /** Injected backend callbacks; a missing one hides its UI affordance. */
  onDiscover?: EditCallbacks["onDiscover"];
  onEvaluate?: EditCallbacks["onEvaluate"];
  onActivityStatistics?: EditCallbacks["onActivityStatistics"];
  onEdgeStatistics?: EditCallbacks["onEdgeStatistics"];
  onTemplateString?: EditCallbacks["onTemplateString"];
  /** Render object involvement as text notation instead of dots; controlled when `onShowTextLabelsChange` is given. */
  showTextLabels?: boolean;
  onShowTextLabelsChange?: (value: boolean) => void;
  /** Restore a saved pan/zoom on mount (else the view fits the graph). */
  defaultViewport?: { x: number; y: number; zoom: number };
  /** Fires on ReactFlow move-end with the current pan/zoom, for host persistence. */
  onViewportChange?: (viewport: { x: number; y: number; zoom: number }) => void;
  /** Override the activity color resolver (defaults to the canonical `colorForKey` mapping). */
  activityColor?: ColorResolver;
  /** Override the object-type color resolver (same default mapping). */
  objectTypeColor?: ColorResolver;
  /** Per-activity object-type involvement counts from the OCEL; shape matches `get_ocel_activity_object_involvements`. */
  activityInvolvements?: {
    [activity: string]: { [objectType: string]: { min: number; max: number } | undefined } | undefined;
  };
  /** Event-type occurrence counts from the OCEL (activity -> count). */
  eventTypeCounts?: Record<string, number>;
  /** Filters are controlled when the matching `on...Change` is given; otherwise seed the built-in filter. */
  hiddenArcTypes?: Set<string>;
  onHiddenArcTypesChange?: (next: Set<string>) => void;
  hiddenObjectTypes?: Set<string>;
  onHiddenObjectTypesChange?: (next: Set<string>) => void;
  /** Activity chips for the controls card; a host that filters the model itself must pass the FULL list so hidden chips stay toggleable. */
  activities?: string[];
  /** Hidden activities; when uncontrolled this is a visibility hide that never mutates the model. */
  hiddenActivities?: Set<string>;
  onHiddenActivitiesChange?: (next: Set<string>) => void;
  /** Lossless projection onto kept activities; when given and some are hidden, shows a display-only
   *  overlay (removed activities' constraints folded into survivors) and pauses editing until cleared. */
  onProjectActivities?: (arcs: OCDeclareArc[], activities: string[]) => Promise<OCDeclareArc[]>;
  /** Count shown in the controls card footer; defaults to the model's edge count. */
  arcsCount?: number;
  className?: string;
  /** Optional callback when the focused node changes. */
  onFocusChange?: (id: string | null) => void;
  /** Layout direction; "DOWN" fits narrow, page-shaped surfaces. Controlled when `onDirectionChange` is given. */
  direction?: "RIGHT" | "DOWN";
  onDirectionChange?: (d: "RIGHT" | "DOWN") => void;
  /** Replace the default Rust layout with a host-supplied one. Same contract: return
   *  nodes with positions + edges with routing data. */
  layoutOverride?: DeclareLayoutFn;
  /** Draw the exact on-screen graph via a host renderer (typically `export_graph_svg`); falls back to the ambient config, then the DOM snapshot export. */
  renderSvg?: StyledGraphRenderer;
}

/** Imperative handle for the viz: exposes current laid-out nodes/edges for export. */
export interface OCDeclareVizHandle {
  getLayoutedNodes: () => Node<ActivityNodeData, "activity">[];
  getLayoutedEdges: () => Edge<ConstraintEdgeData, "constraint">[];
}

const NODE_TYPES = { activity: ActivityNode };
const EDGE_TYPES = { constraint: ConstraintEdge };

type InvolvementsMap = {
  [activity: string]: { [objectType: string]: { min: number; max: number } | undefined } | undefined;
};

/** Convert the backend involvements map into the node-data shape, sorted by object-type name. */
function buildActivityObjectTypes(
  involvements: InvolvementsMap | undefined,
  activity: string,
): { name: string; min: number; max: number }[] {
  const perType = involvements?.[activity];
  if (!perType) return [];
  const out: { name: string; min: number; max: number }[] = [];
  for (const [name, c] of Object.entries(perType)) {
    if (!c || c.max <= 0) continue;
    out.push({ name, min: c.min, max: c.max });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Group edges between the same (source, target) pair so parallel arcs can be spread. */
function bundleEdges(edges: Edge[]): Edge[] {
  const keyOf = (e: Edge) => `${e.source}|${e.target}`;
  const groups = new Map<string, Edge[]>();
  for (const e of edges) {
    const k = keyOf(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)?.push(e);
  }
  const result: Edge[] = [];
  for (const group of groups.values()) {
    group.forEach((e, i) => {
      const data = e.data as ConstraintEdgeData;
      result.push({
        ...e,
        data: { ...data, bundleIndex: i, bundleTotal: group.length },
      });
    });
  }
  return result;
}

type FlowNode = Node<ActivityNodeData, "activity">;
type FlowEdge = Edge<ConstraintEdgeData, "constraint">;

// Nodes are keyed by MODEL id, so edits target them directly.
function modelToFlow(
  model: DeclareFlowModel,
  involvements: InvolvementsMap | undefined,
): { initNodes: FlowNode[]; initEdges: FlowEdge[] } {
  const initNodes: FlowNode[] = model.nodes.map((n) => ({
    id: n.id,
    type: "activity",
    position: n.position ?? { x: 0, y: 0 },
    data: {
      label: n.type,
      kind: n.kind,
      objectTypes: buildActivityObjectTypes(involvements, n.type),
    },
  }));
  const initEdges: FlowEdge[] = model.edges.map((e, i) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "constraint",
    data: {
      arcType: TEMPLATE_TO_ARC[e.template].arc_type,
      counts: templateCounts(e.template, e.cardinality) as [number, number | null],
      label: normalizeLabel(e.label),
      rawLabel: e.label,
      template: e.template,
      cardinality: e.cardinality,
      violation: e.violation,
      bundleIndex: 0,
      bundleTotal: 1,
      constraintIndex: i,
    },
  }));
  return { initNodes, initEdges };
}

const OCDeclareVizInner = forwardRef<OCDeclareVizHandle, OCDeclareVizProps>(function OCDeclareVizInner(
  {
    combineEfEp = true,
    activityColor = defaultActivityColor,
    objectTypeColor = defaultObjectTypeColor,
    activityInvolvements,
    eventTypeCounts = {},
    hiddenArcTypes: hiddenArcTypesProp,
    onHiddenArcTypesChange,
    hiddenObjectTypes: hiddenObjectTypesProp,
    onHiddenObjectTypesChange,
    activities: activitiesProp,
    hiddenActivities: hiddenActivitiesProp,
    onHiddenActivitiesChange,
    onProjectActivities,
    arcsCount,
    onFocusChange,
    direction = "RIGHT",
    onDirectionChange,
    layoutOverride,
    renderSvg,
    editable = false,
    value,
    onChange,
    eventTypes = [],
    objectTypes = [],
    relatedTypes,
    getSupport,
    onDiscover,
    onEvaluate,
    onActivityStatistics,
    onEdgeStatistics,
    onTemplateString,
    showTextLabels,
    onShowTextLabelsChange,
    defaultViewport,
    onViewportChange,
  },
  ref,
) {
  // While a projection overlay is active, `effectiveValue` is the projected model and `isEdit` is false.
  const [projectedModel, setProjectedModel] = useState<DeclareFlowModel | null>(null);
  const effectiveValue = projectedModel ?? value;
  const isEdit = editable && !!value && projectedModel === null;
  const cfg = useViewerConfig({});
  const runLayout = layoutOverride ?? cfg.layout?.declare ?? noopDeclareLayout;
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ActivityNodeData, "activity">>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<ConstraintEdgeData, "constraint">>([]);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [statsRequest, setStatsRequest] = useState<StatsRequest | null>(null);
  const textLabelsControlled = onShowTextLabelsChange !== undefined;
  const [textLabelsInternal, setTextLabelsInternal] = useState(showTextLabels ?? false);
  useEffect(() => {
    if (!textLabelsControlled) setTextLabelsInternal(showTextLabels ?? false);
  }, [showTextLabels, textLabelsControlled]);
  const textLabels = textLabelsControlled ? (showTextLabels ?? false) : textLabelsInternal;
  const setTextLabels = useCallback(
    (v: boolean) => {
      onShowTextLabelsChange?.(v);
      if (!textLabelsControlled) setTextLabelsInternal(v);
    },
    [onShowTextLabelsChange, textLabelsControlled],
  );
  const dirControlled = onDirectionChange !== undefined;
  const [dirInternal, setDirInternal] = useState(direction);
  useEffect(() => {
    if (!dirControlled) setDirInternal(direction);
  }, [direction, dirControlled]);
  const dir = dirControlled ? direction : dirInternal;
  const setDir = useCallback(
    (d: "RIGHT" | "DOWN") => {
      onDirectionChange?.(d);
      if (!dirControlled) setDirInternal(d);
    },
    [onDirectionChange, dirControlled],
  );

  const arcTypesControlled = onHiddenArcTypesChange !== undefined;
  const [hiddenArcInternal, setHiddenArcInternal] = useState<Set<string>>(() => new Set(hiddenArcTypesProp));
  const hiddenArcTypes = (arcTypesControlled ? hiddenArcTypesProp : undefined) ?? hiddenArcInternal;
  const toggleArcType = useCallback(
    (t: string) => {
      setHiddenArcInternal((cur) => {
        const base = arcTypesControlled ? (hiddenArcTypesProp ?? cur) : cur;
        const next = new Set(base);
        if (next.has(t)) next.delete(t);
        else next.add(t);
        onHiddenArcTypesChange?.(next);
        return arcTypesControlled ? cur : next;
      });
    },
    [arcTypesControlled, hiddenArcTypesProp, onHiddenArcTypesChange],
  );

  const objTypesControlled = onHiddenObjectTypesChange !== undefined;
  const [hiddenObjInternal, setHiddenObjInternal] = useState<Set<string>>(
    () => new Set(hiddenObjectTypesProp),
  );
  const hiddenObjectTypes = (objTypesControlled ? hiddenObjectTypesProp : undefined) ?? hiddenObjInternal;
  const toggleObjectType = useCallback(
    (t: string) => {
      setHiddenObjInternal((cur) => {
        const base = objTypesControlled ? (hiddenObjectTypesProp ?? cur) : cur;
        const next = new Set(base);
        if (next.has(t)) next.delete(t);
        else next.add(t);
        onHiddenObjectTypesChange?.(next);
        return objTypesControlled ? cur : next;
      });
    },
    [objTypesControlled, hiddenObjectTypesProp, onHiddenObjectTypesChange],
  );
  // Bumped after mutations that add positionless nodes; effect-run so the layout reads the committed model.
  const [relayoutTick, setRelayoutTick] = useState(0);
  const { fitView, getNodes, getEdges, screenToFlowPosition } = useReactFlow();
  const connectingNodeId = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const mousePos = useRef({ x: 0, y: 0 });
  // Nodes the user has manually placed stay pinned across drag-relayouts; a fresh layout clears them.
  const pinnedIds = useRef<Set<string>>(new Set());

  useImperativeHandle(
    ref,
    () => ({
      getLayoutedNodes: () => nodes,
      getLayoutedEdges: () => edges,
    }),
    [nodes, edges],
  );

  const svgRenderer = renderSvg ?? cfg.layout?.renderSvg;
  const renderSvgRef = useRef(svgRenderer);
  renderSvgRef.current = svgRenderer;
  const colorsRef = useRef({ activityColor, objectTypeColor });
  colorsRef.current = { activityColor, objectTypeColor };
  const textLabelsRef = useRef(textLabels);
  textLabelsRef.current = textLabels;
  // An always-on source yielding null would block the frame's DOM-snapshot fallback.
  const exportSource = useMemo<VectorExportSource | null>(
    () =>
      svgRenderer
        ? {
            toSvg: async () => {
              const render = renderSvgRef.current;
              if (!render) return null;
              const { activityColor: ac, objectTypeColor: oc } = colorsRef.current;
              const graph = ocDeclareModelToStyledGraph(nodes, edges, ac, oc, textLabelsRef.current);
              return graph ? render(graph) : null;
            },
          }
        : null,
    [nodes, edges, svgRenderer],
  );
  useRegisterExport("oc-declare", exportSource);

  const valueRef = useRef(value);
  valueRef.current = value;

  // undefined on an empty model so the legend shows every type as guidance.
  const usedArcTypes = useMemo(() => {
    if (edges.length === 0) return undefined;
    return new Set<string>(edges.flatMap((e) => (e.data?.arcType ? [e.data.arcType] : [])));
  }, [edges]);

  // Read-only render path: the non-editable viewer and the projected overlay (isEdit is off for both).
  useEffect(() => {
    if (isEdit || !effectiveValue) return;
    pinnedIds.current.clear();
    const { initNodes, initEdges } = modelToFlow(effectiveValue, activityInvolvements);
    const bundled = bundleEdges(collapseFlowEdges(initEdges, combineEfEp));
    let cancelled = false;
    runLayout(initNodes, bundled, { direction: dir, textLabels }).then((r) => {
      if (cancelled) return;
      setNodes(r.nodes as FlowNode[]);
      setEdges(r.edges as FlowEdge[]);
      setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
    });
    return () => {
      cancelled = true;
    };
  }, [
    effectiveValue,
    isEdit,
    activityInvolvements,
    dir,
    textLabels,
    combineEfEp,
    setNodes,
    setEdges,
    fitView,
    runLayout,
  ]);

  const mutate = useCallback(
    (fn: (m: DeclareFlowModel) => DeclareFlowModel) => {
      const v = valueRef.current;
      if (v && onChange) onChange(fn(v));
    },
    [onChange],
  );

  const runFullLayout = useCallback(
    (fit = true) => {
      const v = valueRef.current;
      if (!v) return;
      const { initNodes, initEdges } = modelToFlow(v, activityInvolvements);
      const bundled = bundleEdges(collapseFlowEdges(initEdges, combineEfEp));
      runLayout(initNodes, bundled, { direction: dir, textLabels }).then((r) => {
        setNodes(r.nodes as FlowNode[]);
        setEdges(r.edges as FlowEdge[]);
        // Write layout output back to the model to persist it; collapsed EFEP/DFDP edges keep the forward edge's id.
        const posById = new Map(r.nodes.map((n) => [n.id, n.position]));
        const routeById = new Map<string, DeclareEdgeRoute>();
        for (const e of r.edges as FlowEdge[]) {
          const d = e.data;
          if (d?.routedPoints && d.layoutSourcePos && d.layoutTargetPos) {
            routeById.set(e.id, {
              points: d.routedPoints,
              sourcePos: d.layoutSourcePos,
              targetPos: d.layoutTargetPos,
            });
          }
        }
        mutate((m) => ({
          nodes: m.nodes.map((n) => ({ ...n, position: posById.get(n.id) ?? n.position })),
          edges: m.edges.map((e) => {
            const route = routeById.get(e.id);
            return route ? { ...e, route } : e;
          }),
        }));
        if (fit) setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
      });
    },
    [activityInvolvements, dir, textLabels, combineEfEp, runLayout, setNodes, setEdges, fitView, mutate],
  );

  // Effect, not inline in the caller, so the layout reads the model AFTER the mutation committed.
  const runFullLayoutRef = useRef(runFullLayout);
  runFullLayoutRef.current = runFullLayout;
  useEffect(() => {
    if (relayoutTick > 0) runFullLayoutRef.current(true);
  }, [relayoutTick]);

  // Label width / per-pair arc count change spacing, so re-layout on toggle (edit mode only).
  const prevSpacingKey = useRef(`${textLabels}|${combineEfEp}`);
  useEffect(() => {
    const key = `${textLabels}|${combineEfEp}`;
    if (prevSpacingKey.current !== key) {
      prevSpacingKey.current = key;
      if (isEdit) setRelayoutTick((t) => t + 1);
    }
  }, [textLabels, combineEfEp, isEdit]);

  // Edit mode: layout once on first mount if positions are missing, then reconcile in place so user-placed nodes stay put.
  const didInitialLayout = useRef(false);
  useEffect(() => {
    if (!isEdit || !value) return;
    if (!didInitialLayout.current) {
      didInitialLayout.current = true;
      if (value.nodes.some((n) => !n.position)) {
        runFullLayout(true);
        return;
      }
      if (!defaultViewport) setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 60);
    }
    setNodes((cur) => {
      const curById = new Map(cur.map((n) => [n.id, n]));
      let cascade = 0;
      return value.nodes.map((mn) => {
        const ex = curById.get(mn.id);
        let position = ex?.position ?? mn.position;
        if (!position) {
          position = { x: 80 + (cascade % 6) * 44, y: 80 + Math.floor(cascade / 6) * 90 };
          cascade++;
        }
        return {
          id: mn.id,
          type: "activity" as const,
          position,
          selected: ex?.selected ?? false,
          data: {
            label: mn.type,
            kind: mn.kind,
            objectTypes: buildActivityObjectTypes(activityInvolvements, mn.type),
          },
        } satisfies FlowNode;
      });
    });
    setEdges((cur) => {
      const curById = new Map(cur.map((e) => [e.id, e]));
      const built: FlowEdge[] = value.edges.map((me) => {
        const ex = curById.get(me.id);
        const data: ConstraintEdgeData = {
          bundleIndex: 0,
          bundleTotal: 1,
          constraintIndex: 0,
          ...(ex?.data ?? {}),
          // Seed persisted route geometry (saved model reload); live flow-edge data wins once present.
          ...(!ex?.data?.routedPoints && me.route
            ? {
                routedPoints: me.route.points,
                routedPath: roundedPointsToSvgPath(me.route.points, me.source === me.target ? 14 : 16),
                layoutSourcePos: me.route.sourcePos,
                layoutTargetPos: me.route.targetPos,
              }
            : {}),
          arcType: TEMPLATE_TO_ARC[me.template].arc_type,
          counts: templateCounts(me.template, me.cardinality) as [number, number | null],
          label: normalizeLabel(me.label),
          rawLabel: me.label,
          template: me.template,
          cardinality: me.cardinality,
          violation: me.violation,
        };
        return {
          id: me.id,
          source: me.source,
          target: me.target,
          type: "constraint" as const,
          selected: ex?.selected ?? false,
          data,
        };
      });
      return bundleEdges(collapseFlowEdges(built, combineEfEp)) as FlowEdge[];
    });
  }, [
    value,
    isEdit,
    activityInvolvements,
    combineEfEp,
    runFullLayout,
    setNodes,
    setEdges,
    defaultViewport,
    fitView,
  ]);

  useEffect(() => {
    if (!isEdit) return;
    const root = rootRef.current;
    if (!root) return;

    const allowed = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return false;
      if (el && root.contains(el)) return true;
      const r = root.getBoundingClientRect();
      const { x, y } = mousePos.current;
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };

    const getSelection = (): ClipSelection => {
      const v = valueRef.current;
      if (!v) return { nodes: [], edges: [] };
      const selNodes = new Set(
        getNodes()
          .filter((n) => n.selected)
          .map((n) => n.id),
      );
      const selEdges = new Set(
        getEdges()
          .filter((e) => e.selected)
          .map((e) => e.id),
      );
      return {
        nodes: v.nodes.filter((n) => selNodes.has(n.id)),
        edges: v.edges.filter(
          (e) => selEdges.has(e.id) || (selNodes.has(e.source) && selNodes.has(e.target)),
        ),
      };
    };

    const onMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };
    const onCopy = (e: ClipboardEvent) => {
      if (!allowed(e.target)) return;
      const sel = getSelection();
      if (sel.nodes.length === 0 && sel.edges.length === 0) return;
      e.preventDefault();
      const data = serializeSelection(sel);
      e.clipboardData?.setData(CLIPBOARD_MIME, data);
      e.clipboardData?.setData("text/plain", data);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!allowed(e.target)) return;
      const text = e.clipboardData?.getData(CLIPBOARD_MIME) || e.clipboardData?.getData("text/plain") || "";
      const parsed = parseClipboard(text);
      if (!parsed) return;
      e.preventDefault();
      if ("arcs" in parsed) {
        mutate((m) => mergeArcs(m, parsed.arcs, () => uid()));
        setRelayoutTick((t) => t + 1);
        return;
      }
      if (parsed.nodes.length === 0 && parsed.edges.length === 0) return;
      const idMap = new Map<string, string>();
      const anchor = parsed.nodes[0]?.position ?? { x: 0, y: 0 };
      const drop = screenToFlowPosition(mousePos.current);
      const dx = drop.x - anchor.x;
      const dy = drop.y - anchor.y;
      const newNodes: DeclareNode[] = parsed.nodes.map((n) => {
        const id = uid();
        idMap.set(n.id, id);
        return {
          ...n,
          id,
          position: n.position ? { x: n.position.x + dx, y: n.position.y + dy } : undefined,
        };
      });
      const newEdges: DeclareEdge[] = parsed.edges
        .filter((ed) => idMap.has(ed.source) && idMap.has(ed.target))
        .map((ed) => ({
          ...ed,
          id: uid(),
          source: idMap.get(ed.source) as string,
          target: idMap.get(ed.target) as string,
        }));
      mutate((m) => ({ nodes: [...m.nodes, ...newNodes], edges: [...m.edges, ...newEdges] }));
      const nodeIds = new Set(newNodes.map((n) => n.id));
      const edgeIds = new Set(newEdges.map((ed) => ed.id));
      setTimeout(() => {
        setNodes((nds) => nds.map((n) => ({ ...n, selected: nodeIds.has(n.id) })));
        setEdges((eds) => eds.map((ed) => ({ ...ed, selected: edgeIds.has(ed.id) })));
      }, 0);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!allowed(e.target)) return;
      if (e.altKey && e.key === "n") {
        const pos = screenToFlowPosition(mousePos.current);
        mutate((m) => ({
          ...m,
          nodes: [...m.nodes, { id: uid(), type: "new activity", kind: "activity", position: pos }],
        }));
      } else if (e.altKey && e.key === "l") {
        e.preventDefault();
        setRelayoutTick((t) => t + 1);
      } else if (e.altKey && e.key === "c") {
        e.preventDefault();
        const sel = getSelection();
        if (sel.nodes.length || sel.edges.length)
          void navigator.clipboard?.writeText(serializeSelection(sel));
      } else if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        setEdges((eds) => eds.map((ed) => ({ ...ed, selected: true })));
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isEdit, getNodes, getEdges, mutate, screenToFlowPosition, setNodes, setEdges]);

  const editContextValue = useMemo<EditContextValue | null>(() => {
    if (!isEdit || !value) return null;
    return {
      model: value,
      mutate,
      palette: { eventTypes, objectTypes },
      relatedTypes,
      getSupport,
      callbacks: { onDiscover, onEvaluate, onActivityStatistics, onEdgeStatistics, onTemplateString },
      openStats: setStatsRequest,
      runLayout: () => setRelayoutTick((t) => t + 1),
    };
  }, [
    isEdit,
    value,
    mutate,
    eventTypes,
    objectTypes,
    relatedTypes,
    getSupport,
    onDiscover,
    onEvaluate,
    onActivityStatistics,
    onEdgeStatistics,
    onTemplateString,
  ]);

  // Drag-connect: dropping on a node connects (onConnect); dropping on empty canvas creates a node there (onConnectEnd).
  const onConnectStart = useCallback<OnConnectStart>((_, params) => {
    connectingNodeId.current = params.nodeId ?? null;
  }, []);

  const onConnect = useCallback(
    (c: Connection) => {
      const v = valueRef.current;
      if (!isEdit || !v) return;
      const s = v.nodes.find((n) => n.id === c.source);
      const t = v.nodes.find((n) => n.id === c.target);
      if (!s || !t || s.id === t.id) return;
      const rel = relatedTypes ?? (() => ({}));
      const edge: DeclareEdge = {
        id: uid(),
        source: s.id,
        target: t.id,
        template: defaultTemplate(s.kind, t.kind),
        label: defaultConnectLabel(s, t, rel),
      };
      mutate((m) => ({ ...m, edges: [...m.edges, edge] }));
    },
    [isEdit, relatedTypes, mutate],
  );

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event) => {
      const src = connectingNodeId.current;
      connectingNodeId.current = null;
      const v = valueRef.current;
      if (!isEdit || !src || !v) return;
      const targetEl = event.target as Element | null;
      // Dropped on a node: onConnect already made the edge. Only the pane creates a node.
      if (!targetEl?.classList?.contains("react-flow__pane")) return;
      const s = v.nodes.find((n) => n.id === src);
      if (!s) return;
      const point = "clientX" in event ? event : event.changedTouches[0];
      const pos = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      const newNode: DeclareNode = { id: uid(), type: "new activity", kind: "activity", position: pos };
      const rel = relatedTypes ?? (() => ({}));
      const edge: DeclareEdge = {
        id: uid(),
        source: src,
        target: newNode.id,
        template: defaultTemplate(s.kind, "activity"),
        label: defaultConnectLabel(s, newNode, rel),
      };
      mutate((m) => ({ nodes: [...m.nodes, newNode], edges: [...m.edges, edge] }));
    },
    [isEdit, screenToFlowPosition, relatedTypes, mutate],
  );

  // Deletion must reach the model, not just flow state, or deleted arcs resurface on the next rebuild.
  // A collapsed EFEP/DFDP edge stands for two model edges (`data.pair`); deleting it removes both.
  const onDelete = useCallback<NonNullable<ReactFlowProps["onDelete"]>>(
    ({ nodes: delNodes, edges: delEdges }) => {
      if (!isEdit) return;
      const nodeIds = new Set(delNodes.map((n) => n.id));
      const edgeIds = new Set<string>();
      for (const e of delEdges) {
        const pair = (e.data as ConstraintEdgeData | undefined)?.pair;
        if (pair) {
          edgeIds.add(pair.forward);
          edgeIds.add(pair.backward);
        } else edgeIds.add(e.id);
      }
      mutate((m) => ({
        nodes: m.nodes.filter((n) => !nodeIds.has(n.id)),
        edges: m.edges.filter((e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target)),
      }));
    },
    [isEdit, mutate],
  );

  // Relayout after a drag: seed every node at its current centre, pin the manually-placed set, and re-route edges over that geometry.
  const onNodeDragStop = useCallback<NonNullable<ReactFlowProps["onNodeDragStop"]>>(
    (_e, dragged) => {
      pinnedIds.current.add(dragged.id);
      // In edit mode, persist the drop position and keep all nodes pinned; only edges reroute.
      if (isEdit) {
        mutate((m) => ({
          ...m,
          nodes: m.nodes.map((n) => (n.id === dragged.id ? { ...n, position: dragged.position } : n)),
        }));
      }
      const curNodes = getNodes() as Node<ActivityNodeData, "activity">[];
      const curEdges = getEdges() as Edge<ConstraintEdgeData, "constraint">[];
      void runLayout(curNodes, curEdges, {
        direction: dir,
        reroute: true,
        textLabels,
        seed: (n) => ({
          x: n.position.x + ACT_NODE_WIDTH / 2,
          y: n.position.y + ACT_NODE_HEIGHT / 2,
          pinned: isEdit || pinnedIds.current.has(n.id),
        }),
      })
        .then((r) => {
          setNodes(r.nodes);
          setEdges(r.edges as Edge<ConstraintEdgeData, "constraint">[]);
        })
        .catch((e) => console.error("[oc-declare] reroute failed:", e));
    },
    [runLayout, dir, textLabels, getNodes, getEdges, setNodes, setEdges, isEdit, mutate],
  );

  const ctxValue = useMemo(
    () => ({
      activityColor,
      objectTypeColor,
      hiddenArcTypes,
      hiddenObjectTypes,
      focusedNodeId,
      hoveredNodeId,
      eventTypeCounts,
      showTextLabels: textLabels,
    }),
    [
      activityColor,
      objectTypeColor,
      hiddenArcTypes,
      hiddenObjectTypes,
      focusedNodeId,
      hoveredNodeId,
      eventTypeCounts,
      textLabels,
    ],
  );

  // Object types present in the model (nodes + edge labels + involvements), for the controls card chips.
  const modelObjectTypes = useMemo(() => {
    if (!value) return [] as string[];
    const s = new Set<string>();
    for (const n of value.nodes) if (n.kind !== "activity") s.add(n.type);
    for (const e of value.edges) {
      for (const grp of [e.label.each, e.label.all, e.label.any]) {
        for (const a of grp) {
          if (a.type === "Simple") s.add(a.object_type);
          else {
            s.add(a.first);
            s.add(a.second);
          }
        }
      }
    }
    for (const per of Object.values(activityInvolvements ?? {})) {
      for (const [ot, c] of Object.entries(per ?? {})) if (c && c.max > 0) s.add(ot);
    }
    return [...s].sort();
  }, [value, activityInvolvements]);

  // Uncontrolled: a non-destructive visibility hide that never mutates the model. Controlled: the
  // host owns the semantics (typically a lossless projection) and passes the full activities list.
  const activitiesControlled = onHiddenActivitiesChange !== undefined;
  const [hiddenActInternal, setHiddenActInternal] = useState<Set<string>>(
    () => new Set(hiddenActivitiesProp),
  );
  const hiddenActivities = (activitiesControlled ? hiddenActivitiesProp : undefined) ?? hiddenActInternal;
  const setHiddenActivities = useCallback(
    (next: Set<string>) => {
      onHiddenActivitiesChange?.(next);
      if (!activitiesControlled) setHiddenActInternal(next);
    },
    [activitiesControlled, onHiddenActivitiesChange],
  );
  const modelActivities = useMemo(() => {
    if (!value) return [] as string[];
    return [...new Set(value.nodes.filter((n) => n.kind === "activity").map((n) => n.type))].sort();
  }, [value]);
  const chromeActivities = activitiesProp ?? modelActivities;

  // When some activities are hidden, fold their constraints into the survivors (lossless) and render
  // that instead of the raw model. Endpoints stay in the kept set or the projection drops their arcs.
  useEffect(() => {
    if (!onProjectActivities || !value || hiddenActivities.size === 0) {
      setProjectedModel(null);
      return;
    }
    const arcs = toArcs(value);
    const kept = [...new Set(arcs.flatMap((a) => [a.from, a.to]))].filter((name) => {
      const { type, kind } = parseNodeName(name);
      return kind !== "activity" || !hiddenActivities.has(type);
    });
    let cancelled = false;
    onProjectActivities(arcs, kept)
      .then((r) => !cancelled && setProjectedModel(arcsToModel(r)))
      .catch(() => !cancelled && setProjectedModel(null));
    return () => {
      cancelled = true;
    };
  }, [value, hiddenActivities, onProjectActivities]);
  const displayNodes = useMemo(() => {
    if (hiddenActivities.size === 0) return nodes;
    return nodes.map((n) => ({
      ...n,
      hidden: n.data.kind === "activity" && hiddenActivities.has(n.data.label),
    }));
  }, [nodes, hiddenActivities]);
  const displayEdges = useMemo(() => {
    // zIndex 1 lifts arcs above the activity nodes, matching the SVG export's z-order.
    const hiddenIds = new Set(displayNodes.filter((n) => n.hidden).map((n) => n.id));
    return edges.map((e) => ({
      ...e,
      zIndex: 1,
      hidden: hiddenIds.has(e.source) || hiddenIds.has(e.target),
    }));
  }, [edges, displayNodes]);

  const colorMode = useIsDarkMode() ? "dark" : "light";

  return (
    <EditContext.Provider value={editContextValue}>
      <VizProvider value={ctxValue}>
        <div ref={rootRef} style={{ width: "100%", height: "100%", position: "relative" }}>
          <ReactFlow
            connectionLineType={ConnectionLineType.Straight}
            colorMode={colorMode}
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onDelete={onDelete}
            onBeforeDelete={isEdit ? undefined : async () => false}
            defaultViewport={defaultViewport}
            onMoveEnd={onViewportChange ? (_, vp) => onViewportChange(vp) : undefined}
            connectionMode={isEdit ? ConnectionMode.Loose : undefined}
            minZoom={0.1}
            maxZoom={2}
            nodesConnectable={isEdit}
            // Freeze node dragging while the projection overlay (a derived read-only view) is shown.
            nodesDraggable={projectedModel === null}
            onNodeClick={(_, node) => {
              const next = focusedNodeId === node.id ? null : node.id;
              setFocusedNodeId(next);
              onFocusChange?.(next);
            }}
            onPaneClick={() => {
              setFocusedNodeId(null);
              onFocusChange?.(null);
            }}
            onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
            onNodeMouseLeave={() => setHoveredNodeId(null)}
            proOptions={{ hideAttribution: true }}
          >
            <Panel position="top-left" className="pointer-events-none!">
              <div className="flex flex-col items-start gap-2 pointer-events-none">
                {isEdit && (
                  <div className="pointer-events-auto">
                    <EditToolbar />
                  </div>
                )}
                {projectedModel !== null && (
                  <div className="pointer-events-none rounded-md bg-(--amber-a3) border border-(--amber-a6) px-2 py-1 text-[10px] font-semibold text-(--amber-11)">
                    Projected view · read-only (show all activities to edit)
                  </div>
                )}
                <div className="pointer-events-auto">
                  <ControlsCard
                    direction={dir}
                    onDirectionChange={setDir}
                    textLabels={textLabels}
                    onTextLabelsChange={setTextLabels}
                    hiddenArcTypes={hiddenArcTypes}
                    onToggleArcType={toggleArcType}
                    objectTypes={modelObjectTypes}
                    hiddenObjectTypes={hiddenObjectTypes}
                    onToggleObjectType={toggleObjectType}
                    activities={chromeActivities}
                    activityCounts={eventTypeCounts}
                    hiddenActivities={hiddenActivities}
                    onSetHiddenActivities={setHiddenActivities}
                    usedArcTypes={usedArcTypes}
                    showCombined={combineEfEp}
                    arcsCount={arcsCount ?? value?.edges.length}
                    activityColor={activityColor}
                    objectTypeColor={objectTypeColor}
                  />
                </div>
              </div>
            </Panel>
          </ReactFlow>
          {isEdit && statsRequest && (
            <StatsSheet
              request={statsRequest}
              objectTypeColor={(name) => objectTypeColor(name, "normal")}
              onClose={() => setStatsRequest(null)}
            />
          )}
        </div>
      </VizProvider>
    </EditContext.Provider>
  );
});

export const OCDeclareViz = forwardRef<OCDeclareVizHandle, OCDeclareVizProps>(
  function OCDeclareViz(props, ref) {
    return (
      <div
        className={`oc-declare-viz-root ${props.className ?? "w-full h-full"}`}
        style={{
          position: "relative",
          minHeight: ACT_NODE_HEIGHT + 20,
          minWidth: ACT_NODE_WIDTH + 20,
        }}
      >
        <ReactFlowProvider>
          <OCDeclareVizInner ref={ref} {...props} />
        </ReactFlowProvider>
      </div>
    );
  },
);
