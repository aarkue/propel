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
import { latestOnly, noopDeclareLayout, roundedPointsToSvgPath } from "./layout-util";
import type { ActivityNodeData, ConstraintEdgeData } from "./types";
import { collapseFlowEdges } from "./collapse";
import { type ColorResolver, VizProvider } from "./VizContext";
import { defaultConnectLabel, defaultTemplate } from "./auto-label";
import {
  type DeclareEdge,
  type DeclareFlowModel,
  type DeclareNode,
  arcsToModel,
  mergeArcs,
  modelArcs,
  needsReroute,
  nodeDisplayName,
  parseNodeName,
  toArcs,
  uniqueName,
} from "./model";
import {
  constraintData,
  type DeclareScreenState,
  type ViolationBadge,
  declareBuildOptions,
  declareSvg,
  type EdgeRouteData,
  type InvolvementsMap,
  layoutRoutes,
  persistedRoutes,
  nodeCentres,
  placeNodes,
  refsToFlowEdges,
} from "./viz-layout";
import { layoutModel, modelLayoutRequest, rerouteModel, type VizTransport } from "../viz";
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
import { visibleArcCount } from "./projection";
import { editingContent, relayoutKey } from "./edit/edit-mode";
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
  /**
   * Whether the graph may re-arrange itself: after a node is dropped, and when a change such as
   * switching the involvement notation alters how much room the arcs need. The Layout button and
   * Alt+L keep working, so turning this off leaves the user in charge of the arrangement.
   * @default true
   */
  relayoutOnChange?: boolean;
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
  /** Objects per object type from the OCEL, to sort the object-type picker by frequency. */
  objectTypeCounts?: Record<string, number>;
  /** Default true. False leaves the activity picker out of the controls card (the host offers one). */
  activityPicker?: boolean;
  /** Default true. With `editable`, false keeps the layout in the model (positions, routing, saved
   *  drags) but offers no content editing: no toolbar, connecting, rename or delete. */
  editTools?: boolean;
  /** Without content editing (read-only, or `editTools={false}`): hovering an activity offers Hide
   *  (project it away) and Focus (keep it and its neighbors). Absent: no hover actions. */
  onHideActivity?: (activity: string) => void;
  onFocusActivity?: (activity: string) => void;
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
  /** rust4pm's visualization, which lays the constraints out and draws the SVG export. Defaults to
   *  the ambient `ViewerConfig.viz`. Without one, the activities stack in a column and only the
   *  snapshot export is offered. */
  viz?: VizTransport;
}

/** Imperative handle for the viz: exposes current laid-out nodes/edges for export. */
export interface OCDeclareVizHandle {
  getLayoutedNodes: () => Node<ActivityNodeData, "activity">[];
  getLayoutedEdges: () => Edge<ConstraintEdgeData, "constraint">[];
}

const NODE_TYPES = { activity: ActivityNode };
const EDGE_TYPES = { constraint: ConstraintEdge };

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
  // In code point order, as rust4pm's export lists them, so both show the same types in the strip.
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
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
    data: constraintData(e, i),
  }));
  return { initNodes, initEdges };
}

/** `next` with each node's measured size from `cur`. ReactFlow draws an edge only between measured
 *  nodes, and does not measure a node again whose box kept its size, so a node replaced without
 *  it would keep its edges hidden. */
function keepMeasured(cur: FlowNode[], next: FlowNode[]): FlowNode[] {
  const measured = new Map(cur.map((n) => [n.id, n.measured]));
  return next.map((n) => (n.measured || !measured.get(n.id) ? n : { ...n, measured: measured.get(n.id) }));
}

