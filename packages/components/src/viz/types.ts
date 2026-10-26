// JSON shapes of rust4pm's visualization bindings (`process_mining::visualization`), so the
// components need no dependency on `@r4pm/client`.

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  min: Point;
  max: Point;
}

/** Where one node ended up: its centre and size in drawing space. */
export interface Placement {
  center: Point;
  size: Size;
  order: number;
  rank?: number | null;
}

/** How an edge was routed. */
export type RouteKind =
  | "direct"
  | "selfloop"
  | "unrouted"
  | { chained: { spans: number } }
  | { bundled: { lane: number } };

/** How one edge was drawn: a border-to-border polyline, source first. */
export interface EdgeRoute {
  kind: RouteKind;
  points: Point[];
  label_anchor?: Point | null;
}

/** A graphlay layout: one placement per graph node and one route per edge, in graph order. */
export interface Layout {
  bounds: Rect;
  nodes: Placement[];
  edges: EdgeRoute[];
  layer_count: number;
  reversed: number[];
  stats: { dummy_count: number };
  junctions?: Point[];
  lanes?: { group?: number | null; rect: Rect }[];
}

/** How one node or edge is drawn differently, e.g., to highlight, dim or annotate it. */
export interface ElementStyle {
  fill?: string | null;
  stroke?: string | null;
  stroke_width?: number | null;
  opacity?: number | null;
  extra_label?: string | null;
  dash?: string | null;
}

/** Per-element style changes, keyed by graph index (the index in the layout and in the refs). */
export interface StyleOverrides {
  nodes?: Record<number, ElementStyle>;
  edges?: Record<number, ElementStyle>;
}

/** Fallback colors of a drawing. */
export interface Palette {
  node_bg: string;
  node_border: string;
  node_text: string;
  arc_color: string;
  arc_label_bg: string;
  export_bg: string;
}

/** A graphlay layout request built by the caller, for graphs no rust4pm model covers. */
export interface GraphRequest {
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
  preset?: "layered" | "process_map" | "hub_and_spoke" | "hub_and_spoke_flow";
  /** Fields of the preset's options to change, deep-merged (graphlay `LayoutOptions`). */
  options?: Record<string, unknown>;
}

export interface GraphNode {
  size: Size;
  shape?: "box" | "ellipse";
  rank?: "free" | "first" | "last" | { fixed: number };
  group?: number | null;
  key?: string | null;
  position?: Point | null;
  pinned?: boolean;
  margin?: { along_neg?: number; along_pos?: number; cross_neg?: number; cross_pos?: number };
}

export interface GraphEdge {
  source: number;
  target: number;
  weight?: number;
  thickness?: number;
  label_size?: Size | null;
  reverse_for_ranking?: boolean;
  group?: number | null;
}

/** A rooted tree or forest for the tidy-tree engine. */
export interface TreeRequest {
  graph: GraphRequest["graph"];
  options?: Record<string, unknown>;
}

/** rust4pm `DirectlyFollowsGraph`. */
export interface Dfg {
  activities: Record<string, number>;
  directly_follows_relations: [[string, string], number][];
  start_activities: Record<string, number>;
  end_activities: Record<string, number>;
}

/** rust4pm `OCDirectlyFollowsGraph`: one DFG per object type. */
export interface OcDfg {
  object_type_to_dfg: Record<string, Dfg>;
}

export type ProcessTreeOperatorType =
  | "Sequence"
  | "ExclusiveChoice"
  | "Concurrency"
  | "Loop"
  | "Interleaving"
  | "InclusiveChoice";

/** rust4pm `ProcessTree` node, externally tagged. */
export type ProcessTreeNode =
  | { Operator: { operator_type: ProcessTreeOperatorType; children: ProcessTreeNode[] } }
  | { Leaf: { activity_label: { Activity: string } | "Tau" } };

/** rust4pm `ProcessTree`. */
export interface ProcessTree {
  root: ProcessTreeNode;
}

/** rust4pm `OcTypeGraph`: event and object types and the relations between them, by index. */
export interface OcTypeGraph {
  nodes: { kind: "event" | "object"; label: string; count?: number | null }[];
  edges: { source: number; target: number; qualifier?: string | null }[];
}

/** rust4pm's flat object-centric Petri net JSON (`ObjectCentricPetriNetJson`). Names are unique among
 *  places and transitions. Markings are by place name. A missing `label` is a silent transition, a
 *  missing arc `type` is `"normal"` and a missing `weight` is 1. */
export interface Ocpn {
  places: { name: string; object_type: string }[];
  transitions: { name: string; label?: string | null }[];
  arcs: { source: string; target: string; type?: "normal" | "variable"; weight?: number }[];
  initial_marking: Record<string, number>;
  final_marking: Record<string, number>;
}

// Refs: the model element behind each graph node and edge, in graph order

export type DfgNodeRef = { kind: "start" } | { kind: "end" } | { kind: "activity"; name: string };
export type DfgEdgeRef =
  | { kind: "follows"; from: string; to: string; count: number }
  | { kind: "start"; activity: string; count: number }
  | { kind: "end"; activity: string; count: number };

/** OC-DFG terminals are per object type: `name` is the object type for start/end. */
export type OcdfgNodeRef =
  | { kind: "start"; name: string }
  | { kind: "end"; name: string }
  | { kind: "activity"; name: string };
export interface OcdfgEdgeRef {
  object_type: string;
  edge: DfgEdgeRef;
}

/** An activity name, with the `<init> `/`<exit> ` prefix for synthetic activities. */
export type OcDeclareNodeRef = string;
/** `arc` indexes the input arcs. `mirrored` is the EP/DP arc merged into this EF/DF one. */
export interface OcDeclareEdgeRef {
  arc: number;
  mirrored?: number | null;
}

export type PetriNodeRef = { kind: "place"; index: number } | { kind: "transition"; index: number };
export interface PetriArcRef {
  source: PetriNodeRef;
  target: PetriNodeRef;
  weight: number;
}

/** A place or transition of a flat OCPN, by its index in `places` or `transitions`. */
export type OcpnNodeRef = { kind: "place"; index: number } | { kind: "transition"; index: number };
/** `arc` indexes the flat OCPN's `arcs`. */
export interface OcpnArcRef {
  arc: number;
  source: OcpnNodeRef;
  target: OcpnNodeRef;
}

/** The path of child indices from the root. */
export type ProcessTreeNodeRef = { kind: "operator"; path: number[] } | { kind: "leaf"; path: number[] };
