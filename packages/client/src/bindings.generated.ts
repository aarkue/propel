// AUTO-GENERATED from engine binding metadata. Do not edit.

/** A registry-stored object referenced by id; never the value itself. */
export type Handle<T extends string> = string & { readonly __ref: T };

export type EventLogHandle = Handle<"EventLog">;
export type EventLogActivityProjectionHandle = Handle<"EventLogActivityProjection">;
export type IndexLinkedOCELHandle = Handle<"IndexLinkedOCEL">;
export type OCELHandle = Handle<"OCEL">;
export type SlimLinkedOCELHandle = Handle<"SlimLinkedOCEL">;

export interface Place {
id: string
}
/**
 * Transition in a Petri net
 */

export interface Transition {
/**
 * Transition label (None if this transition is _invisible_)
 */
label?: (string | null)
id: string
}
/**
 * Arc in a Petri net
 * 
 * Connecting a transition and a place (or the other way around)
 */

export interface Arc {
/**
 * Source and target of Arc
 */
from_to: ({
type: "PlaceTransition"
/**
 * @minItems 2
 * @maxItems 2
 */
nodes: [string, string]
} | {
type: "TransitionPlace"
/**
 * @minItems 2
 * @maxItems 2
 */
nodes: [string, string]
})
/**
 * Weight (i.e., how many tokens this arc moves)
 */
weight: number
}

export type AlignmentMove = ({
SyncMove: {
/**
 * The transition that was fired
 */
transition: string
/**
 * Index of the event in the trace
 */
trace_event_index: number
}
} | {
ModelMove: {
/**
 * The transition that was fired
 */
transition: string
}
} | {
LogMove: {
/**
 * Index of the event in the trace
 */
trace_event_index: number
}
})
/**
 * Alignment Error
 */

export type AlignmentError = ({
SearchError: SearchError
} | {
SyncProdNetConstructionFailed: SyncProdNetConstructionError
})
/**
 * Reason [`search`] found no path
 */

export type SearchError = ("LimitReached" | "Unreachable" | "MaxEdgeCostTooLarge")
/**
 * Error when constructing the sync product net
 */

export type SyncProdNetConstructionError = ({
InvalidPlaceInMarking: PlaceID
} | "NoFinalMarking" | "NoInitialMarking")
/**
 * Place ID
 */

export type PlaceID = string

/**
 * Everything the alignment visualizations need, computed in one call.
 */

export interface PetriNet {
/**
 * Places
 */
places: {
[k: string]: Place
}
/**
 * Transitions
 */
transitions: {
[k: string]: Transition
}
/**
 * Arcs
 */
arcs: Arc[]
/**
 * Initial marking
 */
initial_marking?: ({
[k: string]: number
} | null)
/**
 * Final markings (any of them are accepted as a final marking)
 */
final_markings?: ({
[k: string]: number
}[] | null)
}
/**
 * Place in a Petri net
 */

export interface VariantAlignmentResult {
/**
 * The variant's activity sequence
 */
activities: string[]
/**
 * How many traces follow this variant
 */
frequency: number
/**
 * The alignment result or error for this variant
 */
result: ({
Ok: AlignmentResult
} | {
Err: AlignmentError
})
}
/**
 * Alignment Result
 */

export interface AlignmentResult {
/**
 * The sequence of alignment moves
 */
moves: AlignmentMove[]
/**
 * Total cost of the alignment
 */
cost: number
/**
 * Number of states visited during search
 */
states_visited: number
}
/**
 * Alignment Fitness Result
 */

export interface FitnessResult {
/**
 * Log fitness, as the total computed fitness (summing up the costs for all traces)
 */
log_fitness: number
/**
 * Average trace fitness (across all traces)
 */
average_fitness: number
/**
 * Fraction of traces that perfectly fit (i.e., have an alignment cost of `0`)
 */
perfectly_fitting_frac: number
/**
 * The total cost, summed up from all traces
 */
total_costs: number
}
/**
 * Pre-aggregated per-transition / per-activity deviation counts (for a net heatmap).
 */

export interface AlignmentAggregate {
/**
 * Per transition id (matches `PetriNet.transitions` keys): sync vs model-only firings.
 */
transition_stats: {
[k: string]: TransitionFireStats
}
/**
 * Per activity: total log-moves (logged events with no matching model step) across all traces.
 */
log_move_counts: {
[k: string]: number
}
/**
 * Total number of aligned traces.
 */
total_traces: number
}
/**
 * Firing counts for a single transition across all aligned traces (weighted by variant frequency).
 */

export interface TransitionFireStats {
/**
 * Times the transition fired in sync with a log event (conforming).
 */
sync_fires: number
/**
 * Times the transition fired as a model-only move (a deviation / skipped step).
 */
model_fires: number
}

export interface XesTraceInput {
caseId: string
events?: XesEventInput[]
attributes?: XesAttrInput[]
}
/**
 * One event of an authored trace. `time` is RFC3339; events without a parseable time get none.
 */

export interface XesEventInput {
activity: string
time: string
attributes?: XesAttrInput[]
}
/**
 * One typed attribute as authored in the editor: value carried as a string, `attr_type` selecting
 * how it is parsed into an `AttributeValue` (`string` | `int` | `float` | `boolean` | `date`).
 */

export interface XesAttrInput {
name: string
type: string
value: string
}

export type AttributeLevel = ("Event" | "Case")

export type AttributeKind = ("Numeric" | "Categorical" | "Date" | "Other")

export interface NumericStats {
min: number
max: number
mean: number
median: number
stddev: number
}

export interface DfArcDuration {
source: string
target: string
count: number
min_ms: number
max_ms: number
mean_ms: number
median_ms: number
p90_ms: number
}

export interface LogExtensionInfo {
name: string
prefix: string
uri: string
}

export interface LogClassifierInfo {
name: string
keys: string[]
}

export interface TraceBrowserRow {
case_index: number
case_id: string
num_events: number
start_time?: (string | null)
end_time?: (string | null)
duration_ms?: (number | null)
}

export type AttributeScope = ({
type: "LogGlobal"
} | {
activity?: (string | null)
type: "Event"
} | {
object_type?: (string | null)
type: "Object"
})

/**
 * One entry in the attribute catalog returned by `get_removable_attributes_xes`.
 */

export interface TraceEventRow {
activity: string
timestamp?: (string | null)
attributes: {
[k: string]: string
}
}

export interface ObjectEventRow {
event_id: string
event_type: string
timestamp: string
/**
 * (object_id, object_type)
 */
other_objects: [string, string][]
}

export interface ObjectInvolvementCounts {
min: number
max: number
}

export type OcelAttributeLevel = ("Event" | {
Object: {
object_type: string
}
})

export interface DfgCounts {
activities: {
[k: string]: number
}
directly_follows_relations: [[string, string], number][]
start_activities: {
[k: string]: number
}
end_activities: {
[k: string]: number
}
}

export interface ObjectBrowserRow {
object_id: string
object_type: string
num_events: number
first_time?: (string | null)
last_time?: (string | null)
}

export interface OcelTypePairRelation {
source_type: string
target_type: string
/**
 * Real total across all qualifiers, independent of the `qualifiers` cap below.
 */
count: number
/**
 * Top qualifiers by count, capped at `max_qualifiers_per_pair`.
 */
qualifiers: OcelTypeQualifierCount[]
/**
 * Sum of counts of qualifiers omitted from `qualifiers`.
 */
other_qualifier_count: number
/**
 * Real number of distinct qualifiers (may exceed `qualifiers.len()`).
 */
distinct_qualifiers: number
}
/**
 * A qualifier and its instance count.
 */

export interface OcelTypeQualifierCount {
qualifier: string
count: number
}

export interface OcelTypeInput {
name: string
attributes?: OcelTypeAttrInput[]
}
/**
 * One attribute in a type's schema: a name plus its declared value type.
 */

export interface OcelTypeAttrInput {
name: string
type: string
}
/**
 * One authored event: id, type, RFC3339 time, typed attributes, and its E2O relationships.
 */

export interface OcelEventInput {
id: string
type: string
time: string
attributes?: OcelAttrInput[]
relationships?: OcelRelInput[]
}
/**
 * One typed attribute value (string-carried, `attr_type` selects parsing).
 */

export interface OcelAttrInput {
name: string
type: string
value: string
}
/**
 * A relationship (E2O on an event, O2O on an object): target object id plus qualifier.
 */

export interface OcelRelInput {
objectId: string
qualifier: string
}
/**
 * One authored object: id, type, timestamped attributes, and its O2O relationships.
 */

export interface OcelObjectInput {
id: string
type: string
attributes?: OcelTimedAttrInput[]
relationships?: OcelRelInput[]
}
/**
 * One timestamped object attribute value (object attributes carry a `time` in OCEL).
 */

export interface OcelTimedAttrInput {
name: string
type: string
value: string
time: string
}

export interface OcSimTraceObject {
id: string
objectType: string
}

export type TimeframeMode = ("AnyEvent" | "AllEvents" | "SpanWithin" | "SpanEncloses" | "StartsWithin" | "EndsWithin" | "Overlaps" | "Before" | "After")
/**
 * How related entities (events / objects) must satisfy a sub-condition in an
 * `EventMatch` / `ObjectMatch` predicate.
 */

export type MatchQuantifier = ("Any" | "All" | "First" | "Last")

export type KeepOrRemove = ("Keep" | "Remove")

export type RelabelTarget = ({
value: string
type: "Literal"
} | {
template: string
type: "Template"
})

export type RequiredOrForbidden = ("Required" | "Forbidden")
/**
 * Where an attribute lives in a dataset.
 */

export interface RelabelRule {
target: RelabelTarget
condition?: (Condition | null)
}

export type MarkingKind = ("dot" | "square")
/**
 * A single decorative glyph drawn centered in a node (e.g. the start/end terminal chrome on a
 * DFG). Distinct from [`MarkingGroup`], which draws a *counted row* of tokens.
 */

export type IconKind = ("triangle" | "square")

/**
 * A fully laid-out, fully styled diagram, ready to draw with no further layout decisions.
 */

export interface StyledNode {
cx: number
cy: number
w: number
h: number
/**
 * Node outline shape.
 */
shape?: ({
radius?: number
kind: "box"
} | {
kind: "ellipse"
} | {
kind: "circle"
})
fill?: (string | null)
stroke?: (string | null)
stroke_width?: number
stroke_dash?: (string | null)
labels?: StyledLabel[]
marking?: MarkingGroup[]
/**
 * Vertical offset of the marking row from the node center, in px (e.g. OC-Declare draws
 * its involvement dots below the label).
 */
marking_dy?: number
icon?: (StyledIcon | null)
}
/**
 * One line of text drawn centered in a node, offset vertically by `dy`. Multiple labels stack
 * (e.g. an activity name line + a frequency-count line below it).
 */

export interface StyledLabel {
text: string
size?: number
weight?: number
color?: (string | null)
/**
 * Vertical offset from the node center, in px.
 */
dy?: number
/**
 * Horizontal offset from the node center, in px (e.g. to re-center a text+bullet group).
 */
dx?: number
/**
 * Word-wrap to fit the node width (max 2 lines, ellipsized). Off by default: pass one
 * `StyledLabel` per pre-wrapped line instead when the caller already knows the split.
 */
wrap?: boolean
/**
 * Small kind-indicator glyph drawn just left of the text (OCEL type graph: square = event
 * type, dot = object type); ignored on wrapped labels.
 */
bullet?: (MarkingKind | null)
/**
 * Bullet fill; defaults to the label color.
 */
bullet_color?: (string | null)
}
/**
 * A group of same-kind tokens drawn inside a node (e.g. Petri place markings), left-to-right in
 * a single row; if the total count doesn't fit the node's width, the row collapses to a numeral.
 */

export interface MarkingGroup {
kind: MarkingKind
color?: (string | null)
count: number
/**
 * Draw a dashed border on each dot (OC-Declare optional involvement, min 0).
 */
dashed?: boolean
/**
 * Fixed dot radius. When any group sets it, the whole row renders in exact mode: fixed
 * sizes, tight per-group clusters, no fit-to-node scaling or numeral collapse.
 */
radius?: (number | null)
/**
 * Center-to-center spacing between this group's dots (exact mode; below `2*radius`
 * overlaps them into a cluster). Defaults to a non-overlapping `2*radius + 2`.
 */
step?: (number | null)
/**
 * Ring stroke around each dot (exact mode). Absent: ring only when `dashed`, in the
 * node's stroke color.
 */
stroke?: (string | null)
}

export interface StyledIcon {
kind: IconKind
color?: (string | null)
/**
 * Icon half-size as a fraction of the node's half-extent. Defaults to the terminal-chrome
 * proportions used on screen (~0.3 of the radius).
 */
scale?: number
}
/**
 * One edge in a [`StyledGraph`]: an already-routed polyline plus its own styling.
 */

export interface StyledEdge {
/**
 * Routed polyline points, already in the same coordinate space as node `cx`/`cy`.
 */
points: [number, number][]
color?: (string | null)
/**
 * Linear gradient stroke from the first to the last polyline point, used by OC-Declare
 * multi-object-type arcs; two or more stops override `color` on the path.
 */
gradient?: GradientStop[]
width?: number
dash?: (string | null)
/**
 * End-of-edge marker glyph. The ball-bearing kinds mirror the on-screen OC-Declare markers:
 * the ball is centered exactly on the path endpoint (the node border).
 */
marker_start?: (("none" | "arrow") | "arrow_centered" | "ball" | "arrow_ball" | "arrow_bar" | "ball_arrow" | "ball_bar_arrow")
/**
 * End-of-edge marker glyph. The ball-bearing kinds mirror the on-screen OC-Declare markers:
 * the ball is centered exactly on the path endpoint (the node border).
 */
marker_end?: (("none" | "arrow") | "arrow_centered" | "ball" | "arrow_ball" | "arrow_bar" | "ball_arrow" | "ball_bar_arrow")
/**
 * Marker fill; defaults to the edge color (OC-Declare draws all markers in one neutral
 * gray so the object-type color stays on the path itself).
 */
marker_color?: (string | null)
/**
 * Marker base size in px (the side of the 12-unit marker viewBox); defaults to
 * `marker_size_for(width)`. OC-Declare passes 6 to match its small on-screen markers.
 */
marker_size?: (number | null)
labels?: EdgeLabel[]
dots?: EdgeDot[]
/**
 * Corner radius (px) for rounding the polyline's interior joins. 0 draws straight segments
 * (a plain multi-point polyline), matching whatever radius the on-screen edge used.
 */
rounded?: number
}
/**
 * One stop of a [`StyledEdge::gradient`] stroke.
 */

export interface GradientStop {
/**
 * Fraction (0..1) along the gradient axis.
 */
offset: number
color: string
}
/**
 * A text label anchored at a fraction along the edge's polyline.
 */

export interface EdgeLabel {
text: string
/**
 * Fraction (0..1) of the polyline's length. Defaults to the midpoint.
 */
at?: number
/**
 * Pixel displacement from the `at` anchor (e.g. the on-screen label de-overlap pass).
 */
dx?: number
dy?: number
bg?: (string | null)
color?: (string | null)
}
/**
 * A small dot drawn along an edge's curve, filled or hollow (OC-Declare cardinality markers).
 */

export interface EdgeDot {
at: number
color: string
filled?: boolean
/**
 * Ring stroke around the dot (the on-screen `MultiDot` ring: color mixed toward
 * CanvasText). Absent: filled dots draw ringless, hollow ones ring in `color`.
 */
stroke?: (string | null)
}
/**
 * A titled group of legend entries (e.g. "Object types").
 */

export interface LegendGroup {
title?: (string | null)
items: LegendItem[]
}
/**
 * One legend entry: a labeled swatch.
 */

export interface LegendItem {
label: string
color?: (string | null)
}

export interface SvgPalette {
node_bg: string
node_border: string
node_text: string
arc_color: string
arc_label_bg: string
export_bg: string
}

