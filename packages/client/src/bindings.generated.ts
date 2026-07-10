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

export type KeepOrRemove = ("Keep" | "Remove")

export type RelabelTarget = ({
value: string
type: "Literal"
} | {
template: string
type: "Template"
})

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
conditions: Condition[]
type: "And"
} | {
conditions: Condition[]
type: "Or"
} | {
condition: Condition
type: "Not"
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
 * Word-wrap to fit the node width (max 2 lines, ellipsized). Off by default: pass one
 * `StyledLabel` per pre-wrapped line instead when the caller already knows the split.
 */
wrap?: boolean
}
/**
 * A group of same-kind tokens drawn inside a node (e.g. Petri place markings). Groups are drawn
 * left-to-right in a single row; if the total count across all groups doesn't fit the node's
 * width, the renderer collapses the whole row to a single numeral instead.
 */

export interface MarkingGroup {
kind: MarkingKind
color?: (string | null)
count: number
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
width?: number
dash?: (string | null)
/**
 * End-of-edge marker glyph.
 */
marker_start?: (("none" | "arrow" | "ball") | "arrow_ball")
/**
 * End-of-edge marker glyph.
 */
marker_end?: (("none" | "arrow" | "ball") | "arrow_ball")
labels?: EdgeLabel[]
dots?: EdgeDot[]
/**
 * Corner radius (px) for rounding the polyline's interior joins. 0 draws straight segments
 * (a plain multi-point polyline), matching whatever radius the on-screen edge used.
 */
rounded?: number
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
 * Optional seed centre `[x, y]` in final space. When any node has a seed, the layout keeps the
 * structural layer/order but places the cross-axis at the seed (a stable relayout that leaves
 * un-dragged nodes put). Absent means classic layout.
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

export type EventIndex = number

export type ObjectIndex = number

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
 * Optional `[width, height]` in final space of each edge's mid-point label (same length/order
 * as `edges`). The layout reserves that space on the edge centre so labels don't overlap other
 * edges/nodes. Empty => no reservation.
 */
edge_label_sizes?: [number, number][]
/**
 * Optional per-edge drawn stroke width (same length/order as `edges`); port spreading keeps
 * adjacent thick strokes from visually merging. Empty => all 2.0.
 */
