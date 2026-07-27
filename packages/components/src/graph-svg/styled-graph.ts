/** TS mirror of the Rust `StyledGraph` binding types; structurally compatible with `@r4pm/client` bindings but not imported from there (backend-free). */

export type NodeShape = { kind: "box"; radius?: number } | { kind: "ellipse" } | { kind: "circle" };

export interface StyledLabel {
  text: string;
  size?: number;
  weight?: number;
  color?: string;
  /** Vertical offset from the node center, in px. */
  dy?: number;
  /** Horizontal offset from the node center, in px (e.g. to re-center a text+bullet group). */
  dx?: number;
  /** Word-wrap to fit the node width (max 2 lines, ellipsized). */
  wrap?: boolean;
  /** Kind-indicator glyph left of the text (OCEL type graph: square = event, dot = object).
   *  Ignored on wrapped labels; placement uses an estimated text width. */
  bullet?: MarkingKind;
  /** Bullet fill; defaults to the label color. */
  bullet_color?: string;
}

export type MarkingKind = "dot" | "square";

export interface MarkingGroup {
  kind: MarkingKind;
  color?: string;
  count: number;
  /** Dashed border on each dot (OC-Declare optional involvement, min 0). */
  dashed?: boolean;
  /** Fixed dot radius; setting it on any group switches the whole row to exact mode (fixed
   *  sizes, tight per-group clusters, no fit-to-node scaling / numeral collapse). */
  radius?: number;
  /** Center-to-center dot spacing within the group (exact mode; below `2*radius` overlaps). */
  step?: number;
  /** Ring stroke around each dot (exact mode). Absent: ring only when `dashed`. */
  stroke?: string;
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
  /** Vertical offset of the marking row from the node center, in px. */
  marking_dy?: number;
  /** A single decorative glyph (e.g. DFG start/end terminal chrome). */
  icon?: StyledIcon;
}

export type EdgeMarker =
  | "none"
  | "arrow"
  | "arrow_centered"
  | "ball"
  | "arrow_ball"
  | "arrow_bar"
  | "ball_arrow"
  | "ball_bar_arrow";

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
  /** Ring stroke (the on-screen `MultiDot` ring). Absent: hollow dots ring in `color`. */
  stroke?: string;
}

export interface GradientStop {
  /** Fraction (0..1) along the gradient axis. */
  offset: number;
  color: string;
}

export interface StyledEdge {
  points: [number, number][];
  color?: string;
  /** Linear gradient stroke (first -> last point); 2+ stops override `color` on the path. */
  gradient?: GradientStop[];
  width?: number;
  dash?: string;
  marker_start?: EdgeMarker;
  marker_end?: EdgeMarker;
  /** Marker fill; defaults to the edge color (OC-Declare uses one neutral gray for all markers). */
  marker_color?: string;
  /** Marker base size in px (side of the 12-unit marker viewBox); default scales with `width`. */
  marker_size?: number;
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
  /** Draw edges/markers AFTER nodes so border-centered markers sit on top (OC-Declare). */
  edges_on_top?: boolean;
  legend?: LegendGroup[];
}

/** Host-supplied renderer: draws a `StyledGraph` to a standalone SVG string (usually backed by
 *  the `export_graph_svg` binding). Injected so this package never imports a backend directly. */
export type StyledGraphRenderer = (graph: StyledGraph) => Promise<string>;
