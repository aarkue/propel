// AUTO-GENERATED from engine binding metadata. Do not edit.

/** A registry-stored object referenced by id; never the value itself. */
export type Handle<T extends string> = string & { readonly __ref: T };

export type EventLogHandle = Handle<"EventLog">;
export type EventLogActivityProjectionHandle = Handle<"EventLogActivityProjection">;
export type IndexLinkedOCELHandle = Handle<"IndexLinkedOCEL">;
export type OCELHandle = Handle<"OCEL">;
export type SlimLinkedOCELHandle = Handle<"SlimLinkedOCEL">;

export type PlaceID = number

/**
 * A [`PetriNet`] with an initial and a final marking
 * 
 * In JSON, the net's fields sit next to `initial_marking` and `final_marking`.
 */

export interface Place {
/**
 * External identifier (e.g., the PNML id), not used for identity
 */
name?: (string | null)
}
/**
 * Transition in a [`PetriNet`]
 */

export interface Transition {
/**
 * Activity label (`None` if this transition is silent)
 */
label?: (string | null)
/**
 * External identifier (e.g., the PNML id), not used for identity
 */
name?: (string | null)
/**
 * The places this transition takes tokens from, with the number of tokens
 */
inputs: [PlaceID, number][]
/**
 * The places this transition puts tokens into, with the number of tokens
 */
outputs: [PlaceID, number][]
}
/**
 * The marking the net starts in
 */

export interface Marking {
/**
 * This interface was referenced by `Marking`'s JSON-Schema definition
 * via the `patternProperty` "^\d+$".
 * 
 * This interface was referenced by `Marking1`'s JSON-Schema definition
 * via the `patternProperty` "^\d+$".
 */
[k: string]: number
}
/**
 * The marking a complete run ends in
 */

export interface Marking1 {
/**
 * This interface was referenced by `Marking`'s JSON-Schema definition
 * via the `patternProperty` "^\d+$".
 * 
 * This interface was referenced by `Marking1`'s JSON-Schema definition
 * via the `patternProperty` "^\d+$".
 */
[k: string]: number
}

