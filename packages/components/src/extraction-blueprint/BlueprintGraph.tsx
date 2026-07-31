// The main ReactFlow surface.
//
// Five node types: the four row-graph ops (`Source`/`Filter`/`Join`/`Union`, dispatched off
// `op.type`) and `mapping`. Mappings are nodes, not a side panel: a mapping reads exactly one
// node's rows, which is an edge, and what it produces is the point of the blueprint. This mirrors
// OCPQ's editor, whose `ExtractorNode` sat on the canvas next to its table.
//
// Row-graph edges are still derived rather than stored -- `NodeOp`'s own fields and each
// mapping's `node` already say which nodes feed which, so a separate edge list would be a second
// source of truth (see model.ts). `onConnect` routes a drag-connect back into the right field.
import {
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionLineType,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  getBezierPath,
  type Node,
  type NodeChange,
  type OnConnect,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ContextMenu, Text } from "@r4pm/components/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type BlueprintLayoutFn, layoutBlueprintGraph } from "./elk-layout";
import {
  deriveEdges,
  entryMappings,
  entryTargetKind,
  withEntryNode,
  type EditorBlueprint,
  type EditorMapping,
  type EditorNode,
  toBlueprint,
} from "./model";
import { categoryOf } from "./node-summary";
import { blueprintNodeTypes, KIND_ACCENT, type BlueprintNodeData, type MappingNodeData } from "./nodes";
import type { BlueprintEditCallbacks } from "./edit/edit-context";
import { EditContext, type EditContextValue } from "./edit/edit-context";
import { LeftToolbar, RightToolbar } from "./edit/EditToolbar";
import { NodeDialog, type NodeDialogRequest } from "./edit/NodeDialog";
import {
  addMapping,
  addTransform,
  childPosition,
  freshId,
  suggestJoinKeys,
  suggestMappingSeed,
  type DraftKind,
} from "./edit/node-draft";
import { TableList, type TableRef } from "./edit/AddTableMenu";
import { ConnectionsDialog } from "./edit/ConnectionsDialog";
import { EmptyState } from "./edit/EmptyState";
import { groupValidationErrors } from "./edit/ValidationBadges";
import { useIsDarkMode } from "../viewer/dark-mode";
import { useViewerConfig } from "../viewer/viewer-config";
import type { ExtractionCatalog, MappingEntry, NodeOp, TablePreview, ValidationError } from "./types";

const EMPTY_CATALOG: ExtractionCatalog = { tables: {}, domains: {} };

/** Floating chrome shared by the canvas overlays, so they read as panes above the graph rather
 *  than as controls drawn on it. */
const TOOLBAR_CHROME: React.CSSProperties = {
  background: "var(--color-panel-translucent)",
  backdropFilter: "blur(8px)",
  border: "1px solid var(--gray-a5)",
  boxShadow: "0 4px 14px -6px rgba(0,0,0,0.25)",
};

type FlowNode = Node<BlueprintNodeData | MappingNodeData>;

/** Edge stroke per kind: a mapping edge takes the color of the mapping it feeds, so the canvas
 *  reads as "these rows become events / objects / relations" without following the arrow. */
function edgeColor(kind: "row" | "mapping", targetKind: string | undefined): string {
  if (kind === "row") return "var(--gray-8)";
  return `var(--${KIND_ACCENT[categoryOf(targetKind as never)]}-9)`;
}

/**
 * Edges are drawn from the *live* handle positions ReactFlow passes in, not from a path ELK
 * routed. Two bugs came from doing it the other way round: a node added after the initial layout
 * had no routed path at all and so rendered no edge, and dragging a node left its edges frozen
 * where the layout had put them. ELK still decides where nodes go; it just no longer owns how the
 * lines between them look.
 */
function BlueprintEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const color = (data as { color?: string } | undefined)?.color ?? "var(--gray-8)";
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.35,
  });
  // No arrowhead: the graph always flows left to right, so the layout already shows direction.
  return (
    <g>
      {/* A wide transparent stroke under the visible one, so an edge is clickable without having
          to hit a 2px line. */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={14} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={selected ? 3 : 2}
        strokeOpacity={selected ? 1 : 0.9}
        strokeLinecap="round"
      />
    </g>
  );
}

