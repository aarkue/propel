import { Button } from "@r4pm/components/ui";
import type { Connection, Edge, Node, ReactFlowProps } from "@xyflow/react";
import {
  ConnectionLineType,
  Controls,
  type NodeOrigin,
  type OnConnectEnd,
  type OnConnectStart,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { LayoutOptions } from "elkjs";
import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { PiCircle, PiSquare, PiTreeStructure } from "react-icons/pi";
import CustomEdge from "./CustomEdge";
import "./editor.css";
import { ExportControls } from "./helpers/export-controls";
import { useLayoutedElements } from "./helpers/Layout";
import type { ArcRouting } from "./helpers/layout-graph";
import { uid } from "../id";
import PlaceNode from "./PlaceNode";
import TransitionNode from "./TransitionNode";
const nodeTypes = {
  transition: TransitionNode,
  place: PlaceNode,
};

/** Pointer interaction handlers shared by all element data types. */
export type ElementHandlers = {
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

export type TransitionData = ElementHandlers & {
  label?: string | undefined;
  className?: string;
  style?: React.CSSProperties;
  /** Replace the transition's inner content entirely (e.g. an icon). */
  renderContent?: () => React.ReactNode;
};
/** One drawn token: a dot or square, optionally colored/faded. Both the DOM node
 *  and the SVG export render from this, so overlay/simulator markings (e.g. a green
 *  "final reached" square) appear in exports too - unlike JSX `renderMarking`, which
 *  the standalone SVG builder cannot run. Omitted `color` falls back to the node text. */
export type TokenMark = { shape: "dot" | "square"; color?: string; opacity?: number; title?: string };

export type PlaceData = ElementHandlers & {
  label?: string | undefined;
  tokens?: number;
  finalTokens?: number;
  /** Color of the default token dots (defaults to black). */
  tokenColor?: string;
  /** Explicit per-token marks; render-safe in both DOM and SVG export. Takes
   *  precedence over tokens/finalTokens; superseded by `renderMarking` on screen. */
  tokenMarks?: TokenMark[];
  className?: string;
  style?: React.CSSProperties;
  /** Replace the marking rendering entirely (e.g. per-object-type tokens). */
  renderMarking?: () => React.ReactNode;
  /** Extra editable control rendered inside the place (e.g. object-type select). */
  renderControls?: () => React.ReactNode;
  /** Consumer attribute: the object type this place belongs to (OCPN). Stored on the
   *  node so the editor is the single source of truth; serialized back out. */
  objectType?: string;
};

export type ArcData = ElementHandlers & {
  weight?: number;
  routing?: ArcRouting;
  /** Label drawn at the arc midpoint (defaults to the weight when > 1). */
  label?: string;
  /** Extra class on the arc path, for CSS targeting. */
  className?: string;
  /** Consumer attribute: whether this arc is "variable" (OCPN), stored on the edge. */
  variable?: boolean;
};

const edgeTypes = {
  custom: CustomEdge,
};

/** Cosmetic patch for one arc, matched to a live edge by its (source, target). */
export type EditorEdgePatch = {
  from: string;
  to: string;
  style?: React.CSSProperties;
  className?: string;
  label?: string;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

function InnerEditor() {
  const props = useContext(EditorPropsContext);
  const { screenToFlowPosition, getNode, getNodes, fitView } = useReactFlow();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const getChildNodePosition = useCallback(
    (event: MouseEvent) => {
      const panePosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      return panePosition;
    },
    [screenToFlowPosition],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(
    props.nodes ??
      props.initialNodes ?? [
        {
          id: "transition@@@root",
          type: "transition",
          data: { label: "Create Order" },
          position: { x: 0, y: 0 },
        },
      ],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(props.edges ?? props.initialEdges ?? []);

  useEffect(() => {
    if (props.nodes) setNodes(props.nodes);
  }, [props.nodes, setNodes]);
  useEffect(() => {
    if (props.edges) setEdges(props.edges);
  }, [props.edges, setEdges]);

  // Editable cosmetic merge: patch overlay-driven data into live nodes/edges by id
  // (nodes) or endpoints (edges) without touching structure or positions.
  useEffect(() => {
    const patches = props.overlayNodeData;
    if (!patches) return;
    setNodes((ns) =>
      ns.map((n) => {
        const p = patches.get(n.id);
        return p ? { ...n, data: { ...n.data, ...p } } : n;
      }),
    );
  }, [props.overlayNodeData, setNodes]);
  useEffect(() => {
    const patches = props.overlayEdgeData;
    if (!patches) return;
    setEdges((es) =>
      es.map((e) => {
        const p = patches.find((x) => x.from === e.source && x.to === e.target);
        return p
          ? {
              ...e,
              style: p.style,
              data: {
                ...e.data,
                className: p.className,
                label: p.label,
                onClick: p.onClick,
                onContextMenu: p.onContextMenu,
              },
            }
          : e;
      }),
    );
  }, [props.overlayEdgeData, setEdges]);

  const onChangeRef = useRef(props.onChange);
  onChangeRef.current = props.onChange;
  useEffect(() => {
    if (props.readOnly || !onChangeRef.current) return;
    const raf = requestAnimationFrame(() =>
      onChangeRef.current?.(nodes as PetriNetNode[], edges as Edge<ArcData>[]),
    );
    return () => cancelAnimationFrame(raf);
  }, [nodes, edges, props.readOnly]);

  const connectingNodeId = useRef<string | null>(null);

  const { getLayoutedElements } = useLayoutedElements();

  // Read-only viewers often mount at 0 size, where ReactFlow's one-shot fitView
  // no-ops; re-fit when the container resizes. `nodes` is intentionally not a dep
  // (count read via getNodes) so dragging doesn't trigger a fit mid-drag.
  useEffect(() => {
    if (!props.readOnly) return;
    const el = wrapperRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (el.clientWidth > 0 && el.clientHeight > 0 && getNodes().length > 0) {
          void fitView({ padding: 0.15 });
        }
      });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [props.readOnly, fitView, getNodes]);

  const onConnectStart: OnConnectStart = useCallback((_, { nodeId }) => {
    connectingNodeId.current = nodeId;
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      if (props.readOnly) {
        return;
      }
      // we only want to create a new node if the connection ends on the pane
      const targetIsPane = (event.target as Element).classList.contains("react-flow__pane");

      const parentNode = getNode(connectingNodeId.current!)!;
      const childNodePosition = getChildNodePosition(event as MouseEvent);

      if (targetIsPane && connectingNodeId.current) {
        const newNode: PetriNetNode = {
          id: uid(),
          type: parentNode.type === "place" ? "transition" : "place",
          data: { label: "New Node" },
          position: childNodePosition,
        };

        const newEdge: Edge<ArcData> = {
          id: uid(),
          source: parentNode.id,
          target: newNode.id,
          type: "custom",
        };
        setNodes((ns) => [...ns, newNode]);
        setEdges((es) => [...es, newEdge]);
      }
    },
    [getChildNodePosition, getNode, props.readOnly, setNodes, setEdges],
  );

  const onConnect = useCallback(
    (c: Edge | Connection) => {
      if (props.readOnly) {
        return;
      }
      const { source, target } = c;
      const sourceNode = getNode(source!)!;
      const targetNode = getNode(target!)!;
      if (sourceNode.type === targetNode.type) {
        return;
      }
      requestAnimationFrame(() => {
        const h = c.sourceHandle;
        setEdges((eds) => {
          const newEds = [...eds];
          const newEdge = {
            id: uid(),
            source: h === sourceNode.type ? source! : target!,
            target: h === sourceNode.type ? target! : source!,
            type: "custom",
          };
          newEds.push(newEdge);
          return newEds;
        });
      });
    },
    [setEdges, getNode, props.readOnly],
  );

  const addNode = useCallback(
    (type: "place" | "transition") => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const center = rect
        ? screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
        : { x: 0, y: 0 };
      const id = uid();
      const newNode: PetriNetNode =
        type === "place"
          ? { id, type: "place", data: {}, position: center }
          : { id, type: "transition", data: { label: "New" }, position: center };
      setNodes((ns) => [...ns, newNode]);
    },
    [screenToFlowPosition, setNodes],
  );

  const nodeOrigin: NodeOrigin = [0.5, 0.5];
  return (
    <div ref={wrapperRef} style={{ width: "100%", height: "100%" }}>
      <ReactFlow
        className={`petri-net-editor ${props.readOnly ? "readonly" : ""}`}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeOrigin={nodeOrigin}
        onConnectStart={onConnectStart}
        nodesConnectable={props.readOnly ? false : undefined}
        onConnectEnd={onConnectEnd}
        connectionLineStyle={{ strokeWidth: 1.5 }}
        onConnect={onConnect}
        connectionLineType={ConnectionLineType.Straight}
        snapToGrid={true}
        snapGrid={[2, 2]}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        maxZoom={10}
        minZoom={0.05}
        onBeforeDelete={props.readOnly ? async () => false : undefined}
        proOptions={{ hideAttribution: true }}
        {...props.editorProps}
      >
        <Controls showInteractive={false} position="bottom-right" />
        <Panel position="top-left" style={{ display: "flex", flexDirection: "row", gap: 6 }}>
          {(props.showExportControls ?? true) && <ExportControls />}
          {!props.readOnly && (
            <>
              <Button type="button" size="1" variant="surface" color="gray" onClick={() => addNode("place")}>
                <PiCircle /> Place
              </Button>
              <Button
                type="button"
                size="1"
                variant="surface"
                color="gray"
                onClick={() => addNode("transition")}
              >
                <PiSquare /> Transition
              </Button>
            </>
          )}
          {/* Layout is useful in read-only too: re-tidy after dragging nodes around. */}
          <Button
            type="button"
            size="1"
            variant="surface"
            color="gray"
            title="Auto-layout"
            onClick={() => {
              getLayoutedElements(props.layoutOptions ?? {}, true);
            }}
          >
            <PiTreeStructure /> Layout
          </Button>
        </Panel>
      </ReactFlow>
      {props.children}
    </div>
  );
}
export type PetriNetNode =
  | (Node<TransitionData> & { type: "transition" })
  | (Node<PlaceData> & { type: "place" });
export type EditorProps = {
  readOnly?: boolean;
  initialNodes?: PetriNetNode[];
  initialEdges?: Edge<ArcData>[];
  layoutOptions?: LayoutOptions;
  editorProps?: ReactFlowProps<PetriNetNode, Edge<ArcData>>;
  /** Show the built-in PNG/SVG export buttons. Off when a host (e.g. a viewer frame) owns export. */
  showExportControls?: boolean;
  /** In-canvas controllers rendered inside the ReactFlow provider (e.g. an OCPN
   *  inference effect). They can use `useReactFlow` to read/patch live nodes/edges. */
  children?: React.ReactNode;
  /** Turn on editing (drag-to-create, rename, delete, markings). Convenience for
   *  `readOnly={false}`; `readOnly` still wins if both are set. */
  editable?: boolean;
  /** Fired (rAF-coalesced) on any node/edge change while editing. */
  onChange?: (nodes: PetriNetNode[], edges: Edge<ArcData>[]) => void;
  /** Controlled node set: when provided, the editor mirrors it into internal state
   *  on change (no remount, positions preserved). Used by viewers/simulators that
   *  push live data updates. Editable mode uses `initialNodes` instead. */
  nodes?: PetriNetNode[];
  edges?: Edge<ArcData>[];
  /** Editable mode only: cosmetic data merged into the editor's live nodes by id,
   *  so an overlay change never clobbers structure/positions/edits. Excludes
   *  tokens/finalTokens (the user owns those via the marking stepper). */
  overlayNodeData?: Map<string, Partial<TransitionData & PlaceData>>;
  /** Editable mode only: cosmetic arc patches matched to live edges by endpoints. */
  overlayEdgeData?: EditorEdgePatch[];
  /** Live per-place presentation resolver, evaluated at render by every place node -
   *  including ones added in-canvas - with the place's current data. Returns fields
   *  to merge over that data (never tokens/finalTokens; the stepper owns those). */
  placeOverlay?: (placeId: string, data: PlaceData) => Partial<PlaceData> | undefined;
  /** Live per-arc presentation resolver, evaluated at render by every edge with its
   *  current data and resolved endpoint kinds (so a consumer can tell place from
   *  transition without re-deriving topology). */
  arcOverlay?: (arc: ArcContext, data: ArcData) => ArcPresentation | undefined;
};

/** Endpoint kinds + ids for an arc, passed to {@link EditorProps.arcOverlay}. */
export type ArcContext = {
  id: string;
  from: string;
  to: string;
  fromType: "place" | "transition";
  toType: "place" | "transition";
};
/** What an `arcOverlay` returns: edge stroke style plus arc-data cosmetics/handlers. */
export type ArcPresentation = {
  style?: React.CSSProperties;
  className?: string;
  label?: string;
  /** Adornment rendered at the arc midpoint (e.g. a toggle chip) inside the HTML overlay. */
  badge?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};
export const EditorPropsContext = createContext<EditorProps>({});
export default function Editor(props: EditorProps) {
  const normalized: EditorProps = { ...props, readOnly: props.readOnly ?? !props.editable };
  return (
    <ReactFlowProvider>
      <EditorPropsContext.Provider value={normalized}>
        <InnerEditor />
      </EditorPropsContext.Provider>
    </ReactFlowProvider>
  );
}