export interface GraphNode {
width: number
height: number
/**
 * Draw as an ellipse (arcs meet the outline) vs a box. Defaults to box.
 */
ellipse?: boolean
/**
 * Pin to the first or last layer: `"first"` (source rank) or `"last"` (sink rank).
 */
pin?: (string | null)
/**
 * Optional grouping id (e.g. an object type). Same-category nodes are held in a consistent
 * order across layers as a crossing-neutral tiebreak. Absent means no grouping.
 */
category?: (number | null)
/**
 * Optional seed centre `[x, y]` in final space. When any node has a seed, the layout keeps
 * the structural layer/order but places the cross-axis at the seed (a stable relayout).
 * 
 * @minItems 2
 * @maxItems 2
 */
seed?: ([number, number] | null)
/**
 * Hard-pin this node's seed cross-coordinate (others yield around it); use for the just-dragged
 * node so it lands exactly where dropped. Only meaningful with `seed`.
 */
pinned?: boolean
/**
 * Minimum clearance (px) to keep free beyond this node's border on the positive order side
 * (screen right in TB, screen bottom in LR): room for caller-drawn self-loops + labels.
 */
clear_after?: number
}

export interface DottedChartPoints {
/**
 * X-axis values (interpretation depends on [`DottedChartXAxis`]).
 */
x: number[]
/**
 * Y-axis indices into [`DottedChartData::y_values`].
 */
y: number[]
}

export interface AttributeChange {
/**
 * Timestamp of the change.
 */
time: string
/**
 * Attribute value at this point in time.
 */
value: (number | boolean | string | null)
}

export type Literal = (boolean | number | string | {
/**
 * The instant.
 */
timestamp: string
})

export type MappingEntry = (Mapping | {
/**
 * Mappings, in priority order.
 */
mappings: Mapping1[]
type: "ordered"
})

export type TimestampFormat = ({
type: "auto"
} | {
/**
 * The format.
 */
format: string
type: "format-string"
} | {
type: "unix-seconds"
} | {
type: "unix-millis"
})
/**
 * _Types_ of attribute values in OCEL2
 */

export type OCELAttributeType = ("String" | "Time" | "Integer" | "Float" | "Boolean" | "Null")
/**
 * Where an entity's timestamp comes from.
 * 
 * `deny_unknown_fields`: a misspelled key would otherwise be ignored, leaving a timestamp that
 * silently drops every row.
 */

export type TimestampSource = ({
/**
 * Where the text comes from.
 */
source: ValueExpression
/**
 * How to read it. `None` means auto-detection.
 */
format?: (TimestampFormat | null)
type: "value"
} | {
/**
 * Where the date comes from, if anywhere.
 */
date?: (TimestampPart | null)
/**
 * Where the time comes from, if anywhere.
 */
time?: (TimestampPart | null)
type: "components"
})

/**
 * A declarative mapping from relational rows to an OCEL.
 * 
 * Carries no connection details and no schema snapshot: both are supplied by the caller, which
 * keeps a blueprint portable, shareable and free of secrets.
 */

export interface Node {
/**
 * Unique id, referenced by other nodes and by mappings.
 */
id: string
/**
 * Display label. No semantic role.
 */
label?: (string | null)
/**
 * The operation.
 */
op: ({
/**
 * Source id, resolved to a connection at execution time.
 */
source_id: string
/**
 * Table name.
 */
table: string
type: "source"
} | {
/**
 * Input node id.
 */
input: string
/**
 * The condition.
 */
condition: Predicate
type: "filter"
} | {
/**
 * Left input node id.
 */
left: string
/**
 * Right input node id.
 */
right: string
/**
 * Column pairs, as `(left column, right column)`.
 */
on: [string, string][]
type: "join"
} | {
/**
 * Input node ids.
 */
inputs: string[]
type: "union"
})
}
/**
 * One independent mapping.
 */

export interface Mapping {
type: "single"
}
/**
 * One mapping from a node's rows to entities.
 */

export interface Mapping1 {
/**
 * The node whose rows this reads.
 */
node: string
/**
 * Display label, also used to name this mapping in diagnostics.
 */
label?: (string | null)
/**
 * Only rows satisfying this produce anything. `None` accepts every row.
 */
when?: (Predicate | null)
/**
 * What to produce.
 */
target: ({
/**
 * Event type.
 */
event_type: ValueExpression
/**
 * Event id. `None` assigns a UUID, which is not reproducible across runs and cannot
 * be compiled to a view.
 * 
 * It is also what coalesces a fan-out. Reading a join of orders and their items gives
 * one row per item, so a `None` id makes one event per item; an id naming the order
 * makes one event per order, still related to every item, because the repeated rows
 * are counted as [`MappingStats::deduplicated`](super::report::MappingStats::deduplicated)
 * while `objects` below is emitted for each of them.
 */
id?: (ValueExpression | null)
/**
 * When it happened.
 */
timestamp: ({
/**
 * Where the text comes from.
 */
source: ValueExpression
/**
 * How to read it. `None` means auto-detection.
 */
format?: (TimestampFormat | null)
type: "value"
} | {
/**
 * Where the date comes from, if anywhere.
 */
date?: (TimestampPart | null)
/**
 * Where the time comes from, if anywhere.
 */
time?: (TimestampPart | null)
type: "components"
})
/**
 * Event attributes.
 */
attributes?: AttributeMapping[]
/**
 * Objects related to this event.
 */
objects?: InlineObjectRef[]
type: "event"
} | {
/**
 * Object type.
 */
object_type: ValueExpression
/**
 * Object id.
 */
id: ValueExpression
/**
 * When the attribute values below were observed. `None` records them as static
 * values stamped at the Unix epoch.
 */
timestamp?: (TimestampSource | null)
/**
 * Object attributes.
 */
attributes?: AttributeMapping[]
type: "object"
} | {
event: EventEndpoint
object: ObjectEndpoint1
/**
 * Relation qualifier.
 */
qualifier?: (ValueExpression | null)
type: "e2o"
} | {
source: ObjectEndpoint2
target: ObjectEndpoint3
/**
 * Relation qualifier.
 */
qualifier?: (ValueExpression | null)
type: "o2o"
})
}
/**
 * One value read as a timestamp: where the text comes from, and how to read it.
 */

export interface TimestampPart {
/**
 * Where the text comes from.
 */
source: ValueExpression
/**
 * How to read it. `None` means auto-detection.
 */
format?: (TimestampFormat | null)
}
/**
 * Maps a source column to a named OCEL attribute.
 */

export interface AttributeMapping {
/**
 * Column to read.
 */
source_column: string
/**
 * Attribute name in the resulting log.
 */
name: string
/**
 * Declared attribute type, or `None` to take the catalog's type for `source_column`.
 */
value_type?: (OCELAttributeType | null)
}
/**
 * An object related to an event declared by the same mapping.
 */

export interface InlineObjectRef {
object: ObjectEndpoint
/**
 * Relation qualifier.
 */
qualifier?: (ValueExpression | null)
}
/**
 * The object.
 */

export interface ObjectEndpoint {
/**
 * The object's id.
 */
id: ValueExpression
/**
 * The object's type. Required under [`IdRendering::TypePrefixed`] and under
 * [`MissingEndpointPolicy::Create`].
 */
object_type?: (ValueExpression | null)
/**
 * Split the id cell into several ids, producing one relation per part.
 */
split?: (SplitSpec | null)
}
/**
 * How to split one cell into several values.
 */

export interface SplitSpec {
/**
 * The splitting rule.
 */
kind: ({
/**
 * The separator.
 */
delimiter: string
type: "delimiter"
} | {
/**
 * The pattern.
 */
pattern: string
type: "regex"
})
/**
 * Trim surrounding whitespace from each part.
 */
trim: boolean
}
/**
 * The event.
 */

export interface EventEndpoint {
/**
 * The event's id.
 */
id: ValueExpression
/**
 * The event's type. Required under [`IdRendering::TypePrefixed`].
 */
event_type?: (ValueExpression | null)
}
/**
 * The object.
 */

export interface ObjectEndpoint1 {
/**
 * The object's id.
 */
id: ValueExpression
/**
 * The object's type. Required under [`IdRendering::TypePrefixed`] and under
 * [`MissingEndpointPolicy::Create`].
 */
object_type?: (ValueExpression | null)
/**
 * Split the id cell into several ids, producing one relation per part.
 */
split?: (SplitSpec | null)
}
/**
 * The source object.
 */

export interface ObjectEndpoint2 {
/**
 * The object's id.
 */
id: ValueExpression
/**
 * The object's type. Required under [`IdRendering::TypePrefixed`] and under
 * [`MissingEndpointPolicy::Create`].
 */
object_type?: (ValueExpression | null)
/**
 * Split the id cell into several ids, producing one relation per part.
 */
split?: (SplitSpec | null)
}
/**
 * The target object.
 */

export interface ObjectEndpoint3 {
/**
 * The object's id.
 */
id: ValueExpression
/**
 * The object's type. Required under [`IdRendering::TypePrefixed`] and under
 * [`MissingEndpointPolicy::Create`].
 */
object_type?: (ValueExpression | null)
/**
 * Split the id cell into several ids, producing one relation per part.
 */
split?: (SplitSpec | null)
}

export interface TableSchema {
/**
 * Table name.
 */
name: string
/**
 * Columns, keyed by name.
 */
columns: {
[k: string]: ColumnSchema
}
}
/**
 * One column's declared shape.
 */

export interface ColumnSchema {
/**
 * Column name.
 */
name: string
/**
 * The source's own type name, verbatim, for example `INTEGER` or `timestamp`.
 */
col_type: string
/**
 * Whether the source permits `NULL` here.
 */
nullable: boolean
}
/**
 * A few real rows of one table, for display only.
 * 
 * Rows are aligned to [`TablePreview::columns`] so a wide table can be read across. A cell is
 * `None` for SQL `NULL`, distinct from `Some(String::new())`.
 */

export interface TablePreview {
/**
 * Column names, in the order the rows are aligned to.
 */
columns: string[]
/**
 * Rows, each the same length as `columns`.
 */
rows: (string | null)[][]
}

export type SqlDialect = "DuckDb"
/**
 * Which OCEL surface the compiler emits.
 */

export type EmissionShape = ("PerType" | "Consolidated")

/**
 * A blueprint compiled to SQL.
 * 
 * Serializable but not deserializable: [`Self::errors`] holds [`CompileError`], which is not, so
 * neither is this. Crosses a bindings boundary outbound only, as a compile binding's return
 * value.
 */

export interface ViewDef {
/**
 * The relation's name, unquoted.
 */
name: string
/**
 * A bare `SELECT` body with no `CREATE` wrapper, so the same text serves a view, a CTE and
 * a `CREATE TABLE AS`.
 */
body: string
}
/**
 * SQL that must return zero rows for the compiled relations to agree with the extractor.
 */

export interface Probe {
/**
 * The mapping this is about, or `None` for a whole-log check.
 */
mapping?: (MappingRef | null)
/**
 * What it guards.
 */
kind: ("AmbiguousObjectIdentity" | "AmbiguousEventIdentity" | "AmbiguousStaticObjectAttributes" | {
StaleTypeDomain: {
/**
 * The column the domain came from.
 */
column: string
}
})
/**
 * The check itself, as a `SELECT` returning zero rows when the guard holds.
 */
sql: string
}
/**
 * Points a diagnostic back at the mapping it came from.
 */

export interface MappingRef {
/**
 * Position in the desugared, flattened mapping list this run executed.
 */
index: number
/**
 * The mapping's own label, if it has one.
 */
label?: (string | null)
/**
 * The JSON path of the authored entry this mapping came from -- see
 * [`desugar_with_paths`](super::desugar::desugar_with_paths) -- so a diagnostic points at
 * what the author wrote rather than a position in the flattened list.
 */
path: string
/**
 * What this mapping produces, derived from its target: `event "appoint officer"`,
 * `event -> object relation`, and so on. Present whether or not a `label` was typed.
 */
describes: string
}
/**
 * A mapping that produced no view, and why.
 * 
 * Compilation never fails wholesale: an uncompilable mapping is skipped and recorded here, and
 * everything else still compiles.
 * 
 * Serializable but not deserializable: [`RejectReason`] is not, so neither is this.
 */

export interface CompileError {
/**
 * The mapping this is about, or `None` for a blueprint-level problem.
 */
mapping?: (MappingRef | null)
/**
 * Why it could not be compiled.
 */
reason: ({
SynthesizedId: {
/**
 * The absent field.
 */
field: string
}
} | {
DynamicTypeName: {
/**
 * The position whose type is dynamic.
 */
field: string
/**
 * Why no domain was available.
 */
detail: string
}
} | {
TypeDomainTooLarge: {
/**
 * The column the domain came from.
 */
column: string
/**
 * How many values it has.
 */
size: number
/**
 * The cap.
 */
cap: number
}
} | {
ReservedTypeName: {
/**
 * The offending type name.
 */
name: string
}
} | {
UnknownNode: {
/**
 * The node id.
 */
node: string
}
} | {
UnresolvedNodeSchema: {
/**
 * The node id.
 */
node: string
}
} | {
NodeCycle: {
/**
 * A node id taking part in the cycle.
 */
node: string
}
} | {
EmptyProjection: {
/**
 * The node id.
 */
node: string
}
} | {
EmptyUnion: {
/**
 * The node id.
 */
node: string
}
} | {
UnknownColumn: {
/**
 * The column name.
 */
column: string
/**
 * Which position referenced it.
 */
field: string
}
} | {
UndeclaredColumnKind: {
/**
 * The column name.
 */
column: string
/**
 * The catalog's own type string.
 */
col_type: string
/**
 * Which position referenced it.
 */
field: string
}
} | {
UnstableIdentityRendering: {
/**
 * The column name.
 */
column: string
/**
 * The catalog's own type string.
 */
col_type: string
/**
 * Which position referenced it.
 */
field: string
}
} | {
UnstableDisplayRendering: {
/**
 * The column name.
 */
column: string
/**
 * The catalog's own type string.
 */
col_type: string
/**
 * Which position referenced it.
 */
field: string
}
} | {
ResidualTimestamp: {
/**
 * What about it is residual.
 */
detail: string
}
} | {
UndecidableJoinKey: {
/**
 * The join node's id.
 */
node: string
/**
 * Which side the column is on.
 */
side: string
/**
 * The column name.
 */
column: string
/**
 * The catalog's own type string.
 */
col_type: string
}
} | {
UnportableRegex: {
/**
 * The pattern.
 */
pattern: string
/**
 * Which construct made it unportable.
 */
detail: string
}
} | {
InvalidRegex: {
/**
 * The pattern.
 */
pattern: string
/**
 * The compiler's message.
 */
message: string
}
} | {
InvalidTemplate: {
/**
 * The template text.
 */
template: string
/**
 * What is wrong with it.
 */
reason: string
}
} | {
AttributeCoercion: {
/**
 * The attribute name.
 */
attribute: string
/**
 * The source column.
 */
column: string
/**
 * The catalog's own type string.
 */
col_type: string
/**
 * The declared OCEL attribute type.
 */
declared: string
}
} | {
DynamicTypeAttributeConflict: {
/**
 * The attribute name.
 */
attribute: string
}
} | {
UnsupportedEmissionShape: {
/**
 * The shape asked for.
 */
shape: string
}
} | {
ViewCycle: {
/**
 * The relation's name.
 */
view: string
}
} | {
Invalid: {
/**
 * The rendered validation error.
 */
detail: string
}
})
}

export interface ExtractionCatalog {
/**
 * Table schemas, keyed by source id then table name.
 */
tables: {
[k: string]: {
[k: string]: TableSchema
}
}
/**
 * Column domains, keyed by source id, then table name, then column name.
 */
domains: {
[k: string]: {
[k: string]: {
[k: string]: string[]
}
}
}
/**
 * A handful of real rows per table, keyed by source id then table name, to show a person
 * what the data looks like.
 * 
 * Deliberately unreachable through the [`Catalog`] trait: unlike
 * [`domains`](ExtractionCatalog::domains), a preview is incomplete, so compiling from one
 * would emit views only for the types that happened to appear first.
 */
previews?: {
[k: string]: {
[k: string]: TablePreview
}
}
}
/**
 * One table's declared shape.
 */