const edgeTypes: EdgeTypes = { blueprint: BlueprintEdge };

/** Take content from `fresh`, but keep React Flow's per-node measurements and (unless `positions`
 *  overrides it) placement from `current`. Dropping `measured`/`width`/`height` leaves the graph
 *  without dimensions until the next frame, and a `fitView` in that window fits an empty box. */
function mergeFlowNodes(
  current: FlowNode[],
  fresh: FlowNode[],
  positions?: Map<string, { x: number; y: number }>,
): FlowNode[] {
  const previous = new Map(current.map((n) => [n.id, n]));
  return fresh.map((n) => {
    const prev = previous.get(n.id);
    const position = positions?.get(n.id) ?? prev?.position ?? n.position;
    if (!prev) return { ...n, position };
    return {
      ...prev,
      ...n,
      position,
      measured: prev.measured,
      width: prev.width,
      height: prev.height,
    };
  });
}

function toFlowNodes(
  model: EditorBlueprint,
  errorsByNode: Map<string, ValidationError[]>,
  catalog: ExtractionCatalog,
): FlowNode[] {
  const nodeIds = new Set(model.nodes.map((n) => n.id));
  const rowNodes: FlowNode[] = model.nodes.map((n) => ({
    id: n.id,
    type: n.op.type,
    position: n.position ?? { x: 0, y: 0 },
    data: {
      node: n,
      errorCount: errorsByNode.get(n.id)?.length ?? 0,
      columns: n.op.type === "source" ? catalog.tables[n.op.source_id]?.[n.op.table]?.columns : undefined,
    },
  }));
  const mappingNodes: FlowNode[] = model.mappings.map((m) => {
    const from = entryMappings(m.entry)[0]?.node;
    return {
      id: m.id,
      type: "mapping",
      position: m.position ?? { x: 0, y: 0 },
      data: {
        mapping: m,
        errorCount: errorsByNode.get(m.id)?.length ?? 0,
        hasSource: !!from && nodeIds.has(from),
      },
    };
  });
  return [...rowNodes, ...mappingNodes];
}

export interface BlueprintGraphProps {
  value: EditorBlueprint;
  onChange?: (next: EditorBlueprint) => void;
  editable?: boolean;
  /** Connections are held here (or by the host, via `onConnectionsChange`) -- never in `value`. */
  connections?: Record<string, string>;
  onConnectionsChange?: (next: Record<string, string>) => void;
  /** Controlled catalog; when absent, fetched via `callbacks.onDiscoverCatalog` on connection
   *  changes (debounced), falling back to an empty catalog with none. */
  catalog?: ExtractionCatalog;
  callbacks?: BlueprintEditCallbacks;
  layoutOverride?: BlueprintLayoutFn;
  className?: string;
}