export type AlignmentMove = ({
SyncMove: {
/**
 * The transition that was fired
 */
transition: number
/**
 * The label of the transition (and activity of the event)
 */
label: string
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
transition: number
/**
 * The label of the transition (`None` if it is silent)
 */
label?: (string | null)
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

export type SearchError = ("LimitReached" | "MemoryLimitReached" | "Unreachable" | "MaxEdgeCostTooLarge")
/**
 * Error when constructing the sync product net
 */

export type SyncProdNetConstructionError = ({
InvalidPlaceInMarking: PlaceID
} | {
ArcWeightTooLarge: number
} | {
/**
 * @minItems 2
 * @maxItems 2
 */
MarkingTooLarge: [PlaceID, number]
} | {
TraceTooLong: number
})

/**
 * Everything the alignment visualizations need, computed in one call.
 */

export interface AcceptingPetriNet {
/**
 * The places, indexed by [`PlaceID`]
 */
places: Place[]
/**
 * The transitions, indexed by [`TransitionID`]
 */
transitions: Transition[]
initial_marking: Marking
final_marking: Marking1
}
/**
 * Place in a [`PetriNet`]
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
 * Number of states visited during search, summed over both search directions
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
 * Per transition index (position in `net.transitions`): sync vs model-only firings.
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

export interface VariantTimeProfile {
rank: number
/**
 * Position in `variant_sort` order.
 */
sort_position: number
activities: string[]
num_cases: number
/**
 * One entry per step, aligned with `activities`.
 */
steps: StepTimeStats[]
/**
 * Cases matching the case query.
 */
cases_total: number
cases: CaseTimeCurve[]
/**
 * Position of `focus_case` in `case_sort` order.
 */
focus_index?: (number | null)
}
/**
 * Distribution of the elapsed time since case start at one step of a variant, in ms.
 */

export interface StepTimeStats {
min_ms: number
p10_ms: number
p25_ms: number
median_ms: number
p75_ms: number
p90_ms: number
max_ms: number
mean_ms: number
}
/**
 * One case with its elapsed time since case start per step, in ms.
 */

export interface CaseTimeCurve {
case_id: string
elapsed_ms: number[]
}

export interface VariantSummary {
/**
 * 0-based frequency rank.
 */
rank: number
activities: string[]
num_cases: number
/**
 * Median time from case start to the last step.
 */
median_total_ms: number
/**
 * Activity indices the query matched.
 */
matched: number[]
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

export type MappingEntry = ((Mapping & {
type: "single"
}) | {
/**
 * Mappings, in priority order.
 */
mappings: Mapping[]
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
 * One mapping from a node's rows to entities.
 */

export interface Mapping {
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
 * It is also what coalesces a fan-out: over a join of orders and their items, a `None`
 * id makes one event per item, an id naming the order one event per order, still related
 * to every item. The repeated rows count as
 * [`MappingStats::deduplicated`](super::report::MappingStats::deduplicated) while
 * `objects` below is emitted for each.
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

export type SqlDialect = ("DuckDb" | "Postgres")
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
 * A data-dependent assumption the compiled relations make, as SQL that returns zero rows when
 * the assumption holds.
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
 * The JSON path of the authored entry this mapping came from (see `desugar_with_paths`), so
 * a diagnostic points at what the author wrote rather than a position in the flattened
 * list.
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
 * How many relations the sink could not resolve. Usually equals an eager sink's
 * [`MissingEndpoint`](Self::MissingEndpoint) count for the same run, but can exceed it:
 * a deferring sink also stages the inline references of a `Target::Event` whose event
 * this run dropped, which an eager sink never asks about.
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
} | {
/**
 * The `Join` node.
 */
node: string
/**
 * The contested output column name.
 */
column: string
type: "ambiguous-join-column"
} | {
/**
 * The mapping, by label or authored path, or the `Filter` node, the comparison sits in.
 */
location: string
/**
 * The column compared against.
 */
column: string
/**
 * That column's declared type, verbatim from the catalog.
 */
col_type: string
/**
 * The literal, as authored.
 */
literal: string
/**
 * The kind `col_type` names: `text`, `integer`, `float`, `boolean` or `timestamp`.
 */
expected: string
type: "uncoercible-literal"
} | {
/**
 * The mapping, by label or authored path, or the `Filter` node, the comparison sits in.
 */
location: string
/**
 * The left operand's declared kind: `text`, `integer`, `float`, `boolean` or `timestamp`.
 */
left_kind: string
/**
 * The right operand's declared kind.
 */
right_kind: string
type: "incomparable-compare"
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
 * Entities or relations this mapping handed to the sink, which is not the same as
 * "survived the run" for a sink that defers resolution.
 * 
 * An eager sink refuses a dangling relation at the call site, so it lands in
 * [`DropReason::UnresolvedEndpoint`] and never here. A deferring sink writes it, counts it
 * here, and deletes it at [`finalize`](super::sink::ExtractionSink::finalize), reporting it
 * in [`FinalizeReport::unresolved_endpoints`](super::sink::FinalizeReport) instead. To count
 * what a run produced, subtract `ExtractionReport::finalize.unresolved_endpoints` from the
 * total.
 */
entities_emitted: number
/**
 * Rows that tried to create an entity the sink already had. Not a loss: an object mapping
 * at event grain names the same object on every row by design. See
 * [`DuplicateObjectPolicy::Error`](super::blueprint::DuplicateObjectPolicy::Error) for what
 * turns a repeat into a loss instead.
 * 
 * One increment per row whose entity-creating call found the entity already present, across
 * mappings, since the sink is what answers.
 * 
 * Resolving a relation endpoint is never counted, so an `E2O`/`O2O` mapping reports zero
 * however often its rows repeat an id: finding an existing endpoint is the normal successful
 * case. A blueprint that wants its inline references' repeats counted can name the objects
 * with their own [`Target::Object`](super::blueprint::Target::Object) mapping.
 */
deduplicated: number
/**
 * Rows dropped, by reason. A row that matches several reasons at once (rare) is counted
 * once, under the first one detected.
 */
dropped: {
[k: string]: number
}
/**
 * Attribute values that would not convert to their attribute's declared type, stored as
 * `Null`. Not a dropped row: the entity was written, with one of its attributes empty.
 */
uncoercible_attributes?: number
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
 * The JSON path of the authored entry this mapping came from (see `desugar_with_paths`), so
 * a diagnostic points at what the author wrote rather than a position in the flattened
 * list.
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
 * The JSON path of the authored entry this mapping came from (see `desugar_with_paths`), so
 * a diagnostic points at what the author wrote rather than a position in the flattened
 * list.
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
 * The JSON path of the authored entry this mapping came from (see `desugar_with_paths`), so
 * a diagnostic points at what the author wrote rather than a position in the flattened
 * list.
 */
path: string
/**
 * What this mapping produces, derived from its target: `event "appoint officer"`,
 * `event -> object relation`, and so on. Present whether or not a `label` was typed.
 */
describes: string
}
/**
 * One node the compiler refused to push down to its source, and why.
 */

export interface PushdownDeclined {
/**
 * The node id, as the blueprint names it.
 */
node: string
/**
 * What the compiler objected to.
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
/**
 * What the sink did at [`ExtractionSink::finalize`](super::sink::ExtractionSink::finalize).
 * 
 * All zero for a sink that resolves relation endpoints eagerly, which reports everything
 * through [`per_mapping`](Self::per_mapping) instead. See
 * [`Resolution`](super::sink::Resolution).
 */

export interface FinalizeReport {
/**
 * Relations written against a [`Resolution::Deferred`] endpoint that resolved to a real
 * entity at finalize.
 */
resolved_relations: number
/**
 * Relations whose deferred endpoint did not resolve. An eager sink counts these per mapping
 * as [`DropReason::UnresolvedEndpoint`](super::report::DropReason::UnresolvedEndpoint).
 */
unresolved_endpoints: number
/**
 * Objects synthesized at finalize under `on_missing_endpoint: Create`, for deferred
 * endpoints that turned out not to exist.
 */
objects_created: number
/**
 * Repeated entity ids removed at finalize: a deferring sink's share of
 * [`MappingStats::deduplicated`](super::report::MappingStats::deduplicated).
 */
duplicates_removed: number
}
/**
 * How long a run spent, split by phase, in milliseconds. Schema discovery is a fixed cost a
 * caller holding a catalog can skip, so it is reported apart from the row reading.
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

export interface AlignmentOptions {
cost_fn: CostFunction
/**
 * Maximum number of states to visit before aborting (per trace, both search directions
 * together). `None` means no limit.
 * 
 * This bounds runtime. See [`AlignmentOptions::max_memory_mib`] for memory.
 */
max_states?: (number | null)
/**
 * Memory in MiB that all alignment searches of one call may hold together (default 6 GiB).
 * `None` means no limit.
 * 
 * Traces are aligned in parallel, so each search gets an even share: the budget divided by
 * `rayon::current_num_threads()`, or by the number of variants if there are fewer. A single
 * search (e.g., [`align_trace`]) gets all of it. A trace that needs more than its share fails with
 * [`SearchError::MemoryLimitReached`], while the other traces are aligned as usual.
 * 
 * This bounds the buffers of the searches. The event log, the model and the alignments come
 * on top, as does memory the allocator keeps, so leave some headroom.
 * 
 * [`align_variants_with_retry`] aligns the traces that ran out again, one at a time with
 * the whole budget. By hand:
 * 
 * ```no_run
 * # use process_mining::{conformance::alignments::{*, petri_net::AlignmentError}, utils::dijkstra_search::SearchError, AcceptingPetriNet};
 * # use process_mining::core::event_data::case_centric::utils::activity_projection::EventLogActivityProjection;
 * # fn retry(net: &AcceptingPetriNet, log: &EventLogActivityProjection, options: &AlignmentOptions) {
 * let mut results = align_variants(net, log, options);
 * for variant in &mut results {
 *     if variant.result == Err(AlignmentError::SearchError(SearchError::MemoryLimitReached)) {
 *         let trace: Vec<&str> = variant.activities.iter().map(String::as_str).collect();
 *         variant.result = align_trace(net, &trace, options);
 *     }
 * }
 * # }
 * ```
 */
max_memory_mib?: (number | null)
}
/**
 * Cost function for alignment moves
 */

export type PathStep = ({
Activity: string
} | {
Transition: TransitionID
} | "End")
/**
 * Id of a transition, handed out by its [`PetriNet`] in creation order
 */

export type TransitionID = number

/**
 * Result of [`escaping_edges_precision`]
 */

export interface EscapingEdge {
/**
 * The state, as the path leading to it
 */
prefix: PathStep[]
/**
 * One step of a path through the model: an activity, or a transition when
 * [`SilentTransitions::AsActivities`] is used
 */
escaping: ({
Activity: string
} | {
Transition: TransitionID
} | "End")
/**
 * Weight of the state
 */
weight: number
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
 * Start activities, with how many traces start with each
 */
start_activities: {
[k: string]: number
}
/**
 * End activities, with how many traces end with each
 */
end_activities: {
[k: string]: number
}
}

export interface InductiveMinerOptions {
/**
 * Deviation threshold `f ∈ [0, 1]` of `IMf`, clamped to that range. `0.0` turns filtering
 * off.
 */
noise_threshold?: number
/**
 * Whether to try the [fall throughs](fallthrough) before resorting to a flower model.
 */
use_fallthroughs?: boolean
/**
 * Whether to merge the parts of a sequence cut that only occur together with a skippable
 * neighbor.
 */
strict_sequence?: boolean
/**
 * Whether to look for interleaved (`↔`) cuts, tried before concurrency. Under `IMf` they still
 * read the unfiltered traces, so noise can prevent them.
 */
use_interleaved?: boolean
/**
 * Whether to regroup concurrent cuts into nested concurrency, optionality and inclusive
 * choice (`∨`).
 */
use_inclusive_choice?: boolean
/**
 * Whether to refuse a cut whose split leaves a part without any events, which only the
 * filtering splits of `IMf` can do, and fall through instead. Otherwise the cut is taken and
 * the part becomes `τ`, as in the thesis.
 */
guard_empty_cut_parts?: boolean
/**
 * Whether concurrency detection consults the minimum-self-distance relation (∧↔.1), which
 * tells `a` and `b` running concurrently from `a` looping around `b`. A concurrent cut that
 * keeps such activities together is preferred. If there is none, the plain one is taken.
 */
use_minimum_self_distance?: boolean
/**
 * Whether to take a tau loop that cuts every trace into single events, as the thesis does.
 * Mining those single events gives the flower model, so this only decides whether
 * [`two_activities_concurrent`](fallthrough::two_activities_concurrent) gets a chance first.
 */
use_degenerate_tau_loops?: boolean
/**
 * Whether `IMf` keeps the single-activity base case despite repetitions when single
 * executions dominate (§6.2.2.3). Without it any repetition ends the recursion in a loop.
 */
filter_single_activity?: boolean
/**
 * Whether the [activity-concurrent fall through](fallthrough::activity_concurrent) also
 * accepts a candidate whose remaining log only has a cut after filtering. The thesis
 * (§6.2.2.4) probes the unfiltered graph.
 */
filter_activity_concurrent_probe?: boolean
/**
 * Whether `IMf` keeps an edge, a start or end activity, or the empty traces, when their
 * frequency is exactly at the threshold.
 */
keep_at_threshold?: boolean
/**
 * Whether `IMf` also removes infrequent start and end activities.
 */
filter_start_end?: boolean
/**
 * Whether the [activity-concurrent fall through](fallthrough::activity_concurrent) tries the
 * activities by name instead of the most frequent first. It takes the first whose removal
 * leaves a cut.
 */
activity_concurrent_by_name?: boolean
/**
 * Whether to [fold](crate::core::process_models::process_tree::Node::fold) the tree, e.g.,
 * `→(→(a, b), c)` into `→(a, b, c)` and `→(τ, a)` into `a`.
 */
fold?: boolean
}
/**
 * Settings of the DFG variant of the Inductive Miner. Settings that need traces, such as the
 * interleaved cut, do not exist here.
 * 
 * Fields missing in JSON take their default value.
 */

export interface InductiveMinerDfgOptions {
/**
 * Deviation threshold `f ∈ [0, 1]` of `IMfd`, clamped to that range. `0.0` is plain `IMd`.
 */
noise_threshold?: number
/**
 * Whether to merge the parts of a sequence cut that only occur together with a skippable
 * neighbor.
 */
strict_sequence?: boolean
/**
 * Whether to collapse nested occurrences of the same associative operator, turning, e.g.,
 * `→(→(a, b), c)` into `→(a, b, c)`.
 */
fold?: boolean
/**
 * Whether to try the [tau loops](strict_dfg_tau_loop) before resorting to a flower model.
 */
use_tau_loops?: boolean
/**
 * Whether the flower model allows the empty trace, i.e., is `↺(τ, ×(a₁, ..., aₙ))` instead of
 * the thesis' `↺(×(a₁, ..., aₙ), τ)`. The empty-traces step runs before any fall through, so
 * allowing one here only loses precision.
 */
flower_accepts_empty?: boolean
/**
 * Whether a lone activity with a self edge becomes a flower instead of `↺(a, τ)`. The
 * thesis hands the case to [`strict_dfg_tau_loop`] (§6.6.3.3). With
 * [`flower_accepts_empty`](Self::flower_accepts_empty), this turns `a⁺` into `a*`.
 */
repeated_activity_to_flower?: boolean
/**
 * Whether `IMfd` keeps the single-activity base case despite a self edge when single
 * executions dominate (§6.6.4.3). Without it a self edge always ends the recursion in a loop.
 */
filter_single_activity?: boolean
}

export interface Leaf {
/**
 * The silent or non-silent activity label [`LeafLabel`]
 */
activity_label: ({
Activity: string
} | "Tau")
}

export type OCDeclareArcType = ("AS" | "EF" | "EP" | "DF" | "DP")

/**
 * Options for the automatic discovery of OC-DECLARE constraints
 */

export interface JsonPlace {
/**
 * Unique among all places and transitions.
 */
name: string
/**
 * The object type whose tokens this place holds.
 */
object_type: string
}
/**
 * A transition, silent if it has no label.
 */

export interface JsonTransition {
/**
 * Unique among all places and transitions. For a labeled transition, the activity itself.
 */
name: string
/**
 * The activity, or `None` for a silent transition.
 */
label?: (string | null)
}
/**
 * An arc from a place to a transition or the other way round.
 */

export interface JsonArc {
/**
 * Name of the place or transition the arc leaves.
 */
source: string
/**
 * Name of the place or transition the arc enters.
 */
target: string
/**
 * Whether the arc moves one object or a whole set of them.
 */
type?: ("normal" | "variable")
/**
 * How many tokens the arc moves.
 */
weight?: number
}

export type Direction = ("leftright" | "topbottom")
/**
 * A node of a [`DirectlyFollowsGraph`] drawing, e.g., `{"kind": "activity", "name": "pay"}`.
 */

export type DfgNodeRef = ({
kind: "start"
} | {
kind: "end"
} | {
kind: "activity"
name: string
})

/**
 * How a [`DirectlyFollowsGraph`] is turned into a [`Graph`].
 */

export interface LayoutOptions {
/**
 * Primary flow direction of the layered layout. Default [`Direction::LeftRight`].
 * 
 * The output is in screen coordinates either way (`x` right, `y` down). The direction decides
 * which axis the layers advance along. Options named in flow terms ([`crate::Margins`],
 * [`LoopSide`], [`PortSides`]) turn with it. Port hints ([`crate::PortHint`]) and the output
 * do not.
 * 
 * ```
 * use graphlay::{layout, Direction, GraphBuilder, LayoutOptions, Size};
 * 
 * let mut b = GraphBuilder::new();
 * let a = b.add_box(Size::new(100.0, 40.0));
 * let c = b.add_box(Size::new(100.0, 40.0));
 * b.connect(a, c);
 * let g = b.build();
 * let mut o = LayoutOptions::layered_default();
 * 
 * o.direction = Direction::LeftRight; // the default
 * let across = layout(&g, &o)?;
 * let gap = across.nodes[1].center.x - across.nodes[0].center.x - 100.0;
 * assert!((gap - o.spacing.layer_gap).abs() < 0.5);
 * 
 * o.direction = Direction::TopBottom;
 * let down = layout(&g, &o)?;
 * // The same layer gap, now between a 40px-tall box and the one below it.
 * let gap = down.nodes[1].center.y - down.nodes[0].center.y - 40.0;
 * assert!((gap - o.spacing.layer_gap).abs() < 0.5);
 * # Ok::<(), graphlay::LayoutError>(())
 * ```
 * 
 * There is no `BottomTop` or `RightLeft`. Mirroring the layer axis would reverse the handedness
 * the order axis, port sides and routing repairs assume.
 */
direction?: ("leftright" | "topbottom")
spacing?: Spacing
routing?: Routing
order?: OrderOptions
coords?: CoordOptions
compaction?: CompactionOptions
self_loops?: SelfLoopOptions
labels?: LabelOptions
/**
 * How hard the engine works, as one dial. See [`Effort`].
 */
effort?: ("fast" | "balanced" | "thorough" | {
custom: EffortBudget
})
/**
 * Seed for the crossing minimisation's restarts and kicks. The same seed gives the same
 * drawing. 32 bits so it survives JSON in JavaScript. Default [`DEFAULT_SEED`].
 */
seed?: number
limits?: Limits
wrap?: WrapOptions
cycles?: CycleOptions
/**
 * How node positions given as seeds steer the layout.
 */
seed_mode?: ("placement" | "structure")
tuning?: Tuning
}
/**
 * Gaps and clearances.
 */

export interface Spacing {
/**
 * Between layer columns, on the layer axis. Default 54.
 * 
 * A left-to-right drawing's width grows with `n_layers * (node_w + layer_gap)`, so lower
 * this to narrow it.
 */
layer_gap?: number
/**
 * Between two real nodes in one layer, on the order axis. Default 46.
 */
node_gap?: number
/**
 * Between a routing track and its order-axis neighbour. Default 30, tighter than `node_gap`
 * because a track is a line.
 */
dummy_gap?: number
/**
 * Minimum port-to-port separation along one border. Default 18.
 */
port_gap?: number
/**
 * Clear space between the strokes of two adjacent ports, on top of half of each stroke's
 * width. Default 14. Raise it for thick strokes.
 */
port_stroke_clear?: number
/**
 * Straight run out of a port before the first bend. Default 15.
 */
stub?: number
/**
 * Clear space between the strokes of two lanes in one parallel-edge bundle. Default 8.
 */
bundle_lane_gap?: number
/**
 * Depth step between two self-loops stacked on one node border. Default 10, also the
 * default of [`SelfLoopOptions::gap`].
 */
self_loop_gap?: number
/**
 * Extra layer gap beyond an edge label's own layer-axis extent, so the edge has room for
 * the label and its arrow marker. Default 24.
 */
edge_label_margin?: number
/**
 * Clear space between two edge labels stacked in one layer gap. Default 6.
 */
edge_label_stack_gap?: number
/**
 * Order-axis gap [`crate::reroute()`] uses instead of [`Spacing::node_gap`]. Default 46.
 * 
 * A reroute keeps the caller's coordinates and runs no compaction, so a compaction preset's
 * tight `node_gap` would leave it cramped.
 */
reroute_node_gap?: number
/**
 * Padding around each cell of the grid that holds edgeless nodes, and the gap between that
 * grid and the connected drawing above it. Default 46.
 */
isolated_gap?: number
/**
 * Column cap for the isolated-node grid. Further nodes wrap into new rows. Default 24.
 */
isolated_max_columns?: number
/**
 * Room between a compound's border and its children's drawing, on every side
 * ([`crate::Node::parent`]). Default 20.
 */
compound_padding?: number
/**
 * Extra room along a compound's top border, on top of [`Spacing::compound_padding`], for a
 * title. Default 0.
 */
compound_header?: number
}
/**
 * Routing style, bundling and port choices.
 */

export interface Routing {
/**
 * How edges are drawn between their ports. Default [`RoutingStyle::Orthogonal`].
 */
style?: ("orthogonal" | "diagonal")
/**
 * Route parallel edges with the same endpoints as one edge, then split it into offset lanes.
 * Default `true`. When off, each is routed separately and they can scatter across corridors.
 */
bundle_parallel?: boolean
/**
 * Room reserved per riser in a layer gap. A gap where `k` edges change height is widened to
 * at least `(k + 1) * lane_gap`, so risers never merge into one thick line. Default 8.
 */
lane_gap?: number
/**
 * How readily an edge end may attach to a border across the layout axis instead of the one
 * facing the edge's direction. See [`PortSides`]. [`crate::Node::port_sides`] overrides it
 * per node. Default [`PortSides::Any`], but [`LayoutOptions::layered_default`] and
 * [`LayoutOptions::process_map`] use [`PortSides::FacingPreferred`].
 */
port_sides?: ("any" | "facing_only" | "facing_preferred" | "long_edges_any")
/**
 * Which nodes pack a border's ends around its middle. See [`PortCentring`]. Default
 * [`PortCentring::Round`].
 */
centre_ports?: ("off" | "round" | "all")
/**
 * Draw a node's forks (edges leaving it) or joins (edges reaching it) on one shared trunk
 * that branches at a common riser. Default [`MergeEdges::None`]. Orthogonal routing only.
 * It moves no node, and edges with a port hint are never merged.
 * 
 * ```
 * use graphlay::{layout, GraphBuilder, LayoutOptions, MergeEdges, Size};
 * 
 * let mut b = GraphBuilder::new();
 * let split = b.add_box(Size::new(80.0, 40.0));
 * for _ in 0..3 {
 *     let branch = b.add_box(Size::new(80.0, 40.0));
 *     b.connect(split, branch);
 * }
 * let mut o = LayoutOptions::layered_default();
 * o.routing.merge_edges = MergeEdges::Forks;
 * let l = layout(&b.build(), &o)?;
 * 
 * // All three edges leave `split` from one point, and branch where the junctions say.
 * assert!(l.edges.iter().all(|e| e.points[0] == l.edges[0].points[0]));
 * assert!(!l.junctions.is_empty());
 * # Ok::<(), graphlay::LayoutError>(())
 * ```
 */
merge_edges?: ("none" | "forks" | "joins" | "both")
}
/**
 * Crossing-minimisation heuristic and lane budgets.
 */

export interface OrderOptions {
/**
 * Which one-sided heuristic the sweeps sort by. See [`OrderHeuristic`].
 */
heuristic?: ("barycenter" | "median" | "alternate")
/**
 * Crossings the lane pass may add to put each group ([`crate::Node::group`]) in a band of
 * its own, as a percentage of the crossings ordering left, plus
 * [`OrderTuning::group_lane_budget_floor`]. Default 0.
 * 
 * A banding that costs nothing is always taken. For clear lanes, try 100 here, a floor of 8
 * and [`OrderOptions::group_lane_area_percent`] of 50.
 */
group_lane_budget_percent?: number
/**
 * How much wider the order axis may get, in percent, when the group bands are stacked into
 * disjoint slots. Default 0, which leaves the bands where the coordinate phases put them.
 * 
 * The stack is compressed to fit this budget, letting wide bands overlap at their edges.
 */
group_lane_area_percent?: number
/**
 * Whether group lanes are a preference traded against the two budgets above
 * ([`GroupLanes::Soft`], the default) or required swimlanes ([`GroupLanes::Strict`]).
 */
group_lanes?: ("soft" | "strict")
}
/**
 * Cross-axis placement behaviour.
 */

export interface CoordOptions {
/**
 * Which optimiser places the order axis. Default [`Placement::NetworkSimplex`].
 */
placement?: ("brandes_koepf" | "network_simplex")
/**
 * Keep each branch off the main path in a band of its own, so one branch never slides into
 * a sibling's row. Default `true`. Graphs without a main path (several flows, caller seeds,
 * group lanes) are unaffected.
 */
branch_bands?: boolean
/**
 * Centre a first- or last-layer terminal on the weighted median of its neighbours, so it
 * sits over its main flow. Default `false`, `true` in [`LayoutOptions::process_map`].
 */
terminal_centering?: boolean
/**
 * How a fork/join block's branches are drawn. See [`BranchStyle`]. Default
 * [`BranchStyle::Free`], but [`LayoutOptions::layered_default`] and
 * [`LayoutOptions::process_map`] use [`BranchStyle::StraightMain`].
 */
branch_style?: ("free" | "straight_main" | "symmetric")
}
/**
 * Whether and how the cross axis is compacted afterwards.
 */

export interface CompactionOptions {
/**
 * Whether the cross axis is compacted after placement.
 */
mode?: ("none" | "priority")
}
/**
 * How self-loops are placed and drawn.
 */

export interface SelfLoopOptions {
/**
 * Which border the loops bump out of. Default [`LoopSide::Auto`].
 */
side?: ("cross_positive" | "cross_negative" | "along_positive" | "auto")
/**
 * How far the innermost loop reaches beyond the node's border. Default 15, the
 * [`Spacing::stub`] default, so a loop leaves its port by the same run as an ordinary edge.
 */
size?: number
/**
 * Depth step between two loops stacked on one node, so `k` loops nest. Default 10, the
 * [`Spacing::self_loop_gap`] default.
 */
gap?: number
/**
 * Clear space between the outer run of a loop and its own label box. Default 4.
 */
label_gap?: number
}
/**
 * How edge labels are given room, and where they end up.
 */

export interface LabelOptions {
/**
 * When a layer gap is widened to hold a label.
 */
reservation?: ("always" | "when_needed" | "never")
/**
 * How the final position is chosen.
 */
placement?: ("gap_centre" | "candidates")
/**
 * Clear space a label tries to keep from node boxes, other labels and other edges. Soft: A
 * position with less clearance is penalised for the shortfall. Default 4.
 */
clearance?: number
}
/**
 * The iteration counts one [`Effort`] resolves to.
 */

export interface EffortBudget {
/**
 * Ordering restarts ([`OrderTuning::seeds`]).
 */
order_seeds?: number
/**
 * Sweeps per restart ([`OrderTuning::sweeps`]).
 */
order_sweeps?: number
/**
 * Brute-force permutation cap ([`OrderTuning::exhaustive_layer_max`]).
 */
exhaustive_layer_max?: number
/**
 * Sifting rounds per wide layer ([`OrderTuning::sifting_rounds`]).
 */
sifting_rounds?: number
/**
 * Channel pull-in rounds, applied only when [`CoordTuning::pullin_rounds`] is non-zero.
 */
pullin_rounds?: number
/**
 * Rejected kicks per layer before the local search gives up on it
 * ([`OrderTuning::kick_patience`]).
 */
kick_patience?: number
}
/**
 * Input size limits. Exceeding one is an error instead of unbounded time.
 */

export interface Limits {
/**
 * Largest accepted node count.
 */
max_nodes?: (number | null)
/**
 * Largest accepted edge count.
 */
max_edges?: (number | null)
/**
 * Largest accepted routing-waypoint count (one per layer a long edge passes), checked after
 * layering. [`crate::LayoutError::TooLarge`] names it `"routing waypoints"`.
 */
max_dummies?: (number | null)
}
/**
 * Wrapping a long drawing into rows. Off unless a viewport shape is given.
 */

export interface WrapOptions {
/**
 * Width over height of the viewport the drawing is shown in. Default `0`, never wrap.
 */
viewport_aspect?: number
}
/**
 * Which edges of a cyclic graph are drawn against the flow.
 */

export interface CycleOptions {
/**
 * Which edges of a cycle are drawn backwards.
 */
strategy?: ("minimum_reversal" | "follow_flow")
}
/**
 * The engine's internal iteration counts, budgets and thresholds. See [`Tuning`].
 */

export interface Tuning {
routing?: RoutingTuning
order?: OrderTuning
coords?: CoordTuning
compaction?: CompactionTuning
labels?: LabelTuning
wrap?: WrapTuning
}
/**
 * The router's repair passes.
 */

export interface RoutingTuning {
/**
 * Minimum clearance between a diagonal segment and a node box. A closer segment takes a
 * corner detour, since a graze reads as badly as a hit. Default 8.
 */
diagonal_clear?: number
/**
 * How far outside a node box a diagonal's corner detour is placed. Default 12.
 */
diagonal_detour_margin?: number
/**
 * How far past the inner channel's turn an outer channel is carried when two nested
 * long-edge channels would otherwise cross at their shared target. Default 12.
 */
bundle_nest_gap?: number
/**
 * Largest port jog that is straightened onto the edge's main track. Default 6.
 */
endpoint_snap?: number
/**
 * Shortest segment that counts as a main track. Default 25.
 */
endpoint_snap_min_track?: number
/**
 * Tallest step (run, perpendicular jog, run) merged away after routing by moving one run onto
 * the other's line. Default `1.0e6` (no cap), `0.0` disables the pass.
 * 
 * A move is taken only if it hits no node box, keeps ports [`Spacing::port_gap`] apart, and
 * adds no crossing or overlap.
 */
step_flatten?: number
/**
 * Minimum distance between two ports on adjacent borders of one node, the corner case
 * `port_gap` does not cover. Default 10.
 */
port_relax_clear?: number
/**
 * Step of the greedy nudge that enforces `port_relax_clear`. Default 3.
 */
port_relax_step?: number
/**
 * Iterations of that nudge per node. Default 48.
 */
port_relax_rounds?: number
/**
 * Rounds of the repair that separates two edges' runs drawn on one line along the layer
 * axis, where that adds no box hit or crossing. Default 8. `0` disables it.
 */
overlap_repair_rounds?: number
/**
 * How far that repair moves a run or a port, in one or two steps. Default 8. `0.0`
 * disables the repair.
 */
overlap_repair_step?: number
}
/**
 * Crossing-minimisation and lane effort.
 */

export interface OrderTuning {
/**
 * Ordering restarts. Default 9. The first three are structural (a DFS seed, its mirror, and
 * a DFS from the last layer), the rest deterministic shuffles of the first.
 */
seeds?: number
/**
 * Upper bound on forward and backward sweeps per restart. Default 8. A restart stops early
 * after [`OrderTuning::sweep_stall`] sweeps without improvement.
 */
sweeps?: number
/**
 * Consecutive non-improving sweeps after which a restart gives up. Default 2. `0` is read as
 * `1`.
 */
sweep_stall?: number
/**
 * Layers with 2 to this many nodes are ordered by trying every permutation. Default 5.
 */
exhaustive_layer_max?: number
/**
 * Layers wider than this get the sifting pass. Default 2. The kicks only visit layers that
 * sift, so raising it also removes layers from the local search.
 */
sifting_min_layer?: number
/**
 * Upper bound on sifting rounds over the layer stack. Default 8. A round sifts every layer
 * still moving and wakes the neighbours of those that moved. It stops early when a round
 * moves nothing.
 */
sifting_rounds?: number
/**
 * Work ceiling for sifting one layer, in arc pairs (about `e^2` for `e` arcs on its two
 * sides). A heavier layer is left to the sweeps. Default 160000.
 */
sifting_max_work?: number
/**
 * Arc count up to which sifting also runs inside each restart's sweeps, instead of only on
 * the winning order. It multiplies sifting cost by the restart count. Default 20000.
 */
sifting_sweep_max_arcs?: number
/**
 * Upper bound on kicks the iterated local search tries on the winning order. A kick reverses
 * a short run of one layer, re-sifts, and is kept only if strictly better. Usually
 * [`OrderTuning::kick_patience`] stops the pass first. Default 30000. `0` disables it.
 */
kick_rounds?: number
/**
 * Consecutive rejected kicks per layer after which that layer leaves the kick pool. An
 * accepted kick resets its layer and both neighbours. Default 64. `0` is read as `1`.
 */
kick_patience?: number
/**
 * Longest run of a layer one kick may reverse. Each kick picks a length from 2 up to this.
 * Default 8.
 */
kick_max_span?: number
/**
 * Relaxation iterations that spread lane values from grouped to ungrouped nodes.
 * Default 64.
 */
group_relax_iters?: number
/**
 * Re-sort rounds of the group lane pass. Default 8.
 */
group_sort_rounds?: number
/**
 * Crossings the lane pass may add on top of [`OrderOptions::group_lane_budget_percent`].
 * Default 0. A nearly planar drawing has no crossings to take a percentage of, so this
 * floor is what lets it get lanes.
 */
group_lane_budget_floor?: number
/**
 * Barycentre sweeps over the banded order, each re-sorting every layer within its bands.
 * Default 4.
 */
group_lane_sweeps?: number
/**
 * Rounds of band-preserving adjacent swaps that win back crossings the banding cost.
 * Default 3.
 */
group_lane_repair_rounds?: number
/**
 * Rounds of adjacent band swaps looking for a band order with fewer crossings. Default 2.
 */
group_lane_order_rounds?: number
/**
 * Rounds of the chain-lane pass, which moves a long edge's waypoints past their neighbours
 * where that costs no crossing and lets the edge run on one lane. Default 3. `0` disables the
 * pass.
 */
chain_lane_rounds?: number
/**
 * On a graph with more routing waypoints than this, the chain-lane pass skips chains longer
 * than [`OrderTuning::chain_lane_max_span`]. Default 2000.
 */
chain_lane_size_threshold?: number
/**
 * Longest chain the chain-lane pass still works on above the size threshold. Default 12.
 */
chain_lane_max_span?: number
/**
 * How many positions the chain-lane pass may move one waypoint in one go. A walk is kept
 * whole if it opens the lane, else undone. Default 5.
 */
chain_lane_max_steps?: number
/**
 * Rounds of the side-balancing pass, which mirrors branches off the main path to whichever
 * side evens out the layers, where that costs no crossing. Default 4. `0` disables it.
 */
balance_rounds?: number
}
/**
 * The coordinate phases' rounds and budgets.
 */

export interface CoordTuning {
/**
 * Auxiliary-graph size (layered nodes plus arcs) above which [`Placement::NetworkSimplex`]
 * falls back to Brandes-Kopf. Default 10000.
 */
simplex_max_nodes?: number
/**
 * Simplex iterations before [`Placement::NetworkSimplex`] stops with its best placement so
 * far. Every iteration is feasible, so a capped solve is still a valid drawing. Default
 * 50000.
 */
simplex_max_pivots?: number
/**
 * Rounds of the walk over the simplex's optimal face that re-places each long edge, heaviest
 * first, on the fewest lanes possible at the same cost. Default 2. `0` switches it off.
 * Brandes-Kopf ignores it.
 */
simplex_face_rounds?: number
/**
 * Rounds of the straightness snap after Brandes-Kopf. Default 8. The network simplex
 * ignores it.
 */
snap_rounds?: number
/**
 * How much wider, in percent, the drawing may get to draw its heaviest source-to-sink path
 * as one straight line, but at least the widest node on the path. Default 15. `0` turns the
 * pass off.
 */
main_path_room?: number
/**
 * How much wider than the balanced placement one of Brandes-Kopf's four biased passes may
 * be and still be chosen, in percent. Default 20.
 */
balance_width_slack?: number
/**
 * Pixels of layer width one removed staircase step is worth when chain flattening pushes a
 * node aside to free a lane. Default 300. `0` turns the phase off.
 */
flatten_room?: number
/**
 * Rounds of channel pull-in, which moves a long edge's waypoints past a real node standing
 * between them and their endpoints' line when crossings allow. Default 0 (off), 3 in
 * [`LayoutOptions::process_map`].
 */
pullin_rounds?: number
/**
 * Rounds of the [`BranchStyle`] pass. Each round walks every block innermost-first and
 * stops early once a round aligns nothing new. Default 3.
 */
branch_rounds?: number
}
/**
 * Priority compaction's rounds.
 */

export interface CompactionTuning {
/**
 * Rounds of rigid per-layer offsetting. Default 24.
 */
offset_rounds?: number
/**
 * Rounds of per-node refinement inside the packed envelope. Default 8.
 */
refine_rounds?: number
}
/**
 * Label placement's candidates and rounds.
 */

export interface LabelTuning {
/**
 * Fractions along its own polyline at which a label is tried, besides the midpoint of the
 * longest segment. Ties go to the earlier fraction. Default `[0.5, 0.32, 0.68, 0.18, 0.82]`.
 * 
 * @minItems 5
 * @maxItems 5
 */
fractions?: [number, number, number, number, number]
/**
 * How far off its line a label may be pushed, as multiples of the distance that just clears
 * the line (half the label's extent across the line, plus the stroke, plus
 * [`LabelOptions::clearance`]). Both sides are tried, nearest first. Default `[1, 2, 4, 8]`.
 * 
 * @minItems 4
 * @maxItems 4
 */
side_steps?: [number, number, number, number]
/**
 * Rounds of placement. Round one ignores other labels, and each further round re-places
 * every label against the others. Default 2. `0` places nothing.
 */
rounds?: number
}
/**
 * When and how far a drawing is wrapped.
 */

export interface WrapTuning {
/**
 * Most rows a drawing is wrapped into. Default 4.
 */
max_rows?: number
/**
 * Scale factor by which the drawing must grow in the viewport for a wrap to be taken.
 * Default 1.2. Every edge across a cut gets a U-turn, which a small gain does not pay for.
 */
min_gain?: number
/**
 * Most edges one cut may carry to the next row. Default 4.
 */
max_cut_edges?: number
}
/**
 * Labels, layout weights and line widths by node and edge, instead of the counts.
 */

export interface AnnotationsFor_DfgNodeRef {
/**
 * By node, as one more line in the node.
 */
nodes: [DfgNodeRef, NodeAnnotation][]
/**
 * By edge.
 */
edges: [[DfgNodeRef, DfgNodeRef], EdgeAnnotation][]
}
/**
 * A line a node shows under its label, e.g., an average duration.
 */

export interface NodeAnnotation {
/**
 * The line's text. An empty string draws no line.
 */
label?: (string | null)
}
/**
 * How an edge is labeled, weighted and drawn, instead of the model's defaults.
 */

export interface EdgeAnnotation {
/**
 * Replaces the edge's label, e.g., its count. An empty string draws no label.
 */
label?: (string | null)
/**
 * Layout weight. A heavier edge is drawn shorter and straighter. A weight that is not finite
 * and `> 0` is ignored, so the edge keeps the model's weight.
 */
weight?: (number | null)
/**
 * Line width in px, which the layout also keeps between edges sharing a port. A width that is
 * not finite and `>= 0` is ignored, so the edge keeps the model's width.
 */
thickness?: (number | null)
}

export type EdgeId = number
/**
 * A lane group. Nodes sharing one are drawn in a lane of their own.
 * 
 * Groups are opaque ids, only compared and ordered. Lanes appear only when nodes carry at least
 * two distinct groups (see [`Node::group`]).
 */

export type GroupId = number

/**
 * One laid-out drawing.
 */

export interface Placement {
center: Point
size: Size
/**
 * Layer index. `None` for an edgeless node packed into the grid below the layered drawing.
 */
rank?: (number | null)
/**
 * Position within the layer. Routing waypoints count too, so two nodes with a long edge's
 * track between them are two apart.
 */
order: number
}
/**
 * Centre of the node's box, in output space.
 */

export interface Point {
/**
 * Horizontal coordinate, growing to the right.
 */
x: number
/**
 * Vertical coordinate, growing downwards (SVG convention).
 */
y: number
}
/**
 * The node's size, echoed from the input so a renderer needs only the layout.
 */

export interface Size {
/**
 * Extent along `x`.
 */
width: number
/**
 * Extent along `y`.
 */
height: number
}
/**
 * How one edge was drawn.
 */

export interface EdgeRoute {
/**
 * Border-to-border polyline, source first. At least two points for a routed edge, four for
 * a [`RouteKind::SelfLoop`] and none for [`RouteKind::Unrouted`].
 */
points: Point1[]
/**
 * Where the polyline leaves the source node, or `None` when there is no polyline.
 */
source_port?: (PortInfo | null)
/**
 * Where the polyline enters the target node, or `None` when there is no polyline.
 */
target_port?: (PortInfo | null)
/**
 * What kind of route this is.
 */
kind: ("direct" | {
chained: {
/**
 * How many layer gaps it crosses (always `> 1`).
 */
spans: number
}
} | "selfloop" | {
bundled: {
/**
 * Index of this edge's lane within its bundle, in edge order.
 */
lane: number
}
} | "unrouted")
/**
 * Where to centre this edge's label, when [`crate::Edge::label_size`] is set.
 */
label_anchor?: (Point1 | null)
}
/**
 * A point in output (drawing) space, in px.
 */

export interface Point1 {
/**
 * Horizontal coordinate, growing to the right.
 */
x: number
/**
 * Vertical coordinate, growing downwards (SVG convention).
 */
y: number
}
/**
 * How an edge attaches to one of its nodes.
 */

export interface PortInfo {
point: Point2
/**
 * Which border that is, in output space. For an end placed by a port hint
 * ([`crate::Edge::source_port`] / [`crate::Edge::target_port`]), the hinted border.
 */
side: ("right" | "left" | "top" | "bottom")
/**
 * Signed distance in px along the border from its middle to [`PortInfo::point`]. Positive
 * is down on the left and right borders and right on the top and bottom borders.
 */
offset: number
}
/**
 * A point in output (drawing) space, in px.
 */

export interface Point2 {
/**
 * Horizontal coordinate, growing to the right.
 */
x: number
/**
 * Vertical coordinate, growing downwards (SVG convention).
 */
y: number
}
/**
 * Bounding box of every node box, polyline point and label anchor, without padding.
 */

export interface Rect {
min: Point3
max: Point4
}
/**
 * A point in output (drawing) space, in px.
 */

export interface Point3 {
/**
 * Horizontal coordinate, growing to the right.
 */
x: number
/**
 * Vertical coordinate, growing downwards (SVG convention).
 */
y: number
}
/**
 * A point in output (drawing) space, in px.
 */

export interface Point4 {
/**
 * Horizontal coordinate, growing to the right.
 */
x: number
/**
 * Vertical coordinate, growing downwards (SVG convention).
 */
y: number
}
/**
 * Counters about the run.
 */

export interface LayoutStats {
/**
 * Routing waypoints (dummy nodes) the long edges were cut into.
 */
dummy_count: number
}
/**
 * One swimlane: a strip across the whole drawing that holds one group's nodes.
 */

export interface Lane {
/**
 * The group the lane holds, or `None` for the lane of nodes without a group.
 */
group?: (GroupId | null)
rect: Rect1
}
/**
 * The lane's rectangle. Adjacent lanes share their border, halfway across the gap between
 * their nodes, and every lane spans the drawing's full extent along the layer axis.
 */

export interface Rect1 {
min: Point3
max: Point4
}

export type PortSides = ("any" | "facing_only" | "facing_preferred" | "long_edges_any")
/**
 * Index of a node in [`Graph::nodes`].
 */

export type NodeId = number
/**
 * Where an edge end must attach to its node, set in [`Edge::source_port`] and
 * [`Edge::target_port`].
 * 
 * Sides are in output (screen) terms, like [`crate::layout::PortInfo::side`], so [`Side::Top`]
 * is the drawn top border whatever the [`crate::Direction`]. A hint overrides
 * [`crate::Routing::port_sides`] and [`Node::port_sides`].
 * 
 * A hinted edge is never bundled ([`crate::Routing::bundle_parallel`]) or merged
 * ([`crate::Routing::merge_edges`]). A self-loop honours only the side, and only when all hinted
 * loops on its node agree. [`crate::tree::layout`] ignores hints.
 * 
 * ```
 * use graphlay::{layout, Edge, GraphBuilder, LayoutOptions, PortHint, Side, Size};
 * 
 * let mut b = GraphBuilder::new();
 * let a = b.add_box(Size::new(120.0, 50.0));
 * let c = b.add_box(Size::new(120.0, 50.0));
 * // Leave `a` through the middle of its bottom border, and enter `c` from above.
 * b.add_edge(Edge {
 *     source_port: Some(PortHint::Offset { side: Side::Bottom, t: 0.0 }),
 *     target_port: Some(PortHint::Side(Side::Top)),
 *     ..Edge::new(a, c)
 * });
 * let l = layout(&b.build(), &LayoutOptions::layered_default())?;
 * 
 * let route = &l.edges[0];
 * let (pa, pc) = (l.nodes[0].center, l.nodes[1].center);
 * assert_eq!(route.source_port.map(|p| p.side), Some(Side::Bottom));
 * assert_eq!(route.target_port.map(|p| p.side), Some(Side::Top));
 * let (first, last) = (route.points[0], route.points[route.points.len() - 1]);
 * assert!((first.x - pa.x).abs() < 0.5 && (first.y - (pa.y + 25.0)).abs() < 0.5);
 * assert!((last.y - (pc.y - 25.0)).abs() < 0.5);
 * # Ok::<(), graphlay::LayoutError>(())
 * ```
 */

export type PortHint = ({
side: Side
} | {
offset: {
/**
 * One border of a node's bounding box.
 * 
 * In [`crate::layout::PortInfo`] sides are in output space, so `Top` is the smaller-`y` border
 * whatever the [`crate::Direction`].
 */
side: ("right" | "left" | "top" | "bottom")
/**
 * Position along the border in `-1..=1`, as a share of its half-extent. `0` is the
 * middle, `-1` the left end of a top or bottom border and the top end of a side border.
 * Values near the corners are pulled in to the router's port limit.
 */
t: number
}
})
/**
 * One border of a node's bounding box.
 * 
 * In [`crate::layout::PortInfo`] sides are in output space, so `Top` is the smaller-`y` border
 * whatever the [`crate::Direction`].
 */

export type Side = ("right" | "left" | "top" | "bottom")
/**
 * A node of a [`DirectlyFollowsGraph`] drawing, e.g., `{"kind": "activity", "name": "pay"}`.
 */

export type DfgEdgeRef = ({
/**
 * Source activity.
 */
from: string
/**
 * Target activity, equal to `from` for a self-loop.
 */
to: string
/**
 * How often the relation was observed.
 */
count: number
kind: "follows"
} | {
/**
 * The activity.
 */
activity: string
/**
 * How many traces begin with it.
 */
count: number
kind: "start"
} | {
/**
 * The activity.
 */
activity: string
/**
 * How many traces end with it.
 */
count: number
kind: "end"
})

/**
 * The layout request of a model, with the model element behind each of its nodes and edges:
 * `layout.nodes[i]` of its layout is where `nodes[i]` went.
 */

export interface LayoutRequest {
graph?: Graph
/**
 * Which preset the options start from.
 */
preset?: ("layered" | "process_map" | "hub_and_spoke" | "hub_and_spoke_flow")
options?: LayoutOptions
}
/**
 * The graph to lay out. Nodes and edges are addressed by index, and a `source == target`
 * edge is a self-loop.
 */

export interface Graph {
/**
 * Nodes, in [`NodeId`] order.
 */
nodes?: Node[]
/**
 * Edges, in [`EdgeId`] order, which is also their order in a [`crate::Layout`].
 */
edges?: Edge[]
}
/**
 * One node of the input graph.
 * 
 * Only [`Node::size`] must be set, so `Node { size, ..Node::default() }` is the usual form. The
 * default size is `0 x 0`, which [`Graph::validate`] rejects.
 */

export interface Margins {
/**
 * Towards the previous layer.
 */
along_neg?: number
/**
 * Towards the next layer.
 */
along_pos?: number
/**
 * Towards the negative order side (screen up in `LeftRight`, screen left in `TopBottom`).
 */
cross_neg?: number
/**
 * Towards the positive order side (screen down in `LeftRight`, screen right in `TopBottom`).
 */
cross_pos?: number
}
/**
 * One directed edge of the input graph.
 * 
 * `source == target` is a self-loop, drawn as a [`crate::layout::RouteKind::SelfLoop`] bump on
 * one border ([`crate::SelfLoopOptions`]).
 */

export interface Edge {
/**
 * Index of a node in [`Graph::nodes`].
 */
source?: number
/**
 * Index of a node in [`Graph::nodes`].
 */
target?: number
/**
 * Layout importance, finite and `> 0`, default 1. Heavier edges are drawn shorter and
 * straighter.
 */
weight?: number
/**
 * Stroke width in px, default 2. Used only for port separation.
 */
thickness?: number
/**
 * Box to reserve for a mid-edge label. Its centre comes back as
 * [`crate::layout::EdgeRoute::label_anchor`].
 */
label_size?: (Size1 | null)
/**
 * Where the edge attaches to `source` (see [`PortHint`]), even if ranking reversed it.
 */
source_port?: (PortHint | null)
/**
 * Where the edge attaches to `target` (see [`PortHint`]), even if ranking reversed it.
 */
target_port?: (PortHint | null)
/**
 * Group of the edge (e.g., an object type). Used only as a bundling and lane tiebreak.
 */
group?: (GroupId | null)
/**
 * Lay this edge out as if it ran `target -> source`, but draw it `source -> target`.
 * 
 * The target gets the lower rank, the route still runs source to target, and the edge is
 * listed in [`crate::Layout::reversed`]. Use it for edges that point backwards, e.g., a retry.
 * 
 * ```
 * use graphlay::{layout, Edge, GraphBuilder, LayoutOptions, Size};
 * 
 * let mut b = GraphBuilder::new();
 * let refund = b.add_box(Size::new(100.0, 40.0));
 * let order = b.add_box(Size::new(100.0, 40.0));
 * // An arrow from refund to order, drawn as a step back.
 * let cancels = b.add_edge(Edge { reverse_for_ranking: true, ..Edge::new(refund, order) });
 * let l = layout(&b.build(), &LayoutOptions::layered_default())?;
 * 
 * assert!(l.nodes[order.index()].center.x < l.nodes[refund.index()].center.x);
 * assert_eq!(l.reversed, vec![cancels]);
 * // The polyline still starts on refund's left border.
 * let start = l.edges[0].points[0];
 * assert!((start.x - (l.nodes[refund.index()].center.x - 50.0)).abs() < 0.5);
 * # Ok::<(), graphlay::LayoutError>(())
 * ```
 */
reverse_for_ranking?: boolean
}
/**
 * The full extent of an axis-aligned box, in px.
 */

export interface Size1 {
/**
 * Extent along `x`.
 */
width: number
/**
 * Extent along `y`.
 */
height: number
}
/**
 * Fields of the preset to change, as a partial [`LayoutOptions`] object, deep-merged.
 */

export interface BaseStyle {
/**
 * Page background. `None` leaves the SVG transparent.
 */
background?: (string | null)
/**
 * Space kept around the drawing's bounding box, in px.
 */
padding?: number
/**
 * Default node border color.
 */
node_border?: string
/**
 * Default node fill.
 */
node_fill?: string
/**
 * Default label color.
 */
text?: string
/**
 * Default edge (and arrowhead) color.
 */
edge?: string
/**
 * Node label size in px.
 */
label_size?: number
/**
 * Edge label size in px.
 */
edge_label_size?: number
/**
 * Corner radius of a box-shaped node.
 */
corner_radius?: number
/**
 * Node border width in px.
 */
border_width?: number
}

export interface ElementStyle {
/**
 * Fill of a node. Ignored on an edge.
 */
fill?: (string | null)
/**
 * Border color of a node, or line color of an edge and its markers.
 */
stroke?: (string | null)
/**
 * Border width of a node, or line width of an edge, in px.
 */
stroke_width?: (number | null)
/**
 * Opacity of the whole element, e.g., `0.35` to dim it.
 */
opacity?: (number | null)
/**
 * Dash pattern of an edge's line or a node's border, as an SVG `stroke-dasharray`, e.g.,
 * `"4 3"`. An empty string draws a solid line.
 */
dash?: (string | null)
/**
 * One more line of text, under a node's label or under an edge's labels.
 */
extra_label?: (string | null)
}

export type NodeContent = ((TextRun & {
kind: "text"
}) | (GlyphRow & {
kind: "glyphs"
}) | {
/**
 * The rings.
 */
rings: Ring[]
kind: "rings"
} | {
/**
 * The symbol's [`SymbolDef::id`].
 */
symbol: string
at: Point3
size: SceneSize1
/**
 * Tint, set as `color` on the `<use>` so `currentColor` in the symbol picks it up.
 * `None` inherits.
 */
color?: (string | null)
attrs?: Attrs6
kind: "use"
} | {
/**
 * The corners, relative to the node centre.
 */
points: Point4[]
/**
 * Fill colour. `None` leaves the inside unpainted.
 */
fill?: (string | null)
/**
 * Outline. `None` draws none.
 */
stroke?: (Stroke | null)
attrs?: Attrs7
kind: "polygon"
} | (RawSvg & {
kind: "raw"
}))
/**
 * Something drawn along an edge. `Band`s are painted under the edge's own path, in list order.
 * Everything else is painted over it.
 */

export type Decoration = ({
/**
 * Where along the edge.
 */
at: (number | Point5 | {
/**
 * A fraction (0..1) of the edge's length.
 */
fraction: number
/**
 * Distance along the line from there.
 */
offset: number
})
/**
 * Circle radius.
 */
radius: number
/**
 * Fill colour. Falls back to the theme's arc colour.
 */
fill?: (string | null)
/**
 * Outline. `None` draws none.
 */
stroke?: (Stroke | null)
attrs?: Attrs10
kind: "dot"
} | {
/**
 * Where along the edge. The bar is perpendicular to the path's direction there.
 */
at: (number | Point5 | {
/**
 * A fraction (0..1) of the edge's length.
 */
fraction: number
/**
 * Distance along the line from there.
 */
offset: number
})
/**
 * Length of the bar, centred on the anchor.
 */
length: number
/**
 * Degrees the bar is turned from the perpendicular, towards the direction of travel at
 * its right-hand end. `0` crosses the path at a right angle.
 */
slant?: number
stroke: Stroke2
attrs?: Attrs11
kind: "tick"
} | {
/**
 * Where along the edge.
 */
at: (number | Point5 | {
/**
 * A fraction (0..1) of the edge's length.
 */
fraction: number
/**
 * Distance along the line from there.
 */
offset: number
})
/**
 * The symbol's [`SymbolDef::id`].
 */
symbol: string
size: SceneSize2
/**
 * Tint, set as `color` on the `<use>`. `None` inherits.
 */
color?: (string | null)
attrs?: Attrs12
kind: "glyph"
} | {
/**
 * The band's own polyline, in scene coordinates. Fewer than two points draws nothing.
 */
points: Point4[]
stroke: Stroke3
/**
 * Radius its interior joins are rounded with. `0` draws straight segments.
 */
corner_radius?: number
attrs?: Attrs13
kind: "band"
})

/**
 * One complete drawing.
 */

export interface RawSvg {
/**
 * SVG markup, emitted unescaped. The caller is responsible for it being well-formed and safe.
 */
markup: string
bounds: SceneRect
attrs?: Attrs
}
/**
 * The area the markup draws over, in scene coordinates, for [`Scene::bounds`].
 */

export interface SceneRect {
/**
 * Left edge.
 */
x: number
/**
 * Top edge.
 */
y: number
/**
 * Width.
 */
w: number
/**
 * Height.
 */
h: number
}
/**
 * When non-empty, the markup is wrapped in a `<g>` carrying these attributes.
 */

export interface Attrs {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * A reusable fragment, emitted once as `<symbol>` and drawn with `<use>`.
 * 
 * The markup is in the symbol's own `view_box` coordinates. A fragment that should take the
 * colour of the place it is used paints with `currentColor`, since the renderer sets `color` on
 * the `<use>` element.
 */

export interface SymbolDef {
/**
 * The id that [`NodeContent::Use`], [`Glyph::Symbol`], [`Separator::symbol`],
 * [`Decoration::Glyph`] and [`Swatch::Symbol`] refer to it by. A scene symbol with the id of
 * a builtin one ([`crate::svg::builtin_symbols`]) replaces it.
 */
id: string
view_box: SceneRect1
/**
 * SVG markup, emitted unescaped inside the `<symbol>`.
 */
markup: string
attrs?: Attrs1
}
/**
 * The coordinate box the markup is written in. It is scaled to whatever box it is used at.
 */

export interface SceneRect1 {
/**
 * Left edge.
 */
x: number
/**
 * Top edge.
 */
y: number
/**
 * Width.
 */
w: number
/**
 * Height.
 */
h: number
}
/**
 * Attributes on the `<symbol>` element.
 */

export interface Attrs1 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * A user-defined `<marker>`.
 */

export interface MarkerDef {
/**
 * The id [`MarkerRef::Custom`] refers to it by. A reference to an id that no marker has
 * draws no marker.
 */
id?: string
/**
 * Markup in `view_box` coordinates, emitted verbatim inside the `<marker>`.
 */
markup?: string
view_box?: SceneRect2
ref_point?: Point
size?: SceneSize
/**
 * Rotate the marker to follow the path's direction at its end (`orient="auto"`). `false`
 * draws it unrotated. Defaults to `true`.
 */
orient_auto?: boolean
/**
 * How far the path end is pulled back so the marker's visible tip lands on the endpoint, in
 * scene units. 0 leaves the path alone.
 */
tip_gap?: number
attrs?: Attrs2
}
/**
 * The coordinate box the markup is written in. Defaults to `0 0 12 12`.
 */

export interface SceneRect2 {
/**
 * Left edge.
 */
x: number
/**
 * Top edge.
 */
y: number
/**
 * Width.
 */
w: number
/**
 * Height.
 */
h: number
}
/**
 * The point of the marker that lands on the path's endpoint, in `view_box` coordinates.
 */

export interface SceneSize {
/**
 * Width, in scene units.
 */
w: number
/**
 * Height, in scene units.
 */
h: number
}
/**
 * Attributes on the `<marker>` element.
 */

export interface Attrs2 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * One node: a shape at a position, plus whatever is drawn inside it.
 */

export interface SceneNode {
rect?: SceneRect3
/**
 * Outline drawn in [`SceneNode::rect`].
 */
shape?: ({
/**
 * Corner radius in scene units. `0` draws sharp corners. Clamped to half the shorter
 * side.
 */
corner_radius: number
kind: "rect"
} | {
kind: "ellipse"
} | {
kind: "circle"
})
/**
 * Fill colour. Falls back to the theme's node background.
 */
fill?: (string | null)
/**
 * Border stroke. `None` draws a 1-unit border in the theme's node border colour.
 */
stroke?: (Stroke | null)
/**
 * What is drawn inside, in list order, over the fill and border.
 */
content?: NodeContent[]
attrs?: Attrs8
}
/**
 * The node's box in scene coordinates. The content is anchored at its centre.
 */

export interface SceneRect3 {
/**
 * Left edge.
 */
x: number
/**
 * Top edge.
 */
y: number
/**
 * Width.
 */
w: number
/**
 * Height.
 */
h: number
}
/**
 * A stroke: what to paint with, how wide, dashed how, capped how.
 */

export interface Stroke {
/**
 * What the stroke is painted with. Defaults to `currentColor`.
 */
paint?: (string | Gradient)
/**
 * Stroke width in scene units. Defaults to `1`.
 */
width?: number
/**
 * SVG `stroke-dasharray`, e.g., `"4 2"`. `None` draws a solid line.
 */
dash?: (string | null)
/**
 * How the open ends of the stroke are drawn.
 */
linecap?: ("butt" | "round" | "square")
/**
 * `stroke-opacity` in `0..=1`. `None` leaves it out (fully opaque).
 */
opacity?: (number | null)
}
/**
 * The renderer emits one `<linearGradient>` per distinct gradient and references it.
 */

export interface Gradient {
from: Point1
to: Point2
/**
 * The colour stops, in offset order.
 */
stops: GradientStop[]
}
/**
 * Where offset `0` lies.
 */

export interface GradientStop {
/**
 * Fraction (0..1) along the gradient axis.
 */
offset: number
/**
 * The colour at that point.
 */
color: string
}
/**
 * One run of text: a single line, or several when [`TextRun::wrap`] is set.
 */

export interface TextRun {
/**
 * The text, escaped on output.
 */
text?: string
/**
 * Horizontal offset from the anchor the run belongs to (a node's centre, an edge's label
 * anchor, a panel's origin).
 */
dx?: number
/**
 * Vertical offset from that same anchor.
 */
dy?: number
/**
 * Font size in scene units. `None` takes the scene's [`Scene::font`] size.
 */
size?: (number | null)
/**
 * CSS numeric font weight. `None` takes the scene's [`Scene::font`] weight.
 */
weight?: (number | null)
/**
 * Font family. Falls back to the scene's [`Scene::font`].
 */
family?: (string | null)
/**
 * Fill colour. Falls back to the theme's text colour.
 */
color?: (string | null)
/**
 * Horizontal alignment around the anchor. Defaults to [`TextAnchor::Middle`].
 */
anchor?: ("start" | "middle" | "end")
/**
 * Vertical alignment around the anchor. Defaults to [`Baseline::Central`].
 */
baseline?: ("alphabetic" | "central")
/**
 * Word wrapping. `None` draws [`TextRun::text`] on one line as given. Wrapped lines are
 * stacked [`TextWrap::line_height`] apart and centred as a block on the anchor.
 */
wrap?: (TextWrap | null)
/**
 * A background-coloured outline under the glyphs. `None` draws the glyphs bare.
 */
halo?: (Halo | null)
/**
 * When non-empty, these are drawn one after another in place of [`TextRun::text`], on one
 * line. They are measured as their joined text in the run's font, and `wrap` is ignored.
 */
spans?: TextSpan[]
attrs?: Attrs3
}
/**
 * Opt-in word wrapping. The renderer asks the [`crate::svg::TextMeasurer`] where to split.
 */

export interface TextWrap {
/**
 * Widest a line may be, in scene units, as the measurer reports it.
 */
max_width: number
/**
 * Most lines the text is split into. The last one is ellipsised when the text does not fit.
 * `0` draws nothing.
 */
max_lines: number
/**
 * Baseline-to-baseline distance between wrapped lines.
 */
line_height: number
}
/**
 * A background-coloured stroke drawn under the glyphs (`paint-order="stroke"`), so text stays
 * legible over an arc without a hard chip around it.
 */

export interface Halo {
/**
 * Colour of the halo, usually the background the text sits on.
 */
color: string
/**
 * Stroke width of the halo. It reaches half of this beyond each glyph's outline.
 */
width: number
}
/**
 * Part of a [`TextRun`] with its own colour or weight, drawn as a `<tspan>`.
 */

export interface TextSpan {
/**
 * The text, escaped on output.
 */
text?: string
/**
 * Fill colour. `None` takes the run's.
 */
color?: (string | null)
/**
 * CSS numeric font weight. `None` takes the run's.
 */
weight?: (number | null)
}
/**
 * Attributes on each emitted `<text>` element.
 */

export interface Attrs3 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * A counted-glyph row drawn inside a node: multiplicities, cardinalities, tokens, capacity
 * markers. Clusters run left to right, centred on the row's anchor.
 */

export interface GlyphRow {
/**
 * The clusters, left to right.
 */
clusters?: GlyphCluster[]
/**
 * Horizontal offset of the row's centre from the node centre.
 */
dx?: number
/**
 * Vertical offset of the row's first line from the node centre.
 */
dy?: number
/**
 * How the clusters are sized and arranged.
 */
layout?: ((ExactLayout & {
kind: "exact"
}) | (FitLayout & {
kind: "fit"
}))
attrs?: Attrs5
}
/**
 * One run of `count` identical glyphs.
 */

export interface GlyphCluster {
/**
 * The shape of every glyph in the cluster.
 */
glyph?: ({
kind: "dot"
} | {
/**
 * Side length as a fraction of the diameter.
 */
scale: number
/**
 * Corner radius of the square.
 */
corner_radius: number
/**
 * Opacity of the whole glyph, `0..=1`.
 */
opacity: number
kind: "square"
} | {
/**
 * The symbol's [`SymbolDef::id`].
 */
id: string
kind: "symbol"
})
/**
 * How many glyphs. Defaults to `1`.
 */
count?: number
/**
 * Glyph fill (the tint, for [`Glyph::Symbol`]). Falls back to the theme's text colour.
 */
color?: (string | null)
/**
 * Glyph radius. Ignored under [`GlyphLayout::Fit`], which sizes glyphs to the row.
 */
radius?: number
/**
 * Centre-to-centre spacing inside the cluster. Below `2 * radius` the glyphs overlap into a
 * tight cluster. `None` uses `2 * radius + 2`.
 */
step?: (number | null)
/**
 * Outline stroked around each glyph.
 */
outline?: (Stroke | null)
/**
 * Glyph drawn in the gap before this cluster, tying it to the previous one. Only
 * [`GlyphLayout::Exact`] draws it.
 */
separator?: (Separator | null)
attrs?: Attrs4
}
/**
 * A separator glyph drawn in the gap before a cluster, binding it to the cluster before it.
 * The bound pair is never split across rows.
 */

export interface Separator {
/**
 * Id of a [`SymbolDef`]. See [`crate::svg::builtin_symbols`] for the builtin ones.
 */
symbol: string
/**
 * Width of the box the symbol is drawn in.
 */
width: number
/**
 * Height of that box. It is centred on the row.
 */
height: number
/**
 * Space between the previous cluster and the separator. Together with
 * [`Separator::width`] and [`Separator::gap_after`] it takes the place of
 * [`ExactLayout::cluster_gap`] before this cluster.
 */
gap_before: number
/**
 * Space between the separator and this cluster.
 */
gap_after: number
/**
 * Tint for the symbol. Falls back to the theme's arc colour.
 */
color?: (string | null)
}
/**
 * Attributes on each glyph's element.
 */

export interface Attrs4 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * Fixed-size clusters packed left to right, wrapping into further rows.
 */

export interface ExactLayout {
/**
 * Rows wrap once they would grow past this width. A single cluster wider than this still
 * gets a row of its own. Unbounded by default, `null` in JSON.
 */
wrap_width?: (number | null)
/**
 * Space between two neighbouring clusters (unless the second has a [`Separator`]).
 */
cluster_gap?: number
/**
 * Space between two rows, on top of the largest glyph diameter.
 */
row_gap?: number
/**
 * When several rows would run past this y, they are packed tighter (down to touching)
 * instead of overflowing, so no badge is dropped.
 */
max_bottom?: (number | null)
}
/**
 * One row scaled to fit `max_width`, collapsing to a numeral when even the smallest glyphs
 * would not fit.
 */

export interface FitLayout {
/**
 * Width the row is scaled to fit. Unbounded by default, `null` in JSON.
 */
max_width?: (number | null)
/**
 * Edge-to-edge gap between glyphs.
 */
gap?: number
/**
 * Smallest glyph diameter. A row that would need smaller glyphs collapses to the numeral.
 */
min_diameter?: number
/**
 * Largest glyph diameter, however much room the row has.
 */
max_diameter?: number
/**
 * Most glyphs drawn one by one. A row with more collapses to the numeral even when they
 * would fit. Has no effect without a `numeral`.
 */
max_glyphs?: (number | null)
/**
 * `None` draws the glyphs at `min_diameter` and lets the row overflow instead of collapsing.
 */
numeral?: (NumeralStyle | null)
}
/**
 * Style of the numeral a [`GlyphLayout::Fit`] row collapses to when it cannot fit.
 */

export interface NumeralStyle {
/**
 * Font size of the numeral.
 */
size: number
/**
 * CSS numeric font weight of the numeral.
 */
weight: number
/**
 * Fill colour. Falls back to the theme's text colour.
 */
color?: (string | null)
/**
 * One line per non-empty cluster, its glyph followed by a multiplication sign (U+00D7) and
 * the count, instead of a single total. The lines shrink together to fit `max_width`.
 */
counted?: boolean
}
/**
 * When non-empty, the row is wrapped in a `<g>` carrying these attributes.
 */

export interface Attrs5 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * A concentric ring drawn just inside a node's border. `inset` is the distance from the border
 * to the ring's outer edge. Rings follow the node's own shape.
 */

export interface Ring {
/**
 * Stroke colour.
 */
color: string
/**
 * Stroke width.
 */
width: number
/**
 * Distance from the node's border inwards to the ring's outer edge. A ring with no room left
 * inside the node is not drawn.
 */
inset: number
}
/**
 * Centre of the symbol's box, relative to the node centre.
 */

export interface SceneSize1 {
/**
 * Width, in scene units.
 */
w: number
/**
 * Height, in scene units.
 */
h: number
}
/**
 * Attributes on the `<use>` element.
 */

export interface Attrs6 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * A point in output (drawing) space, in px.
 */

export interface Attrs7 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * When non-empty, the node is wrapped in a `<g>` carrying these attributes.
 */

export interface Attrs8 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * One edge: an already-routed polyline plus its styling, markers, labels and decorations.
 */

export interface SceneEdge {
/**
 * The polyline in scene coordinates, source first. Fewer than two points draws nothing.
 */
points?: Point4[]
stroke?: Stroke1
/**
 * Radius the interior joins are rounded with. 0 draws straight segments.
 */
corner_radius?: number
/**
 * Radius of the semicircle a horizontal run of this edge draws where it crosses another
 * edge's vertical run. 0 draws crossings flat. Only crossings well inside both runs hop, so
 * a T junction or a crossing near a corner stays flat.
 */
hop_radius?: number
/**
 * Ramer-Douglas-Peucker tolerance applied to the *drawn* path only (0 = draw as given).
 * Labels and decorations still anchor on the points as passed in.
 */
simplify?: number
/**
 * Marker at the first point. The drawn path is pulled back by the marker's tip gap so the
 * tip lands on the endpoint. See [`MarkerDef::tip_gap`]. Builtin markers compute their own.
 */
marker_start?: ({
kind: "none"
} | {
/**
 * Which marker.
 */
marker: ("arrow" | "arrow_centered" | "ball" | "bar" | "arrow_ball" | "arrow_bar" | "ball_arrow" | "ball_bar_arrow")
/**
 * Marker fill. Falls back to the edge's own stroke colour.
 */
color?: (string | null)
/**
 * Side of the marker's 12-unit box in scene units. `None` scales with the stroke width.
 */
size?: (number | null)
kind: "builtin"
} | {
/**
 * The [`MarkerDef::id`].
 */
id: string
kind: "custom"
})
/**
 * Marker at the last point, with the same pull-back.
 */
marker_end?: ({
kind: "none"
} | {
/**
 * Which marker.
 */
marker: ("arrow" | "arrow_centered" | "ball" | "bar" | "arrow_ball" | "arrow_bar" | "ball_arrow" | "ball_bar_arrow")
/**
 * Marker fill. Falls back to the edge's own stroke colour.
 */
color?: (string | null)
/**
 * Side of the marker's 12-unit box in scene units. `None` scales with the stroke width.
 */
size?: (number | null)
kind: "builtin"
} | {
/**
 * The [`MarkerDef::id`].
 */
id: string
kind: "custom"
})
/**
 * Text labels, drawn over the path and its decorations.
 */
labels?: EdgeLabel[]
/**
 * Dots, ticks, glyphs and bands along the edge. See [`Decoration`] for the paint order.
 */
decorations?: Decoration[]
attrs?: Attrs14
}
/**
 * A stroke: what to paint with, how wide, dashed how, capped how.
 */

export interface Stroke1 {
/**
 * What the stroke is painted with. Defaults to `currentColor`.
 */
paint?: (string | Gradient)
/**
 * Stroke width in scene units. Defaults to `1`.
 */
width?: number
/**
 * SVG `stroke-dasharray`, e.g., `"4 2"`. `None` draws a solid line.
 */
dash?: (string | null)
/**
 * How the open ends of the stroke are drawn.
 */
linecap?: ("butt" | "round" | "square")
/**
 * `stroke-opacity` in `0..=1`. `None` leaves it out (fully opaque).
 */
opacity?: (number | null)
}
/**
 * A text label riding on an edge.
 */

export interface EdgeLabel {
text?: TextRun1
/**
 * Where along the edge the label is anchored. Defaults to the middle of the polyline.
 */
at?: (number | Point5 | {
/**
 * A fraction (0..1) of the edge's length.
 */
fraction: number
/**
 * Distance along the line from there.
 */
offset: number
})
/**
 * A background chip. For a glyph-hugging outline instead, set [`TextRun::halo`].
 */
chip?: (Chip | null)
attrs?: Attrs9
}
/**
 * One run of text: a single line, or several when [`TextRun::wrap`] is set.
 */

export interface TextRun1 {
/**
 * The text, escaped on output.
 */
text?: string
/**
 * Horizontal offset from the anchor the run belongs to (a node's centre, an edge's label
 * anchor, a panel's origin).
 */
dx?: number
/**
 * Vertical offset from that same anchor.
 */
dy?: number
/**
 * Font size in scene units. `None` takes the scene's [`Scene::font`] size.
 */
size?: (number | null)
/**
 * CSS numeric font weight. `None` takes the scene's [`Scene::font`] weight.
 */
weight?: (number | null)
/**
 * Font family. Falls back to the scene's [`Scene::font`].
 */
family?: (string | null)
/**
 * Fill colour. Falls back to the theme's text colour.
 */
color?: (string | null)
/**
 * Horizontal alignment around the anchor. Defaults to [`TextAnchor::Middle`].
 */
anchor?: ("start" | "middle" | "end")
/**
 * Vertical alignment around the anchor. Defaults to [`Baseline::Central`].
 */
baseline?: ("alphabetic" | "central")
/**
 * Word wrapping. `None` draws [`TextRun::text`] on one line as given. Wrapped lines are
 * stacked [`TextWrap::line_height`] apart and centred as a block on the anchor.
 */
wrap?: (TextWrap | null)
/**
 * A background-coloured outline under the glyphs. `None` draws the glyphs bare.
 */
halo?: (Halo | null)
/**
 * When non-empty, these are drawn one after another in place of [`TextRun::text`], on one
 * line. They are measured as their joined text in the run's font, and `wrap` is ignored.
 */
spans?: TextSpan[]
attrs?: Attrs3
}
/**
 * A point in output (drawing) space, in px.
 */

export interface Point5 {
/**
 * Horizontal coordinate, growing to the right.
 */
x: number
/**
 * Vertical coordinate, growing downwards (SVG convention).
 */
y: number
}
/**
 * A filled box drawn behind an edge label.
 */

export interface Chip {
/**
 * Fill colour. Defaults to white.
 */
fill?: string
/**
 * Space between the measured text box and the chip's border, on every side.
 */
padding?: number
/**
 * Corner radius of the chip.
 */
corner_radius?: number
/**
 * Border stroke. `None` draws no border.
 */
stroke?: (Stroke | null)
}
/**
 * When non-empty, the chip and text are wrapped in a `<g>` carrying these attributes.
 */

export interface Attrs9 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * Attributes on the `<circle>`.
 */

export interface Attrs10 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * A stroke: what to paint with, how wide, dashed how, capped how.
 */

export interface Stroke2 {
/**
 * What the stroke is painted with. Defaults to `currentColor`.
 */
paint?: (string | Gradient)
/**
 * Stroke width in scene units. Defaults to `1`.
 */
width?: number
/**
 * SVG `stroke-dasharray`, e.g., `"4 2"`. `None` draws a solid line.
 */
dash?: (string | null)
/**
 * How the open ends of the stroke are drawn.
 */
linecap?: ("butt" | "round" | "square")
/**
 * `stroke-opacity` in `0..=1`. `None` leaves it out (fully opaque).
 */
opacity?: (number | null)
}
/**
 * Attributes on the `<line>`.
 */

export interface Attrs11 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * Size of the box the symbol is drawn in. The symbol is not rotated with the path.
 */

export interface SceneSize2 {
/**
 * Width, in scene units.
 */
w: number
/**
 * Height, in scene units.
 */
h: number
}
/**
 * Attributes on the `<use>`.
 */

export interface Attrs12 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * A stroke: what to paint with, how wide, dashed how, capped how.
 */

export interface Stroke3 {
/**
 * What the stroke is painted with. Defaults to `currentColor`.
 */
paint?: (string | Gradient)
/**
 * Stroke width in scene units. Defaults to `1`.
 */
width?: number
/**
 * SVG `stroke-dasharray`, e.g., `"4 2"`. `None` draws a solid line.
 */
dash?: (string | null)
/**
 * How the open ends of the stroke are drawn.
 */
linecap?: ("butt" | "round" | "square")
/**
 * `stroke-opacity` in `0..=1`. `None` leaves it out (fully opaque).
 */
opacity?: (number | null)
}
/**
 * Attributes on the band's `<path>`.
 */

export interface Attrs13 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * When non-empty, the edge is wrapped in a `<g>` carrying these attributes.
 */

export interface Attrs14 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * A fragment or panel drawn outside the node/edge stack.
 */

export interface Overlay {
/**
 * Whether the overlay is drawn under or over the graph.
 */
z?: ("under" | "over")
/**
 * What is drawn.
 */
content: ((RawSvg & {
kind: "raw"
}) | (Panel & {
kind: "panel"
}))
attrs?: Attrs18
}
/**
 * A block of legend entries, stacked top-down from `origin`.
 */

export interface Panel {
origin?: Point6
/**
 * The sections, top to bottom.
 */
sections?: PanelSection[]
style?: PanelStyle
attrs?: Attrs17
}
/**
 * A point in output (drawing) space, in px.
 */

export interface Point6 {
/**
 * Horizontal coordinate, growing to the right.
 */
x: number
/**
 * Vertical coordinate, growing downwards (SVG convention).
 */
y: number
}
/**
 * A titled group of legend entries.
 */

export interface PanelSection {
/**
 * Heading line drawn above the entries. `None` draws none.
 */
title?: (string | null)
/**
 * The entries, top to bottom.
 */
items?: LegendItem[]
attrs?: Attrs16
}
/**
 * One labelled entry of a [`Panel`].
 */

export interface LegendItem {
/**
 * What is drawn left of the text.
 */
swatch?: ({
kind: "none"
} | {
/**
 * The colour.
 */
color: string
kind: "color"
} | {
/**
 * The symbol's [`SymbolDef::id`].
 */
id: string
size: SceneSize3
/**
 * Tint. Falls back to the theme's arc colour.
 */
color?: (string | null)
kind: "symbol"
} | (RawSvg & {
kind: "raw"
}))
/**
 * The entry's text.
 */
text?: string
/**
 * Horizontal space reserved for the swatch before the text. `None` uses
 * [`PanelStyle::swatch_column`].
 */
swatch_advance?: (number | null)
attrs?: Attrs15
}
/**
 * Size of the symbol's box.
 */

export interface SceneSize3 {
/**
 * Width, in scene units.
 */
w: number
/**
 * Height, in scene units.
 */
h: number
}
/**
 * When non-empty, the entry is wrapped in a `<g>` carrying these attributes.
 */

export interface Attrs15 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * When non-empty, the section is wrapped in a `<g>` carrying these attributes.
 */

export interface Attrs16 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * Sizes and colours.
 */

export interface PanelStyle {
/**
 * Font size of a section title.
 */
title_size?: number
/**
 * CSS numeric font weight of a section title.
 */
title_weight?: number
/**
 * Font size of an entry. Entries are always drawn at weight 400.
 */
item_size?: number
/**
 * Baseline-to-baseline distance between entries (and after a title).
 */
line_height?: number
/**
 * Extra space after a section.
 */
section_gap?: number
/**
 * Default horizontal space reserved for a swatch.
 */
swatch_column?: number
/**
 * Height of the swatch box. It is centred on the entry's text.
 */
swatch_height?: number
/**
 * Offset of the swatch box's centre from the entry's baseline (negative = above it).
 */
swatch_dy?: number
/**
 * Corner radius of a [`Swatch::Color`] square.
 */
swatch_corner_radius?: number
/**
 * Colour of titles and entry text. Falls back to the theme's text colour.
 */
text_color?: (string | null)
}
/**
 * When non-empty, the panel is wrapped in a `<g>` carrying these attributes.
 */

export interface Attrs17 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * When non-empty, the overlay is wrapped in a `<g>` carrying these attributes.
 */

export interface Attrs18 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * Attributes for the root `<svg>` element.
 */

export interface Attrs19 {
/**
 * The element's `id`.
 */
id?: (string | null)
/**
 * Class names, joined with spaces into one `class` attribute.
 */
class?: string[]
/**
 * `(name, value)` pairs, each emitted as `data-<name>="<value>"`.
 */
data?: [string, string][]
/**
 * Inline CSS, emitted as the `style` attribute.
 */
style?: (string | null)
/**
 * Free-form attributes, escaped but otherwise untouched.
 */
extra?: [string, string][]
}
/**
 * The default font of every text run. Its family is set on the root `<svg>`, and a run that
 * names no family, size or weight of its own takes this one's. The italic flag applies to
 * every run.
 */

export interface FontSpec {
/**
 * CSS `font-family` list. Defaults to `Inter, system-ui, -apple-system, sans-serif`.
 */
family?: string
/**
 * Font size in scene units. Defaults to `12.5`.
 */
size?: number
/**
 * CSS numeric font weight (`400` regular, `700` bold). Defaults to `400`.
 */
weight?: number
/**
 * Italic style, passed to the [`crate::svg::TextMeasurer`] and drawn with
 * `font-style="italic"`.
 */
italic?: boolean
}

export interface Palette {
/**
 * Node fill, where a node names none. Default `#ffffff`.
 */
node_bg: string
/**
 * Node border, where a node names no stroke. Default `#1f2937`.
 */
node_border: string
/**
 * Text, token and numeral fill, where a run names no colour. Default `#111827`.
 */
node_text: string
/**
 * Fallback for edge dots, separators, symbol swatches and a builtin marker on a gradient
 * stroke. Default `#374151`.
 */
arc_color: string
/**
 * Background behind an edge label (its halo or chip), where the label names none. Default
 * `#ffffff`.
 */
arc_label_bg: string
/**
 * Fill of a hollow edge dot. Default `#ffffff`.
 */
export_bg: string
}

export interface TreeOptions {
/**
 * Which way the tree grows. `TopBottom` puts the roots at the top, `LeftRight` on the left.
 * Defaults to `TopBottom`, unlike [`crate::LayoutOptions::direction`].
 */
direction?: ("leftright" | "topbottom")
/**
 * Clearance between the boxes of two neighbouring siblings, in px. Defaults to `28`.
 */
sibling_gap?: number
/**
 * Clearance between two nodes that face each other on the contours of different subtrees,
 * in px. Defaults to `28`.
 */
subtree_gap?: number
/**
 * Gap between two depth rows, on the axis the tree grows along, in px. Defaults to `56`.
 */
row_gap?: number
/**
 * Which row a node is drawn in. See [`LevelAlignment`].
 */
level_alignment?: "by_depth"
/**
 * How a parent-to-child edge is drawn. See [`TreeEdgeStyle`].
 */
edge_style?: ("straight" | "elbow")
}

export interface OcTypeGraphNode {
/**
 * Event type or object type.
 */
kind: ("event" | "object")
/**
 * The type's name.
 */
label: string
/**
 * How many events or objects have this type, shown under the name.
 */
count?: (number | null)
}
/**
 * A relation between two types, by their index in [`OcTypeGraph::nodes`]. One from an event type
 * is an E2O relation, one from an object type an O2O relation, which is drawn dashed.
 */

export interface OcTypeGraphEdge {
/**
 * Index of the source type.
 */
source: number
/**
 * Index of the target type.
 */
target: number
/**
 * The relation's qualifier, shown on the edge.
 */
qualifier?: (string | null)
}

export type OcdfgNodeRef = ({
kind: "start"
name: string
} | {
kind: "end"
name: string
} | {
kind: "activity"
name: string
})
/**
 * A node of a [`DirectlyFollowsGraph`] drawing, e.g., `{"kind": "activity", "name": "pay"}`.
 */

export interface AnnotationsFor_OcdfgNodeRef {
/**
 * By node, as one more line in the node.
 */
nodes: [OcdfgNodeRef, NodeAnnotation][]
/**
 * By edge.
 */
edges: [[string, DfgNodeRef, DfgNodeRef], EdgeAnnotation][]
}
/**
 * A line a node shows under its label, e.g., an average duration.
 */

export type OcpnNodeRef = ({
kind: "place"
index: number
} | {
kind: "transition"
index: number
})

/**
 * How an object-centric Petri net is turned into a [`Graph`].
 */

export interface AnnotationsFor_OcpnNodeRef {
/**
 * By node, as one more line in the node.
 */
nodes: [OcpnNodeRef, NodeAnnotation][]
/**
 * By edge.
 */
edges: [number, EdgeAnnotation][]
}
/**
 * A line a node shows under its label, e.g., an average duration.
 */

export interface PetriStyle {
base?: BaseStyle
/**
 * Fill of a silent transition.
 */
silent_fill?: string
/**
 * Color of the tokens and their counts.
 */
token?: string
}
/**
 * Colors and paddings shared with every other model.
 */

export type EventHash = number

/**
 * A partial order trace of [`Event`]s.
 * Contains all events of a trace and their particular partial relations.
 */

export interface Event {
/**
 * Event attributes
 */
attributes: Attribute[]
}

export interface EventLogClassifier {
/**
 * Name of the classifier
 */
name: string
/**
 * List of attribute keys to consider for the _class identity_
 */
keys: string[]
}

export type PetriNodeRef = ({
kind: "place"
index: PlaceID
} | {
kind: "transition"
index: TransitionID
})
/**
 * Id of a place, handed out by its [`PetriNet`] in creation order
 */

export interface AnnotationsFor_PetriNodeRef {
/**
 * By node, as one more line in the node.
 */
nodes: [PetriNodeRef, NodeAnnotation][]
/**
 * By edge.
 */
edges: [[PetriNodeRef, PetriNodeRef], EdgeAnnotation][]
}
/**
 * A line a node shows under its label, e.g., an average duration.
 */

export interface OperatorColors {
/**
 * Sequence.
 */
sequence?: string
/**
 * Exclusive choice.
 */
exclusive_choice?: string
/**
 * Concurrency.
 */
concurrency?: string
/**
 * Loop.
 */
loop_?: string
/**
 * Interleaving.
 */
interleaving?: string
/**
 * Inclusive choice.
 */
inclusive_choice?: string
}

export interface LogAlignments {
net: AcceptingPetriNet
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

export type output_id = (string | null)

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

export type VariantSort = ("Frequency" | "SlowestFirst" | "FastestFirst" | "LongestFirst" | "ShortestFirst")

export type CaseSort = ("LogOrder" | "FastestFirst" | "SlowestFirst")

export type Nullable_VariantTimeProfile = (VariantTimeProfile | null)

/**
 * Timing of one variant over all its cases, plus one page of those cases.
 */

export interface VariantTimingPage {
/**
 * Variants matching the query.
 */
total: number
/**
 * Variants among the timed cases.
 */
num_variants: number
num_timed_cases: number
/**
 * Cases with an untimed event, left out of all results.
 */
num_untimed_cases: number
rows: VariantSummary[]
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
 * Width of each bin in milliseconds, which is also the spacing of the bin centers.
 * 
 * Bins are keyed by their center, so one spans
 * `[center - bin_width_ms / 2, center + bin_width_ms / 2)`. `0` means there are no bins.
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

export interface Map_of_string {
[k: string]: string
}

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
 * One entry per mapping executed, in desugared blueprint order: the order the author wrote
 * the mappings in, with each ordered group expanded in place. Not execution order,
 * which is multi-pass and grouped by node. Each entry's [`MappingRef::path`] names the
 * authored entry.
 */
per_mapping: MappingStats[]
/**
 * Non-fatal problems collected while running: a policy configured to error
 * (`on_duplicate_object: Error`, `on_missing_endpoint: Error`), or an attribute type two
 * mappings disagreed on. Extraction continues past these. See [`ExtractionError`] for what
 * aborts it instead.
 * 
 * Capped at [`MAX_REPORTED_ERRORS`], with the remainder counted in
 * [`errors_suppressed`](Self::errors_suppressed).
 */
errors: ExtractionError[]
/**
 * Non-fatal problems the run hit past [`MAX_REPORTED_ERRORS`], which
 * [`errors`](Self::errors) therefore does not name. Zero for every run under the cap.
 */
errors_suppressed: number
/**
 * Rows every `Join`/`Union` materialization this run performed produced, summed across
 * materializations rather than peaked: an upper bound on peak buffered rows. A cached
 * materialization is counted once, when computed.
 * 
 * Zero when no mapping's node graph contains a `Join` or `Union`, since a pure
 * `Source -> Filter` chain streams. Zero is therefore a witness that the run streamed.
 */
rows_materialized: number
/**
 * Nodes whose source could have executed the whole node but the compiler declined to build
 * the query for, paired with the reason, and deduplicated per node.
 * 
 * Always safe, since the executor runs the node itself. Reported because falling back on a
 * `Join` is the one execution path whose memory grows with the data, so this explains a
 * non-zero [`rows_materialized`](Self::rows_materialized).
 */
pushdown_declined: PushdownDeclined[]
finalize: FinalizeReport
/**
 * Where the run's wall-clock time went.
 * 
 * `None` from [`extract`](super::extract::extract) itself, which is handed open providers
 * and cannot know what they cost to obtain. The runner that owns the connections fills this
 * in, as the `extraction-dbcon` bindings do. Also kept out of `extract` because
 * `std::time::Instant` panics on `wasm32-unknown-unknown`.
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

export interface EscapingEdgesOptions {
/**
 * Where the paths through the model come from
 */
log_paths?: ({
Aligned: {
options: AlignmentOptions
/**
 * Whether to align the variants that ran out of their memory share again, one at a time
 * with the whole budget (as [`align_variants_with_retry`] does). This can take long, and
 * they may still run out.
 */
retry_out_of_memory?: boolean
}
} | "ReplayUntilDeviation")
/**
 * How silent transitions take part
 */
silent_transitions?: ("Skip" | "AsActivities")
/**
 * How traces that end in a state count there
 */
trace_ends?: ("Ignore" | "Weigh" | "AsActivity")
/**
 * Whether to count escaping edges in the initial state. Without it, only the activities the
 * traces start with count as available there.
 */
count_escaping_edges_at_start?: boolean
/**
 * Whether an activity only counts as available if the final marking can still be reached
 * after it, so that the dead ends of an unsound net are not counted as allowed behavior
 */
exclude_dead_ends?: boolean
/**
 * Limit on the markings visited per search (following silent transitions, or checking that
 * the final marking can be reached). Reaching it can make the precision wrong in either
 * direction, see [`EscapingEdgesPrecision::search_limit_reached`].
 */
search_limit?: (number | null)
/**
 * Whether to return every escaping edge
 */
report_escaping_edges?: boolean
}
/**
 * How to align the variants
 */

export interface EscapingEdgesPrecision {
/**
 * Weighted share of available behavior that the log takes, `1.0` if nothing is available
 */
precision: number
/**
 * Sum over all states of their weight times the number of available activities
 */
weighted_available: number
/**
 * Sum over all states of their weight times the number of escaping edges
 */
weighted_escaping: number
/**
 * Number of states with a positive weight
 */
num_states: number
/**
 * Traces left out because their alignment failed (e.g., a search limit was reached, or the
 * trace is too long)
 */
unaligned_traces: number
/**
 * Traces only measured up to the first step the model could not follow (a deviation, or a
 * search stopped at `search_limit`)
 */
truncated_traces: number
/**
 * Whether a search stopped at `search_limit` somewhere, which can make `precision` too high
 * (fewer activities available after silent transitions) or too low (a dead end counted as
 * completing)
 */
search_limit_reached: boolean
/**
 * Every escaping edge, if `report_escaping_edges` was set
 */
escaping_edges?: (EscapingEdge[] | null)
}
/**
 * An activity (or transition) the model allows in a state, but no trace takes there
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
 * A directly-follows graph of [`Activity`]s, with its start and end activities.
 * Activities and directly-follows relations are annotated with their frequency, and start and
 * end activities with how many traces start or end with them.
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

export type InductiveMinerVariant = ("IM" | "IMf" | "IMa" | "IMd" | "IMfd")

export type InductiveMinerPreset = ("default" | "thesis" | "prom" | "pm4py")

export type InductiveMiner = ((InductiveMinerOptions & {
kind: "log"
}) | (InductiveMinerDfgOptions & {
kind: "dfg"
}))

/**
 * Settings of the Inductive Miner. Each constructor sets up one variant:
 * - [`default`](Self::default): IM
 * - [`imf`](Self::imf): `IMf` with the given noise threshold
 * - [`ima`](Self::ima): IM with the cuts of `IMa`
 * - [`im_thesis`](Self::im_thesis) and [`imf_thesis`](Self::imf_thesis): IM and `IMf` as
 *   published, without the refinements of this implementation
 * - [`prom`](Self::prom) and [`pm4py`](Self::pm4py): the settings closest to those tools
 * 
 * Fields missing in JSON take their default value.
 */

export interface Operator {
/**
 * The [`OperatorType`] of the tree itself
 */
operator_type: ("Sequence" | "ExclusiveChoice" | "Concurrency" | "Loop" | "Interleaving" | "InclusiveChoice")
/**
 * The children nodes of the operator node
 */
children: Node[]
}

export interface ProcessTree {
/**
 * The root of the object-centric process tree
 */
root: Node
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
 * Object types to use for the discovery. If this is `None`, all object types of the OCEL are used
 * 
 * An object-to-object association is only used if both of its object types are selected.
 */
object_types_to_use?: (string[] | null)
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

export type OCDeclareReductionMode = ("None" | "Lossless" | "Lossy")

export interface OcpnDiscoveryOptions {
/**
 * How the Petri net of each object type is discovered from its flattened log. The
 * [DFG variant](InductiveMiner::Dfg) reads each log once, which suits large logs.
 */
miner?: ((InductiveMinerOptions & {
kind: "log"
}) | (InductiveMinerDfgOptions & {
kind: "dfg"
}))
/**
 * Object types to discover a net for. If this is `None`, every object type of the log is used.
 * 
 * Each type's net and variable arcs are discovered independently, so leaving a type out does
 * not change the nets of the others.
 */
object_types_to_use?: (string[] | null)
/**
 * Activities to keep. If this is `None`, every activity is kept.
 * 
 * The other activities' events are removed from each flattened log before mining, so the
 * nets describe the log without them. An object left without events adds no trace.
 */
activities_to_use?: (string[] | null)
/**
 * Fraction of an activity's executions that may involve other than exactly one object of a
 * type while its arc to that type still counts as normal.
 * 
 * The default `0.0` is the strict reading. A small tolerance keeps data-quality noise from
 * making arcs variable.
 */
variable_arc_tolerance?: number
}
/**
 * Settings of the Inductive Miner. Each constructor sets up one variant:
 * - [`default`](Self::default): IM
 * - [`imf`](Self::imf): `IMf` with the given noise threshold
 * - [`ima`](Self::ima): IM with the cuts of `IMa`
 * - [`im_thesis`](Self::im_thesis) and [`imf_thesis`](Self::imf_thesis): IM and `IMf` as
 *   published, without the refinements of this implementation
 * - [`prom`](Self::prom) and [`pm4py`](Self::pm4py): the settings closest to those tools
 * 
 * Fields missing in JSON take their default value.
 */

export interface ObjectCentricPetriNetJson {
/**
 * The places, each belonging to one object type.
 */
places: JsonPlace[]
/**
 * The transitions, each appearing once even when several object types share it.
 */
transitions: JsonTransition[]
/**
 * The arcs, each between a place and a transition.
 */
arcs: JsonArc[]
/**
 * Tokens per place at the start, by place name.
 */
initial_marking: {
[k: string]: number
}
/**
 * Tokens per place at the end, by place name.
 */
final_marking: {
[k: string]: number
}
}
/**
 * A place of one object type.
 */

export interface DfgBuildOptions {
/**
 * Flow direction. `None` is the model's own default.
 */
direction?: (Direction | null)
/**
 * Fields of the engine options to change, as a partial
 * [`LayoutOptions`](graphlay::LayoutOptions) object deep-merged over the model's preset and
 * the direction, e.g., `{"routing": {"style": "diagonal"}}`. `null` changes nothing.
 */
layout_patch?: (LayoutOptions | null)
/**
 * Draw the artificial START / END terminals. On by default.
 */
terminals?: boolean
annotations?: AnnotationsFor_DfgNodeRef
}
/**
 * Everything that steers one layout run.
 */

export interface Layout {
/**
 * One entry per input node, in [`crate::NodeId`] order.
 */
nodes: Placement[]
/**
 * One entry per input edge, in [`crate::EdgeId`] order.
 */
edges: EdgeRoute[]
bounds: Rect
/**
 * Number of layers in a layered drawing, or of depth rows in a tidy tree. `0` for an empty
 * graph.
 */
layer_count: number
/**
 * Edges the layering saw the other way round: Those the cycle breaker reversed, plus those
 * with [`crate::Edge::reverse_for_ranking`] (an edge that is both is not listed). Their
 * polylines still run source to target.
 */
reversed: EdgeId[]
stats: LayoutStats
/**
 * Where a merged edge branches off a shared trunk ([`crate::Routing::merge_edges`]), for a
 * renderer to mark with a dot. Empty unless edges were merged.
 */
junctions?: Point1[]
/**
 * The swimlanes of a drawing with [`crate::GroupLanes::Strict`] lanes, in order along the
 * order axis. Empty otherwise.
 */
lanes?: Lane[]
}
/**
 * Where one node ended up.
 */

export interface ModelLayoutRequest {
request: LayoutRequest
/**
 * The model element behind each graph node.
 */
nodes: DfgNodeRef[]
/**
 * The model element behind each graph edge.
 */
edges: DfgEdgeRef[]
}
/**
 * The graph, preset and options patch, for the engine.
 */

export interface DfgStyle {
base?: BaseStyle
/**
 * Fill of the START terminal.
 */
start_fill?: string
/**
 * Fill of the END terminal.
 */
end_fill?: string
}
/**
 * Colors and paddings shared with every other model.
 */

export interface StyleOverrides {
/**
 * By node index.
 */
nodes?: {
[k: string]: ElementStyle
}
/**
 * By edge index.
 */
edges?: {
[k: string]: ElementStyle
}
}
/**
 * A change to how one node or edge is drawn, e.g., to highlight, dim or annotate it.
 * 
 * This interface was referenced by `undefined`'s JSON-Schema definition
 * via the `patternProperty` "^\d+$".
 * 
 * This interface was referenced by `undefined`'s JSON-Schema definition
 * via the `patternProperty` "^\d+$".
 */

export interface Scene {
/**
 * Colour of a rectangle filling the whole view box, padding included. `None` leaves the
 * background transparent.
 */
background?: (string | null)
/**
 * Space kept around the scene's bounding box.
 */
padding?: number
/**
 * User `<defs>` content, emitted verbatim.
 */
defs?: RawSvg[]
/**
 * Reusable fragments, emitted whether or not anything uses them.
 */
symbols?: SymbolDef[]
/**
 * Custom markers, for [`MarkerRef::Custom`].
 */
markers?: MarkerDef[]
/**
 * The nodes, painted in list order.
 */
nodes?: SceneNode[]
/**
 * The edges, painted in list order.
 */
edges?: SceneEdge[]
/**
 * Fragments and panels drawn under or over the graph.
 */
overlays?: Overlay[]
/**
 * Whether edges are painted under or over the nodes.
 */
order?: ("edges_under_nodes" | "edges_over_nodes")
attrs?: Attrs19
font?: FontSpec
}
/**
 * Raw SVG the caller vouches for, emitted verbatim exactly once.
 * 
 * `bounds` is mandatory because the renderer cannot parse the markup. It is the only way the
 * fragment takes part in [`Scene::bounds`].
 */

export type Nullable_Palette = (Palette | null)

/**
 * The six colours every drawable falls back to.
 * 
 * Pass the on-screen theme's resolved colours here so an export matches the screen.
 */

export interface TreeRequest {
graph?: Graph
options?: TreeOptions
}
/**
 * The rooted tree or forest to lay out.
 */

export interface OCDeclareBuildOptions {
/**
 * Flow direction. `None` is the model's own default.
 */
direction?: (Direction | null)
/**
 * Fields of the engine options to change, as a partial
 * [`LayoutOptions`](graphlay::LayoutOptions) object deep-merged over the model's preset and
 * the direction, e.g., `{"routing": {"style": "diagonal"}}`. `null` changes nothing.
 */
layout_patch?: (LayoutOptions | null)
/**
 * Widen each activity box to fit its label.
 */
fit_node_width?: boolean
/**
 * Rank EP and DP arcs backwards, so the drawing reads forwards in time.
 */
reverse_backward_arcs?: boolean
/**
 * Merge an EF (DF) arc and an EP (DP) arc mirroring it with the same object types into one
 * edge, which shows the EF (DF) arc's count bounds.
 */
merge_mirrored_arcs?: boolean
/**
 * How the arcs show their object types.
 */
labels?: ("names" | "dots")
/**
 * Per activity, how many objects of each type one of its events involves, shown under its
 * name.
 */
involvements?: {
[k: string]: {
[k: string]: ObjectInvolvementCounts
}
}
/**
 * Activities that become nodes even if no arc connects them, e.g., one just added in an
 * editor.
 */
extra_activities?: string[]
}
/**
 * Everything that steers one layout run.
 */

export interface OCDeclareStyle {
base?: BaseStyle
/**
 * Draw the activities in the base node colors instead of tinting each one.
 */
plain_activities?: boolean
/**
 * How far towards white an activity's color is washed for its fill.
 */
fill_lightness?: number
/**
 * Color of the markers, and of an arc that names no object type.
 */
marker?: string
/**
 * Width of an arc's line.
 */
arc_width?: number
/**
 * Side of a marker's box.
 */
marker_size?: number
}
/**
 * Colors and paddings shared with every other model.
 */

export interface OcTypeGraph {
/**
 * The event types and object types.
 */
nodes: OcTypeGraphNode[]
/**
 * The E2O and O2O relations, one per source type, target type and qualifier.
 */
edges: OcTypeGraphEdge[]
}
/**
 * An event type or object type.
 */

export interface OcTypeGraphBuildOptions {
/**
 * Flow direction. `None` is the model's own default.
 */
direction?: (Direction | null)
/**
 * Fields of the engine options to change, as a partial
 * [`LayoutOptions`](graphlay::LayoutOptions) object deep-merged over the model's preset and
 * the direction, e.g., `{"routing": {"style": "diagonal"}}`. `null` changes nothing.
 */
layout_patch?: (LayoutOptions | null)
}
/**
 * Everything that steers one layout run.
 */

export interface OcTypeGraphStyle {
base?: BaseStyle
/**
 * How far towards white a type's color is washed for its fill.
 */
fill_lightness?: number
/**
 * Width of a relation's line.
 */
edge_width?: number
/**
 * Dash pattern of an O2O relation.
 */
o2o_dash?: string
}
/**
 * Colors and paddings shared with every other model.
 */

export interface OcdfgBuildOptions {
/**
 * Flow direction. `None` is the model's own default.
 */
direction?: (Direction | null)
/**
 * Fields of the engine options to change, as a partial
 * [`LayoutOptions`](graphlay::LayoutOptions) object deep-merged over the model's preset and
 * the direction, e.g., `{"routing": {"style": "diagonal"}}`. `null` changes nothing.
 */
layout_patch?: (LayoutOptions | null)
/**
 * Draw each object type's START / END terminals. On by default.
 */
terminals?: boolean
/**
 * Object types to draw, in this order. Empty draws all of them, by name.
 */
object_types?: string[]
annotations?: AnnotationsFor_OcdfgNodeRef
}
/**
 * Everything that steers one layout run.
 */

export interface OcdfgStyle {
base?: BaseStyle
/**
 * How far towards white an object type's color is washed for the play or stop mark on its
 * START and END terminals.
 */
fill_lightness?: number
}
/**
 * Colors and paddings shared with every other model.
 */

export interface OcpnBuildOptions {
/**
 * Flow direction. `None` is the model's own default.
 */
direction?: (Direction | null)
/**
 * Fields of the engine options to change, as a partial
 * [`LayoutOptions`](graphlay::LayoutOptions) object deep-merged over the model's preset and
 * the direction, e.g., `{"routing": {"style": "diagonal"}}`. `null` changes nothing.
 */
layout_patch?: (LayoutOptions | null)
annotations?: AnnotationsFor_OcpnNodeRef
}
/**
 * Everything that steers one layout run.
 */

export interface OcpnStyle {
petri?: PetriStyle
/**
 * How far towards white a place's fill is from its object type's color.
 */
place_fill_lightness?: number
/**
 * Line width of a variable arc. The layout keeps room for the default width.
 */
variable_arc_width?: number
/**
 * SVG dash pattern of a variable arc, e.g., `"6 3"`. Empty draws it solid.
 */
variable_arc_dash?: string
}
/**
 * Transitions, silent transitions, markings and the colors shared with every other model.
 */

export type AttributeValue = ({
type: "String"
content: string
} | {
type: "Date"
content: string
} | {
type: "Int"
content: number
} | {
type: "Float"
content: number
} | {
type: "Boolean"
content: boolean
} | {
type: "ID"
content: string
} | {
type: "List"
content: Attribute[]
} | {
type: "Container"
content: Attribute[]
} | {
type: "None"
/**
 * @maxItems 0
 */
content: []
})

export interface Attribute {
/**
 * Attribute key
 */
key: string
/**
 * Attribute value
 */
value: AttributeValue
/**
 * Child attributes (nested)
 */
own_attributes?: (Attribute[] | null)
}

export interface PartialOrderTrace {
/**
 * Trace-level attributes
 */
attributes: Attribute[]
/**
 * A mapping from an [`Event`]'s hash value [`EventHash`] to the [`Event`] itself.
 */
event_map: {
[k: string]: Event
}
/**
 * The partial relations between the [`Event`]s contained in the [`PartialOrderTrace`].
 */
partial_relations: [EventHash, EventHash][]
}
/**
 * An event consists of multiple (event) attributes ([Attributes])
 * 
 * This interface was referenced by `undefined`'s JSON-Schema definition
 * via the `patternProperty` "^\d+$".
 */

export interface PartialOrderBuildOptions {
/**
 * Flow direction. `None` is the model's own default.
 */
direction?: (Direction | null)
/**
 * Fields of the engine options to change, as a partial
 * [`LayoutOptions`](graphlay::LayoutOptions) object deep-merged over the model's preset and
 * the direction, e.g., `{"routing": {"style": "diagonal"}}`. `null` changes nothing.
 */
layout_patch?: (LayoutOptions | null)
classifier?: EventLogClassifier
}
/**
 * Everything that steers one layout run.
 */

export interface PartialOrderStyle {
base?: BaseStyle
}
/**
 * Colors and paddings shared with every other model.
 */

export interface PetriBuildOptions {
/**
 * Flow direction. `None` is the model's own default.
 */
direction?: (Direction | null)
/**
 * Fields of the engine options to change, as a partial
 * [`LayoutOptions`](graphlay::LayoutOptions) object deep-merged over the model's preset and
 * the direction, e.g., `{"routing": {"style": "diagonal"}}`. `null` changes nothing.
 */
layout_patch?: (LayoutOptions | null)
annotations?: AnnotationsFor_PetriNodeRef
}
/**
 * Everything that steers one layout run.
 */

export interface ProcessTreeBuildOptions {
/**
 * Which way the tree grows. `None` means top to bottom.
 */
direction?: (Direction | null)
/**
 * How the tree is drawn. It also sets the node sizes and gaps.
 */
look?: ("classic" | "color_coded")
/**
 * Fields of the tidy-tree options to change, as a partial [`TreeOptions`] object deep-merged
 * over [`ProcessTreeBuildOptions::tree_options`], e.g., `{"row_gap": 60}`. `null` changes
 * nothing.
 */
layout_patch?: (TreeOptions | null)
}
/**
 * What steers a tidy-tree layout.
 */

export interface ProcessTreeStyle {
base?: BaseStyle
/**
 * Fill of an operator circle in the classic look.
 */
operator_fill?: string
/**
 * Color of the operator symbol in the classic look.
 */
operator_text?: string
/**
 * Point size of the operator symbol in the classic look.
 */
operator_symbol_size?: number
/**
 * Fill of a leaf box in the classic look.
 */
leaf_fill?: string
/**
 * Fill of a silent leaf in the classic look.
 */
silent_fill?: string
/**
 * Color of a silent leaf's tau in the color-coded look.
 */
silent_text?: string
operator_colors?: OperatorColors
}
/**
 * Colors and paddings shared with every other model.
 */

export interface Bindings {
  "app_bindings::alignments::align_event_log": { args: {
    "event_log": EventLogHandle;
    "net": AcceptingPetriNet;
    }; ret: LogAlignments };
  "app_bindings::alphappp_auto": { args: {
    "log_proj": EventLogActivityProjectionHandle;
    }; ret: AcceptingPetriNet };
  "app_bindings::app_ping": { args: {}; ret: string };
  "app_bindings::discover_petri_net": { args: {
    "event_log": EventLogHandle;
    }; ret: AcceptingPetriNet };
  "app_bindings::event_log::event_log_from_activities": { args: {
    "traces": string[][];
    "output_id"?: output_id;
    }; ret: EventLogHandle };
  "app_bindings::event_log::event_log_from_json": { args: {
    "log": EventLogInput;
    "output_id"?: output_id;
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
    "output_id"?: output_id;
    }; ret: SlimLinkedOCELHandle };
  "app_bindings::ocel::ocel_from_oc_sim_trace": { args: {
    "trace": OcSimTraceStep[];
    "output_id"?: output_id;
    }; ret: SlimLinkedOCELHandle };
  "app_bindings::ocel::ocel_to_json": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: OcelInput };
  "app_bindings::petri_net_io::export_petri_net_pnml": { args: {
    "net": AcceptingPetriNet;
    }; ret: string };
  "app_bindings::transforms::apply_event_log_transforms": { args: {
    "event_log": EventLogHandle;
    "transforms": Transform[];
    "output_id"?: output_id;
    }; ret: EventLogHandle };
  "app_bindings::transforms::apply_ocel_transforms": { args: {
    "ocel": SlimLinkedOCELHandle;
    "transforms": Transform[];
    "output_id"?: output_id;
    }; ret: SlimLinkedOCELHandle };
  "app_bindings::variant_timing::get_variant_time_profile": { args: {
    "event_log": EventLogHandle;
    "activities": string[];
    "variant_sort": VariantSort;
    "case_query": string;
    "case_sort": CaseSort;
    "case_offset": number;
    "case_limit": number;
    "focus_case": Nullable_string;
    }; ret: Nullable_VariantTimeProfile };
  "app_bindings::variant_timing::get_variant_timing_page": { args: {
    "event_log": EventLogHandle;
    "query": string;
    "sort": VariantSort;
    "offset": number;
    "limit": number;
    }; ret: VariantTimingPage };
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
  "process_mining::bindings::extraction_bindings::extraction_column_domain_items": { args: {
    "sources": Map_of_string;
    "source_id": string;
    "table": string;
    "column": string;
    }; ret: string[] };
  "process_mining::bindings::extraction_bindings::extraction_compile": { args: {
    "blueprint": Blueprint;
    "catalog": ExtractionCatalog;
    "shape": EmissionShape;
    "dialect"?: SqlDialect;
    }; ret: CompiledOcel };
  "process_mining::bindings::extraction_bindings::extraction_discover_catalog_items": { args: {
    "sources": Map_of_string;
    }; ret: ExtractionCatalog };
  "process_mining::bindings::extraction_bindings::extraction_run_items": { args: {
    "blueprint": Blueprint;
    "sources": Map_of_string;
    "catalog"?: Nullable_ExtractionCatalog;
    "output_id"?: output_id;
    }; ret: SlimLinkedOCELHandle };
  "process_mining::bindings::extraction_bindings::extraction_table_preview_items": { args: {
    "sources": Map_of_string;
    "source_id": string;
    "table": string;
    "limit"?: Nullable_uint;
    }; ret: TablePreview };
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
  "process_mining::bindings::extraction_dbcon_bindings::extraction_connection_kinds": { args: {}; ret: string[] };
  "process_mining::bindings::extraction_dbcon_bindings::extraction_discover_catalog": { args: {
    "connections": Map_of_string;
    }; ret: ExtractionCatalog };
  "process_mining::bindings::extraction_dbcon_bindings::extraction_run": { args: {
    "ocel": SlimLinkedOCELHandle;
    "blueprint": Blueprint;
    "connections": Map_of_string;
    "catalog"?: Nullable_ExtractionCatalog;
    }; ret: ExtractionReport };
  "process_mining::bindings::extraction_dbcon_bindings::extraction_table_preview": { args: {
    "connections": Map_of_string;
    "source_id": string;
    "table": string;
    "limit"?: Nullable_uint;
    }; ret: TablePreview };
  "process_mining::bindings::index_link_ocel": { args: {
    "ocel": OCELHandle;
    "output_id"?: output_id;
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
    "output_id"?: output_id;
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
    "output_id"?: output_id;
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
  "process_mining::bindings::slim_ocel_bindings::locel_new": { args: {
    "output_id"?: output_id;
    }; ret: SlimLinkedOCELHandle };
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
    "net": AcceptingPetriNet;
    "options"?: AlignmentOptions;
    }; ret: AlignmentResult };
  "process_mining::conformance::case_centric::alignments::align_trace_binding": { args: {
    "net": AcceptingPetriNet;
    "trace": string[];
    "options"?: AlignmentOptions;
    }; ret: AlignmentResult };
  "process_mining::conformance::case_centric::alignments::align_variants": { args: {
    "net": AcceptingPetriNet;
    "projection": EventLogActivityProjectionHandle;
    "options"?: AlignmentOptions;
    }; ret: VariantAlignmentResult[] };
  "process_mining::conformance::case_centric::alignments::align_variants_with_retry": { args: {
    "net": AcceptingPetriNet;
    "projection": EventLogActivityProjectionHandle;
    "options"?: AlignmentOptions;
    }; ret: VariantAlignmentResult[] };
  "process_mining::conformance::case_centric::alignments::compute_fitness": { args: {
    "align_res": VariantAlignmentResult[];
    "net": AcceptingPetriNet;
    "options"?: AlignmentOptions;
    }; ret: FitnessResult };
  "process_mining::conformance::case_centric::precision::escaping_edges_precision": { args: {
    "net": AcceptingPetriNet;
    "log": EventLogActivityProjectionHandle;
    "options"?: EscapingEdgesOptions;
    }; ret: EscapingEdgesPrecision };
  "process_mining::conformance::case_centric::precision::escaping_edges_precision_from_alignments": { args: {
    "net": AcceptingPetriNet;
    "alignments": VariantAlignmentResult[];
    "options"?: EscapingEdgesOptions;
    }; ret: EscapingEdgesPrecision };
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
    "output_id"?: output_id;
    }; ret: EventLogActivityProjectionHandle };
  "process_mining::core::event_data::object_centric::utils::flatten::flatten_ocel_on": { args: {
    "ocel": SlimLinkedOCELHandle;
    "object_type": string;
    "output_id"?: output_id;
    }; ret: EventLogHandle };
  "process_mining::core::event_data::object_centric::utils::init_exit_events::add_init_exit_events_to_ocel": { args: {
    "ocel": OCEL;
    "output_id"?: output_id;
    }; ret: OCELHandle };
  "process_mining::core::process_models::object_centric::ocdfg::object_centric_dfg_struct::discover_dfg_from_slim_ocel": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: OCDirectlyFollowsGraph };
  "process_mining::discovery::case_centric::alphappp::full::discover_alphappp_net": { args: {
    "log": EventLogActivityProjectionHandle;
    "config"?: AlphaPPPConfig;
    }; ret: AcceptingPetriNet };
  "process_mining::discovery::case_centric::dfg::discover_dfg": { args: {
    "event_log": EventLogHandle;
    }; ret: DirectlyFollowsGraph };
  "process_mining::discovery::case_centric::inductive_miner::discover_inductive_net": { args: {
    "log": EventLogActivityProjectionHandle;
    "variant"?: InductiveMinerVariant;
    "noise_threshold"?: number;
    "preset"?: InductiveMinerPreset;
    }; ret: AcceptingPetriNet };
  "process_mining::discovery::case_centric::inductive_miner::discover_inductive_net_with": { args: {
    "log": EventLogActivityProjectionHandle;
    "miner"?: InductiveMiner;
    }; ret: AcceptingPetriNet };
  "process_mining::discovery::case_centric::inductive_miner::discover_inductive_tree": { args: {
    "log": EventLogActivityProjectionHandle;
    "variant"?: InductiveMinerVariant;
    "noise_threshold"?: number;
    "preset"?: InductiveMinerPreset;
    }; ret: ProcessTree };
  "process_mining::discovery::case_centric::inductive_miner::discover_inductive_tree_with": { args: {
    "log": EventLogActivityProjectionHandle;
    "miner"?: InductiveMiner;
    }; ret: ProcessTree };
  "process_mining::discovery::case_centric::inductive_miner::inductive_miner_options": { args: {
    "variant": InductiveMinerVariant;
    "preset"?: InductiveMinerPreset;
    "noise_threshold"?: number;
    }; ret: InductiveMiner };
  "process_mining::discovery::object_centric::dfg::get_dfg_of_object_type": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob_type": string;
    }; ret: [[string, string], number][] };
  "process_mining::discovery::object_centric::oc_declare::discover_behavior_constraints": { args: {
    "locel": SlimLinkedOCELHandle;
    "options"?: OCDeclareDiscoveryOptions;
    }; ret: OCDeclareArc[] };
  "process_mining::discovery::object_centric::oc_declare::project_oc_arcs": { args: {
    "arcs": OCDeclareArc[];
    "activities": string[];
    "reduction": OCDeclareReductionMode;
    }; ret: OCDeclareArc[] };
  "process_mining::discovery::object_centric::oc_declare::reduce_oc_arcs": { args: {
    "arcs": OCDeclareArc[];
    "lossless": boolean;
    }; ret: OCDeclareArc[] };
  "process_mining::discovery::object_centric::ocpn::discover_ocpn": { args: {
    "locel": SlimLinkedOCELHandle;
    "options"?: OcpnDiscoveryOptions;
    }; ret: ObjectCentricPetriNetJson };
  "process_mining::discovery::object_centric::variants::get_variants_of_object_type": { args: {
    "ocel": SlimLinkedOCELHandle;
    "ob_type": string;
    }; ret: [string[], number][] };
  "process_mining::visualization::bindings::dfg_layout": { args: {
    "dfg": DirectlyFollowsGraph;
    "options"?: DfgBuildOptions;
    }; ret: Layout };
  "process_mining::visualization::bindings::dfg_layout_request": { args: {
    "dfg": DirectlyFollowsGraph;
    "options"?: DfgBuildOptions;
    }; ret: ModelLayoutRequest };
  "process_mining::visualization::bindings::dfg_scene_from_layout": { args: {
    "dfg": DirectlyFollowsGraph;
    "layout": Layout;
    "options"?: DfgBuildOptions;
    "style"?: DfgStyle;
    "overrides"?: StyleOverrides;
    }; ret: Scene };
  "process_mining::visualization::bindings::dfg_svg": { args: {
    "dfg": DirectlyFollowsGraph;
    "options"?: DfgBuildOptions;
    "style"?: DfgStyle;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::dfg_svg_from_layout": { args: {
    "dfg": DirectlyFollowsGraph;
    "layout": Layout;
    "options"?: DfgBuildOptions;
    "style"?: DfgStyle;
    "overrides"?: StyleOverrides;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::layout_graph": { args: {
    "request": LayoutRequest;
    }; ret: Layout };
  "process_mining::visualization::bindings::layout_tree": { args: {
    "request": TreeRequest;
    }; ret: Layout };
  "process_mining::visualization::bindings::oc_declare_involvements": { args: {
    "locel": SlimLinkedOCELHandle;
    }; ret: Map_of_Map_of_ObjectInvolvementCounts };
  "process_mining::visualization::bindings::oc_declare_layout": { args: {
    "arcs": OCDeclareArc[];
    "options"?: OCDeclareBuildOptions;
    }; ret: Layout };
  "process_mining::visualization::bindings::oc_declare_layout_request": { args: {
    "arcs": OCDeclareArc[];
    "options"?: OCDeclareBuildOptions;
    }; ret: ModelLayoutRequest };
  "process_mining::visualization::bindings::oc_declare_scene_from_layout": { args: {
    "arcs": OCDeclareArc[];
    "layout": Layout;
    "options"?: OCDeclareBuildOptions;
    "style"?: OCDeclareStyle;
    "overrides"?: StyleOverrides;
    }; ret: Scene };
  "process_mining::visualization::bindings::oc_declare_svg": { args: {
    "arcs": OCDeclareArc[];
    "options"?: OCDeclareBuildOptions;
    "style"?: OCDeclareStyle;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::oc_declare_svg_from_layout": { args: {
    "arcs": OCDeclareArc[];
    "layout": Layout;
    "options"?: OCDeclareBuildOptions;
    "style"?: OCDeclareStyle;
    "overrides"?: StyleOverrides;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::oc_type_graph_from_ocel": { args: {
    "ocel": SlimLinkedOCELHandle;
    }; ret: OcTypeGraph };
  "process_mining::visualization::bindings::oc_type_graph_layout": { args: {
    "graph": OcTypeGraph;
    "options"?: OcTypeGraphBuildOptions;
    }; ret: Layout };
  "process_mining::visualization::bindings::oc_type_graph_layout_request": { args: {
    "graph": OcTypeGraph;
    "options"?: OcTypeGraphBuildOptions;
    }; ret: ModelLayoutRequest };
  "process_mining::visualization::bindings::oc_type_graph_scene_from_layout": { args: {
    "graph": OcTypeGraph;
    "layout": Layout;
    "options"?: OcTypeGraphBuildOptions;
    "style"?: OcTypeGraphStyle;
    "overrides"?: StyleOverrides;
    }; ret: Scene };
  "process_mining::visualization::bindings::oc_type_graph_svg": { args: {
    "graph": OcTypeGraph;
    "options"?: OcTypeGraphBuildOptions;
    "style"?: OcTypeGraphStyle;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::oc_type_graph_svg_from_layout": { args: {
    "graph": OcTypeGraph;
    "layout": Layout;
    "options"?: OcTypeGraphBuildOptions;
    "style"?: OcTypeGraphStyle;
    "overrides"?: StyleOverrides;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::ocdfg_layout": { args: {
    "ocdfg": OCDirectlyFollowsGraph;
    "options"?: OcdfgBuildOptions;
    }; ret: Layout };
  "process_mining::visualization::bindings::ocdfg_layout_request": { args: {
    "ocdfg": OCDirectlyFollowsGraph;
    "options"?: OcdfgBuildOptions;
    }; ret: ModelLayoutRequest };
  "process_mining::visualization::bindings::ocdfg_scene_from_layout": { args: {
    "ocdfg": OCDirectlyFollowsGraph;
    "layout": Layout;
    "options"?: OcdfgBuildOptions;
    "style"?: OcdfgStyle;
    "overrides"?: StyleOverrides;
    }; ret: Scene };
  "process_mining::visualization::bindings::ocdfg_svg": { args: {
    "ocdfg": OCDirectlyFollowsGraph;
    "options"?: OcdfgBuildOptions;
    "style"?: OcdfgStyle;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::ocdfg_svg_from_layout": { args: {
    "ocdfg": OCDirectlyFollowsGraph;
    "layout": Layout;
    "options"?: OcdfgBuildOptions;
    "style"?: OcdfgStyle;
    "overrides"?: StyleOverrides;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::ocpn_layout": { args: {
    "ocpn": ObjectCentricPetriNetJson;
    "options"?: OcpnBuildOptions;
    }; ret: Layout };
  "process_mining::visualization::bindings::ocpn_layout_request": { args: {
    "ocpn": ObjectCentricPetriNetJson;
    "options"?: OcpnBuildOptions;
    }; ret: ModelLayoutRequest };
  "process_mining::visualization::bindings::ocpn_scene_from_layout": { args: {
    "ocpn": ObjectCentricPetriNetJson;
    "layout": Layout;
    "options"?: OcpnBuildOptions;
    "style"?: OcpnStyle;
    "overrides"?: StyleOverrides;
    }; ret: Scene };
  "process_mining::visualization::bindings::ocpn_svg": { args: {
    "ocpn": ObjectCentricPetriNetJson;
    "options"?: OcpnBuildOptions;
    "style"?: OcpnStyle;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::ocpn_svg_from_layout": { args: {
    "ocpn": ObjectCentricPetriNetJson;
    "layout": Layout;
    "options"?: OcpnBuildOptions;
    "style"?: OcpnStyle;
    "overrides"?: StyleOverrides;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::partial_order_layout": { args: {
    "trace": PartialOrderTrace;
    "options"?: PartialOrderBuildOptions;
    }; ret: Layout };
  "process_mining::visualization::bindings::partial_order_layout_request": { args: {
    "trace": PartialOrderTrace;
    "options"?: PartialOrderBuildOptions;
    }; ret: ModelLayoutRequest };
  "process_mining::visualization::bindings::partial_order_scene_from_layout": { args: {
    "trace": PartialOrderTrace;
    "layout": Layout;
    "options"?: PartialOrderBuildOptions;
    "style"?: PartialOrderStyle;
    "overrides"?: StyleOverrides;
    }; ret: Scene };
  "process_mining::visualization::bindings::partial_order_svg": { args: {
    "trace": PartialOrderTrace;
    "options"?: PartialOrderBuildOptions;
    "style"?: PartialOrderStyle;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::partial_order_svg_from_layout": { args: {
    "trace": PartialOrderTrace;
    "layout": Layout;
    "options"?: PartialOrderBuildOptions;
    "style"?: PartialOrderStyle;
    "overrides"?: StyleOverrides;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::petri_net_layout": { args: {
    "net": AcceptingPetriNet;
    "options"?: PetriBuildOptions;
    }; ret: Layout };
  "process_mining::visualization::bindings::petri_net_layout_request": { args: {
    "net": AcceptingPetriNet;
    "options"?: PetriBuildOptions;
    }; ret: ModelLayoutRequest };
  "process_mining::visualization::bindings::petri_net_scene_from_layout": { args: {
    "net": AcceptingPetriNet;
    "layout": Layout;
    "options"?: PetriBuildOptions;
    "style"?: PetriStyle;
    "overrides"?: StyleOverrides;
    }; ret: Scene };
  "process_mining::visualization::bindings::petri_net_svg": { args: {
    "net": AcceptingPetriNet;
    "options"?: PetriBuildOptions;
    "style"?: PetriStyle;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::petri_net_svg_from_layout": { args: {
    "net": AcceptingPetriNet;
    "layout": Layout;
    "options"?: PetriBuildOptions;
    "style"?: PetriStyle;
    "overrides"?: StyleOverrides;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::process_tree_layout": { args: {
    "tree": ProcessTree;
    "options"?: ProcessTreeBuildOptions;
    }; ret: Layout };
  "process_mining::visualization::bindings::process_tree_layout_request": { args: {
    "tree": ProcessTree;
    "options"?: ProcessTreeBuildOptions;
    }; ret: ModelLayoutRequest };
  "process_mining::visualization::bindings::process_tree_scene_from_layout": { args: {
    "tree": ProcessTree;
    "layout": Layout;
    "options"?: ProcessTreeBuildOptions;
    "style"?: ProcessTreeStyle;
    "overrides"?: StyleOverrides;
    }; ret: Scene };
  "process_mining::visualization::bindings::process_tree_svg": { args: {
    "tree": ProcessTree;
    "options"?: ProcessTreeBuildOptions;
    "style"?: ProcessTreeStyle;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::process_tree_svg_from_layout": { args: {
    "tree": ProcessTree;
    "layout": Layout;
    "options"?: ProcessTreeBuildOptions;
    "style"?: ProcessTreeStyle;
    "overrides"?: StyleOverrides;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::render_scene_svg": { args: {
    "scene": Scene;
    "palette"?: Nullable_Palette;
    }; ret: string };
  "process_mining::visualization::bindings::reroute_graph": { args: {
    "request": LayoutRequest;
    "positions"?: Point[];
    }; ret: Layout };
}

export type BindingId = keyof Bindings;

/** Typed dispatch. Runtime decodes the binding's Vec<u8> JSON; types are compile-time only.
 *  `opts.outputName` deterministically names a minted result handle (pipeline intermediates). */
export type CallBinding = <K extends BindingId>(id: K, args: Bindings[K]["args"], opts?: { outputName?: string }) => Promise<Bindings[K]["ret"]>;

/** Distinct return-type titles, keyed for rename-safe reference from viewer `accepts` predicates. */
export const RETURN_TYPES = {
  "AcceptingPetriNet": "AcceptingPetriNet",
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
  "DirectlyFollowsGraph": "DirectlyFollowsGraph",
  "DottedChartData": "DottedChartData",
  "EscapingEdgesPrecision": "EscapingEdgesPrecision",
  "EventLog": "EventLog",
  "EventLogActivityProjection": "EventLogActivityProjection",
  "EventLogInput": "EventLogInput",
  "EventTimeHistogram": "EventTimeHistogram",
  "ExtractionCatalog": "ExtractionCatalog",
  "ExtractionReport": "ExtractionReport",
  "FitnessResult": "FitnessResult",
  "IndexLinkedOCEL": "IndexLinkedOCEL",
  "InductiveMiner": "InductiveMiner",
  "Layout": "Layout",
  "LogAlignments": "LogAlignments",
  "LogGlobals": "LogGlobals",
  "Map_of_Map_of_ObjectInvolvementCounts": "Map_of_Map_of_ObjectInvolvementCounts",
  "Map_of_uint": "Map_of_uint",
  "ModelLayoutRequest": "ModelLayoutRequest",
  "Nullable_Array_of_string": "Nullable_Array_of_string",
  "Nullable_EventIndex": "Nullable_EventIndex",
  "Nullable_OCELAttributeValue": "Nullable_OCELAttributeValue",
  "Nullable_OCELType": "Nullable_OCELType",
  "Nullable_ObjectIndex": "Nullable_ObjectIndex",
  "Nullable_VariantTimeProfile": "Nullable_VariantTimeProfile",
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
  "ObjectCentricPetriNetJson": "ObjectCentricPetriNetJson",
  "ObjectDetail": "ObjectDetail",
  "OcTypeGraph": "OcTypeGraph",
  "OcelAttributeSummary": "OcelAttributeSummary",
  "OcelDfPerformance": "OcelDfPerformance",
  "OcelInput": "OcelInput",
  "OcelTypeRelations": "OcelTypeRelations",
  "PathSchemaConnections": "PathSchemaConnections",
  "PathSchemaDiscovery": "PathSchemaDiscovery",
  "PathSchemaTypeGraph": "PathSchemaTypeGraph",
  "ProcessTree": "ProcessTree",
  "Scene": "Scene",
  "SlimLinkedOCEL": "SlimLinkedOCEL",
  "TablePreview": "TablePreview",
  "TraceBrowserPage": "TraceBrowserPage",
  "TraceDetail": "TraceDetail",
  "TraceVariants": "TraceVariants",
  "VariantTimingPage": "VariantTimingPage",
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
  "AcceptingPetriNet": AcceptingPetriNet;
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
  "DirectlyFollowsGraph": DirectlyFollowsGraph;
  "DottedChartData": DottedChartData;
  "EscapingEdgesPrecision": EscapingEdgesPrecision;
  "EventLog": EventLogHandle;
  "EventLogActivityProjection": EventLogActivityProjectionHandle;
  "EventLogInput": EventLogInput;
  "EventTimeHistogram": EventTimeHistogram;
  "ExtractionCatalog": ExtractionCatalog;
  "ExtractionReport": ExtractionReport;
  "FitnessResult": FitnessResult;
  "IndexLinkedOCEL": IndexLinkedOCELHandle;
  "InductiveMiner": InductiveMiner;
  "Layout": Layout;
  "LogAlignments": LogAlignments;
  "LogGlobals": LogGlobals;
  "Map_of_Map_of_ObjectInvolvementCounts": Map_of_Map_of_ObjectInvolvementCounts;
  "Map_of_uint": Map_of_uint;
  "ModelLayoutRequest": ModelLayoutRequest;
  "Nullable_Array_of_string": Nullable_Array_of_string;
  "Nullable_EventIndex": Nullable_EventIndex;
  "Nullable_OCELAttributeValue": Nullable_OCELAttributeValue;
  "Nullable_OCELType": Nullable_OCELType;
  "Nullable_ObjectIndex": Nullable_ObjectIndex;
  "Nullable_VariantTimeProfile": Nullable_VariantTimeProfile;
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
  "ObjectCentricPetriNetJson": ObjectCentricPetriNetJson;
  "ObjectDetail": ObjectDetail;
  "OcTypeGraph": OcTypeGraph;
  "OcelAttributeSummary": OcelAttributeSummary;
  "OcelDfPerformance": OcelDfPerformance;
  "OcelInput": OcelInput;
  "OcelTypeRelations": OcelTypeRelations;
  "PathSchemaConnections": PathSchemaConnections;
  "PathSchemaDiscovery": PathSchemaDiscovery;
  "PathSchemaTypeGraph": PathSchemaTypeGraph;
  "ProcessTree": ProcessTree;
  "Scene": Scene;
  "SlimLinkedOCEL": SlimLinkedOCELHandle;
  "TablePreview": TablePreview;
  "TraceBrowserPage": TraceBrowserPage;
  "TraceDetail": TraceDetail;
  "TraceVariants": TraceVariants;
  "VariantTimingPage": VariantTimingPage;
  "boolean": boolean;
  "double": number;
  "null": null;
  "string": string;
  "uint": number;
  "uint64": number;
}

/** Each binding's return-type title (null when the return type is unnamed, e.g. a tuple/primitive). */
export const BINDING_RETURN_TYPE: Record<BindingId, ReturnTypeTitle | null> = {
  "app_bindings::alignments::align_event_log": "LogAlignments",
  "app_bindings::alphappp_auto": "AcceptingPetriNet",
  "app_bindings::app_ping": "string",
  "app_bindings::discover_petri_net": "AcceptingPetriNet",
  "app_bindings::event_log::event_log_from_activities": "EventLog",
  "app_bindings::event_log::event_log_from_json": "EventLog",
  "app_bindings::event_log::event_log_to_json": "EventLogInput",
  "app_bindings::event_log::get_activity_counts": "Map_of_uint",
  "app_bindings::event_log::get_attribute_names": "Array_of_AttributeInfo",
  "app_bindings::event_log::get_attribute_summary": "AttributeSummary",
  "app_bindings::event_log::get_attribute_values": "AttributeValues",
  "app_bindings::event_log::get_case_durations": "CaseDurations",
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
  "app_bindings::variant_timing::get_variant_time_profile": "Nullable_VariantTimeProfile",
  "app_bindings::variant_timing::get_variant_timing_page": "VariantTimingPage",
  "process_mining::analysis::case_centric::dotted_chart::get_dotted_chart": "DottedChartData",
  "process_mining::analysis::case_centric::event_timestamp_histogram::get_event_timestamps": "AggregatedEventTimestamps",
  "process_mining::analysis::object_centric::object_attribute_changes::get_object_attribute_changes": "ObjectAttributeChanges",
  "process_mining::analysis::object_centric::oc_performance::locel_oc_perf_sojourn_per_event": "Array_of_Tuple_of_string_and_int64",
  "process_mining::analysis::object_centric::oc_performance::locel_oc_perf_sync_per_event": "Array_of_Tuple_of_string_and_int64_and_string",
  "process_mining::analysis::object_centric::oc_statistics::locel_conversion_rate": "double",
  "process_mining::analysis::object_centric::oc_statistics::locel_event_object_type_counts": "Array_of_Tuple_of_string_and_string_and_int64",
  "process_mining::bindings::extraction_bindings::extraction_column_domain_items": "Array_of_string",
  "process_mining::bindings::extraction_bindings::extraction_compile": "CompiledOcel",
  "process_mining::bindings::extraction_bindings::extraction_discover_catalog_items": "ExtractionCatalog",
  "process_mining::bindings::extraction_bindings::extraction_run_items": "SlimLinkedOCEL",
  "process_mining::bindings::extraction_bindings::extraction_table_preview_items": "TablePreview",
  "process_mining::bindings::extraction_bindings::extraction_validate": "Array_of_ValidationError",
  "process_mining::bindings::extraction_dbcon_bindings::extraction_column_domain": "Array_of_string",
  "process_mining::bindings::extraction_dbcon_bindings::extraction_connection_kinds": "Array_of_string",
  "process_mining::bindings::extraction_dbcon_bindings::extraction_discover_catalog": "ExtractionCatalog",
  "process_mining::bindings::extraction_dbcon_bindings::extraction_run": "ExtractionReport",
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
  "process_mining::conformance::case_centric::alignments::align_variants_with_retry": "Array_of_VariantAlignmentResult",
  "process_mining::conformance::case_centric::alignments::compute_fitness": "FitnessResult",
  "process_mining::conformance::case_centric::precision::escaping_edges_precision": "EscapingEdgesPrecision",
  "process_mining::conformance::case_centric::precision::escaping_edges_precision_from_alignments": "EscapingEdgesPrecision",
  "process_mining::conformance::object_centric::oc_declare::oc_declare_conformance": "double",
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_num_cases": "uint64",
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_num_variants": "uint",
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_projection_activities": "Array_of_string",
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_top_n_variants": "Array_of_ProcessVariant",
  "process_mining::core::event_data::case_centric::utils::activity_projection::get_variants": "Array_of_ProcessVariant",
  "process_mining::core::event_data::case_centric::utils::activity_projection::log_to_activity_projection": "EventLogActivityProjection",
  "process_mining::core::event_data::object_centric::utils::flatten::flatten_ocel_on": "EventLog",
  "process_mining::core::event_data::object_centric::utils::init_exit_events::add_init_exit_events_to_ocel": "OCEL",
  "process_mining::core::process_models::object_centric::ocdfg::object_centric_dfg_struct::discover_dfg_from_slim_ocel": "OCDirectlyFollowsGraph",
  "process_mining::discovery::case_centric::alphappp::full::discover_alphappp_net": "AcceptingPetriNet",
  "process_mining::discovery::case_centric::dfg::discover_dfg": "DirectlyFollowsGraph",
  "process_mining::discovery::case_centric::inductive_miner::discover_inductive_net": "AcceptingPetriNet",
  "process_mining::discovery::case_centric::inductive_miner::discover_inductive_net_with": "AcceptingPetriNet",
  "process_mining::discovery::case_centric::inductive_miner::discover_inductive_tree": "ProcessTree",
  "process_mining::discovery::case_centric::inductive_miner::discover_inductive_tree_with": "ProcessTree",
  "process_mining::discovery::case_centric::inductive_miner::inductive_miner_options": "InductiveMiner",
  "process_mining::discovery::object_centric::dfg::get_dfg_of_object_type": "Array_of_Tuple_of_Tuple_of_string_and_string_and_uint",
  "process_mining::discovery::object_centric::oc_declare::discover_behavior_constraints": "Array_of_OCDeclareArc",
  "process_mining::discovery::object_centric::oc_declare::project_oc_arcs": "Array_of_OCDeclareArc",
  "process_mining::discovery::object_centric::oc_declare::reduce_oc_arcs": "Array_of_OCDeclareArc",
  "process_mining::discovery::object_centric::ocpn::discover_ocpn": "ObjectCentricPetriNetJson",
  "process_mining::discovery::object_centric::variants::get_variants_of_object_type": "Array_of_Tuple_of_Array_of_string_and_uint",
  "process_mining::visualization::bindings::dfg_layout": "Layout",
  "process_mining::visualization::bindings::dfg_layout_request": "ModelLayoutRequest",
  "process_mining::visualization::bindings::dfg_scene_from_layout": "Scene",
  "process_mining::visualization::bindings::dfg_svg": "string",
  "process_mining::visualization::bindings::dfg_svg_from_layout": "string",
  "process_mining::visualization::bindings::layout_graph": "Layout",
  "process_mining::visualization::bindings::layout_tree": "Layout",
  "process_mining::visualization::bindings::oc_declare_involvements": "Map_of_Map_of_ObjectInvolvementCounts",
  "process_mining::visualization::bindings::oc_declare_layout": "Layout",
  "process_mining::visualization::bindings::oc_declare_layout_request": "ModelLayoutRequest",
  "process_mining::visualization::bindings::oc_declare_scene_from_layout": "Scene",
  "process_mining::visualization::bindings::oc_declare_svg": "string",
  "process_mining::visualization::bindings::oc_declare_svg_from_layout": "string",
  "process_mining::visualization::bindings::oc_type_graph_from_ocel": "OcTypeGraph",
  "process_mining::visualization::bindings::oc_type_graph_layout": "Layout",
  "process_mining::visualization::bindings::oc_type_graph_layout_request": "ModelLayoutRequest",
  "process_mining::visualization::bindings::oc_type_graph_scene_from_layout": "Scene",
  "process_mining::visualization::bindings::oc_type_graph_svg": "string",
  "process_mining::visualization::bindings::oc_type_graph_svg_from_layout": "string",
  "process_mining::visualization::bindings::ocdfg_layout": "Layout",
  "process_mining::visualization::bindings::ocdfg_layout_request": "ModelLayoutRequest",
  "process_mining::visualization::bindings::ocdfg_scene_from_layout": "Scene",
  "process_mining::visualization::bindings::ocdfg_svg": "string",
  "process_mining::visualization::bindings::ocdfg_svg_from_layout": "string",
  "process_mining::visualization::bindings::ocpn_layout": "Layout",
  "process_mining::visualization::bindings::ocpn_layout_request": "ModelLayoutRequest",
  "process_mining::visualization::bindings::ocpn_scene_from_layout": "Scene",
  "process_mining::visualization::bindings::ocpn_svg": "string",
  "process_mining::visualization::bindings::ocpn_svg_from_layout": "string",
  "process_mining::visualization::bindings::partial_order_layout": "Layout",
  "process_mining::visualization::bindings::partial_order_layout_request": "ModelLayoutRequest",
  "process_mining::visualization::bindings::partial_order_scene_from_layout": "Scene",
  "process_mining::visualization::bindings::partial_order_svg": "string",
  "process_mining::visualization::bindings::partial_order_svg_from_layout": "string",
  "process_mining::visualization::bindings::petri_net_layout": "Layout",
  "process_mining::visualization::bindings::petri_net_layout_request": "ModelLayoutRequest",
  "process_mining::visualization::bindings::petri_net_scene_from_layout": "Scene",
  "process_mining::visualization::bindings::petri_net_svg": "string",
  "process_mining::visualization::bindings::petri_net_svg_from_layout": "string",
  "process_mining::visualization::bindings::process_tree_layout": "Layout",
  "process_mining::visualization::bindings::process_tree_layout_request": "ModelLayoutRequest",
  "process_mining::visualization::bindings::process_tree_scene_from_layout": "Scene",
  "process_mining::visualization::bindings::process_tree_svg": "string",
  "process_mining::visualization::bindings::process_tree_svg_from_layout": "string",
  "process_mining::visualization::bindings::render_scene_svg": "string",
  "process_mining::visualization::bindings::reroute_graph": "Layout",
};