export type ExtractionError = ({
Invalid: ValidationError[]
} | {
MissingProvider: {
/**
 * The missing source id.
 */
source_id: string
}
} | {
InvalidRegex: {
/**
 * The offending pattern.
 */
pattern: string
/**
 * The compiler's message.
 */
message: string
}
} | {
JoinKeyColumnMissing: {
/**
 * The `Join` node.
 */
node: string
/**
 * `"left"` or `"right"`.
 */
side: string
/**
 * The key column, as named on that side.
 */
column: string
}
} | {
Provider: {
/**
 * The node being read when the failure happened.
 */
node: string
/**
 * The underlying error.
 */
source: ({
UnknownTable: {
/**
 * The table name.
 */
table: string
}
} | {
UnknownColumn: {
/**
 * The table name.
 */
table: string
/**
 * The column name.
 */
column: string
}
} | "QueryUnsupported" | {
Backend: {
/**
 * The table being read when the failure happened.
 */
table: string
/**
 * The backend's error message.
 */
message: string
}
})
}
} | {
Sink: {
/**
 * What was being added when the failure happened.
 */
context: string
/**
 * The underlying error.
 */
source: ({
DuplicateEvent: {
/**
 * The repeated id.
 */
id: string
}
} | {
DuplicateObject: {
/**
 * The repeated id.
 */
id: string
}
} | {
IdTypeCollision: {
/**
 * The contested id.
 */
id: string
}
} | {
UnknownType: {
/**
 * `"event"` or `"object"`.
 */
kind: string
/**
 * The undeclared type name.
 */
name: string
}
} | "InvalidRef" | {
Backend: string
})
}
} | {
IdTypeCollision: {
mapping: MappingRef1
/**
 * The contested id.
 */
id: string
/**
 * The type this row wanted the id for. The type that already holds it is whatever the
 * sink reports for that id.
 */
requested_type: string
}
} | {
ConflictingAttributeType: {
/**
 * `"event"` or `"object"`.
 */
kind: string
/**
 * The entity type.
 */
type_name: string
/**
 * The attribute.
 */
attribute: string
/**
 * The type it was declared with first.
 */
declared: ("String" | "Time" | "Integer" | "Float" | "Boolean" | "Null")
/**
 * The type the later declaration gave it.
 */
conflicting: ("String" | "Time" | "Integer" | "Float" | "Boolean" | "Null")
}
} | {
DuplicateObject: {
mapping: MappingRef2
/**
 * The repeated id.
 */
id: string
}
} | {
MissingEndpoint: {
mapping: MappingRef3
/**
 * Which endpoint (`"event"`, `"object"`, `"source"`, `"target"`, ...).
 */
endpoint: string
/**
 * The unresolved id.
 */
id: string
}
} | {
MissingEndpointsAtFinalize: {
/**
 * How many relations the sink could not resolve. Equals the number of
 * [`MissingEndpoint`](Self::MissingEndpoint) errors an eager sink reports for the same
 * run for an `E2O`/`O2O` endpoint or a `Target::Event`'s inline reference resolved via
 * [`resolve_object_endpoint`](super::mapping_exec::resolve_object_endpoint) --
 * **not** universally: an inline reference on a `Target::Event` whose own event this run
 * dropped is reported by an eager sink as [`DropReason::UnresolvedEndpoint`] on that
 * mapping, with no [`MissingEndpoint`] error pushed at all (there is no endpoint left to
 * resolve), while a deferring sink -- which cannot know at the call site that the event
 * will not exist -- stages the reference regardless and counts it here at finalize. This
 * count can therefore exceed the eager sink's `MissingEndpoint` tally by exactly that
 * many references.
 */
count: number
}
})
/**
 * A reason a blueprint cannot be executed or compiled.
 */

export type ValidationError = ({
/**
 * The blueprint's version.
 */
found: number
/**
 * The newest version this build reads.
 */
supported: number
type: "unsupported-version"
} | {
/**
 * The repeated id.
 */
id: string
type: "duplicate-node-id"
} | {
/**
 * Who referred to it.
 */
from: string
/**
 * The missing id.
 */
id: string
type: "unknown-node-ref"
} | {
/**
 * One node id participating in the cycle.
 */
id: string
type: "node-cycle"
} | {
/**
 * The source id.
 */
source_id: string
type: "unknown-source"
} | {
/**
 * The source id.
 */
source_id: string
/**
 * The table name.
 */
table: string
type: "unknown-table"
} | {
/**
 * The node whose rows were being read.
 */
node: string
/**
 * The column name.
 */
column: string
type: "unknown-column"
} | {
/**
 * Which mapping, by label or index.
 */
mapping: string
/**
 * Which endpoint.
 */
endpoint: string
type: "missing-type-for-prefixing"
} | {
/**
 * Which mapping, by label or index.
 */
mapping: string
/**
 * Which endpoint.
 */
endpoint: string
type: "missing-type-for-create"
} | {
/**
 * The node id.
 */
node: string
type: "empty-union"
} | {
/**
 * The pattern.
 */
pattern: string
/**
 * The compiler's message.
 */
message: string
type: "invalid-regex"
} | {
/**
 * The template text.
 */
template: string
/**
 * What is wrong with it.
 */
reason: string
type: "invalid-template"
})

/**
 * What [`extract`](super::extract::extract) produced, beyond the OCEL itself.
 * 
 * Serializable but not deserializable: [`ExtractionError`] carries `&'static str` fields (a
 * borrow no deserializer can manufacture), so this only ever crosses a bindings boundary
 * outbound, as a `#[register_binding]` return value.
 */

export interface MappingStats {
mapping: MappingRef
/**
 * Rows the mapping's node produced, before `when` was applied.
 */
rows_read: number
/**
 * Entities or relations this mapping *handed to the sink*.
 * 
 * # Not "survived the run", for a sink that defers resolution
 * 
 * For an eager sink ([`SlimOcelSink`](super::slim_sink::SlimOcelSink)) the two coincide:
 * a relation whose endpoint does not exist is refused at the call site, so it is counted
 * under [`DropReason::UnresolvedEndpoint`] and never here.
 * 
 * A sink that answers [`Resolution::Deferred`](super::sink::Resolution::Deferred) --
 * [`DuckDbSink`](super::duckdb_sink::DuckDbSink) -- has no id index to refuse with, so the
 * relation is written, counted here, and only deleted at
 * [`finalize`](super::sink::ExtractionSink::finalize). The same dangling `E2O` therefore
 * reads as
 * 
 * | | eager | deferring |
 * |---|---|---|
 * | `entities_emitted` | 0 | 1 |
 * | `dropped[UnresolvedEndpoint]` | 1 | absent |
 * | [`FinalizeReport::unresolved_endpoints`](super::sink::FinalizeReport) | 0 | 1 |
 * 
 * This is the same reporting shift [`DuckDbSink`]'s own docs describe for `dropped`, seen
 * from the other side: the loss is reported in bulk at finalize because the mapping that
 * named the endpoint is long gone by then. Both logs still have the same contents.
 * 
 * To compare two sinks, or to count what a run actually produced, subtract
 * `ExtractionReport::finalize.unresolved_endpoints` from the run's total rather than
 * reading a single mapping's counter -- per-mapping attribution of a deferred loss does not
 * exist, by construction.
 * 
 * [`DuckDbSink`]: super::duckdb_sink::DuckDbSink
 */
entities_emitted: number
/**
 * Rows that tried to create an entity **the sink already had**. Not a loss: an object mapping
 * at event grain names the same object on every row by design. See
 * [`DuplicateObjectPolicy::Error`](super::blueprint::DuplicateObjectPolicy::Error) for what
 * turns a repeat into a loss instead.
 * 
 * # Exactly what is counted
 * 
 * One increment per row whose entity-creating call found the entity already present:
 * 
 * * a [`Target::Object`](super::blueprint::Target::Object) row whose
 *   [`resolve_object`](super::sink::ExtractionSink::resolve_object) answered
 *   [`Exists`](super::sink::Resolution::Exists), or whose
 *   [`add_object`](super::sink::ExtractionSink::add_object) was refused with
 *   [`SinkError::DuplicateObject`](super::sink::SinkError::DuplicateObject) -- the same event
 *   seen through an eager and a deferring sink respectively, which is why both report the same
 *   number;
 * * a [`Target::Event`](super::blueprint::Target::Event) row whose `add_event` was refused
 *   with [`SinkError::DuplicateEvent`](super::sink::SinkError::DuplicateEvent).
 * 
 * **Including a repeat across two mappings**, which is a change in meaning from "rows that
 * named an entity *this mapping* had already emitted". A second mapping naming an id a first
 * mapping created now counts one deduplication, where it used to count none. That distinction
 * needed one id set per mapping holding every id it named -- the last per-run structure whose
 * size tracked the data -- and it could never have been made to agree across sinks anyway: a
 * sink that answers [`Deferred`](super::sink::Resolution::Deferred) to every ask cannot say
 * whose object it already had.
 * 
 * # And what is not
 * 
 * **Resolving a relation endpoint is never counted**, so an `E2O`/`O2O` mapping reports zero
 * however often its rows repeat an id. Finding an endpoint that already exists is the normal
 * successful case, not a deduplication -- counting it made a healthy `E2O` mapping over `n`
 * rows report `n` deduplications (and `2n` for `O2O`) while nothing had been deduplicated at
 * all. Counting only the repeats among them is what the per-mapping id set used to buy, and it
 * went with it: a case-centric blueprint whose single event mapping creates its case objects
 * through an inline reference used to report `rows - distinct cases` here and now reports
 * zero. The objects are unaffected; only this counter is. A blueprint that wants that number
 * reported can name the cases with a [`Target::Object`](super::blueprint::Target::Object)
 * mapping, which is what [`FlatEventTable`](super::case_centric::FlatEventTable) already adds
 * as soon as there are case attributes.
 */
deduplicated: number
/**
 * Rows dropped, by reason. A row that matches several reasons at once (rare) is counted
 * once, under the first one detected.
 */
dropped: {
[k: string]: number
}
}
/**
 * Which mapping.
 */

export interface MappingRef1 {
/**
 * Position in the desugared, flattened mapping list this run executed.
 */
index: number
/**
 * The mapping's own label, if it has one.
 */
label?: (string | null)
/**
 * The JSON path of the authored entry this mapping came from -- see
 * [`desugar_with_paths`](super::desugar::desugar_with_paths) -- so a diagnostic points at
 * what the author wrote rather than a position in the flattened list.
 */
path: string
/**
 * What this mapping produces, derived from its target: `event "appoint officer"`,
 * `event -> object relation`, and so on. Present whether or not a `label` was typed.
 */
describes: string
}
/**
 * The mapping whose row named the repeat.
 */

export interface MappingRef2 {
/**
 * Position in the desugared, flattened mapping list this run executed.
 */
index: number
/**
 * The mapping's own label, if it has one.
 */
label?: (string | null)
/**
 * The JSON path of the authored entry this mapping came from -- see
 * [`desugar_with_paths`](super::desugar::desugar_with_paths) -- so a diagnostic points at
 * what the author wrote rather than a position in the flattened list.
 */
path: string
/**
 * What this mapping produces, derived from its target: `event "appoint officer"`,
 * `event -> object relation`, and so on. Present whether or not a `label` was typed.
 */
describes: string
}
/**
 * The mapping whose row named the endpoint.
 */

export interface MappingRef3 {
/**
 * Position in the desugared, flattened mapping list this run executed.
 */
index: number
/**
 * The mapping's own label, if it has one.
 */
label?: (string | null)
/**
 * The JSON path of the authored entry this mapping came from -- see
 * [`desugar_with_paths`](super::desugar::desugar_with_paths) -- so a diagnostic points at
 * what the author wrote rather than a position in the flattened list.
 */
path: string
/**
 * What this mapping produces, derived from its target: `event "appoint officer"`,
 * `event -> object relation`, and so on. Present whether or not a `label` was typed.
 */
describes: string
}
/**
 * What the sink did at [`ExtractionSink::finalize`](super::sink::ExtractionSink::finalize).
 * 
 * All zero for a sink that resolves relation endpoints eagerly, which reports everything
 * through [`per_mapping`](Self::per_mapping) instead. A sink that defers -- a path-backed
 * one, which cannot afford an in-memory id index -- reports its share of the same
 * information here, because it only learns it after the last row. See
 * [`Resolution`](super::sink::Resolution).
 */

export interface FinalizeReport {
/**
 * Relations written against a [`Resolution::Deferred`] endpoint that resolved to a real
 * entity at finalize.
 */
resolved_relations: number
/**
 * Relations whose deferred endpoint did not resolve. These are what a sink answering
 * immediately would have counted per mapping as
 * [`DropReason::UnresolvedEndpoint`](super::report::DropReason::UnresolvedEndpoint);
 * `on_missing_endpoint` decided what happened to them (dropped, or their object created).
 */
unresolved_endpoints: number
/**
 * Objects synthesised at finalize under `on_missing_endpoint: Create`, for deferred
 * endpoints that turned out not to exist.
 */
objects_created: number
/**
 * Repeated entity ids removed at finalize -- a deferring sink's share of
 * [`MappingStats::deduplicated`](super::report::MappingStats::deduplicated), which it could
 * not detect while writing.
 */
duplicates_removed: number
}
/**
 * How long a run spent, split by phase, in milliseconds.
 * 
 * The split is the point: discovering a source's schema is a fixed cost paid before a single row
 * is read, and a caller that already holds a catalog can skip it entirely. Reporting one total
 * would hide which of the two a slow run actually spent its time in.
 */

export interface ExtractionTiming {
/**
 * Connecting to each source and reading its schema. Zero when the caller supplied a catalog.
 */
discovery_ms: number
/**
 * Reading rows and emitting entities: `extract` itself.
 */
extraction_ms: number
}

export interface ResolvedStep {
edge: TypeEdge
/**
 * Whether the edge is traversed in reverse direction.
 */
reverse: boolean
}
/**
 * The typed edge traversed in this step.
 */

export interface TypeEdge {
/**
 * Source type of the edge.
 */
source: ({
Event: string
} | {
Object: string
})
/**
 * Target type of the edge.
 */
target: ({
Event: string
} | {
Object: string
})
/**
 * Relationship qualifier this edge represents.
 */
qualifier: string
}

export type EventIndex = number
/**
 * An Object Index
 * 
 * Points to an object in the context of a given OCEL
 */

export type ObjectIndex = number

/**
 * Connections of a single schema, with metrics and throughput.
 */

export interface SchemaStats {
metrics: SchemaMetrics
/**
 * Event-to-event throughput times, if both endpoints are events.
 */
throughput?: (ThroughputStats | null)
}
/**
 * Schema quality metrics.
 */

export interface SchemaMetrics {
/**
 * Number of distinct (source, target) pairs connected.
 */
support: number
/**
 * Fraction of source-type instances with at least one connection.
 */
coverage: number
/**
 * Inverse average fan-out: `1 / (avg distinct targets per connected source)`. High = discriminating.
 */
selectivity: number
/**
 * Total number of connections.
 */
path_count: number
/**
 * Number of distinct source entities with at least one connection.
 */
sources_with_paths: number
/**
 * Total number of source entities of this type.
 */
total_sources: number
/**
 * Fraction of target-type instances reached.
 */
reach: number
/**
 * Inverse average fan-in: `|distinct targets| / support`. High = each target reached by few sources.
 */
exclusivity: number
}
/**
 * Throughput time statistics (seconds) over event-to-event connections.
 */

export interface ThroughputStats {
/**
 * Minimum duration in seconds.
 */
min: number
/**
 * Maximum duration in seconds.
 */
max: number
/**
 * Mean duration in seconds.
 */
mean: number
/**
 * Median duration in seconds.
 */
median: number
}
/**
 * A discovered connection between two entities, with timestamps.
 * 
 * Only source and target are materialized (not the full intermediate path).
 */