function BlueprintGraphInner({
  value,
  onChange,
  editable = true,
  connections: connectionsProp,
  onConnectionsChange,
  catalog: catalogProp,
  callbacks = {},
  layoutOverride,
}: BlueprintGraphProps) {
  const cfg = useViewerConfig({});
  const runLayout = layoutOverride ?? cfg.layout?.blueprint ?? layoutBlueprintGraph;
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<NodeDialogRequest | null>(null);
  const [showConnections, setShowConnections] = useState(false);
  const { fitView, screenToFlowPosition } = useReactFlow();
  const isEdit = editable && !!onChange;

  const valueRef = useRef(value);
  valueRef.current = value;
  /** Where the last context menu opened, in flow coordinates -- a table added from it lands under
   *  the cursor rather than at a fixed spot. */
  const menuPos = useRef<{ x: number; y: number } | null>(null);

  // Connections: controlled when `onConnectionsChange` is given, else internal state.
  const connectionsControlled = onConnectionsChange !== undefined;
  const [connectionsInternal, setConnectionsInternal] = useState<Record<string, string>>(
    connectionsProp ?? {},
  );
  const connections = (connectionsControlled ? connectionsProp : undefined) ?? connectionsInternal;
  const setConnections = useCallback(
    (next: Record<string, string>) => {
      onConnectionsChange?.(next);
      if (!connectionsControlled) setConnectionsInternal(next);
    },
    [connectionsControlled, onConnectionsChange],
  );

  // Catalog: controlled, or fetched via onDiscoverCatalog when `connections` changes (debounced).
  const [catalogFetched, setCatalogFetched] = useState<ExtractionCatalog>(EMPTY_CATALOG);
  const [previews, setPreviews] = useState<Record<string, Record<string, TablePreview>>>({});
  const catalogBase = catalogProp ?? catalogFetched;
  // Stable identity matters: `resolveAllNodeColumns` caches on the catalog object.
  const catalog = useMemo(
    () => (Object.keys(previews).length === 0 ? catalogBase : { ...catalogBase, previews }),
    [catalogBase, previews],
  );
  // Why discovery failed, if it did. Held as state rather than swallowed or toasted: a swallowed
  // rejection leaves an empty canvas with nothing to act on (an unreadable file, a connection the
  // build cannot open, a source the host no longer holds all look identical), and this effect
  // re-runs on every connection keystroke, so a toast per attempt would be a storm.
  const [catalogError, setCatalogError] = useState<string | null>(null);
  useEffect(() => {
    if (catalogProp || !callbacks.onDiscoverCatalog) return;
    const t = setTimeout(() => {
      callbacks
        .onDiscoverCatalog?.(connections)
        .then((c) => {
          setCatalogFetched(c);
          setCatalogError(null);
        })
        .catch((e) => setCatalogError(e instanceof Error ? e.message : String(e)));
    }, 400);
    return () => clearTimeout(t);
    // `callbacks` itself is deliberately excluded: a host passing an inline object literal would
    // otherwise restart the debounce timer every render.
  }, [connections, catalogProp, callbacks.onDiscoverCatalog]);

  // A few real rows per table, fetched lazily for the tables a Source node actually reads. Each
  // (source, table, connection) is attempted once; a preview is a nicety, so failures stay silent.
  const previewRequested = useRef(new Set<string>());
  useEffect(() => {
    const fetchPreview = callbacks.onTablePreview;
    if (!fetchPreview) return;
    for (const node of value.nodes) {
      if (node.op.type !== "source") continue;
      const sourceId = node.op.source_id;
      const table = node.op.table;
      const connection = connections[sourceId];
      if (!sourceId || !table || !connection) continue;
      const key = `${sourceId}\u0000${table}\u0000${connection}`;
      if (previewRequested.current.has(key)) continue;
      previewRequested.current.add(key);
      fetchPreview(connections, sourceId, table)
        .then((preview) =>
          setPreviews((prev) => ({ ...prev, [sourceId]: { ...prev[sourceId], [table]: preview } })),
        )
        .catch(() => {});
    }
  }, [value.nodes, connections, callbacks.onTablePreview]);

  // Validation: debounced on every model change; runs even without a full catalog (UnknownSource
  // etc. firing against an empty/partial catalog is correct -- nothing is proven to exist yet).
  const [errors, setErrors] = useState<ValidationError[]>([]);
  useEffect(() => {
    if (!callbacks.onValidate) return;
    const t = setTimeout(() => {
      callbacks
        .onValidate?.(toBlueprint(value), catalog)
        .then(setErrors)
        .catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [value, catalog, callbacks.onValidate]);

  const errorsByNode = useMemo(
    () => groupValidationErrors(errors, value.nodes).byNode,
    [errors, value.nodes],
  );

  const mutate = useCallback(
    (fn: (m: EditorBlueprint) => EditorBlueprint) => {
      const v = valueRef.current;
      if (onChange) onChange(fn(v));
    },
    [onChange],
  );

  // A fit is requested by bumping this counter and performed once every node has been measured.
  const [fitRequest, setFitRequest] = useState(0);
  const nodesInitialized = useNodesInitialized();
  useEffect(() => {
    if (fitRequest === 0 || !nodesInitialized) return;
    fitView({ padding: 0.15, duration: 300 });
  }, [fitRequest, nodesInitialized, fitView]);

  const applyLayoutResult = useCallback(
    (
      v: EditorBlueprint,
      derived: ReturnType<typeof deriveEdges>,
      posById: Map<string, { x: number; y: number }>,
    ) => {
      setNodes((current) => mergeFlowNodes(current, toFlowNodes(v, errorsByNode, catalog), posById));
      setEdges(
        derived.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          targetHandle: e.sourceHandle,
          type: "blueprint",
          data: { color: edgeColor(e.kind, e.targetKind) },
        })),
      );
      mutate((m) => ({
        ...m,
        nodes: m.nodes.map((n) => ({ ...n, position: posById.get(n.id) ?? n.position })),
        mappings: m.mappings.map((mp) => ({ ...mp, position: posById.get(mp.id) ?? mp.position })),
      }));
    },
    [setNodes, setEdges, mutate, errorsByNode, catalog],
  );

  const runFullLayout = useCallback(
    (fit = true) => {
      const v = valueRef.current;
      if (v.nodes.length === 0 && v.mappings.length === 0) return;
      const derived = deriveEdges(v.nodes, v.mappings);
      runLayout(v.nodes, derived, v.mappings)
        .then((r) => {
          // Applying an empty layout would snap every node to its fallback position.
          if (r.nodes.size === 0) {
            console.warn("[blueprint] layout returned no positions; keeping the current ones");
            return;
          }
          applyLayoutResult(v, derived, r.nodes);
          // Ask for the fit; the effect below runs it once React Flow reports the new nodes
          // measured. Firing it here -- even after a frame or two -- races that measurement, and a
          // fit computed from stale or missing dimensions parks the viewport away from the graph.
          if (fit) setFitRequest((n) => n + 1);
        })
        .catch((e) => console.error("[blueprint] layout failed", e));
    },
    [runLayout, applyLayoutResult],
  );

  // Layout once on first mount if positions are missing; otherwise reconcile in place.
  const didInitialLayout = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `didInitialLayout` guards the only read of `runFullLayout`, and it changes identity with the catalog -- listing it would re-run this whole reconcile on every preview that arrives.
  useEffect(() => {
    const anyNodes = value.nodes.length > 0 || value.mappings.length > 0;
    if (!didInitialLayout.current) {
      didInitialLayout.current = true;
      const missing = value.nodes.some((n) => !n.position) || value.mappings.some((m) => !m.position);
      if (missing && anyNodes) {
        runFullLayout(true);
        return;
      }
      setFitRequest((n) => n + 1);
    }
    // A position the model states wins; a node the model has not placed keeps where it already
    // sits, so a layout that has not yet round-tripped through `mutate` is not thrown away.
    const stated = new Map<string, { x: number; y: number }>();
    for (const n of value.nodes) if (n.position) stated.set(n.id, n.position);
    for (const m of value.mappings) if (m.position) stated.set(m.id, m.position);
    setNodes((current) => mergeFlowNodes(current, toFlowNodes(value, errorsByNode, catalog), stated));
    setEdges(
      deriveEdges(value.nodes, value.mappings).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        targetHandle: e.sourceHandle,
        type: "blueprint",
        data: { color: edgeColor(e.kind, e.targetKind) },
      })),
    );
  }, [value, errorsByNode, catalog, setNodes, setEdges, fitView]);

  // Route a drag-connect into the right field: a Join's targetHandle disambiguates left/right,
  // every other row node has exactly one input field, and a mapping node's input is `Mapping.node`.
  const onConnect = useCallback<OnConnect>(
    (c: Connection) => {
      if (!isEdit || !c.source || !c.target) return;
      if (c.source === c.target) return;
      const v = valueRef.current;
      const isMappingTarget = v.mappings.some((m) => m.id === c.target);
      if (isMappingTarget) {
        mutate((m) => ({
          ...m,
          mappings: m.mappings.map((mp) =>
            mp.id === c.target ? { ...mp, entry: withEntryNode(mp.entry, c.source as string) } : mp,
          ),
        }));
        return;
      }
      if (wouldCreateCycle(v.nodes, c.source, c.target)) return;
      mutate((m) => ({
        ...m,
        nodes: m.nodes.map((n) => {
          if (n.id !== c.target) return n;
          const op = n.op;
          if (op.type === "filter") return { ...n, op: { ...op, input: c.source as string } };
          if (op.type === "join") {
            const side = c.targetHandle === "right" ? "right" : "left";
            const joined = { ...op, [side]: c.source as string };
            // Both sides are known for the first time here. Only fill in key columns the user has
            // not touched -- an existing pair is a decision, and overwriting it on a re-wire would
            // silently undo their work.
            const untouched = joined.on.every(([l, r]) => !l && !r);
            if (untouched && joined.left && joined.right) {
              const keys = suggestJoinKeys(m.nodes, catalog, joined.left, joined.right);
              if (keys.length > 0) joined.on = keys;
            }
            return { ...n, op: joined };
          }
          if (op.type === "union") {
            if (op.inputs.includes(c.source as string)) return n;
            return { ...n, op: { ...op, inputs: [...op.inputs, c.source as string] } };
          }
          return n;
        }),
      }));
    },
    [isEdit, mutate, catalog],
  );

  // Cascading delete: also remove any node whose op, and any mapping whose `node`, would otherwise
  // dangle-reference a deleted one -- proactive, cheap prevention of `UnknownNodeRef` rather than
  // only surfacing it after a round trip to `extraction_validate`.
  const onNodesDelete = useCallback(
    (deleted: FlowNode[]) => {
      if (!isEdit) return;
      const deletedIds = new Set(deleted.map((n) => n.id));
      mutate((m) => {
        const nodes = cascadeDelete(m.nodes, deletedIds);
        const alive = new Set(nodes.map((n) => n.id));
        return {
          ...m,
          nodes,
          mappings: m.mappings.filter(
            (mp) => !deletedIds.has(mp.id) && alive.has(entryMappings(mp.entry)[0]?.node ?? ""),
          ),
        };
      });
      setSelectedNodeId((cur) => (cur && deletedIds.has(cur) ? null : cur));
    },
    [isEdit, mutate],
  );

  /** An edge is a rendering of a field, so deleting one clears that field. Without this, an edge
   *  could be selected and deleted with no effect at all -- it reappeared on the next render, since
   *  edges are derived from the model rather than stored. */
  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!isEdit) return;
      mutate((m) => {
        let nodes = m.nodes;
        let mappings = m.mappings;
        for (const e of deleted) {
          mappings = mappings.map((mp) =>
            mp.id === e.target ? { ...mp, entry: withEntryNode(mp.entry, "") } : mp,
          );
          nodes = nodes.map((n) => {
            if (n.id !== e.target) return n;
            const op = n.op;
            if (op.type === "filter") return { ...n, op: { ...op, input: "" } };
            if (op.type === "join") {
              const side = e.targetHandle === "right" ? "right" : "left";
              return { ...n, op: { ...op, [side]: "" } };
            }
            if (op.type === "union") {
              return { ...n, op: { ...op, inputs: op.inputs.filter((i) => i !== e.source) } };
            }
            return n;
          });
        }
        return { ...m, nodes, mappings };
      });
    },
    [isEdit, mutate],
  );

  const onNodeDragStop = useCallback(
    (_e: unknown, dragged: FlowNode) => {
      if (!isEdit) return;
      mutate((m) => ({
        ...m,
        nodes: m.nodes.map((n) => (n.id === dragged.id ? { ...n, position: dragged.position } : n)),
        mappings: m.mappings.map((mp) => (mp.id === dragged.id ? { ...mp, position: dragged.position } : mp)),
      }));
    },
    [isEdit, mutate],
  );

  /** Add a Source node for `ref` and open the add-mapping dialog on it.
   *
   *  A table on its own produces nothing, so stopping there leaves the user in front of a node
   *  with no indication that the `+` is the next step. `openMapping` is false only when several
   *  tables are being added at once. */
  const addTable = useCallback(
    (ref: TableRef, position?: { x: number; y: number }, openMapping = true) => {
      const id = freshId(
        ref.table.replace(/[^\w-]/g, "_") || "source",
        valueRef.current.nodes.map((n) => n.id),
      );
      mutate((m) => {
        const node: EditorNode = {
          id,
          op: { type: "source", source_id: ref.sourceId, table: ref.table },
          position: position ?? childPosition(m.nodes[m.nodes.length - 1], 1),
        };
        return { ...m, nodes: [...m.nodes, node] };
      });
      if (openMapping) setDialog({ mode: "create", sourceNodeId: id });
    },
    [mutate],
  );

  /** Replace the whole document. A loaded blueprint carries no positions, so layout has to run
   *  again -- otherwise every node lands on top of the others at (0, 0). */
  const importModel = useCallback(
    (next: EditorBlueprint, nextConnections?: Record<string, string>) => {
      if (!onChange) return;
      onChange(next);
      if (nextConnections) setConnections({ ...connections, ...nextConnections });
      setSelectedNodeId(null);
      didInitialLayout.current = false;
    },
    [onChange, connections, setConnections],
  );

  // ---- the add/edit dialog ----

  const dialogState = useMemo(() => {
    if (!dialog) return null;
    if (dialog.mode === "create") {
      return {
        schemaNodeId: dialog.sourceNodeId,
        initialKind: "event" as DraftKind,
        seed: suggestMappingSeed(value.nodes, catalog, dialog.sourceNodeId),
      };
    }
    if (dialog.mode === "edit-source") {
      const node = value.nodes.find((n) => n.id === dialog.nodeId);
      if (node?.op.type !== "source") return null;
      return { schemaNodeId: node.id, initialKind: "filter" as DraftKind, initialOp: node.op };
    }
    if (dialog.mode === "edit-node") {
      const node = value.nodes.find((n) => n.id === dialog.nodeId);
      if (!node || node.op.type === "source") return null;
      const input =
        node.op.type === "filter"
          ? node.op.input
          : node.op.type === "join"
            ? node.op.left
            : (node.op.inputs[0] ?? "");
      return {
        schemaNodeId: input || node.id,
        initialKind: node.op.type as DraftKind,
        initialOp: node.op,
      };
    }
    if (dialog.mode !== "edit-mapping") return null;
    const mapping = value.mappings.find((m) => m.id === dialog.mappingId);
    if (!mapping) return null;
    const entry = mapping.entry;
    const kind: DraftKind = entry.type === "ordered" ? "ordered" : (entryTargetKind(entry) ?? "event");
    const from = entryMappings(entry)[0]?.node ?? "";
    return {
      schemaNodeId: from,
      initialKind: kind,
      initialEntry: entry,
    };
  }, [dialog, value, catalog]);

  const confirmMapping = useCallback(
    (_kind: DraftKind, entry: MappingEntry) => {
      if (!dialog) return;
      if (dialog.mode === "create") {
        mutate((m) => addMapping(m, dialog.sourceNodeId, entry));
      } else if (dialog.mode === "edit-mapping") {
        mutate((m) => ({
          ...m,
          mappings: m.mappings.map((mp) => (mp.id === dialog.mappingId ? { ...mp, entry } : mp)),
        }));
      } else if (dialog.mode === "edit-node") {
        // A transform node was switched to a mapping kind: drop the node, add a mapping in its
        // place reading whatever the node read, so the edit is not silently discarded.
        const node = value.nodes.find((n) => n.id === dialog.nodeId);
        const input = node && node.op.type !== "source" ? inputOf(node.op) : "";
        mutate((m) => {
          const withoutNode = { ...m, nodes: cascadeDelete(m.nodes, new Set([dialog.nodeId])) };
          return addMapping(withoutNode, input, entry);
        });
      }
      setDialog(null);
    },
    [dialog, mutate, value.nodes],
  );

  const confirmTransform = useCallback(
    (kind: DraftKind, op: NodeOp) => {
      if (!dialog) return;
      if (dialog.mode === "edit-source") {
        mutate((m) => ({
          ...m,
          nodes: m.nodes.map((n) => (n.id === dialog.nodeId ? { ...n, op } : n)),
        }));
        setDialog(null);
        return;
      }
      if (dialog.mode === "create") {
        mutate((m) => addTransform(m, dialog.sourceNodeId, kind, op));
      } else if (dialog.mode === "edit-node") {
        mutate((m) => ({
          ...m,
          nodes: m.nodes.map((n) => (n.id === dialog.nodeId ? { ...n, op } : n)),
        }));
      } else if (dialog.mode === "edit-mapping") {
        // A mapping was switched to a transform kind: drop the mapping, add the node in its place.
        const mapping = value.mappings.find((m) => m.id === dialog.mappingId);
        const input = mapping ? (entryMappings(mapping.entry)[0]?.node ?? "") : "";
        mutate((m) => {
          const withoutMapping = {
            ...m,
            mappings: m.mappings.filter((mp) => mp.id !== dialog.mappingId),
          };
          return addTransform(withoutMapping, input, kind, op);
        });
      }
      setDialog(null);
    },
    [dialog, mutate, value.mappings],
  );

  /** A file dropped on the canvas becomes a connected source. Context settles what a drop means
   *  here, so unlike a window-wide drop this asks nothing. */
  const onCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      const resolve = callbacks.onConnectionForDrop;
      if (!isEdit || !resolve) return;
      // Tauri's WebKit strips dropped `File` bytes and passes the path as text instead, so both
      // are read and whichever the host can turn into a connection string wins.
      const dropped = [
        ...(e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain") || "")
          .split(/\r?\n/)
          .filter(Boolean),
        ...Array.from(e.dataTransfer.files).map((f) => f.name),
      ];
      const added: Record<string, string> = {};
      for (const item of dropped) {
        const connection = resolve(item);
        if (!connection) continue;
        const base = (item.split(/[\\/]/).pop() ?? "source").replace(/\.[^.]*$/, "") || "source";
        added[freshId(base, Object.keys({ ...connections, ...added }))] = connection;
      }
      if (Object.keys(added).length === 0) return;
      e.preventDefault();
      setConnections({ ...connections, ...added });
    },
    [isEdit, callbacks, connections, setConnections],
  );

  const editContextValue = useMemo<EditContextValue | null>(() => {
    if (!isEdit) return null;
    return {
      model: value,
      mutate,
      connections,
      onConnectionsChange: setConnections,
      catalog,
      errors,
      callbacks,
      selectedNodeId,
      onSelectNode: setSelectedNodeId,
      runLayout: () => runFullLayout(true),
      onAddChild: (nodeId) => setDialog({ mode: "create", sourceNodeId: nodeId }),
      onEditNode: (nodeId) => {
        const node = valueRef.current.nodes.find((n) => n.id === nodeId);
        setDialog({ mode: node?.op.type === "source" ? "edit-source" : "edit-node", nodeId });
      },
      onEditMapping: (mappingId) => setDialog({ mode: "edit-mapping", mappingId }),
      onOpenConnections: () => setShowConnections(true),
    };
  }, [
    isEdit,
    value,
    mutate,
    connections,
    setConnections,
    catalog,
    errors,
    callbacks,
    selectedNodeId,
    runFullLayout,
  ]);

  const colorMode = useIsDarkMode() ? "dark" : "light";

  const flow = (
    <ReactFlow
      connectionLineType={ConnectionLineType.Bezier}
      colorMode={colorMode}
      nodes={nodes}
      edges={edges}
      nodeTypes={blueprintNodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange as (c: NodeChange<FlowNode>[]) => void}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodesDelete={onNodesDelete}
      onEdgesDelete={onEdgesDelete}
      onNodeDragStop={onNodeDragStop}
      nodesConnectable={isEdit}
      nodesDraggable={isEdit}
      elementsSelectable
      onNodeClick={(_, node) => setSelectedNodeId((cur) => (cur === node.id ? null : node.id))}
      onPaneClick={() => setSelectedNodeId(null)}
      onPaneContextMenu={(e) => {
        menuPos.current = screenToFlowPosition({
          x: "clientX" in e ? e.clientX : 0,
          y: "clientY" in e ? e.clientY : 0,
        });
      }}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      {isEdit && (
        <>
          <Panel position="top-left">
            <div className="rounded-lg p-1" style={TOOLBAR_CHROME}>
              <LeftToolbar onAddTable={(ref) => addTable(ref)} onImport={importModel} />
            </div>
          </Panel>
          <Panel position="top-right">
            <div className="rounded-lg p-1" style={TOOLBAR_CHROME}>
              <RightToolbar onClear={() => mutate((m) => ({ ...m, nodes: [], mappings: [] }))} />
            </div>
          </Panel>
          {value.nodes.length === 0 && (
            <Panel position="top-center" className="pointer-events-none">
              <div className="mt-14">
                <EmptyState
                  catalog={catalog}
                  hasConnection={Object.values(connections).some(Boolean)}
                  onAddTable={(ref) => addTable(ref)}
                  onConnect={() => setShowConnections(true)}
                  canConnect={!!callbacks.onDiscoverCatalog}
                />
              </div>
            </Panel>
          )}
          {catalogError && (
            // Bottom-centre so it is visible whether or not the empty state occupies the top.
            <Panel position="bottom-center" className="pointer-events-none">
              <div
                className="mb-2 max-w-[520px] rounded-lg px-3 py-2"
                style={{ ...TOOLBAR_CHROME, border: "1px solid var(--red-a6)" }}
              >
                <Text size="1" color="red" as="div">
                  Could not read the connected sources: {catalogError}
                </Text>
              </div>
            </Panel>
          )}
        </>
      )}
    </ReactFlow>
  );

  return (
    <EditContext.Provider value={editContextValue}>
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        {isEdit ? (
          <ContextMenu.Root>
            <ContextMenu.Trigger>
              <div
                style={{ width: "100%", height: "100%" }}
                onDragOver={(e) => {
                  if (callbacks.onConnectionForDrop) e.preventDefault();
                }}
                onDrop={onCanvasDrop}
              >
                {flow}
              </div>
            </ContextMenu.Trigger>
            <ContextMenu.Content size="1">
              <div style={{ padding: 4 }}>
                <TableList
                  catalog={catalog}
                  onSelect={(ref) => addTable(ref, menuPos.current ?? undefined)}
                />
              </div>
            </ContextMenu.Content>
          </ContextMenu.Root>
        ) : (
          flow
        )}
        {isEdit && <ConnectionsDialog open={showConnections} onOpenChange={setShowConnections} />}
        {isEdit && dialog && dialogState && (
          <NodeDialog
            request={dialog}
            initialKind={dialogState.initialKind}
            initialEntry={dialogState.initialEntry}
            initialOp={dialogState.initialOp}
            schemaNodeId={dialogState.schemaNodeId}
            seed={dialogState.seed}
            onCancel={() => setDialog(null)}
            onConfirmMapping={confirmMapping}
            onConfirmTransform={confirmTransform}
          />
        )}
      </div>
    </EditContext.Provider>
  );
}

