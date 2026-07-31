// EditorBlueprint: Blueprint (see ./types) plus UI-only positions, and pure to/from conversion
// functions. Positions and every other editor-only concern live here, never in Blueprint itself --
// the model has no position field and must not gain one (spec 1.1: "deliberately not in the
// model"; mirrors oc-declare/model.ts's DeclareFlowModel/DeclareNode).
//
// Mappings are nodes on the canvas, not a side panel: a mapping reads exactly one node's rows
// (`Mapping.node`), which is a graph edge, and its configuration is what a user spends their time
// on. So `EditorMapping` carries the same `id` + `position` an `EditorNode` does. `MappingEntry`
// has no id of its own in the Rust model (it is positional in `Blueprint.mappings`), so ids are
// assigned deterministically by array index on `fromBlueprint` and dropped again by `toBlueprint`.
//
// Row-graph edges are derived, never stored: NodeOp's own fields (Filter.input, Join.left/right,
// Union.inputs) and `Mapping.node` already say which nodes feed which, so a separate edge list
// would just be a second source of truth that can drift from them. `deriveEdges` reads it back out
// on every render instead.
import type {
  Blueprint,
  DuplicateObjectPolicy,
  IdRendering,
  Mapping,
  MappingEntry,
  MissingEndpointPolicy,
  NodeOp,
  Target,
} from "./types";

export interface EditorNode {
  id: string;
  label?: string;
  op: NodeOp;
  /** UI-only; not part of Blueprint. Absent on a freshly-parsed/pasted document -> the host runs layout. */
  position?: { x: number; y: number };
}

export interface EditorMapping {
  /** UI-only, canvas-stable. Reassigned by index on every `fromBlueprint`. */
  id: string;
  entry: MappingEntry;
  /** UI-only; absent -> the host runs layout. */
  position?: { x: number; y: number };
}

export interface EditorBlueprint {
  version: number;
  idRendering: IdRendering;
  nodes: EditorNode[];
  mappings: EditorMapping[];
  onMissingEndpoint: MissingEndpointPolicy;
  onDuplicateObject: DuplicateObjectPolicy;
}

/**
 * A fresh blueprint, with the defaults a *new* document should start from.
 *
 * These are deliberately not `Blueprint`'s serde defaults, and `fromBlueprint`'s `??` fallbacks
 * must keep matching those instead: a document that omits a field means whatever the Rust model
 * says it means, and reading it through a different lens would silently change what an existing
 * blueprint does. This is only about what a user gets on a blank canvas.
 *
 * - `type-prefixed` ids, because two tables both keyed by an integer `id` otherwise collide into
 *   one object the moment a second object type is added, which is the common case and a
 *   confusing thing to debug after the fact.
 * - `create` missing endpoints, because a relation naming an object no mapping produced is
 *   usually a mapping the user has not written yet, and silently dropping the relation loses data
 *   with no signal.
 * - `first-wins` duplicates, matching the model default: a table listing the same object on
 *   several rows is normal, not an error.
 */
export function newBlueprint(): EditorBlueprint {
  return {
    version: 1,
    idRendering: "type-prefixed",
    nodes: [],
    mappings: [],
    onMissingEndpoint: "create",
    onDuplicateObject: "first-wins",
  };
}

/** The mapping id an index in `Blueprint.mappings` gets. Exported so a caller reconciling a
 *  freshly-validated blueprint against editor state can rebuild the same ids. */
export function mappingIdForIndex(i: number): string {
  return `mapping-${i}`;
}

/** Strips positions and mapping ids, camelCase -> the Rust field names/tags. Pure. */
export function toBlueprint(m: EditorBlueprint): Blueprint {
  return {
    version: m.version,
    id_rendering: m.idRendering,
    nodes: m.nodes.map((n) => ({ id: n.id, label: n.label, op: n.op })),
    mappings: m.mappings.map((mp) => mp.entry),
    on_missing_endpoint: m.onMissingEndpoint,
    on_duplicate_object: m.onDuplicateObject,
  };
}

/** Positions absent (fresh import/paste) -> host runs layout, same as oc-declare's `!n.position` check. */
export function fromBlueprint(b: Blueprint): EditorBlueprint {
  return {
    version: b.version,
    idRendering: b.id_rendering ?? "raw",
    nodes: b.nodes.map((n) => ({ id: n.id, label: n.label ?? undefined, op: n.op })),
    mappings: b.mappings.map((entry, i) => ({ id: mappingIdForIndex(i), entry })),
    onMissingEndpoint: b.on_missing_endpoint ?? "drop",
    onDuplicateObject: b.on_duplicate_object ?? "first-wins",
  };
}

/** Every `Mapping` an entry holds: one for `Single`, N for `Ordered`.
 *
 *  `Single(Mapping)` is an internally-tagged newtype variant, so serde flattens the inner
 *  `Mapping`'s fields alongside the `type` discriminant -- the entry *is* the mapping, with one
 *  extra key. Hence the spread rather than an `entry.value` lookup. */