/** The geometry an edge keeps across a model change: its live route, else the one saved in the model. */
function keptRoute(live: FlowEdge | undefined, saved: DeclareEdge | undefined): EdgeRouteData {
  const d = live?.data;
  if (d?.routedPoints) {
    const { routedPoints, routedPath, labelAnchor, layoutSourcePos, layoutTargetPos } = d;
    return { routedPoints, routedPath, labelAnchor, layoutSourcePos, layoutTargetPos };
  }
  const r = saved?.route;
  if (!r) return {};
  return {
    routedPoints: r.points,
    routedPath: roundedPointsToSvgPath(r.points, 16),
    labelAnchor: r.labelAnchor,
    layoutSourcePos: r.sourcePos,
    layoutTargetPos: r.targetPos,
  };
}

const OCDeclareVizInner = forwardRef<OCDeclareVizHandle, OCDeclareVizProps>(function OCDeclareVizInner(
  {
    combineEfEp = true,
    activityColor = defaultActivityColor,
    objectTypeColor = defaultObjectTypeColor,
    activityInvolvements,
    eventTypeCounts = {},
    objectTypeCounts,
    activityPicker = true,
    editTools = true,
    onHideActivity,
    onFocusActivity,
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
    viz: vizProp,
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
    relayoutOnChange = true,
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
  // Edit mode without the tools keeps the layout in the model but offers no content editing.
  const canEdit = editingContent(editable && !!value, editTools, projectedModel !== null);
  const viz = useViewerConfig({ viz: vizProp }).viz;
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ActivityNodeData, "activity">>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<ConstraintEdgeData, "constraint">>([]);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  // A read-only model is rebuilt with fresh ids (e.g., on every projection), so a kept focus would
  // land on another activity or on none at all and dim the whole graph.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset whenever the shown model changes
  useEffect(() => {
    if (!isEdit) setFocusedNodeId(null);
  }, [effectiveValue, isEdit]);
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
  const setHiddenObjectTypes = useCallback(
    (next: Set<string>) => {
      onHiddenObjectTypesChange?.(next);
      if (!objTypesControlled) setHiddenObjInternal(next);
    },
    [objTypesControlled, onHiddenObjectTypesChange],
  );
  // Bumped after mutations that add positionless nodes; effect-run so the layout reads the committed model.
  const [relayoutTick, setRelayoutTick] = useState(0);
  const { fitView, getNodes, getEdges, screenToFlowPosition } = useReactFlow();
  const connectingNodeId = useRef<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const mousePos = useRef({ x: 0, y: 0 });

  useImperativeHandle(
    ref,
    () => ({
      getLayoutedNodes: () => nodes,
      getLayoutedEdges: () => edges,
    }),
    [nodes, edges],
  );

  const valueRef = useRef(value);
  valueRef.current = value;
  const effectiveValueRef = useRef(effectiveValue);
  effectiveValueRef.current = effectiveValue;

  // undefined on an empty model so the legend shows every type as guidance.
  const usedArcTypes = useMemo(() => {
    if (edges.length === 0) return undefined;
    return new Set<string>(edges.flatMap((e) => (e.data?.arcType ? [e.data.arcType] : [])));
  }, [edges]);

  const layoutOptions = useMemo(
    () => declareBuildOptions({ direction: dir, textLabels, combineEfEp }),
    [dir, textLabels, combineEfEp],
  );

  /** Lays a model out: rust4pm through `viz`, else the engine-less column. */
  const layoutFlow = useCallback(
    async (model: DeclareFlowModel): Promise<{ nodes: FlowNode[]; edges: FlowEdge[] }> => {
      const { initNodes, initEdges } = modelToFlow(model, activityInvolvements);
      if (!viz) {
        const r = await noopDeclareLayout(initNodes, bundleEdges(collapseFlowEdges(initEdges, combineEfEp)));
        return { nodes: r.nodes, edges: r.edges as FlowEdge[] };
      }
      const { arcs, edgeIds, extraActivities } = modelArcs(model);
      const laid = await layoutModel(viz, "oc_declare", arcs, {
        ...layoutOptions,
        extra_activities: extraActivities,
      });
      const placed = placeNodes(model, laid);
      const routes = layoutRoutes(model, laid, edgeIds, laid.layout);
      return {
        nodes: initNodes.map((n) => {
          const p = placed.get(n.id);
          return p ? { ...n, position: p.position, width: p.width, height: p.height } : n;
        }),
        edges: refsToFlowEdges(model, laid.edges, edgeIds).map((e) => ({
          ...e,
          data: { ...(e.data as ConstraintEdgeData), ...routes.get(e.id) },
        })),
      };
    },
    [viz, activityInvolvements, combineEfEp, layoutOptions],
  );

  // Full layouts landed so far, in either path. A re-route started before one landed was made for
  // positions the layout replaced.
  const landedLayouts = useRef(0);
  // A drop during a pending full layout must not re-route, which would cancel the layout.
  const fullLayoutPending = useRef(false);
  // A layout builds its node data when it starts, so one that lands later takes the current involvements.
  const involvementsRef = useRef(activityInvolvements);
  involvementsRef.current = activityInvolvements;
  const withCurrentInvolvements = useCallback(
    (laid: FlowNode[]): FlowNode[] =>
      laid.map((n) => ({
        ...n,
        data: { ...n.data, objectTypes: buildActivityObjectTypes(involvementsRef.current, n.data.label) },
      })),
    [],
  );

  // Read-only render path: the non-editable viewer and the projected overlay (isEdit is off for both).
  useEffect(() => {
    if (isEdit || !effectiveValue) return;
    let cancelled = false;
    layoutFlow(effectiveValue)
      .then((r) => {
        if (cancelled) return;
        landedLayouts.current++;
        setNodes((cur) => keepMeasured(cur, withCurrentInvolvements(r.nodes)));
        setEdges(r.edges);
        setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
      })
      .catch((e) => console.error("[oc-declare] layout failed:", e));
    return () => {
      cancelled = true;
    };
  }, [effectiveValue, isEdit, layoutFlow, setNodes, setEdges, fitView, withCurrentInvolvements]);

  const mutate = useCallback(
    (fn: (m: DeclareFlowModel) => DeclareFlowModel) => {
      const v = valueRef.current;
      if (!v || !onChange) return;
      const next = fn(v);
      // Another mutation before the next render builds on this one.
      valueRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  /**
   * Writes layout output back to the model. Positions and routes both have to land here: a route
   * left only in flow state is lost on reload, and the stored one, computed against the previous
   * geometry, renders as stray bendpoints. Collapsed EFEP/DFDP edges keep the forward edge's id.
   */
  const persistLayout = useCallback(
    (laid: {
      nodes: readonly { id: string; position: { x: number; y: number } }[];
      edges: readonly FlowEdge[];
    }) => {
      const posById = new Map(laid.nodes.map((n) => [n.id, n.position]));
      const routeById = persistedRoutes(laid.edges);
      // An arc the layout drew without a route loses its saved one, which belongs to old positions.
      const drawn = new Set(
        laid.edges.flatMap((e) => [e.id, ...(e.data?.pair ? [e.data.pair.backward] : [])]),
      );
      mutate((m) => ({
        nodes: m.nodes.map((n) => ({ ...n, position: posById.get(n.id) ?? n.position })),
        edges: m.edges.map((e) => {
          const route = routeById.get(e.id);
          if (route) return { ...e, route };
          if (!drawn.has(e.id) || !e.route) return e;
          const { route: _stale, ...rest } = e;
          return rest;
        }),
      }));
    },
    [mutate],
  );

  // Full layouts and re-routes resolve in any order. Only the latest one started may land, or an
  // older result would put back routes and positions from before a later drag. Nor may one land
  // after unmount, over a newer graph of the same model. Set on mount, as StrictMode remounts.
  const startLayoutRun = useRef(latestOnly());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const layoutRun = useCallback(() => {
    const latest = startLayoutRun.current();
    return () => latest() && mounted.current;
  }, []);

  const runFullLayout = useCallback(
    (fit = true) => {
      const v = valueRef.current;
      if (!v) return;
      const current = layoutRun();
      fullLayoutPending.current = true;
      layoutFlow(v)
        .then((r) => {
          if (!current()) return;
          landedLayouts.current++;
          setNodes((cur) => keepMeasured(cur, withCurrentInvolvements(r.nodes)));
          setEdges(r.edges);
          persistLayout(r);
          if (fit) setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
        })
        .catch((e) => console.error("[oc-declare] layout failed:", e))
        .finally(() => {
          if (current()) fullLayoutPending.current = false;
        });
    },
    [layoutFlow, setNodes, setEdges, fitView, persistLayout, layoutRun, withCurrentInvolvements],
  );

  // Effect, not inline in the caller, so the layout reads the model AFTER the mutation committed.
  const runFullLayoutRef = useRef(runFullLayout);
  runFullLayoutRef.current = runFullLayout;
  useEffect(() => {
    if (relayoutTick > 0) runFullLayoutRef.current(true);
  }, [relayoutTick]);

  // Label width, per-pair arc count and direction change the arrangement, so an editable graph lays
  // out again when they change, unless the host turned automatic relayout off.
  const spacingKey = relayoutKey({ textLabels, combineEfEp, direction: dir });
  const prevSpacingKey = useRef(spacingKey);
  useEffect(() => {
    if (prevSpacingKey.current !== spacingKey) {
      prevSpacingKey.current = spacingKey;
      if (isEdit && relayoutOnChange) setRelayoutTick((t) => t + 1);
    }
  }, [spacingKey, isEdit, relayoutOnChange]);

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
      pendingReroute.current = needsReroute(value);
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
          width: ex?.width ?? ACT_NODE_WIDTH,
          height: ex?.height ?? ACT_NODE_HEIGHT,
          // Without it, ReactFlow re-measures the node and drops its edges for a frame, which
          // unmounts every edge and closes an open edge popover on each model change.
          measured: ex?.measured,
          selected: ex?.selected ?? false,
          data: {
            label: mn.type,
            kind: mn.kind,
            objectTypes: buildActivityObjectTypes(activityInvolvements, mn.type),
          },
        } satisfies FlowNode;
      });
    });
    const savedById = new Map(value.edges.map((e) => [e.id, e]));
    const withGeometry = (cur: FlowEdge[], built: FlowEdge[]): FlowEdge[] => {
      const curById = new Map(cur.map((e) => [e.id, e]));
      return built.map((b) => {
        const ex = curById.get(b.id);
        return {
          ...b,
          selected: ex?.selected ?? false,
          data: { ...(b.data as ConstraintEdgeData), ...keptRoute(ex, savedById.get(b.id)) },
        };
      });
    };
    if (!viz) {
      const built = value.edges.map(
        (e, i): FlowEdge => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: "constraint",
          data: constraintData(e, i),
        }),
      );
      setEdges((cur) => withGeometry(cur, bundleEdges(collapseFlowEdges(built, combineEfEp)) as FlowEdge[]));
      return;
    }
    // rust4pm decides which arcs merge, so the edges wait for the model's graph.
    const { arcs, edgeIds, extraActivities } = modelArcs(value);
    let cancelled = false;
    modelLayoutRequest(viz, "oc_declare", arcs, { ...layoutOptions, extra_activities: extraActivities })
      .then((req) => {
        if (!cancelled) setEdges((cur) => withGeometry(cur, refsToFlowEdges(value, req.edges, edgeIds)));
      })
      .catch((e) => console.error("[oc-declare] graph build failed:", e));
    return () => {
      cancelled = true;
    };
  }, [
    value,
    isEdit,
    viz,
    activityInvolvements,
    combineEfEp,
    layoutOptions,
    runFullLayout,
    setNodes,
    setEdges,
    defaultViewport,
    fitView,
  ]);

  useEffect(() => {
    if (!canEdit) return;
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
        // Pasted arcs arrive without positions, so this one runs regardless.
        setRelayoutTick((t) => t + 1);
        return;
      }
      if (parsed.nodes.length === 0 && parsed.edges.length === 0) return;
      const v = valueRef.current;
      if (!v) return;
      // A pasted node whose name the model has already is that node, as rust4pm knows nodes by name.
      const existing = new Map(v.nodes.map((n) => [nodeDisplayName(n), n.id]));
      const idMap = new Map<string, string>();
      const anchor = parsed.nodes[0]?.position ?? { x: 0, y: 0 };
      const drop = screenToFlowPosition(mousePos.current);
      const dx = drop.x - anchor.x;
      const dy = drop.y - anchor.y;
      const newNodes: DeclareNode[] = [];
      for (const n of parsed.nodes) {
        const known = existing.get(nodeDisplayName(n));
        if (known) {
          idMap.set(n.id, known);
          continue;
        }
        const id = uid();
        idMap.set(n.id, id);
        existing.set(nodeDisplayName(n), id);
        newNodes.push({
          ...n,
          id,
          position: n.position ? { x: n.position.x + dx, y: n.position.y + dy } : undefined,
        });
      }
      const newEdges: DeclareEdge[] = parsed.edges
        .filter((ed) => idMap.has(ed.source) && idMap.has(ed.target))
        .map((ed) => ({
          ...ed,
          id: uid(),
          source: idMap.get(ed.source) as string,
          target: idMap.get(ed.target) as string,
        }));
      mutate((m) => ({ nodes: [...m.nodes, ...newNodes], edges: [...m.edges, ...newEdges] }));
      const nodeIds = new Set(parsed.nodes.map((n) => idMap.get(n.id) as string));
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
          nodes: [
            ...m.nodes,
            { id: uid(), type: uniqueName(m, "new activity", "activity"), kind: "activity", position: pos },
          ],
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
  }, [canEdit, getNodes, getEdges, mutate, screenToFlowPosition, setNodes, setEdges]);

  const editContextValue = useMemo<EditContextValue | null>(() => {
    if (!canEdit || !value) return null;
    return {
      model: value,
      mutate,
      palette: { eventTypes, objectTypes, eventTypeCounts, objectTypeCounts },
      relatedTypes,
      getSupport,
      callbacks: { onDiscover, onEvaluate, onActivityStatistics, onEdgeStatistics, onTemplateString },
      openStats: setStatsRequest,
      runLayout: () => setRelayoutTick((t) => t + 1),
      newNodePosition: () => {
        const r = rootRef.current?.getBoundingClientRect();
        const centre = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 };
        const p = screenToFlowPosition(centre);
        return { x: p.x - ACT_NODE_WIDTH / 2, y: p.y - ACT_NODE_HEIGHT / 2 };
      },
    };
  }, [
    canEdit,
    value,
    mutate,
    eventTypes,
    objectTypes,
    eventTypeCounts,
    objectTypeCounts,
    relatedTypes,
    getSupport,
    onDiscover,
    onEvaluate,
    onActivityStatistics,
    onEdgeStatistics,
    onTemplateString,
    screenToFlowPosition,
  ]);

  // Drag-connect: dropping on a node connects (onConnect); dropping on empty canvas creates a node there (onConnectEnd).
  const onConnectStart = useCallback<OnConnectStart>((_, params) => {
    connectingNodeId.current = params.nodeId ?? null;
  }, []);

  const onConnect = useCallback(
    (c: Connection) => {
      const v = valueRef.current;
      if (!canEdit || !v) return;
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
    [canEdit, relatedTypes, mutate],
  );

  const onConnectEnd = useCallback<OnConnectEnd>(
    (event) => {
      const src = connectingNodeId.current;
      connectingNodeId.current = null;
      const v = valueRef.current;
      if (!canEdit || !src || !v) return;
      const targetEl = event.target as Element | null;
      // Dropped on a node: onConnect already made the edge. Only the pane creates a node.
      if (!targetEl?.classList?.contains("react-flow__pane")) return;
      const s = v.nodes.find((n) => n.id === src);
      if (!s) return;
      const point = "clientX" in event ? event : event.changedTouches[0];
      const pos = screenToFlowPosition({ x: point.clientX, y: point.clientY });
      const newNode: DeclareNode = {
        id: uid(),
        type: uniqueName(v, "new activity", "activity"),
        kind: "activity",
        position: pos,
      };
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
    [canEdit, screenToFlowPosition, relatedTypes, mutate],
  );

  // Deletion must reach the model, not just flow state, or deleted arcs resurface on the next rebuild.
  // A collapsed EFEP/DFDP edge stands for two model edges (`data.pair`); deleting it removes both.
  const onDelete = useCallback<NonNullable<ReactFlowProps["onDelete"]>>(
    ({ nodes: delNodes, edges: delEdges }) => {
      if (!canEdit) return;
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
    [canEdit, mutate],
  );

  // rust4pm re-routes every arc over the current node centres. No node moves.
  const rerouteArcs = useCallback(() => {
    const model = isEdit ? valueRef.current : effectiveValueRef.current;
    if (!viz || !model) return;
    const { arcs, edgeIds, extraActivities } = modelArcs(model);
    const current = layoutRun();
    const landedAtStart = landedLayouts.current;
    // A new projection is a new model whose ids can name other arcs.
    const stale = () =>
      landedLayouts.current !== landedAtStart || (!isEdit && effectiveValueRef.current !== model);
    void (async () => {
      const req = await modelLayoutRequest(viz, "oc_declare", arcs, {
        ...layoutOptions,
        extra_activities: extraActivities,
      });
      const flowNodes = getNodes() as FlowNode[];
      const layout = await rerouteModel(viz, req, nodeCentres(model, req.nodes, flowNodes));
      if (!current() || stale()) return;
      const routes = layoutRoutes(model, req, edgeIds, layout);
      const routed = (e: FlowEdge): FlowEdge => {
        const r = routes.get(e.id);
        return r ? { ...e, data: { ...(e.data as ConstraintEdgeData), ...r } } : e;
      };
      setEdges((cur) => cur.map(routed));
      // A projected overlay's ids are not the model's, so its drags stay on screen only.
      if (isEdit) persistLayout({ nodes: flowNodes, edges: (getEdges() as FlowEdge[]).map(routed) });
    })().catch((e) => console.error("[oc-declare] reroute failed:", e));
  }, [viz, layoutOptions, getNodes, getEdges, setEdges, isEdit, persistLayout, layoutRun]);

  // Persists moved nodes and re-routes over their new positions, after a drop or an arrow-key move.
  const commitMoves = useCallback(
    (moved: readonly { id: string; position: { x: number; y: number } }[]) => {
      if (isEdit) {
        const position = new Map(moved.map((n) => [n.id, n.position]));
        mutate((m) => ({
          ...m,
          nodes: m.nodes.map((n) => (position.has(n.id) ? { ...n, position: position.get(n.id) } : n)),
        }));
      }
      // Re-routing is the optional part: a host with automatic relayout off keeps the arcs it had.
      if (relayoutOnChange && !fullLayoutPending.current) rerouteArcs();
    },
    [isEdit, mutate, relayoutOnChange, rerouteArcs],
  );

  const dragging = useRef(false);
  const onNodeDragStart = useCallback(() => {
    dragging.current = true;
  }, []);
  const onNodeDragStop = useCallback<NonNullable<ReactFlowProps["onNodeDragStop"]>>(
    (_e, dragged, draggedNodes) => {
      dragging.current = false;
      commitMoves(draggedNodes.length > 0 ? draggedNodes : [dragged]);
    },
    [commitMoves],
  );

  // Arrow keys move selected nodes through `onNodesChange` alone, with no drag events, so the move
  // is committed once the keys rest.
  const keyMoves = useRef(new Set<string>());
  const keyMoveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (keyMoveTimer.current) clearTimeout(keyMoveTimer.current);
    },
    [],
  );
  const handleNodesChange = useCallback<typeof onNodesChange>(
    (changes) => {
      onNodesChange(changes);
      if (dragging.current) return;
      for (const c of changes)
        if (c.type === "position" && c.position && !c.dragging) keyMoves.current.add(c.id);
      if (keyMoves.current.size === 0) return;
      if (keyMoveTimer.current) clearTimeout(keyMoveTimer.current);
      keyMoveTimer.current = setTimeout(() => {
        const ids = keyMoves.current;
        keyMoves.current = new Set();
        commitMoves((getNodes() as FlowNode[]).filter((n) => ids.has(n.id)));
      }, 300);
    },
    [onNodesChange, commitMoves, getNodes],
  );

  // A model opened with placed nodes but unrouted arcs (a saved file) gets its arcs routed once the
  // nodes are on the canvas.
  const pendingReroute = useRef(false);
  useEffect(() => {
    if (!pendingReroute.current || nodes.length === 0 || edges.length === 0) return;
    pendingReroute.current = false;
    rerouteArcs();
  }, [nodes, edges, rerouteArcs]);

  // Each arc's badges as drawn, so the export draws them where the screen does.
  const drawnBadges = useRef(new Map<string, ViolationBadge[]>());
  const reportBadges = useCallback((edgeId: string, badges: ViolationBadge[] | null) => {
    if (badges?.length) drawnBadges.current.set(edgeId, badges);
    else drawnBadges.current.delete(edgeId);
  }, []);
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
      onHideActivity,
      onFocusActivity,
      reportBadges,
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
      onHideActivity,
      onFocusActivity,
      reportBadges,
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
  // Read at export time, so the export shows the screen as of the click.
  const screenRef = useRef<DeclareScreenState | null>(null);
  screenRef.current = effectiveValue
    ? {
        model: effectiveValue,
        nodes: displayNodes,
        edges: displayEdges,
        options: layoutOptions,
        hiddenArcTypes,
        hiddenObjectTypes,
        focusedNodeId,
        involvements: activityInvolvements,
        hostColor: (name, kind) => {
          const [resolve, scope] =
            kind === "activity" ? [activityColor, "activity"] : [objectTypeColor, "objectType"];
          const color = resolve(name, "normal");
          return color === colorForKey(scope, name) ? undefined : color;
        },
      }
    : null;
  const exportSource = useMemo<VectorExportSource | null>(
    () =>
      viz
        ? {
            label: "OC-DECLARE",
            toSvg: () =>
              screenRef.current
                ? declareSvg(viz, { ...screenRef.current, badges: [...drawnBadges.current.values()].flat() })
                : null,
          }
        : null,
    [viz],
  );
  useRegisterExport("oc-declare", exportSource);

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
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onDelete={onDelete}
            onBeforeDelete={canEdit ? undefined : async () => false}
            defaultViewport={defaultViewport}
            onMoveEnd={onViewportChange ? (_, vp) => onViewportChange(vp) : undefined}
            connectionMode={canEdit ? ConnectionMode.Loose : undefined}
            minZoom={0.1}
            maxZoom={2}
            nodesConnectable={canEdit}
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
                {canEdit && (
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
                    objectTypeCounts={objectTypeCounts}
                    onSetHiddenObjectTypes={setHiddenObjectTypes}
                    activities={chromeActivities}
                    showActivities={activityPicker}
                    activityCounts={eventTypeCounts}
                    hiddenActivities={hiddenActivities}
                    onSetHiddenActivities={setHiddenActivities}
                    usedArcTypes={usedArcTypes}
                    showCombined={combineEfEp}
                    arcsCount={
                      arcsCount ??
                      (effectiveValue
                        ? visibleArcCount(effectiveValue, hiddenArcTypes, hiddenObjectTypes)
                        : undefined)
                    }
                    activityColor={activityColor}
                    objectTypeColor={objectTypeColor}
                  />
                </div>
              </div>
            </Panel>
          </ReactFlow>
          {canEdit && statsRequest && (
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