export interface Connection {
/**
 * Source entity of the connection.
 */
source: ({
Event: EventIndex
} | {
Object: ObjectIndex
})
/**
 * Target entity of the connection.
 */
target: ({
Event: EventIndex
} | {
Object: ObjectIndex
})
/**
 * Timestamp of the source (only present if the source is an event).
 */
source_time?: (string | null)
/**
 * Timestamp of the target (only present if the target is an event).
 */
target_time?: (string | null)
}

export type TypeRef = ({
Event: string
} | {
Object: string
})

/**
 * A discovery query: source/target types, max schema length, and connection params.
 */

export interface PathConnectionParams {
/**
 * Temporal constraint applied along each path.
 */
temporal: ("None" | "Forward" | {
Bounded: number
})
/**
 * Which target event(s) to keep per source.
 */
selection: ("All" | "First" | "Last" | "Closest")
/**
 * Global cap on the number of connections: a coarse safety limit, checked between
 * sources, so a single high-fan-out source can overshoot it.
 */
max_connections?: (number | null)
/**
 * Store only one connection per (source, target) pair.
 */
dedup_targets: boolean
/**
 * Terminate early once selectivity is provably below this threshold.
 */
selectivity_threshold?: (number | null)
}

export interface DiscoveredSchema {
/**
 * Enumeration index (stable for a given `source`/`target`/`max_length`/`allowed_types`).
 */
index: number
/**
 * Human-readable schema string.
 */
schema: string
/**
 * Source type.
 */
source: ({
Event: string
} | {
Object: string
})
/**
 * Target type.
 */
target: ({
Event: string
} | {
Object: string
})
/**
 * Number of steps in the schema.
 */
length: number
stats: SchemaStats
/**
 * Whether the schema has zero connections.
 */
is_dead: boolean
/**
 * Whether selectivity-based early termination was triggered.
 */
selectivity_pruned: boolean
/**
 * Whether the connection limit was reached (results may be incomplete).
 */
limit_reached: boolean
/**
 * Index into [`PathSchemaDiscovery::equivalence_classes`].
 */
equivalence_class: number
}
/**
 * Computed metrics and throughput.
 */

export interface ConnectionEquivalenceClass {
/**
 * Representative schema (shortest display string in the class).
 */
representative: string
/**
 * All schemas in this class (display strings).
 */
schemas: string[]
/**
 * Number of unique (source, target) connections shared by every schema in the class.
 */
connection_count: number
}

export interface PathSchemaTypeNode {
/**
 * Type name (activity / object class).
 */
name: string
/**
 * Whether this is an event type (`true`) or object type (`false`).
 */
is_event: boolean
/**
 * Number of entities of this type.
 */
count: number
}
/**
 * A directed, typed edge in the type graph (a qualified E2O or O2O relationship type).
 */

export type OCELAttributeValue = (number | boolean | string | null)

export interface OCELType {
/**
 * Name
 */
name: string
/**
 * Attributes (defining the _type_ of values)
 */
attributes?: OCELTypeAttribute[]
}
/**
 * OCEL Attribute types
 */

export interface OCELTypeAttribute {
/**
 * Name of attribute
 */
name: string
/**
 * Type of attribute
 */
type: string
}

export interface OCELEventAttribute {
/**
 * Name of event attribute
 */
name: string
/**
 * Value of attribute
 */
value: (number | boolean | string | null)
}
/**
 * OCEL Relationship (qualified; referring back to an [`OCELObject`])
 */

export interface OCELRelationship {
/**
 * ID of referenced [`OCELObject`]
 */
objectId: string
/**
 * Qualifier of relationship
 */
qualifier: string
}

export interface OCELObjectAttribute {
/**
 * Name of attribute
 */
name: string
/**
 * Value of attribute
 */
value: (number | boolean | string | null)
/**
 * Time of attribute value
 */
time: string
}
/**
 * OCEL Relationship (qualified; referring back to an [`OCELObject`])
 */

export interface CostFunction {
/**
 * Default cost for a model move (visible transition fires without matching log event)
 */
model_move_cost: number
/**
 * Default cost for a log move (log event not matched by model)
 */
log_move_cost: number
/**
 * Default cost for a synchronous move
 */
sync_move_cost: number
/**
 * Default cost for a silent/tau move
 */
silent_move_cost: number
}

export type ObjectTypeAssociation = ({
/**
 * The object type
 */
object_type: string
type: "Simple"
} | {
/**
 * First object type (for source event)
 */
first: string
/**
 * Second object type (for target event)
 */
second: string
/**
 * Specifies the direction of the O2O relationship.
 * 
 * If reversed is `False`, `(first,second)` is considered
 */
reversed: boolean
type: "O2O"
})

/**
 * OC-DECLARE Constraint arc/edge between two nodes (i.e., activities)
 */

export interface OCDeclareArcLabel {
/**
 * Each (for each object of that type separately, there must be the specified number of relevant target events)
 */
each: ObjectTypeAssociation[]
/**
 * Any (there must be the specified number of relevant target events involving at least one of the objects of this type involved in the source event)
 */
any: ObjectTypeAssociation[]
/**
 * All (there must be the specified number of relevant target events involving all of the objects of this type involved in the source event)
 */
all: ObjectTypeAssociation[]
}

export interface OCELEvent {
/**
 * Event ID
 */
id: string
/**
 * Event Type (referring back to the `name` of an [`OCELType`])
 */
type: string
/**
 * `DateTime` when event occured
 */
time: string
/**
 * Event attributes
 */
attributes?: OCELEventAttribute[]
/**
 * E2O (Event-to-Object) relationships
 */
relationships?: OCELRelationship[]
}
/**
 * OCEL Event Attributes
 */

export interface OCELObject {
/**
 * Object ID
 */
id: string
/**
 * Object Type (referring back to thte `name` of an [`OCELType`])
 */
type: string
/**
 * Object attributes
 */
attributes?: OCELObjectAttribute[]
/**
 * O2O (Object-to-Object) relationships
 */
relationships?: OCELRelationship[]
}
/**
 * OCEL Object Attribute
 * 
 * Describing a named value _at a certain point in time_
 */

export interface DirectlyFollowsGraph {
/**
 * Activities
 */
activities: {
[k: string]: number
}
/**
 * Directly-follows relations
 */
directly_follows_relations: [[string, string], number][]
/**
 * Start activities
 */
start_activities: string[]
/**
 * End activities
 */
end_activities: string[]
}

export type OCDeclareArcType = ("AS" | "EF" | "EP" | "DF" | "DP")

/**
 * Options for the automatic discovery of OC-DECLARE constraints
 */

export interface LogAlignments {
net: PetriNet
/**
 * Per-variant alignment (activity sequence, frequency, the move sequence + cost).
 */
variant_alignments: VariantAlignmentResult[]
/**
 * Aggregate alignment fitness (`None` if fitness could not be computed).
 */
fitness?: (FitnessResult | null)
aggregated: AlignmentAggregate
}
/**
 * The process model the log was aligned against (the caller-supplied net, echoed back).
 */

export interface EventLogInput {
traces?: XesTraceInput[]
}
/**
 * One authored trace (case): its id plus events, with optional case-level attributes.
 */

export interface Map_of_uint {
[k: string]: number
}

export interface AttributeInfo {
name: string
level: AttributeLevel
kind: AttributeKind
unique_count: number
total_count: number
missing_count: number
}

export interface AttributeSummary {
name: string
level: AttributeLevel
kind: AttributeKind
total: number
missing: number
/**
 * For categorical: top values and their counts (sorted desc)
 */
top_values: [string, number][]
/**
 * For numeric: histogram bin edges
 */
hist_bin_edges: number[]
/**
 * For numeric: histogram counts
 */
hist_counts: number[]
/**
 * For numeric: basic stats
 */
numeric_stats?: (NumericStats | null)
}

export interface AttributeValues {
/**
 * Distinct values with their occurrence counts, sorted by count desc then value asc.
 * Truncated to `ATTR_VALUES_CAP` entries; `total_distinct` gives the untruncated count.
 */
values: [string, number][]
/**
 * True number of distinct values before truncation.
 */
total_distinct: number
}

export interface CaseDurations {
num_cases: number
num_empty_cases: number
min_ms: number
max_ms: number
mean_ms: number
median_ms: number
p90_ms: number
p95_ms: number
p99_ms: number
hist_bin_edges_ms: number[]
hist_counts: number[]
ecdf_x_ms: number[]
ecdf_y: number[]
}

export interface DfPerformance {
arcs: DfArcDuration[]
}
/**
 * Per-arc duration statistics.
 */

export interface EventTimeHistogram {
/**
 * Event counts keyed by bin-start epoch millis (as a string) then by event type / activity.
 */
events_per_timestamp: {
[k: string]: {
[k: string]: number
}
}
activities: string[]
bin_width_ms: number
}

export interface LogGlobals {
/**
 * Log-level free-form attributes.
 */
attributes: {
[k: string]: string
}
extensions: LogExtensionInfo[]
classifiers: LogClassifierInfo[]
/**
 * Global trace-level attribute defaults (XES 2.0).
 */
global_trace_attrs: {
[k: string]: string
}
/**
 * Global event-level attribute defaults (XES 2.0).
 */
global_event_attrs: {
[k: string]: string
}
}

export interface NumberOfTracesAndEvents {
num_traces: number
num_events: number
}

export interface TraceVariants {
activities: string[]
act_to_index: {
[k: string]: number
}
traces: [number[], number][]
}

export type TraceSortField = ("CaseId" | "NumEvents" | "StartTime" | "Duration")

export interface TraceBrowserPage {
rows: TraceBrowserRow[]
total: number
}

export interface AttributeCatalogEntry {
scope: AttributeScope
key: string
/**
 * None for OCEL (declared attributes, no scan); Some for XES.
 */
occurrence_count?: (number | null)
/**
 * Up to 5 distinct sample values. Empty for OCEL.
 */
sample_values: string[]
}

export interface TraceDetail {
/**
 * Trace-level attributes, excluding `concept:name`.
 */
case_attributes: {
[k: string]: string
}
events: TraceEventRow[]
}

export interface ObjectDetail {
object_id: string
object_type: string
events: ObjectEventRow[]
/**
 * (object_id, object_type) via O2O
 */
related_objects: [string, string][]
attributes: {
[k: string]: string
}
}

export interface Map_of_Map_of_ObjectInvolvementCounts {
[k: string]: {
[k: string]: ObjectInvolvementCounts
}
}
/**
 * Min/max number of objects of a type involved with an activity.
 */

export interface OcelAttributeInfo {
name: string
level: OcelAttributeLevel
kind: AttributeKind
unique_count: number
total_count: number
missing_count: number
}

export interface OcelAttributeSummary {
name: string
level: OcelAttributeLevel
kind: AttributeKind
total: number
missing: number
top_values: [string, number][]
hist_bin_edges: number[]
hist_counts: number[]
numeric_stats?: (NumericStats | null)
}

export interface OcDfgCounts {
object_type_to_dfg: {
[k: string]: DfgCounts
}
object_counts: {
[k: string]: number
}
}
/**
 * Case-centric DFG counts. Start/end carry real per-activity frequencies.
 */

export interface OcelDfPerformance {
arcs_per_object_type: {
[k: string]: DfArcDuration[]
}
}
/**
 * Per-arc duration statistics.
 */

export interface OCELInfo {
num_objects: number
num_events: number
event_types: string[]
object_types: string[]
}

export interface OCELObjectAttributeChanges {
traces: {
[k: string]: [string, string][]
}
}

export type ObjectSortField = ("ObjectId" | "ObjectType" | "NumEvents" | "FirstTime")

export type Nullable_string = (string | null)

export interface ObjectBrowserPage {
rows: ObjectBrowserRow[]
total: number
object_types: string[]
}

export interface OcelTypeRelations {
e2o_type_relations: OcelTypePairRelation[]
o2o_type_relations: OcelTypePairRelation[]
}
/**
 * Aggregated relation between two types (event->object for E2O, object->object for O2O).
 */

export interface OcelInput {
eventTypes?: OcelTypeInput[]
objectTypes?: OcelTypeInput[]
events?: OcelEventInput[]
objects?: OcelObjectInput[]
}
/**
 * A declared type (event or object) with its attribute schema, as authored in the editor.
 */

export interface OcSimTraceStep {
activity: string
objects: OcSimTraceObject[]
}
/**
 * One object instance taking part in a simulated firing.
 */

export type Condition = ({
key: string
value: string
type: "AttributeEquals"
} | {
key: string
value: number
type: "AttributeGreaterThan"
} | {
key: string
value: number
type: "AttributeLessThan"
} | {
key: string
substring: string
type: "AttributeContains"
} | {
/**
 * Inclusive window start (RFC 3339, e.g. "2025-01-01T00:00:00+00:00").
 */
start: string
/**
 * Exclusive window end (RFC 3339).
 */
end: string
mode: TimeframeMode
type: "Timeframe"
} | {
key: string
type: "AttributeExists"
} | {
value: string
type: "EntityType"
} | {
min_ms?: (number | null)
max_ms?: (number | null)
type: "Duration"
} | {
quantifier: MatchQuantifier
condition: Condition
type: "EventMatch"
} | {
quantifier: MatchQuantifier
condition: Condition
type: "ObjectMatch"
} | {
conditions: Condition[]
type: "And"
} | {
conditions: Condition[]
type: "Or"
} | {
condition: Condition
type: "Not"
})
/**
 * How an entity's temporal footprint must relate to a window `[start, end)`. For an event this
 * is its timestamp; for a trace/object it's the related event timestamps, `span` = `[first, last]`.
 */

export type Transform = ({
activities: string[]
mode: KeepOrRemove
type: "FilterActivities"
} | {
rules: {
[k: string]: RelabelRule[]
}
type: "RelabelActivities"
} | {
start_activities?: (string[] | null)
end_activities?: (string[] | null)
type: "FilterStartEnd"
} | {
activities: string[]
mode: RequiredOrForbidden
type: "FilterTraceContains"
} | {
variants: string[][]
mode: KeepOrRemove
type: "FilterVariants"
} | {
object_types: string[]
mode: KeepOrRemove
type: "FilterObjectTypes"
} | {
rules: {
[k: string]: RelabelRule[]
}
type: "RelabelObjectTypes"
} | {
min_events?: (number | null)
max_events?: (number | null)
of_type?: (string | null)
type: "FilterMinRelatedEvents"
} | {
min_objects?: (number | null)
max_objects?: (number | null)
of_type?: (string | null)
type: "FilterMinRelatedObjects"
} | {
/**
 * How much to sample: a fixed count or a percentage of the total.
 */
amount: ({
value: number
type: "Count"
} | {
value: number
type: "Percent"
})
/**
 * Random seed for reproducibility. If None, uses a default seed.
 */
seed?: (number | null)
/**
 * What to sample: traces (XES), objects, or events.
 */
target: ("TracesOrObjects" | "Events")
type: "Sample"
} | {
/**
 * Inclusive start of the range (ISO 8601 / RFC 3339, e.g. "2025-01-01T00:00:00+00:00").
 */
start: string
/**
 * Exclusive end of the range (ISO 8601 / RFC 3339).
 */
end: string
mode: KeepOrRemove
type: "FilterTimeRange"
} | {
/**
 * Target start time (ISO 8601 / RFC 3339 string, e.g. "2025-01-01T00:00:00+00:00")
 */
target_start: string
/**
 * Target end time (ISO 8601 / RFC 3339 string)
 */
target_end: string
/**
 * If set, enforce a minimum gap (in milliseconds) between consecutive events after rescaling.
 */
min_gap_ms?: (number | null)
/**
 * If set, enforce a maximum gap (in milliseconds) between consecutive events after rescaling.
 */
max_gap_ms?: (number | null)
/**
 * For OCEL only: which object type to scope the gap clamping to.
 */
gap_object_type?: (string | null)
type: "RescaleTimeframe"
} | {
scope: AttributeScope
condition: Condition
mode: KeepOrRemove
type: "FilterAttributes"
} | {
scope: AttributeScope
keys: string[]
type: "RemoveAttributes"
})