export function entryMappings(entry: MappingEntry): Mapping[] {
  if (entry.type === "ordered") return entry.mappings;
  const { type: _tag, ...mapping } = entry;
  return [mapping];
}

/** Wrap one mapping back into a `Single` entry, re-adding the flattened discriminant. */
export function singleEntry(mapping: Mapping): MappingEntry {
  return { type: "single", ...mapping };
}

/** The node an entry reads. For `Ordered`, its first mapping's -- validation requires every
 *  mapping in an ordered group to read the same node, so the first one is authoritative. */
export function entryNode(entry: MappingEntry): string | undefined {
  return entryMappings(entry)[0]?.node;
}

/** Rewrite the node every mapping in an entry reads. Keeps an `Ordered` group consistent. */
export function withEntryNode(entry: MappingEntry, node: string): MappingEntry {
  if (entry.type === "ordered") {
    return { type: "ordered", mappings: entry.mappings.map((m) => ({ ...m, node })) };
  }
  return { ...entry, node };
}

/** Which of the four visual families an entry belongs to, for node color and iconography.
 *  An `Ordered` group takes its first mapping's kind. */
export function entryTargetKind(entry: MappingEntry): Target["type"] | undefined {
  return entryMappings(entry)[0]?.target.type;
}

export type EdgeKind = "row" | "mapping";

export interface DerivedEdge {
  /** `${sourceId}->${targetId}#${handle}`; handle disambiguates a Join's two target handles. */
  id: string;
  source: string;
  target: string;
  /** Which of a Join's two named target handles this edge feeds. Undefined for every other op. */
  sourceHandle?: "left" | "right";
  /** `row`: node feeds node. `mapping`: node feeds a mapping node. Drives edge color. */
  kind: EdgeKind;
  /** For `mapping` edges, the target's kind -- so the edge is colored like the node it feeds. */
  targetKind?: Target["type"];
}

/**
 * Read the edge list off `NodeOp`'s own fields and off each mapping's `node`.
 *
 * - `Source`: no incoming edges.
 * - `Filter { input }`: one incoming edge, single target handle.
 * - `Join { left, right }`: two incoming edges, one per named target handle -- `sourceHandle`
 *   ("left"/"right", per the plan's naming; the value identifies which of the *Join's target*
 *   handles the edge feeds, since Source/Filter/Union nodes only ever expose one undifferentiated
 *   source handle) disambiguates them so a re-drawn edge onto the "left" handle unambiguously
 *   updates `left`, not `right`.
 * - `Union { inputs }`: N incoming edges, all on one fan-in target handle; order doesn't affect
 *   correctness (spec 1.1), so edge identity is keyed by the (source, target) pair, not by
 *   position in `inputs` -- removing one input from the middle of the array must not churn the
 *   ids of the edges that remain.
 * - Each mapping: one incoming edge from the node it reads.
 *
 * An edge whose endpoint id has no matching node (a dangling reference, e.g. mid-edit) is
 * silently omitted -- ReactFlow requires both endpoints to exist as rendered nodes, and surfacing
 * a dangling ref is `extraction_validate`'s `UnknownNodeRef` job, not this pure function's.
 */
export function deriveEdges(nodes: EditorNode[], mappings: EditorMapping[] = []): DerivedEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  const edges: DerivedEdge[] = [];
  for (const n of nodes) {
    const op = n.op;
    switch (op.type) {
      case "source":
        break;
      case "filter":
        if (ids.has(op.input)) {
          edges.push({ id: `${op.input}->${n.id}`, source: op.input, target: n.id, kind: "row" });
        }
        break;
      case "join":
        if (ids.has(op.left)) {
          edges.push({
            id: `${op.left}->${n.id}#left`,
            source: op.left,
            target: n.id,
            sourceHandle: "left",
            kind: "row",
          });
        }
        if (ids.has(op.right)) {
          edges.push({
            id: `${op.right}->${n.id}#right`,
            source: op.right,
            target: n.id,
            sourceHandle: "right",
            kind: "row",
          });
        }
        break;
      case "union": {
        // A repeated input id (unusual but not type-invalid) would otherwise produce two edges
        // sharing one id, which ReactFlow's edge list cannot represent -- de-dupe by (source,
        // target), not position, matching the "keyed by pair, not by array index" requirement.
        const seen = new Set<string>();
        for (const input of op.inputs) {
          if (!ids.has(input) || seen.has(input)) continue;
          seen.add(input);
          edges.push({ id: `${input}->${n.id}`, source: input, target: n.id, kind: "row" });
        }
        break;
      }
    }
  }
  for (const m of mappings) {
    const from = entryNode(m.entry);
    if (!from || !ids.has(from)) continue;
    edges.push({
      id: `${from}->${m.id}`,
      source: from,
      target: m.id,
      kind: "mapping",
      targetKind: entryTargetKind(m.entry),
    });
  }
  return edges;
}