thickness?: number[]
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
  "app_bindings::event_log::get_case_durations": { args: {
    "event_log": EventLogHandle;
    }; ret: CaseDurations };
  "app_bindings::event_log::get_df": { args: {
    "event_log": EventLogHandle;
    }; ret: DfgCounts };
  "app_bindings::event_log::get_df_performance": { args: {
    "event_log": EventLogHandle;
    }; ret: DfPerformance };
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
  "app_bindings::ocel::get_ocel_df": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: OcDfgCounts };
  "app_bindings::ocel::get_ocel_df_performance": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: OcelDfPerformance };
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
  "process_mining::bindings::slim_link_ocel": { args: {
    "ocel": OCELHandle;
    }; ret: SlimLinkedOCELHandle };
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
  "Array_of_Tuple_of_Array_of_string_and_uint": "Array_of_Tuple_of_Array_of_string_and_uint",
  "Array_of_Tuple_of_DateTime_and_OCELAttributeValue": "Array_of_Tuple_of_DateTime_and_OCELAttributeValue",
  "Array_of_Tuple_of_Tuple_of_string_and_string_and_uint": "Array_of_Tuple_of_Tuple_of_string_and_string_and_uint",
  "Array_of_Tuple_of_string_and_EventIndex": "Array_of_Tuple_of_string_and_EventIndex",
  "Array_of_Tuple_of_string_and_ObjectIndex": "Array_of_Tuple_of_string_and_ObjectIndex",
  "Array_of_Tuple_of_string_and_int64": "Array_of_Tuple_of_string_and_int64",
  "Array_of_Tuple_of_string_and_int64_and_string": "Array_of_Tuple_of_string_and_int64_and_string",
  "Array_of_Tuple_of_string_and_string_and_int64": "Array_of_Tuple_of_string_and_string_and_int64",
  "Array_of_VariantAlignmentResult": "Array_of_VariantAlignmentResult",
  "Array_of_string": "Array_of_string",
  "AttributeSummary": "AttributeSummary",
  "CaseDurations": "CaseDurations",
  "DateTime": "DateTime",
  "DfPerformance": "DfPerformance",
  "DfgCounts": "DfgCounts",
  "DirectlyFollowsGraph": "DirectlyFollowsGraph",
  "DottedChartData": "DottedChartData",
  "EventLog": "EventLog",
  "EventLogActivityProjection": "EventLogActivityProjection",
  "EventLogInput": "EventLogInput",
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
  "PetriNet": "PetriNet",
  "SlimLinkedOCEL": "SlimLinkedOCEL",
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
  "Array_of_Tuple_of_Array_of_string_and_uint": [string[], number][];
  "Array_of_Tuple_of_DateTime_and_OCELAttributeValue": [string, OCELAttributeValue][];
  "Array_of_Tuple_of_Tuple_of_string_and_string_and_uint": [[string, string], number][];
  "Array_of_Tuple_of_string_and_EventIndex": [string, number][];
  "Array_of_Tuple_of_string_and_ObjectIndex": [string, number][];
  "Array_of_Tuple_of_string_and_int64": [string, number][];
  "Array_of_Tuple_of_string_and_int64_and_string": [string, number, string][];
  "Array_of_Tuple_of_string_and_string_and_int64": [string, string, number][];
  "Array_of_VariantAlignmentResult": VariantAlignmentResult[];
  "Array_of_string": string[];
  "AttributeSummary": AttributeSummary;
  "CaseDurations": CaseDurations;
  "DateTime": string;
  "DfPerformance": DfPerformance;
  "DfgCounts": DfgCounts;
  "DirectlyFollowsGraph": DirectlyFollowsGraph;
  "DottedChartData": DottedChartData;
  "EventLog": EventLogHandle;
  "EventLogActivityProjection": EventLogActivityProjectionHandle;
  "EventLogInput": EventLogInput;
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
  "PetriNet": PetriNet;
  "SlimLinkedOCEL": SlimLinkedOCELHandle;
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
  "app_bindings::event_log::get_case_durations": "CaseDurations",
  "app_bindings::event_log::get_df": "DfgCounts",
  "app_bindings::event_log::get_df_performance": "DfPerformance",
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
  "app_bindings::ocel::get_ocel_df": "OcDfgCounts",
  "app_bindings::ocel::get_ocel_df_performance": "OcelDfPerformance",
  "app_bindings::ocel::get_ocel_info": "OCELInfo",
  "app_bindings::ocel::get_ocel_object_changes_plot": "OCELObjectAttributeChanges",
  "app_bindings::ocel::get_ocel_object_ids": "Array_of_string",
  "app_bindings::ocel::get_ocel_objects_page": "ObjectBrowserPage",
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
  "process_mining::bindings::index_link_ocel": "IndexLinkedOCEL",
  "process_mining::bindings::num_events": "uint",
  "process_mining::bindings::num_objects": "uint",
  "process_mining::bindings::ocel_type_stats": "OCELTypeStats",
  "process_mining::bindings::slim_link_ocel": "SlimLinkedOCEL",
  "process_mining::bindings::slim_ocel_bindings::get_e2o_ids": "Nullable_Array_of_string",
  "process_mining::bindings::slim_ocel_bindings::get_e2o_rev_ids": "Nullable_Array_of_string",
  "process_mining::bindings::slim_ocel_bindings::get_event_ids_of_type": "Array_of_string",
  "process_mining::bindings::slim_ocel_bindings::get_event_timestamp_of_id": "Nullable_string",
  "process_mining::bindings::slim_ocel_bindings::get_event_type_of_id": "Nullable_string",
  "process_mining::bindings::slim_ocel_bindings::get_o2o_ids": "Nullable_Array_of_string",
  "process_mining::bindings::slim_ocel_bindings::get_obj_activity_trace": "Array_of_string",
  "process_mining::bindings::slim_ocel_bindings::get_object_ids_of_type": "Array_of_string",
  "process_mining::bindings::slim_ocel_bindings::get_object_type_of_id": "Nullable_string",
  "process_mining::bindings::slim_ocel_bindings::locel_add_e2o": "boolean",
  "process_mining::bindings::slim_ocel_bindings::locel_add_event": "Nullable_EventIndex",
  "process_mining::bindings::slim_ocel_bindings::locel_add_event_type": "null",
  "process_mining::bindings::slim_ocel_bindings::locel_add_o2o": "boolean",
  "process_mining::bindings::slim_ocel_bindings::locel_add_object": "Nullable_ObjectIndex",
  "process_mining::bindings::slim_ocel_bindings::locel_add_object_type": "null",
  "process_mining::bindings::slim_ocel_bindings::locel_construct_ocel": "OCEL",
  "process_mining::bindings::slim_ocel_bindings::locel_delete_e2o": "boolean",
  "process_mining::bindings::slim_ocel_bindings::locel_delete_o2o": "boolean",
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