export interface StyledGraph {
background?: (string | null)
padding?: number
nodes: StyledNode[]
edges: StyledEdge[]
/**
 * Draw edges (and their markers/dots) AFTER nodes, so border-centered markers sit on top
 * of node borders (OC-Declare). Default: edges underneath, like React Flow's default.
 */
edges_on_top?: boolean
legend?: LegendGroup[]
}
/**
 * One node in a [`StyledGraph`]: final position/size plus all of its own styling.
 */

export type Nullable_SvgPalette = (SvgPalette | null)

/**
 * Colors passed from the frontend (or defaulted to light theme).
 */

export interface GraphSpec {
nodes: GraphNode[]
/**
 * Directed edges as `(from_index, to_index)` into `nodes`.
 */
edges: [number, number][]
/**
 * Optional per-edge importance (same length as `edges`); heavier edges lay out straighter
 * and shorter. Empty => all equal.
 */
weights?: number[]
/**
 * `"TB"` top->bottom (default) or `"LR"` left->right.
 */
direction?: (string | null)
/**
 * Flow layout: tighter gaps + terminal centring (`true`) vs classic gaps (`false`, default).
 */
flow_edges?: boolean
/**
 * Diagonal (flow) routing vs orthogonal straight-channel routing (`false`, default). Only
 * meaningful with `flow_edges`.
 */
flow_diagonal?: boolean
/**
 * Optional `[width, height]` of each edge's mid-point label (same length/order as `edges`);
 * the layout reserves that space so labels don't overlap other edges/nodes.
 */
edge_label_sizes?: [number, number][]
/**
 * Optional per-edge drawn stroke width (same length/order as `edges`); port spreading keeps
 * adjacent thick strokes from visually merging. Empty => all 2.0.
 */
thickness?: number[]
/**
 * Tidy-tree layout instead of layered; input must be a rooted tree/forest, edges come back unrouted.
 */
tree?: boolean
/**
 * Compact the cross axis after placement (order-preserving); for dense hub-and-spoke graphs like the OCEL type graph. Default `false`.
 */
compact?: boolean
}
/**
 * One node in a generic graph-layout request. Only its size and shape matter to the layout;
 * labels/colors are the caller's concern (this binding returns geometry, not an image).
 */

export interface GraphLayout {
centers: [number, number][]
routes: [number, number][][]
}

export interface DottedChartOptions {
/**
 * X-axis mode.
 */
x_axis: ("Time" | "TimeSinceCaseStart" | "TimeRelativeToCaseDuration" | "StepNumberSinceCaseStart")
/**
 * Y-axis mode.
 */
y_axis: ("Case" | "Resource" | {
EventAttribute: string
} | {
CaseAttribute: string
})
/**
 * Color-axis mode.
 */
color_axis: ("Activity" | "Resource" | "Case" | {
EventAttribute: string
} | {
CaseAttribute: string
})
/**
 * Event attribute key used to extract the timestamp.
 */
timestamp_key: string
}

export interface DottedChartData {
/**
 * Points grouped by color-axis value.
 */
dots_per_color: {
[k: string]: DottedChartPoints
}
/**
 * Ordered list of y-axis labels (index corresponds to [`DottedChartPoints::y`] values).
 */
y_values: string[]
}
/**
 * A series of (x, y) coordinates for one color group in a dotted chart.
 */

export interface EventTimestampOptions {
/**
 * Number of time bins to aggregate events into.
 */
num_bins: number
/**
 * Event attribute key used to identify the activity name.
 */
activity_key: string
/**
 * Event attribute key used to extract the timestamp.
 */
timestamp_key: string
}

export interface AggregatedEventTimestamps {
/**
 * Event counts per bin timestamp (millis) per activity name.
 */
events_per_timestamp: {
/**
 * This interface was referenced by `undefined`'s JSON-Schema definition
 * via the `patternProperty` "^-?\d+$".
 */
[k: string]: {
[k: string]: number
}
}
/**
 * All distinct activity names found in the log.
 */
activities: string[]
/**
 * Width of each equal-width bin, in milliseconds.
 * Each bin has their center as key, so a bar then spans
 * `[center - bin_width_ms / 2, center + bin_width_ms / 2)`.
 * Empty bins might be omitted.
 */
bin_width_ms: number
}

export interface ObjectAttributeChanges {
/**
 * Attribute change traces keyed by attribute name.
 * 
 * Each entry contains the chronological list of value changes
 * for that attribute.
 */
traces: {
[k: string]: AttributeChange[]
}
}
/**
 * A single attribute value change at a point in time.
 */

export type Nullable_uint = (number | null)

export type ValueExpression = ({
/**
 * Column name.
 */
column: string
type: "column"
} | {
/**
 * The value.
 */
value: string
type: "constant"
} | {
/**
 * The template.
 */
template: string
type: "template"
} | {
/**
 * Parts, tried in order.
 */
parts: ValueExpression[]
type: "coalesce"
})

export type Predicate = ({
/**
 * Conditions.
 */
conditions: Predicate[]
type: "and"
} | {
/**
 * Conditions.
 */
conditions: Predicate[]
type: "or"
} | {
/**
 * The negated condition.
 */
condition: Predicate
type: "not"
} | {
/**
 * Left side.
 */
left: ({
/**
 * Column name.
 */
column: string
type: "column"
} | {
/**
 * The literal.
 */
value: (boolean | number | string | {
/**
 * The instant.
 */
timestamp: string
})
type: "literal"
})
/**
 * Operator.
 */
op: ("eq" | "ne" | "lt" | "le" | "gt" | "ge")
/**
 * Right side.
 */
right: ({
/**
 * Column name.
 */
column: string
type: "column"
} | {
/**
 * The literal.
 */
value: (boolean | number | string | {
/**
 * The instant.
 */
timestamp: string
})
type: "literal"
})
type: "compare"
} | {
/**
 * Column name.
 */
column: string
type: "is-null"
} | {
/**
 * Column name.
 */
column: string
type: "is-empty"
} | {
/**
 * Column name.
 */
column: string
/**
 * Regular expression.
 */
regex: string
type: "matches"
} | {
/**
 * Column name.
 */
column: string
/**
 * Accepted values.
 */
values: Literal[]
type: "in"
})

export interface Blueprint {
/**
 * Schema version. Checked against [`super::MODEL_VERSION`] during validation.
 */
version: number
/**
 * How entity ids are rendered.
 */
id_rendering?: ("raw" | "type-prefixed")
/**
 * The row graph.
 */
nodes: Node[]
/**
 * The mappings.
 */
mappings: MappingEntry[]
/**
 * What to do about relations naming a missing entity.
 */
on_missing_endpoint?: ("drop" | "create" | "error")
/**
 * What to do about a repeated object id.
 */
on_duplicate_object?: ("first-wins" | "error")
}
/**
 * A node in the row graph.
 */

export interface CompiledOcel {
dialect: SqlDialect
shape: EmissionShape
views: ViewDef[]
probes: Probe[]
errors: CompileError[]
}
/**
 * One compiled relation: a name and the bare `SELECT` that defines it.
 */

export interface Map_of_string {
[k: string]: string
}

export type Nullable_ExtractionCatalog = (ExtractionCatalog | null)

/**
 * The concrete, serializable [`Catalog`].
 * 
 * This is the form that crosses a bindings boundary, that an editor holds and sends back, and
 * that gets pinned to disk so a compile can be reproduced against a schema that has since
 * changed.
 */

export interface ExtractionReport {
/**
 * One entry per mapping executed, in **desugared blueprint order** -- the order the author
 * wrote the mappings in, with each ordered group expanded in place. Deliberately not
 * execution order: execution is multi-pass and grouped by node (see
 * [`extract`](super::extract::extract)), so there is no single linear order to report, and
 * a diagnostic is far more useful indexed by what the author wrote. Each entry's
 * [`MappingRef::path`] names that authored entry outright.
 */
per_mapping: MappingStats[]
/**
 * Non-fatal problems collected while running -- a policy configured to error
 * (`on_duplicate_object: Error`, `on_missing_endpoint: Error`) or a sink failure on one
 * relation. Extraction continues past these; see [`ExtractionError`] for what aborts it
 * instead.
 */
errors: ExtractionError[]
/**
 * The running total of rows every `Join`/`Union` materialisation this run performed
 * produced -- summed across materialisations, **not** a peak: a run that materialises two
 * nodes of a thousand rows each reports two thousand, even though the two never had to be
 * live at the same moment. It is an upper bound on peak buffered rows, not the peak itself.
 * (A cached materialisation is counted once, when it is computed, not again per reader.)
 * 
 * Includes the `Source`/`Filter` rows that fed a `Join`/`Union`, since those materialise
 * too the moment one needs them as an input; see invariant I1 on
 * [`extract`](super::extract::extract). Zero when no mapping's node graph contains a `Join`
 * or `Union`, since a pure `Source -> Filter` chain streams and never buffers a row past
 * the one being processed -- which is what makes zero here a meaningful witness that the
 * run streamed.
 */
rows_materialized: number
finalize: FinalizeReport
/**
 * Where the run's wall-clock time went.
 * 
 * `None` from [`extract`](super::extract::extract) itself, which is handed a catalog and a
 * set of open providers and so has no idea what it cost to obtain them. The runner that owns
 * the connections fills this in; the `extraction-dbcon` bindings do. Kept out of `extract` for a
 * second reason too: `std::time::Instant` panics on `wasm32-unknown-unknown`, and this crate
 * builds for wasm.
 */
timing?: (ExtractionTiming | null)
}
/**
 * Counts for one mapping's run.
 */

export interface OCELTypeStats {
/**
 * Number of events per event type/activity
 */
event_type_counts: {
[k: string]: number
}
/**
 * Number of objects per object type
 */
object_type_counts: {
[k: string]: number
}
}

export interface ResolvedPathSchema {
/**
 * The starting type.
 */
source: ({
Event: string
} | {
Object: string
})
/**
 * Ordered traversal steps with embedded typed edges.
 */
steps: ResolvedStep[]
/**
 * The ending type.
 */
target: ({
Event: string
} | {
Object: string
})
}
/**
 * One step of a [`ResolvedPathSchema`]: a typed edge plus traversal direction.
 */

export interface PathSchemaConnections {
/**
 * Human-readable schema string.
 */
schema: string
stats: SchemaStats
/**
 * The connections, with entities referenced by their OCEL index.
 */
connections: Connection[]
/**
 * Whether the connection limit was reached (results may be incomplete).
 */
limit_reached: boolean
/**
 * Whether selectivity-based early termination was triggered.
 */
selectivity_pruned: boolean
}
/**
 * Metrics and throughput for the connections.
 */

export interface PathSchemaQuery {
/**
 * Source type to start schemas from.
 */
source: ({
Event: string
} | {
Object: string
})
/**
 * Optional target type; if `None`, schemas to any type are enumerated.
 */
target?: (TypeRef | null)
/**
 * Maximum number of steps per schema.
 */
max_length: number
/**
 * Whether a schema may revisit the same type.
 */
allow_cycles: boolean
/**
 * Optional set of types the intermediate steps may pass through; `None` allows all. The
 * source (the start) and the target (when one is given) are always permitted, so only the
 * steps in between are constrained.
 */
allowed_types?: (TypeRef[] | null)
params: PathConnectionParams
}
/**
 * Connection-finding parameters.
 */

export interface PathSchemaDiscovery {
/**
 * Source entity type the query started from.
 */
source_type: string
/**
 * Total number of source-type entities.
 */
total_sources: number
/**
 * Enumerated schemas with their stats.
 */
schemas: DiscoveredSchema[]
/**
 * Connection-equivalence classes over the enumerated schemas.
 */
equivalence_classes: ConnectionEquivalenceClass[]
}
/**
 * One enumerated schema with its computed stats and equivalence class.
 */

export type Nullable_TypeRef = (TypeRef | null)
/**
 * A reference to an OCEL type: an event type or an object type, by name.
 * 
 * Type-level analogue of [`EntityRef`] (which references an instance). Event and object
 * types live in separate namespaces, so the same name can denote both; carrying the kind
 * here keeps them distinct everywhere a type is named.
 */

export type Nullable_Array_of_TypeRef = (TypeRef[] | null)
/**
 * A reference to an OCEL type: an event type or an object type, by name.
 * 
 * Type-level analogue of [`EntityRef`] (which references an instance). Event and object
 * types live in separate namespaces, so the same name can denote both; carrying the kind
 * here keeps them distinct everywhere a type is named.
 */

export interface PathSchemaTypeGraph {
/**
 * Event and object type nodes.
 */
nodes: PathSchemaTypeNode[]
/**
 * Qualified E2O / O2O relationship edges.
 */
edges: TypeEdge[]
}
/**
 * A node (event or object type) of the OCEL type graph, with its entity count.
 */

export type Nullable_Array_of_string = (string[] | null)

export type Nullable_EventIndex = (EventIndex | null)
/**
 * An Event Index
 * 
 * Points to an event in the context of a given OCEL
 */

export type Nullable_ObjectIndex = (ObjectIndex | null)
/**
 * An Object Index
 * 
 * Points to an object in the context of a given OCEL
 */

export type Nullable_OCELAttributeValue = (OCELAttributeValue | null)
/**
 * OCEL Attribute Values
 */

export type Nullable_OCELType = (OCELType | null)

/**
 * OCEL Event/Object Type
 */

export interface AlignmentOptions {
cost_fn: CostFunction
/**
 * Maximum number of states to visit before aborting (per trace).
 * `None` means no limit.
 */
max_states?: (number | null)
}
/**
 * Cost function for alignment moves
 */

export interface OCDeclareArc {
/**
 * Source node (e.g., triggering activity)
 */
from: string
/**
 * Target node (e.g., target activity)
 */
to: string
/**
 * Arc type, modeling temporal relation
 */
arc_type: ("AS" | "EF" | "EP" | "DF" | "DP")
label: OCDeclareArcLabel
/**
 * First tuple element: min count (optional), Second: max count (optional)
 * 
 * @minItems 2
 * @maxItems 2
 */
counts: [(number | null), (number | null)]
}
/**
 * Arc label specifying object involvement criteria
 */

export interface ProcessVariant {
/**
 * The activity sequence of the variant as activity names
 */
activities: string[]
/**
 * Number of cases corresponding to this variant
 */
count: number
/**
 * Percentage of total cases corresponding to this variant
 */
percentage: number
}

export interface OCEL {
/**
 * Event Types in OCEL
 */
eventTypes: OCELType[]
/**
 * Object Types in OCEL
 */
objectTypes: OCELType[]
/**
 * Events contained in OCEL
 */
events?: OCELEvent[]
/**
 * Objects contained in OCEL
 */
objects?: OCELObject[]
}
/**
 * OCEL Event/Object Type
 */

export interface OCDirectlyFollowsGraph {
/**
 * The DFG per object type
 */
object_type_to_dfg: {
[k: string]: DirectlyFollowsGraph
}
}
/**
 * A directly-follows graph of [`Activity`]s.
 * Graph containing a set of activities, a set of directly-follows relations, a set of start
 * activities, and a set of end activities.
 * Both, the number of occurrences of activities and of directly follows relations are annotated
 * with their frequency.
 */

export interface AlphaPPPConfig {
/**
 * Balance threshold (for filtering place candidates)
 */
balance_thresh: number
/**
 * Fitness threshold (for filtering place candidates)
 */
fitness_thresh: number
/**
 * Replay threshold (for filtering place candidates)
 */
replay_thresh: number
/**
 * Log repair threshold for skips (wrt. to weighted DFG)
 */
log_repair_skip_df_thresh_rel: number
/**
 * Log repair threshold for loops (wrt. to weighted DFG)
 */
log_repair_loop_df_thresh_rel: number
/**
 * Absolute threshold for weighted DFG cleaning
 */
absolute_df_clean_thresh: number
/**
 * Relative threshold for weighted DFG cleaning
 */
relative_df_clean_thresh: number
}

