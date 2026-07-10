/**
 * TS mirror of the Rust `StyledGraph` binding types (`engine/app-bindings/src/viz/graph_svg.rs`).
 * A `StyledGraph` is a fully laid-out, fully styled diagram: viewers build one from their own
 * on-screen React Flow geometry, and a renderer (typically the `export_graph_svg` Rust binding,
 * injected by the host so this package stays backend-free) draws it with no further layout
 * decisions - guaranteeing the export matches the screen pixel-for-pixel.
 *
 * Field names/shapes must stay in sync with the generated `@r4pm/client` bindings; they are not
 * imported from there (this package has no backend dependency) but are structurally compatible.
 */

export type NodeShape = { kind: "box"; radius?: number } | { kind: "ellipse" } | { kind: "circle" };

export interface StyledLabel {
  text: string;
  size?: number;
  weight?: number;
  color?: string;
  /** Vertical offset from the node center, in px. */
  dy?: number;
  /** Word-wrap to fit the node width (max 2 lines, ellipsized). */
  wrap?: boolean;
}

export type MarkingKind = "dot" | "square";

export interface MarkingGroup {
  kind: MarkingKind;
  color?: string;
  count: number;
}

export type IconKind = "triangle" | "square";

export interface StyledIcon {
  kind: IconKind;
  color?: string;
  /** Icon half-size as a fraction of the node's half-extent. */
  scale?: number;
}

export interface StyledNode {
  cx: number;
  cy: number;
  w: number;
  h: number;
  shape?: NodeShape;
  fill?: string;
  stroke?: string;
  stroke_width?: number;
  stroke_dash?: string;
  labels?: StyledLabel[];
  marking?: MarkingGroup[];
  /** A single decorative glyph (e.g. DFG start/end terminal chrome). */
  icon?: StyledIcon;
}

export type EdgeMarker = "none" | "arrow" | "ball" | "arrow_ball";

export interface EdgeLabel {
  text: string;
  /** Fraction (0..1) of the polyline's length. Defaults to the midpoint. */
  at?: number;
  /** Pixel displacement from the `at` anchor (e.g. the on-screen label de-overlap pass). */
  dx?: number;
  dy?: number;
  bg?: string;
  color?: string;
}

export interface EdgeDot {
  at: number;
  color: string;
  filled?: boolean;
}

export interface StyledEdge {
  points: [number, number][];
  color?: string;
  width?: number;
  dash?: string;
  marker_start?: EdgeMarker;
  marker_end?: EdgeMarker;
  labels?: EdgeLabel[];
  dots?: EdgeDot[];
  /** Corner radius (px) for rounding the polyline's interior joins; 0 = straight segments. */
  rounded?: number;
}

export interface LegendItem {
  label: string;
  color?: string;
}

export interface LegendGroup {
  title?: string;
  items: LegendItem[];
}

export interface StyledGraph {
  background?: string;
  padding?: number;
  nodes: StyledNode[];
  edges: StyledEdge[];
  legend?: LegendGroup[];
}

/** Host-supplied renderer: draws a `StyledGraph` to a standalone SVG string (usually backed by
 *  the `export_graph_svg` binding). Injected so this package never imports a backend directly. */
export type StyledGraphRenderer = (graph: StyledGraph) => Promise<string>;