/** The first input a non-Source op reads. */
function inputOf(op: NodeOp): string {
  if (op.type === "filter") return op.input;
  if (op.type === "join") return op.left;
  if (op.type === "union") return op.inputs[0] ?? "";
  return "";
}

/** Would connecting `source -> target` create a cycle, given the graph's *other* edges (the edge
 *  being added is not yet reflected in `nodes`, so this simulates it). DFS from `target`: if we
 *  can already reach `source`, adding `source -> target` closes a loop. */
function wouldCreateCycle(nodes: EditorNode[], source: string, target: string): boolean {
  const edges = deriveEdges(nodes);
  const byTarget = new Map<string, string[]>();
  for (const e of edges) {
    const list = byTarget.get(e.target);
    if (list) list.push(e.source);
    else byTarget.set(e.target, [e.source]);
  }
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (cur === source) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const upstream of byTarget.get(cur) ?? []) stack.push(upstream);
  }
  return false;
}

/** Remove `deletedIds` and, to a fixed point, every node that would then reference a missing id. */
function cascadeDelete(nodes: EditorNode[], deletedIds: Set<string>): EditorNode[] {
  let current = nodes.filter((n) => !deletedIds.has(n.id));
  let changed = true;
  while (changed) {
    changed = false;
    const ids = new Set(current.map((n) => n.id));
    const next: EditorNode[] = [];
    for (const n of current) {
      const op = n.op;
      const dangles =
        (op.type === "filter" && !ids.has(op.input)) ||
        (op.type === "join" && (!ids.has(op.left) || !ids.has(op.right))) ||
        (op.type === "union" && op.inputs.length > 0 && op.inputs.every((i) => !ids.has(i)));
      if (dangles) {
        changed = true;
        continue;
      }
      next.push(n);
    }
    current = next;
  }
  return current;
}

export function BlueprintGraph(props: BlueprintGraphProps) {
  return (
    <div className={props.className ?? "w-full h-full"} style={{ position: "relative", minHeight: 200 }}>
      <ReactFlowProvider>
        <BlueprintGraphInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}

export type { EditorMapping };