export interface OCDeclareDiscoveryOptions {
/**
 * Noise threshold (i.e., what fraction of events are allowed to violate a discovered constraint)
 */
noise_threshold: number
/**
 * Determines if/how object-to-object relationships are considered
 */
o2o_mode: ("None" | "Direct" | "Reversed" | "Bidirectional")
/**
 * Activities to use for the discovery. If this is `None`, all activities of the OCEL are used
 */
acts_to_use?: (string[] | null)
/**
 * What min/max counts to use for the candidate generation steps
 * 
 * @minItems 2
 * @maxItems 2
 */
counts_for_generation: [(number | null), (number | null)]
/**
 * What min/max counts to use for the candidate filtering step (when the arrow type is determined)
 * 
 * @minItems 2
 * @maxItems 2
 */
counts_for_filter: [(number | null), (number | null)]
/**
 * If/how the discovered constraints should be reduced
 */
reduction: ("None" | "Lossless" | "Lossy")
/**
 * Determines if the object involvement of discovered constraints should be made more precise/strict after initial discovery and reduction
 */
refinement: boolean
/**
 * The arrow types to consider when deriving the final constraints
 * 
 * Should be non-empty!
 */
considered_arrow_types: OCDeclareArcType[]
}

export interface Bindings {
  "app_bindings::activity_projection_stub": { args: {}; ret: string[] };
  "app_bindings::alignments::align_event_log": { args: {
    "event_log": EventLogHandle;
    "net": PetriNet;
    }; ret: LogAlignments };
  "app_bindings::alphappp_auto": { args: {
    "log_proj": EventLogActivityProjectionHandle;
    }; ret: PetriNet };
  "app_bindings::app_ping": { args: {}; ret: string };
  "app_bindings::discover_petri_net": { args: {
    "event_log": EventLogHandle;
    }; ret: PetriNet };
  "app_bindings::event_log::event_log_from_activities": { args: {
    "traces": string[][];
    }; ret: EventLogHandle };
  "app_bindings::event_log::event_log_from_json": { args: {
    "log": EventLogInput;
    }; ret: EventLogHandle };
  "app_bindings::event_log::event_log_to_json": { args: {
    "event_log": EventLogHandle;
    }; ret: EventLogInput };
  "app_bindings::event_log::get_activity_counts": { args: {
    "event_log": EventLogHandle;
    }; ret: Map_of_uint };
  "app_bindings::event_log::get_attribute_names": { args: {
    "event_log": EventLogHandle;
    }; ret: AttributeInfo[] };
  "app_bindings::event_log::get_attribute_summary": { args: {
    "event_log": EventLogHandle;
    "attr_name": string;
    "level": AttributeLevel;
    }; ret: AttributeSummary };
  "app_bindings::event_log::get_attribute_values": { args: {
    "event_log": EventLogHandle;
    "attr_name": string;
    "level": AttributeLevel;
    }; ret: AttributeValues };
  "app_bindings::event_log::get_case_durations": { args: {
    "event_log": EventLogHandle;
    }; ret: CaseDurations };
  "app_bindings::event_log::get_df": { args: {
    "event_log": EventLogHandle;
    }; ret: DfgCounts };
  "app_bindings::event_log::get_df_performance": { args: {
    "event_log": EventLogHandle;
    }; ret: DfPerformance };
  "app_bindings::event_log::get_event_log_timestamps": { args: {
    "event_log": EventLogHandle;
    "num_bins": number;
    }; ret: EventTimeHistogram };
  "app_bindings::event_log::get_log_globals": { args: {
    "event_log": EventLogHandle;
    }; ret: LogGlobals };
  "app_bindings::event_log::get_log_info": { args: {
    "event_log": EventLogHandle;
    }; ret: NumberOfTracesAndEvents };
  "app_bindings::event_log::get_log_trace_variants": { args: {
    "event_log": EventLogHandle;
    }; ret: TraceVariants };
  "app_bindings::event_log::get_log_traces": { args: {
    "event_log": EventLogHandle;
    "offset": number;
    "limit": number;
    "sort_field": TraceSortField;
    "sort_asc": boolean;
    "filter": string;
    }; ret: TraceBrowserPage };
  "app_bindings::event_log::get_removable_attributes_xes": { args: {
    "event_log": EventLogHandle;
    }; ret: AttributeCatalogEntry[] };
  "app_bindings::event_log::get_trace_events": { args: {
    "event_log": EventLogHandle;
    "case_index": number;
    }; ret: TraceDetail };
  "app_bindings::ocel::get_object_detail": { args: {
    "ocel": SlimLinkedOCELHandle;
    "object_id": string;
    }; ret: ObjectDetail };
  "app_bindings::ocel::get_ocel_activity_object_involvements": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: Map_of_Map_of_ObjectInvolvementCounts };
  "app_bindings::ocel::get_ocel_attribute_names": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: OcelAttributeInfo[] };
  "app_bindings::ocel::get_ocel_attribute_summary": { args: {
    "ocel": SlimLinkedOCELHandle;
    "attr_name": string;
    "level": OcelAttributeLevel;
    }; ret: OcelAttributeSummary };
  "app_bindings::ocel::get_ocel_attribute_values": { args: {
    "ocel": SlimLinkedOCELHandle;
    "attr_name": string;
    "level": OcelAttributeLevel;
    }; ret: AttributeValues };
  "app_bindings::ocel::get_ocel_df": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: OcDfgCounts };
  "app_bindings::ocel::get_ocel_df_performance": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: OcelDfPerformance };
  "app_bindings::ocel::get_ocel_event_timestamps": { args: {
    "ocel": SlimLinkedOCELHandle;
    "num_bins": number;
    }; ret: EventTimeHistogram };
  "app_bindings::ocel::get_ocel_info": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: OCELInfo };
  "app_bindings::ocel::get_ocel_object_changes_plot": { args: {
    "ocel": SlimLinkedOCELHandle;
    "object_id": string;
    }; ret: OCELObjectAttributeChanges };
  "app_bindings::ocel::get_ocel_object_ids": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: string[] };
  "app_bindings::ocel::get_ocel_objects_page": { args: {
    "ocel": SlimLinkedOCELHandle;
    "offset": number;
    "limit": number;
    "sort_field": ObjectSortField;
    "sort_asc": boolean;
    "filter": string;
    "type_filter": Nullable_string;
    }; ret: ObjectBrowserPage };
  "app_bindings::ocel::get_ocel_type_relations": { args: {
    "ocel": SlimLinkedOCELHandle;
    "max_qualifiers_per_pair": number;
    }; ret: OcelTypeRelations };
  "app_bindings::ocel::get_removable_attributes_ocel": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: AttributeCatalogEntry[] };
  "app_bindings::ocel::ocel_from_json": { args: {
    "input": OcelInput;
    }; ret: SlimLinkedOCELHandle };
  "app_bindings::ocel::ocel_from_oc_sim_trace": { args: {
    "trace": OcSimTraceStep[];
    }; ret: SlimLinkedOCELHandle };
  "app_bindings::ocel::ocel_to_json": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: OcelInput };
  "app_bindings::petri_net_io::export_petri_net_pnml": { args: {
    "net": PetriNet;
    }; ret: string };
  "app_bindings::transforms::apply_event_log_transforms": { args: {
    "event_log": EventLogHandle;
    "transforms": Transform[];
    }; ret: EventLogHandle };
  "app_bindings::transforms::apply_ocel_transforms": { args: {
    "ocel": SlimLinkedOCELHandle;
    "transforms": Transform[];
    }; ret: SlimLinkedOCELHandle };
  "app_bindings::viz::export_graph_svg": { args: {
    "graph": StyledGraph;
    "palette": Nullable_SvgPalette;
    }; ret: string };
  "app_bindings::viz::layout_graph": { args: {
    "spec": GraphSpec;
    }; ret: GraphLayout };
  "app_bindings::viz::reroute_graph": { args: {
    "spec": GraphSpec;
    }; ret: GraphLayout };
  "process_mining::analysis::case_centric::dotted_chart::get_dotted_chart": { args: {
    "xes": EventLogHandle;
    "options"?: DottedChartOptions;
    }; ret: DottedChartData };
  "process_mining::analysis::case_centric::event_timestamp_histogram::get_event_timestamps": { args: {
    "log": EventLogHandle;
    "options"?: EventTimestampOptions;
    }; ret: AggregatedEventTimestamps };
  "process_mining::analysis::object_centric::object_attribute_changes::get_object_attribute_changes": { args: {
    "ocel": SlimLinkedOCELHandle;
    "object_id": string;
    }; ret: ObjectAttributeChanges };
  "process_mining::analysis::object_centric::oc_performance::locel_oc_perf_sojourn_per_event": { args: {
    "ocel": SlimLinkedOCELHandle;
    "top_k"?: Nullable_uint;
    }; ret: [string, number][] };
  "process_mining::analysis::object_centric::oc_performance::locel_oc_perf_sync_per_event": { args: {
    "ocel": SlimLinkedOCELHandle;
    "top_k"?: Nullable_uint;
    }; ret: [string, number, string][] };
  "process_mining::analysis::object_centric::oc_statistics::locel_conversion_rate": { args: {
    "ocel": SlimLinkedOCELHandle;
    "activity": string;
    "source_type": string;
    "target_type": string;
    }; ret: number };
  "process_mining::analysis::object_centric::oc_statistics::locel_event_object_type_counts": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: [string, string, number][] };
  "process_mining::bindings::extraction_bindings::extraction_compile": { args: {
    "blueprint": Blueprint;
    "catalog": ExtractionCatalog;
    "shape": EmissionShape;
    }; ret: CompiledOcel };
  "process_mining::bindings::extraction_bindings::extraction_discover_catalog_items": { args: {
    "sources": Map_of_string;
    }; ret: ExtractionCatalog };
  "process_mining::bindings::extraction_bindings::extraction_run_items": { args: {
    "blueprint": Blueprint;
    "sources": Map_of_string;
    "catalog"?: Nullable_ExtractionCatalog;
    }; ret: SlimLinkedOCELHandle };
  "process_mining::bindings::extraction_bindings::extraction_validate": { args: {
    "blueprint": Blueprint;
    "catalog": ExtractionCatalog;
    }; ret: ValidationError[] };
  "process_mining::bindings::extraction_dbcon_bindings::extraction_column_domain": { args: {
    "connections": Map_of_string;
    "source_id": string;
    "table": string;
    "column": string;
    }; ret: string[] };
  "process_mining::bindings::extraction_dbcon_bindings::extraction_discover_catalog": { args: {
    "connections": Map_of_string;
    }; ret: ExtractionCatalog };
  "process_mining::bindings::extraction_dbcon_bindings::extraction_discover_catalog_items_dbcon": { args: {
    "sources": Map_of_string;
    }; ret: ExtractionCatalog };
  "process_mining::bindings::extraction_dbcon_bindings::extraction_run": { args: {
    "ocel": SlimLinkedOCELHandle;
    "blueprint": Blueprint;
    "connections": Map_of_string;
    "catalog"?: Nullable_ExtractionCatalog;
    }; ret: ExtractionReport };
  "process_mining::bindings::extraction_dbcon_bindings::extraction_run_items_dbcon": { args: {
    "blueprint": Blueprint;
    "sources": Map_of_string;
    "catalog"?: Nullable_ExtractionCatalog;
    }; ret: SlimLinkedOCELHandle };
  "process_mining::bindings::extraction_dbcon_bindings::extraction_table_preview": { args: {
    "connections": Map_of_string;
    "source_id": string;
    "table": string;
    "limit"?: Nullable_uint;
    }; ret: TablePreview };
  "process_mining::bindings::index_link_ocel": { args: {
    "ocel": OCELHandle;
    }; ret: IndexLinkedOCELHandle };
  "process_mining::bindings::num_events": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: number };
  "process_mining::bindings::num_objects": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: number };
  "process_mining::bindings::ocel_type_stats": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: OCELTypeStats };
  "process_mining::bindings::path_schema_bindings::path_schema_connections": { args: {
    "ocel": SlimLinkedOCELHandle;
    "schema": ResolvedPathSchema;
    "params"?: PathConnectionParams;
    }; ret: PathSchemaConnections };
  "process_mining::bindings::path_schema_bindings::path_schema_discover": { args: {
    "ocel": SlimLinkedOCELHandle;
    "query": PathSchemaQuery;
    }; ret: PathSchemaDiscovery };
  "process_mining::bindings::path_schema_bindings::path_schema_enumerate": { args: {
    "ocel": SlimLinkedOCELHandle;
    "source": TypeRef;
    "target"?: Nullable_TypeRef;
    "max_length": number;
    "allow_cycles"?: boolean;
    "allowed_types"?: Nullable_Array_of_TypeRef;
    }; ret: ResolvedPathSchema[] };
  "process_mining::bindings::path_schema_bindings::path_schema_type_graph": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: PathSchemaTypeGraph };
  "process_mining::bindings::slim_link_ocel": { args: {
    "ocel": OCELHandle;
    }; ret: SlimLinkedOCELHandle };
  "process_mining::bindings::slim_ocel_bindings::get_dfg_of_object_type": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob_type": string;
    }; ret: [[string, string], number][] };
  "process_mining::bindings::slim_ocel_bindings::get_e2o_ids": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ev_id": string;
    }; ret: Nullable_Array_of_string };
  "process_mining::bindings::slim_ocel_bindings::get_e2o_rev_ids": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob_id": string;
    }; ret: Nullable_Array_of_string };
  "process_mining::bindings::slim_ocel_bindings::get_event_ids_of_type": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ev_type": string;
    }; ret: string[] };
  "process_mining::bindings::slim_ocel_bindings::get_event_timestamp_of_id": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ev_id": string;
    }; ret: Nullable_string };
  "process_mining::bindings::slim_ocel_bindings::get_event_type_of_id": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ev_id": string;
    }; ret: Nullable_string };
  "process_mining::bindings::slim_ocel_bindings::get_o2o_ids": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob_id": string;
    }; ret: Nullable_Array_of_string };
  "process_mining::bindings::slim_ocel_bindings::get_obj_activity_trace": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob": number;
    }; ret: string[] };
  "process_mining::bindings::slim_ocel_bindings::get_object_ids_of_type": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob_type": string;
    }; ret: string[] };
  "process_mining::bindings::slim_ocel_bindings::get_object_type_of_id": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob_id": string;
    }; ret: Nullable_string };
  "process_mining::bindings::slim_ocel_bindings::get_variants_of_object_type": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob_type": string;
    }; ret: [string[], number][] };
  "process_mining::bindings::slim_ocel_bindings::locel_add_e2o": { args: {
    "ocel": SlimLinkedOCELHandle;
    "event": number;
    "object": number;
    "qualifier": string;
    }; ret: boolean };
  "process_mining::bindings::slim_ocel_bindings::locel_add_event": { args: {
    "ocel": SlimLinkedOCELHandle;
    "event_type": string;
    "time": string;
    "id"?: Nullable_string;
    "attributes"?: OCELAttributeValue[];
    "relationships"?: [string, number][];
    }; ret: Nullable_EventIndex };
  "process_mining::bindings::slim_ocel_bindings::locel_add_event_type": { args: {
    "ocel": SlimLinkedOCELHandle;
    "event_type": string;
    "attributes"?: OCELTypeAttribute[];
    }; ret: null };
  "process_mining::bindings::slim_ocel_bindings::locel_add_o2o": { args: {
    "ocel": SlimLinkedOCELHandle;
    "from_obj": number;
    "to_obj": number;
    "qualifier": string;
    }; ret: boolean };
  "process_mining::bindings::slim_ocel_bindings::locel_add_object": { args: {
    "ocel": SlimLinkedOCELHandle;
    "object_type": string;
    "id"?: Nullable_string;
    "attributes"?: [string, OCELAttributeValue][][];
    "relationships"?: [string, number][];
    }; ret: Nullable_ObjectIndex };
  "process_mining::bindings::slim_ocel_bindings::locel_add_object_type": { args: {
    "ocel": SlimLinkedOCELHandle;
    "object_type": string;
    "attributes"?: OCELTypeAttribute[];
    }; ret: null };
  "process_mining::bindings::slim_ocel_bindings::locel_construct_ocel": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: OCELHandle };
  "process_mining::bindings::slim_ocel_bindings::locel_conversion_rate": { args: {
    "ocel": SlimLinkedOCELHandle;
    "activity": string;
    "source_type": string;
    "target_type": string;
    }; ret: number };
  "process_mining::bindings::slim_ocel_bindings::locel_delete_e2o": { args: {
    "ocel": SlimLinkedOCELHandle;
    "event": number;
    "object": number;
    }; ret: boolean };
  "process_mining::bindings::slim_ocel_bindings::locel_delete_o2o": { args: {
    "ocel": SlimLinkedOCELHandle;
    "from_obj": number;
    "to_obj": number;
    }; ret: boolean };
  "process_mining::bindings::slim_ocel_bindings::locel_event_object_type_counts": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: [string, string, number][] };
  "process_mining::bindings::slim_ocel_bindings::locel_get_e2o": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ev": number;
    }; ret: [string, number][] };
  "process_mining::bindings::slim_ocel_bindings::locel_get_e2o_rev": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob": number;
    }; ret: [string, number][] };
  "process_mining::bindings::slim_ocel_bindings::locel_get_ev_attr_val": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ev": number;
    "attr_name": string;
    }; ret: Nullable_OCELAttributeValue };
  "process_mining::bindings::slim_ocel_bindings::locel_get_ev_by_id": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ev_id": string;
    }; ret: Nullable_EventIndex };
  "process_mining::bindings::slim_ocel_bindings::locel_get_ev_id": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ev": number;
    }; ret: string };
  "process_mining::bindings::slim_ocel_bindings::locel_get_ev_time": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ev": number;
    }; ret: string };
  "process_mining::bindings::slim_ocel_bindings::locel_get_ev_type": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ev_type": string;
    }; ret: Nullable_OCELType };
  "process_mining::bindings::slim_ocel_bindings::locel_get_ev_type_of": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ev": number;
    }; ret: string };
  "process_mining::bindings::slim_ocel_bindings::locel_get_ev_types": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: string[] };
  "process_mining::bindings::slim_ocel_bindings::locel_get_evs_of_type": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ev_type": string;
    }; ret: number[] };
  "process_mining::bindings::slim_ocel_bindings::locel_get_full_ev": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ev": number;
    }; ret: OCELEvent };
  "process_mining::bindings::slim_ocel_bindings::locel_get_full_ob": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob": number;
    }; ret: OCELObject };
  "process_mining::bindings::slim_ocel_bindings::locel_get_o2o": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob": number;
    }; ret: [string, number][] };
  "process_mining::bindings::slim_ocel_bindings::locel_get_o2o_rev": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob": number;
    }; ret: [string, number][] };
  "process_mining::bindings::slim_ocel_bindings::locel_get_ob_attr_vals": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob": number;
    "attr_name": string;
    }; ret: [string, OCELAttributeValue][] };
  "process_mining::bindings::slim_ocel_bindings::locel_get_ob_by_id": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob_id": string;
    }; ret: Nullable_ObjectIndex };
  "process_mining::bindings::slim_ocel_bindings::locel_get_ob_id": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob": number;
    }; ret: string };
  "process_mining::bindings::slim_ocel_bindings::locel_get_ob_type": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob_type": string;
    }; ret: Nullable_OCELType };
  "process_mining::bindings::slim_ocel_bindings::locel_get_ob_type_of": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob": number;
    }; ret: string };
  "process_mining::bindings::slim_ocel_bindings::locel_get_ob_types": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: string[] };
  "process_mining::bindings::slim_ocel_bindings::locel_get_obs_of_type": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob_type": string;
    }; ret: number[] };
  "process_mining::bindings::slim_ocel_bindings::locel_new": { args: {}; ret: SlimLinkedOCELHandle };
  "process_mining::bindings::slim_ocel_bindings::locel_oc_perf_sojourn_per_event": { args: {
    "ocel": SlimLinkedOCELHandle;
    "top_k"?: Nullable_uint;
    }; ret: [string, number][] };
  "process_mining::bindings::slim_ocel_bindings::locel_oc_perf_sync_per_event": { args: {
    "ocel": SlimLinkedOCELHandle;
    "top_k"?: Nullable_uint;
    }; ret: [string, number, string][] };
  "process_mining::bindings::test_some_inputs": { args: {
    "s": string;
    "n": number;
    "i": number;
    "f": number;
    "b": boolean;
    }; ret: string };
  "process_mining::conformance::case_centric::alignments::align_empty_trace": { args: {
    "net": PetriNet;
    "options"?: AlignmentOptions;
    }; ret: AlignmentResult };
  "process_mining::conformance::case_centric::alignments::align_trace_binding": { args: {
    "net": PetriNet;
    "trace": string[];
    "options"?: AlignmentOptions;
    }; ret: AlignmentResult };
  "process_mining::conformance::case_centric::alignments::align_variants": { args: {
    "net": PetriNet;
    "projection": EventLogActivityProjectionHandle;
    "options"?: AlignmentOptions;
    }; ret: VariantAlignmentResult[] };
  "process_mining::conformance::case_centric::alignments::compute_fitness": { args: {
    "align_res": VariantAlignmentResult[];
    "net": PetriNet;
    "options"?: AlignmentOptions;
    }; ret: FitnessResult };
  "process_mining::conformance::object_centric::oc_declare::oc_declare_conformance": { args: {
    "ocel": SlimLinkedOCELHandle;
    "arc": OCDeclareArc;
    }; ret: number };
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_num_cases": { args: {
    "projection": EventLogActivityProjectionHandle;
    }; ret: number };
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_num_variants": { args: {
    "projection": EventLogActivityProjectionHandle;
    }; ret: number };
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_projection_activities": { args: {
    "projection": EventLogActivityProjectionHandle;
    }; ret: string[] };
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_top_n_variants": { args: {
    "projection": EventLogActivityProjectionHandle;
    "n": number;
    }; ret: ProcessVariant[] };
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_variants": { args: {
    "projection": EventLogActivityProjectionHandle;
    }; ret: ProcessVariant[] };
  "process_mining::core::event_data::case_centric::utils::activity_projection::log_to_activity_projection": { args: {
    "log": EventLogHandle;
    }; ret: EventLogActivityProjectionHandle };
  "process_mining::core::event_data::object_centric::utils::flatten::flatten_ocel_on": { args: {
    "ocel": SlimLinkedOCELHandle;
    "object_type": string;
    }; ret: EventLogHandle };
  "process_mining::core::event_data::object_centric::utils::init_exit_events::add_init_exit_events_to_ocel": { args: {
    "ocel": OCEL;
    }; ret: OCELHandle };
  "process_mining::core::process_models::object_centric::ocdfg::object_centric_dfg_struct::discover_dfg_from_ocel": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: OCDirectlyFollowsGraph };
  "process_mining::discovery::case_centric::alphappp::full::alphappp_discover_petri_net": { args: {
    "log_proj": EventLogActivityProjectionHandle;
    "config"?: AlphaPPPConfig;
    }; ret: PetriNet };
  "process_mining::discovery::case_centric::dfg::discover_dfg": { args: {
    "event_log": EventLogHandle;
    }; ret: DirectlyFollowsGraph };
  "process_mining::discovery::object_centric::dfg::get_dfg_of_object_type": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob_type": string;
    }; ret: [[string, string], number][] };
  "process_mining::discovery::object_centric::oc_declare::discover_behavior_constraints": { args: {
    "locel": SlimLinkedOCELHandle;
    "options"?: OCDeclareDiscoveryOptions;
    }; ret: OCDeclareArc[] };
  "process_mining::discovery::object_centric::variants::get_variants_of_object_type": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob_type": string;
    }; ret: [string[], number][] };
}

export type BindingId = keyof Bindings;

/** Typed dispatch. Runtime decodes the binding's Vec<u8> JSON; types are compile-time only.
 *  `opts.outputName` deterministically names a minted result handle (pipeline intermediates). */
export type CallBinding = <K extends BindingId>(id: K, args: Bindings[K]["args"], opts?: { outputName?: string }) => Promise<Bindings[K]["ret"]>;

/** Distinct return-type titles, keyed for rename-safe reference from viewer `accepts` predicates. */
export const RETURN_TYPES = {
  "AggregatedEventTimestamps": "AggregatedEventTimestamps",
  "AlignmentResult": "AlignmentResult",
  "Array_of_AttributeCatalogEntry": "Array_of_AttributeCatalogEntry",
  "Array_of_AttributeInfo": "Array_of_AttributeInfo",
  "Array_of_EventIndex": "Array_of_EventIndex",
  "Array_of_OCDeclareArc": "Array_of_OCDeclareArc",
  "Array_of_ObjectIndex": "Array_of_ObjectIndex",
  "Array_of_OcelAttributeInfo": "Array_of_OcelAttributeInfo",
  "Array_of_ProcessVariant": "Array_of_ProcessVariant",
  "Array_of_ResolvedPathSchema": "Array_of_ResolvedPathSchema",
  "Array_of_Tuple_of_Array_of_string_and_uint": "Array_of_Tuple_of_Array_of_string_and_uint",
  "Array_of_Tuple_of_DateTime_and_OCELAttributeValue": "Array_of_Tuple_of_DateTime_and_OCELAttributeValue",
  "Array_of_Tuple_of_Tuple_of_string_and_string_and_uint": "Array_of_Tuple_of_Tuple_of_string_and_string_and_uint",
  "Array_of_Tuple_of_string_and_EventIndex": "Array_of_Tuple_of_string_and_EventIndex",
  "Array_of_Tuple_of_string_and_ObjectIndex": "Array_of_Tuple_of_string_and_ObjectIndex",
  "Array_of_Tuple_of_string_and_int64": "Array_of_Tuple_of_string_and_int64",
  "Array_of_Tuple_of_string_and_int64_and_string": "Array_of_Tuple_of_string_and_int64_and_string",
  "Array_of_Tuple_of_string_and_string_and_int64": "Array_of_Tuple_of_string_and_string_and_int64",
  "Array_of_ValidationError": "Array_of_ValidationError",
  "Array_of_VariantAlignmentResult": "Array_of_VariantAlignmentResult",
  "Array_of_string": "Array_of_string",
  "AttributeSummary": "AttributeSummary",
  "AttributeValues": "AttributeValues",
  "CaseDurations": "CaseDurations",
  "CompiledOcel": "CompiledOcel",
  "DateTime": "DateTime",
  "DfPerformance": "DfPerformance",
  "DfgCounts": "DfgCounts",
  "DirectlyFollowsGraph": "DirectlyFollowsGraph",
  "DottedChartData": "DottedChartData",
  "EventLog": "EventLog",
  "EventLogActivityProjection": "EventLogActivityProjection",
  "EventLogInput": "EventLogInput",
  "EventTimeHistogram": "EventTimeHistogram",
  "ExtractionCatalog": "ExtractionCatalog",
  "ExtractionReport": "ExtractionReport",
  "FitnessResult": "FitnessResult",
  "GraphLayout": "GraphLayout",
  "IndexLinkedOCEL": "IndexLinkedOCEL",
  "LogAlignments": "LogAlignments",
  "LogGlobals": "LogGlobals",
  "Map_of_Map_of_ObjectInvolvementCounts": "Map_of_Map_of_ObjectInvolvementCounts",
  "Map_of_uint": "Map_of_uint",
  "Nullable_Array_of_string": "Nullable_Array_of_string",
  "Nullable_EventIndex": "Nullable_EventIndex",
  "Nullable_OCELAttributeValue": "Nullable_OCELAttributeValue",
  "Nullable_OCELType": "Nullable_OCELType",
  "Nullable_ObjectIndex": "Nullable_ObjectIndex",
  "Nullable_string": "Nullable_string",
  "NumberOfTracesAndEvents": "NumberOfTracesAndEvents",
  "OCDirectlyFollowsGraph": "OCDirectlyFollowsGraph",
  "OCEL": "OCEL",
  "OCELEvent": "OCELEvent",
  "OCELInfo": "OCELInfo",
  "OCELObject": "OCELObject",
  "OCELObjectAttributeChanges": "OCELObjectAttributeChanges",
  "OCELTypeStats": "OCELTypeStats",
  "ObjectAttributeChanges": "ObjectAttributeChanges",
  "ObjectBrowserPage": "ObjectBrowserPage",
  "ObjectDetail": "ObjectDetail",
  "OcDfgCounts": "OcDfgCounts",
  "OcelAttributeSummary": "OcelAttributeSummary",
  "OcelDfPerformance": "OcelDfPerformance",
  "OcelInput": "OcelInput",
  "OcelTypeRelations": "OcelTypeRelations",
  "PathSchemaConnections": "PathSchemaConnections",
  "PathSchemaDiscovery": "PathSchemaDiscovery",
  "PathSchemaTypeGraph": "PathSchemaTypeGraph",
  "PetriNet": "PetriNet",
  "SlimLinkedOCEL": "SlimLinkedOCEL",
  "TablePreview": "TablePreview",
  "TraceBrowserPage": "TraceBrowserPage",
  "TraceDetail": "TraceDetail",
  "TraceVariants": "TraceVariants",
  "boolean": "boolean",
  "double": "double",
  "null": "null",
  "string": "string",
  "uint": "uint",
  "uint64": "uint64",
} as const;

/** Every value a binding's return type can be matched on by the viewer registry. */
export type ReturnTypeTitle = (typeof RETURN_TYPES)[keyof typeof RETURN_TYPES];

/** Return-type title -> decoded payload type, so a viewer registration can pin its per-title
 *  transform/component to the actual binding payload shape instead of trusting the title string. */
export interface ReturnTypeShape {
  "AggregatedEventTimestamps": AggregatedEventTimestamps;
  "AlignmentResult": AlignmentResult;
  "Array_of_AttributeCatalogEntry": AttributeCatalogEntry[];
  "Array_of_AttributeInfo": AttributeInfo[];
  "Array_of_EventIndex": number[];
  "Array_of_OCDeclareArc": OCDeclareArc[];
  "Array_of_ObjectIndex": number[];
  "Array_of_OcelAttributeInfo": OcelAttributeInfo[];
  "Array_of_ProcessVariant": ProcessVariant[];
  "Array_of_ResolvedPathSchema": ResolvedPathSchema[];
  "Array_of_Tuple_of_Array_of_string_and_uint": [string[], number][];
  "Array_of_Tuple_of_DateTime_and_OCELAttributeValue": [string, OCELAttributeValue][];
  "Array_of_Tuple_of_Tuple_of_string_and_string_and_uint": [[string, string], number][];
  "Array_of_Tuple_of_string_and_EventIndex": [string, number][];
  "Array_of_Tuple_of_string_and_ObjectIndex": [string, number][];
  "Array_of_Tuple_of_string_and_int64": [string, number][];
  "Array_of_Tuple_of_string_and_int64_and_string": [string, number, string][];
  "Array_of_Tuple_of_string_and_string_and_int64": [string, string, number][];
  "Array_of_ValidationError": ValidationError[];
  "Array_of_VariantAlignmentResult": VariantAlignmentResult[];
  "Array_of_string": string[];
  "AttributeSummary": AttributeSummary;
  "AttributeValues": AttributeValues;
  "CaseDurations": CaseDurations;
  "CompiledOcel": CompiledOcel;
  "DateTime": string;
  "DfPerformance": DfPerformance;
  "DfgCounts": DfgCounts;
  "DirectlyFollowsGraph": DirectlyFollowsGraph;
  "DottedChartData": DottedChartData;
  "EventLog": EventLogHandle;
  "EventLogActivityProjection": EventLogActivityProjectionHandle;
  "EventLogInput": EventLogInput;
  "EventTimeHistogram": EventTimeHistogram;
  "ExtractionCatalog": ExtractionCatalog;
  "ExtractionReport": ExtractionReport;
  "FitnessResult": FitnessResult;
  "GraphLayout": GraphLayout;
  "IndexLinkedOCEL": IndexLinkedOCELHandle;
  "LogAlignments": LogAlignments;
  "LogGlobals": LogGlobals;
  "Map_of_Map_of_ObjectInvolvementCounts": Map_of_Map_of_ObjectInvolvementCounts;
  "Map_of_uint": Map_of_uint;
  "Nullable_Array_of_string": Nullable_Array_of_string;
  "Nullable_EventIndex": Nullable_EventIndex;
  "Nullable_OCELAttributeValue": Nullable_OCELAttributeValue;
  "Nullable_OCELType": Nullable_OCELType;
  "Nullable_ObjectIndex": Nullable_ObjectIndex;
  "Nullable_string": Nullable_string;
  "NumberOfTracesAndEvents": NumberOfTracesAndEvents;
  "OCDirectlyFollowsGraph": OCDirectlyFollowsGraph;
  "OCEL": OCELHandle;
  "OCELEvent": OCELEvent;
  "OCELInfo": OCELInfo;
  "OCELObject": OCELObject;
  "OCELObjectAttributeChanges": OCELObjectAttributeChanges;
  "OCELTypeStats": OCELTypeStats;
  "ObjectAttributeChanges": ObjectAttributeChanges;
  "ObjectBrowserPage": ObjectBrowserPage;
  "ObjectDetail": ObjectDetail;
  "OcDfgCounts": OcDfgCounts;
  "OcelAttributeSummary": OcelAttributeSummary;
  "OcelDfPerformance": OcelDfPerformance;
  "OcelInput": OcelInput;
  "OcelTypeRelations": OcelTypeRelations;
  "PathSchemaConnections": PathSchemaConnections;
  "PathSchemaDiscovery": PathSchemaDiscovery;
  "PathSchemaTypeGraph": PathSchemaTypeGraph;
  "PetriNet": PetriNet;
  "SlimLinkedOCEL": SlimLinkedOCELHandle;
  "TablePreview": TablePreview;
  "TraceBrowserPage": TraceBrowserPage;
  "TraceDetail": TraceDetail;
  "TraceVariants": TraceVariants;
  "boolean": boolean;
  "double": number;
  "null": null;
  "string": string;
  "uint": number;
  "uint64": number;
}

/** Each binding's return-type title (null when the return type is unnamed, e.g. a tuple/primitive). */
export const BINDING_RETURN_TYPE: Record<BindingId, ReturnTypeTitle | null> = {
  "app_bindings::activity_projection_stub": "Array_of_string",
  "app_bindings::alignments::align_event_log": "LogAlignments",
  "app_bindings::alphappp_auto": "PetriNet",
  "app_bindings::app_ping": "string",
  "app_bindings::discover_petri_net": "PetriNet",
  "app_bindings::event_log::event_log_from_activities": "EventLog",
  "app_bindings::event_log::event_log_from_json": "EventLog",
  "app_bindings::event_log::event_log_to_json": "EventLogInput",
  "app_bindings::event_log::get_activity_counts": "Map_of_uint",
  "app_bindings::event_log::get_attribute_names": "Array_of_AttributeInfo",
  "app_bindings::event_log::get_attribute_summary": "AttributeSummary",
  "app_bindings::event_log::get_attribute_values": "AttributeValues",
  "app_bindings::event_log::get_case_durations": "CaseDurations",
  "app_bindings::event_log::get_df": "DfgCounts",
  "app_bindings::event_log::get_df_performance": "DfPerformance",
  "app_bindings::event_log::get_event_log_timestamps": "EventTimeHistogram",
  "app_bindings::event_log::get_log_globals": "LogGlobals",
  "app_bindings::event_log::get_log_info": "NumberOfTracesAndEvents",
  "app_bindings::event_log::get_log_trace_variants": "TraceVariants",
  "app_bindings::event_log::get_log_traces": "TraceBrowserPage",
  "app_bindings::event_log::get_removable_attributes_xes": "Array_of_AttributeCatalogEntry",
  "app_bindings::event_log::get_trace_events": "TraceDetail",
  "app_bindings::ocel::get_object_detail": "ObjectDetail",
  "app_bindings::ocel::get_ocel_activity_object_involvements": "Map_of_Map_of_ObjectInvolvementCounts",
  "app_bindings::ocel::get_ocel_attribute_names": "Array_of_OcelAttributeInfo",
  "app_bindings::ocel::get_ocel_attribute_summary": "OcelAttributeSummary",
  "app_bindings::ocel::get_ocel_attribute_values": "AttributeValues",
  "app_bindings::ocel::get_ocel_df": "OcDfgCounts",
  "app_bindings::ocel::get_ocel_df_performance": "OcelDfPerformance",
  "app_bindings::ocel::get_ocel_event_timestamps": "EventTimeHistogram",
  "app_bindings::ocel::get_ocel_info": "OCELInfo",
  "app_bindings::ocel::get_ocel_object_changes_plot": "OCELObjectAttributeChanges",
  "app_bindings::ocel::get_ocel_object_ids": "Array_of_string",
  "app_bindings::ocel::get_ocel_objects_page": "ObjectBrowserPage",
  "app_bindings::ocel::get_ocel_type_relations": "OcelTypeRelations",
  "app_bindings::ocel::get_removable_attributes_ocel": "Array_of_AttributeCatalogEntry",
  "app_bindings::ocel::ocel_from_json": "SlimLinkedOCEL",
  "app_bindings::ocel::ocel_from_oc_sim_trace": "SlimLinkedOCEL",
  "app_bindings::ocel::ocel_to_json": "OcelInput",
  "app_bindings::petri_net_io::export_petri_net_pnml": "string",
  "app_bindings::transforms::apply_event_log_transforms": "EventLog",
  "app_bindings::transforms::apply_ocel_transforms": "SlimLinkedOCEL",
  "app_bindings::viz::export_graph_svg": "string",
  "app_bindings::viz::layout_graph": "GraphLayout",
  "app_bindings::viz::reroute_graph": "GraphLayout",
  "process_mining::analysis::case_centric::dotted_chart::get_dotted_chart": "DottedChartData",
  "process_mining::analysis::case_centric::event_timestamp_histogram::get_event_timestamps": "AggregatedEventTimestamps",
  "process_mining::analysis::object_centric::object_attribute_changes::get_object_attribute_changes": "ObjectAttributeChanges",
  "process_mining::analysis::object_centric::oc_performance::locel_oc_perf_sojourn_per_event": "Array_of_Tuple_of_string_and_int64",
  "process_mining::analysis::object_centric::oc_performance::locel_oc_perf_sync_per_event": "Array_of_Tuple_of_string_and_int64_and_string",
  "process_mining::analysis::object_centric::oc_statistics::locel_conversion_rate": "double",
  "process_mining::analysis::object_centric::oc_statistics::locel_event_object_type_counts": "Array_of_Tuple_of_string_and_string_and_int64",
  "process_mining::bindings::extraction_bindings::extraction_compile": "CompiledOcel",
  "process_mining::bindings::extraction_bindings::extraction_discover_catalog_items": "ExtractionCatalog",
  "process_mining::bindings::extraction_bindings::extraction_run_items": "SlimLinkedOCEL",
  "process_mining::bindings::extraction_bindings::extraction_validate": "Array_of_ValidationError",
  "process_mining::bindings::extraction_dbcon_bindings::extraction_column_domain": "Array_of_string",
  "process_mining::bindings::extraction_dbcon_bindings::extraction_discover_catalog": "ExtractionCatalog",
  "process_mining::bindings::extraction_dbcon_bindings::extraction_discover_catalog_items_dbcon": "ExtractionCatalog",
  "process_mining::bindings::extraction_dbcon_bindings::extraction_run": "ExtractionReport",
  "process_mining::bindings::extraction_dbcon_bindings::extraction_run_items_dbcon": "SlimLinkedOCEL",
  "process_mining::bindings::extraction_dbcon_bindings::extraction_table_preview": "TablePreview",
  "process_mining::bindings::index_link_ocel": "IndexLinkedOCEL",
  "process_mining::bindings::num_events": "uint",
  "process_mining::bindings::num_objects": "uint",
  "process_mining::bindings::ocel_type_stats": "OCELTypeStats",
  "process_mining::bindings::path_schema_bindings::path_schema_connections": "PathSchemaConnections",
  "process_mining::bindings::path_schema_bindings::path_schema_discover": "PathSchemaDiscovery",
  "process_mining::bindings::path_schema_bindings::path_schema_enumerate": "Array_of_ResolvedPathSchema",
  "process_mining::bindings::path_schema_bindings::path_schema_type_graph": "PathSchemaTypeGraph",
  "process_mining::bindings::slim_link_ocel": "SlimLinkedOCEL",
  "process_mining::bindings::slim_ocel_bindings::get_dfg_of_object_type": "Array_of_Tuple_of_Tuple_of_string_and_string_and_uint",
  "process_mining::bindings::slim_ocel_bindings::get_e2o_ids": "Nullable_Array_of_string",
  "process_mining::bindings::slim_ocel_bindings::get_e2o_rev_ids": "Nullable_Array_of_string",
  "process_mining::bindings::slim_ocel_bindings::get_event_ids_of_type": "Array_of_string",
  "process_mining::bindings::slim_ocel_bindings::get_event_timestamp_of_id": "Nullable_string",
  "process_mining::bindings::slim_ocel_bindings::get_event_type_of_id": "Nullable_string",
  "process_mining::bindings::slim_ocel_bindings::get_o2o_ids": "Nullable_Array_of_string",
  "process_mining::bindings::slim_ocel_bindings::get_obj_activity_trace": "Array_of_string",
  "process_mining::bindings::slim_ocel_bindings::get_object_ids_of_type": "Array_of_string",
  "process_mining::bindings::slim_ocel_bindings::get_object_type_of_id": "Nullable_string",
  "process_mining::bindings::slim_ocel_bindings::get_variants_of_object_type": "Array_of_Tuple_of_Array_of_string_and_uint",
  "process_mining::bindings::slim_ocel_bindings::locel_add_e2o": "boolean",
  "process_mining::bindings::slim_ocel_bindings::locel_add_event": "Nullable_EventIndex",
  "process_mining::bindings::slim_ocel_bindings::locel_add_event_type": "null",
  "process_mining::bindings::slim_ocel_bindings::locel_add_o2o": "boolean",
  "process_mining::bindings::slim_ocel_bindings::locel_add_object": "Nullable_ObjectIndex",
  "process_mining::bindings::slim_ocel_bindings::locel_add_object_type": "null",
  "process_mining::bindings::slim_ocel_bindings::locel_construct_ocel": "OCEL",
  "process_mining::bindings::slim_ocel_bindings::locel_conversion_rate": "double",
  "process_mining::bindings::slim_ocel_bindings::locel_delete_e2o": "boolean",
  "process_mining::bindings::slim_ocel_bindings::locel_delete_o2o": "boolean",
  "process_mining::bindings::slim_ocel_bindings::locel_event_object_type_counts": "Array_of_Tuple_of_string_and_string_and_int64",
  "process_mining::bindings::slim_ocel_bindings::locel_get_e2o": "Array_of_Tuple_of_string_and_ObjectIndex",
  "process_mining::bindings::slim_ocel_bindings::locel_get_e2o_rev": "Array_of_Tuple_of_string_and_EventIndex",
  "process_mining::bindings::slim_ocel_bindings::locel_get_ev_attr_val": "Nullable_OCELAttributeValue",
  "process_mining::bindings::slim_ocel_bindings::locel_get_ev_by_id": "Nullable_EventIndex",
  "process_mining::bindings::slim_ocel_bindings::locel_get_ev_id": "string",
  "process_mining::bindings::slim_ocel_bindings::locel_get_ev_time": "DateTime",
  "process_mining::bindings::slim_ocel_bindings::locel_get_ev_type": "Nullable_OCELType",
  "process_mining::bindings::slim_ocel_bindings::locel_get_ev_type_of": "string",
  "process_mining::bindings::slim_ocel_bindings::locel_get_ev_types": "Array_of_string",
  "process_mining::bindings::slim_ocel_bindings::locel_get_evs_of_type": "Array_of_EventIndex",
  "process_mining::bindings::slim_ocel_bindings::locel_get_full_ev": "OCELEvent",
  "process_mining::bindings::slim_ocel_bindings::locel_get_full_ob": "OCELObject",
  "process_mining::bindings::slim_ocel_bindings::locel_get_o2o": "Array_of_Tuple_of_string_and_ObjectIndex",
  "process_mining::bindings::slim_ocel_bindings::locel_get_o2o_rev": "Array_of_Tuple_of_string_and_ObjectIndex",
  "process_mining::bindings::slim_ocel_bindings::locel_get_ob_attr_vals": "Array_of_Tuple_of_DateTime_and_OCELAttributeValue",
  "process_mining::bindings::slim_ocel_bindings::locel_get_ob_by_id": "Nullable_ObjectIndex",
  "process_mining::bindings::slim_ocel_bindings::locel_get_ob_id": "string",
  "process_mining::bindings::slim_ocel_bindings::locel_get_ob_type": "Nullable_OCELType",
  "process_mining::bindings::slim_ocel_bindings::locel_get_ob_type_of": "string",
  "process_mining::bindings::slim_ocel_bindings::locel_get_ob_types": "Array_of_string",
  "process_mining::bindings::slim_ocel_bindings::locel_get_obs_of_type": "Array_of_ObjectIndex",
  "process_mining::bindings::slim_ocel_bindings::locel_new": "SlimLinkedOCEL",
  "process_mining::bindings::slim_ocel_bindings::locel_oc_perf_sojourn_per_event": "Array_of_Tuple_of_string_and_int64",
  "process_mining::bindings::slim_ocel_bindings::locel_oc_perf_sync_per_event": "Array_of_Tuple_of_string_and_int64_and_string",
  "process_mining::bindings::test_some_inputs": "string",
  "process_mining::conformance::case_centric::alignments::align_empty_trace": "AlignmentResult",
  "process_mining::conformance::case_centric::alignments::align_trace_binding": "AlignmentResult",
  "process_mining::conformance::case_centric::alignments::align_variants": "Array_of_VariantAlignmentResult",
  "process_mining::conformance::case_centric::alignments::compute_fitness": "FitnessResult",
  "process_mining::conformance::object_centric::oc_declare::oc_declare_conformance": "double",
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_num_cases": "uint64",
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_num_variants": "uint",
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_projection_activities": "Array_of_string",
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_top_n_variants": "Array_of_ProcessVariant",
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_variants": "Array_of_ProcessVariant",
  "process_mining::core::event_data::case_centric::utils::activity_projection::log_to_activity_projection": "EventLogActivityProjection",
  "process_mining::core::event_data::object_centric::utils::flatten::flatten_ocel_on": "EventLog",
  "process_mining::core::event_data::object_centric::utils::init_exit_events::add_init_exit_events_to_ocel": "OCEL",
  "process_mining::core::process_models::object_centric::ocdfg::object_centric_dfg_struct::discover_dfg_from_ocel": "OCDirectlyFollowsGraph",
  "process_mining::discovery::case_centric::alphappp::full::alphappp_discover_petri_net": "PetriNet",
  "process_mining::discovery::case_centric::dfg::discover_dfg": "DirectlyFollowsGraph",
  "process_mining::discovery::object_centric::dfg::get_dfg_of_object_type": "Array_of_Tuple_of_Tuple_of_string_and_string_and_uint",
  "process_mining::discovery::object_centric::oc_declare::discover_behavior_constraints": "Array_of_OCDeclareArc",
  "process_mining::discovery::object_centric::variants::get_variants_of_object_type": "Array_of_Tuple_of_Array_of_string_and_uint",
};
