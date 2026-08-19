// The pure half of the add/edit dialog: what a freshly-chosen kind starts out as, and how a draft
// turns into a graph mutation. Kept out of the component so the defaults and the create/replace
// rules are testable without rendering.
import {
  entryMappings,
  singleEntry,
  withEntryNode,
  type EditorBlueprint,
  type EditorMapping,
  type EditorNode,
} from "../model";
import { rankedColumnInfo, scoreColumn, type ColumnHint } from "../schema-resolution";
import type {
  ExtractionCatalog,
  MappingEntry,
  NodeOp,
  Predicate,
  Target,
  TimestampSource,
  ValueExpression,
} from "../types";

/** Everything the dialog can create. Mapping kinds mirror `Target`'s variants plus the `Ordered`
 *  group; transform kinds mirror the three non-Source `NodeOp`s. A Source is not here: it is added
 *  from the table picker, which needs a source id and a table name rather than a config form. */
export type DraftKind = Target["type"] | "ordered" | "filter" | "join" | "union";

export const MAPPING_KINDS: DraftKind[] = ["event", "object", "e2o", "o2o", "ordered"];
export const TRANSFORM_KINDS: DraftKind[] = ["filter", "join", "union"];

export function isTransformKind(kind: DraftKind): boolean {
  return kind === "filter" || kind === "join" || kind === "union";
}

export const KIND_META: Record<DraftKind, { label: string; description: string }> = {
  event: { label: "Event", description: "Each row produces one event" },
  object: { label: "Object", description: "Each row produces one object" },
  e2o: { label: "E2O relation", description: "Link an event to an object" },
  o2o: { label: "O2O relation", description: "Link an object to an object" },
  ordered: {
    label: "Rule set",
    description: "First matching rule wins",
  },
  filter: { label: "Filter", description: "Keep rows matching a condition" },
  join: { label: "Join", description: "Merge rows with another node" },
  union: { label: "Union", description: "Concatenate rows from several nodes" },
};

/** What a new mapping off this node should start out saying it produces -- suggestions written into an editable field, never enforced. */
export interface MappingSeed {
  typeName?: string;
  /** Id-ish columns, best first; a list because a relation needs two different ids. */
  idColumns?: string[];
  timestampColumn?: string;
  /** A column naming what happened, when the table has one, instead of the table's name as a constant. */
  activityColumn?: string;
}

/** The nearest `Source` upstream of `nodeId`, following a Filter/Join/Union chain to its first
 *  input. For a Join, the left input is taken. */
function nearestSourceTable(nodes: EditorNode[], nodeId: string): string | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  let cur = byId.get(nodeId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const op = cur.op;
    if (op.type === "source") return op.table;
    const next = op.type === "filter" ? op.input : op.type === "join" ? op.left : op.inputs[0];
    cur = next ? byId.get(next) : undefined;
  }
  return undefined;
}

/**
 * A singular, human-readable type name from a table name: `orders` -> `order`, `order_items` ->
 * `order item`, `address` -> `address`. Deliberately crude, since anything wrong is one edit away
 * in a text field -- not worth an inflection library for a placeholder.
 */
export function typeNameFromTable(table: string): string {
  const base = table.replace(/^.*\./, "").replace(/[_-]+/g, " ").trim();
  if (!base) return "";
  const words = base.split(" ");
  const last = words[words.length - 1];
  words[words.length - 1] = singularize(last);
  return words.join(" ");
}

function singularize(word: string): string {
  const lower = word.toLowerCase();
  if (word.length <= 3) return word;
  if (/(ss|us|is|as|os)$/.test(lower)) return word;
  if (/ies$/.test(lower)) return `${word.slice(0, -3)}y`;
  if (/(ch|sh|x|z)es$/.test(lower)) return word.slice(0, -2);
  if (/s$/.test(lower)) return word.slice(0, -1);
  return word;
}

/** Columns at `nodeId` that actually score for `hint`, best first. A zero score means the column
 *  merely sorted first, which is not a suggestion -- pre-filling a field with the wrong column is
 *  worse than leaving it empty, because it looks deliberate. */
export function scoringColumns(
  nodes: EditorNode[],
  catalog: ExtractionCatalog,
  nodeId: string,
  hint: ColumnHint,
): string[] {
  return rankedColumnInfo(nodes, catalog, nodeId, hint)
    .filter((c) => scoreColumn(c, hint) > 0)
    .map((c) => c.name);
}

/** Type name, id columns and timestamp column to seed a new mapping off `nodeId` with. */
export function suggestMappingSeed(
  nodes: EditorNode[],
  catalog: ExtractionCatalog,
  nodeId: string,
): MappingSeed {
  const table = nearestSourceTable(nodes, nodeId);
  return {
    typeName: table ? typeNameFromTable(table) : undefined,
    idColumns: scoringColumns(nodes, catalog, nodeId, "id"),
    timestampColumn: scoringColumns(nodes, catalog, nodeId, "timestamp")[0],
    activityColumn: scoringColumns(nodes, catalog, nodeId, "activity")[0],
  };
}

/** Which id column each end of a relation should start from. The same column for both would be
 *  wrong by construction, so the event side takes the first id column that names an event and the
 *  object side takes the best one left over. */
export function relationIdColumns(seed: MappingSeed): { event?: string; object?: string } {
  const ids = seed.idColumns ?? [];
  const event = ids.find((c) => /event/i.test(c));
  const object = ids.find((c) => c !== event);
  return { event, object };
}

/** Constant type names the blueprint already uses, for the "which object type is this?" pickers.
 *  A relation endpoint almost always names a type some other mapping produces, so offering that
 *  list is both a shortcut and a way to notice a typo. */
export function knownTypeNames(mappings: { entry: MappingEntry }[]): {
  objects: string[];
  events: string[];
} {
  const objects = new Set<string>();
  const events = new Set<string>();
  const constant = (e: ValueExpression | null | undefined) =>
    e?.type === "constant" && e.value ? e.value : undefined;
  const addObject = (e: ValueExpression | null | undefined) => {
    const v = constant(e);
    if (v) objects.add(v);
  };
  const addEvent = (e: ValueExpression | null | undefined) => {
    const v = constant(e);
    if (v) events.add(v);
  };
  for (const { entry } of mappings) {
    for (const m of entryMappings(entry)) {
      const t = m.target;
      if (t.type === "object") addObject(t.object_type);
      else if (t.type === "event") {
        addEvent(t.event_type);
        for (const ref of t.objects ?? []) addObject(ref.object.object_type);
      } else if (t.type === "e2o") {
        addEvent(t.event.event_type);
        addObject(t.object.object_type);
      } else {
        addObject(t.source.object_type);
        addObject(t.target.object_type);
      }
    }
  }
  return { objects: [...objects].sort(), events: [...events].sort() };
}

function defaultExpr(): ValueExpression {
  return { type: "column", column: "" };
}
function defaultTimestamp(): TimestampSource {
  return { type: "value", source: { type: "column", column: "" } };
}

/** An endpoint's `object_type` starts as an empty *constant* rather than unset. Under the editor's
 *  default policies (type-prefixed ids, create-on-missing) an untyped endpoint cannot work at all,
 *  so the field is present and visibly blank instead of hidden behind "optional". */
function seededObjectEndpoint(column: string | undefined, typeName = "") {
  return {
    id: column ? ({ type: "column", column } as ValueExpression) : defaultExpr(),
    object_type: { type: "constant", value: typeName } as ValueExpression,
    split: undefined,
  };
}

export function defaultTarget(kind: Target["type"], seed: MappingSeed = {}): Target {
  const firstId = seed.idColumns?.[0];
  const id = firstId ? ({ type: "column", column: firstId } as ValueExpression) : defaultExpr();
  const timestamp: TimestampSource = seed.timestampColumn
    ? { type: "value", source: { type: "column", column: seed.timestampColumn } }
    : defaultTimestamp();
  const rel = relationIdColumns(seed);
  switch (kind) {
    case "event":
      return {
        type: "event",
        // A flat event log names the event per row; anything else is named by its table.
        event_type: seed.activityColumn
          ? { type: "column", column: seed.activityColumn }
          : { type: "constant", value: seed.typeName ?? "" },
        id: undefined,
        timestamp,
        attributes: [],
        // The case the events belong to. Only when the table has both an activity column and an
        // id column, which together are what makes it a flat event log rather than a plain table.
        objects:
          seed.activityColumn && firstId
            ? [
                {
                  object: {
                    id: { type: "column", column: firstId },
                    object_type: { type: "constant", value: seed.typeName ?? "case" },
                    split: undefined,
                  },
                  qualifier: undefined,
                },
              ]
            : [],
      };
    case "object":
      return {
        type: "object",
        object_type: { type: "constant", value: seed.typeName ?? "" },
        id,
        timestamp: undefined,
        attributes: [],
      };
    case "e2o":
      return {
        type: "e2o",
        event: {
          id: rel.event ? { type: "column", column: rel.event } : defaultExpr(),
          event_type: { type: "constant", value: "" },
        },
        object: seededObjectEndpoint(rel.object),
        qualifier: undefined,
      };
    case "o2o":
      return {
        type: "o2o",
        source: seededObjectEndpoint(firstId, seed.typeName ?? ""),
        target: seededObjectEndpoint(seed.idColumns?.[1]),
        qualifier: undefined,
      };
  }
}

/** A fresh mapping entry of `kind`, reading `node`. An `ordered` group starts with two event
 *  mappings, since a one-element group is indistinguishable from a `Single` and would only be
 *  confusing. */
export function defaultEntry(kind: DraftKind, node: string, seed: MappingSeed = {}): MappingEntry {
  if (kind === "ordered") {
    return {
      type: "ordered",
      mappings: [
        { node, label: undefined, when: null, target: defaultTarget("event", seed) },
        { node, label: undefined, when: null, target: defaultTarget("event", seed) },
      ],
    };
  }
  if (isTransformKind(kind)) throw new Error(`${kind} is not a mapping kind`);
  return singleEntry({
    node,
    label: undefined,
    when: null,
    target: defaultTarget(kind as Target["type"], seed),
  });
}

const DEFAULT_FILTER_CONDITION: Predicate = { type: "and", conditions: [] };

/** A fresh transform op of `kind`, reading `input`. Join's `right` and Union's second input are
 *  left unset: they come from a second edge the user draws, which is exactly how OCPQ's join
 *  worked ("connect left and right sources via edges after creation"). */
export function defaultNodeOp(kind: DraftKind, input: string): NodeOp {
  switch (kind) {
    case "filter":
      return { type: "filter", input, condition: DEFAULT_FILTER_CONDITION };
    case "join":
      return { type: "join", left: input, right: "", on: [["", ""]] };
    case "union":
      return { type: "union", inputs: input ? [input] : [] };
    default:
      throw new Error(`${kind} is not a transform kind`);
  }
}

/** Convert an entry to another mapping kind, keeping the node and the label so switching kinds
 *  mid-edit does not silently discard the identifying text a user already typed. */
export function convertEntry(
  entry: MappingEntry,
  kind: DraftKind,
  node: string,
  seed: MappingSeed = {},
): MappingEntry {
  const label = entryMappings(entry)[0]?.label ?? undefined;
  const next = defaultEntry(kind, node, seed);
  if (next.type === "ordered") return next;
  return { ...next, label };
}

/** Rewrite a node's op to another transform kind, preserving whatever input it already reads. */
export function convertNodeOp(op: NodeOp, kind: DraftKind): NodeOp {
  const input =
    op.type === "filter"
      ? op.input
      : op.type === "join"
        ? op.left
        : op.type === "union"
          ? (op.inputs[0] ?? "")
          : "";
  return defaultNodeOp(kind, input);
}

/** The attribute name to show after a source column is picked. Follows the column while the name
 *  matches it, but stops once the name has been hand-edited. */
export function attributeNameFor(currentName: string, previousColumn: string, nextColumn: string): string {
  if (!currentName || currentName === previousColumn) return nextColumn;
  return currentName;
}

/** Key-column pairs to start a join from: a same-name match on both sides, then a foreign-key-shaped
 *  pair (`customer_id` against `id`). Id-ish names first, capped at two pairs -- a starting point, not schema inference. */
export function suggestJoinKeys(
  nodes: EditorNode[],
  catalog: ExtractionCatalog,
  left: string,
  right: string,
): [string, string][] {
  const leftCols = rankedColumnInfo(nodes, catalog, left).map((c) => c.name);
  const rightCols = new Set(rankedColumnInfo(nodes, catalog, right).map((c) => c.name));
  if (leftCols.length === 0 || rightCols.size === 0) return [];

  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  const add = (l: string, r: string) => {
    const key = `${l}\u0000${r}`;
    if (seen.has(key) || pairs.length >= 2) return;
    seen.add(key);
    pairs.push([l, r]);
  };

  const idish = (c: string) => /(^|_)id$/i.test(c) || c.toLowerCase().includes("id");
  const shared = leftCols.filter((c) => rightCols.has(c));
  for (const c of shared.filter(idish)) add(c, c);
  for (const c of shared.filter((x) => !idish(x))) add(c, c);

  // `<other table>_id` against the other side's own key column.
  const rightTable = nearestSourceTable(nodes, right);
  const leftTable = nearestSourceTable(nodes, left);
  const fkNames = (table: string | undefined) =>
    table ? [`${typeNameFromTable(table).replace(/ /g, "_")}_id`, `${table}_id`] : [];
  for (const fk of fkNames(rightTable)) {
    if (!leftCols.includes(fk)) continue;
    for (const key of ["id", `${typeNameFromTable(rightTable as string).replace(/ /g, "_")}_id`]) {
      if (rightCols.has(key)) add(fk, key);
    }
  }
  for (const fk of fkNames(leftTable)) {
    if (!rightCols.has(fk)) continue;
    for (const key of ["id", `${typeNameFromTable(leftTable as string).replace(/ /g, "_")}_id`]) {
      if (leftCols.includes(key)) add(key, fk);
    }
  }
  return pairs;
}

/** Point every Source node reading `from` at `to`. Renaming a connection's key without this
 *  silently orphans the nodes that name it. */
export function renameSourceId(nodes: EditorNode[], from: string, to: string): EditorNode[] {
  return nodes.map((n) =>
    n.op.type === "source" && n.op.source_id === from ? { ...n, op: { ...n.op, source_id: to } } : n,
  );
}

/** A unique id of the form `<prefix>-<n>`, skipping ids already taken. */
export function freshId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let i = 1; ; i++) {
    const id = `${prefix}-${i}`;
    if (!used.has(id)) return id;
  }
}

/** Place a new node to the right of the one it reads, stepping down past existing siblings so two
 *  children of the same node do not land on top of each other. Mirrors OCPQ's `+ 280 / + 130 *
 *  siblingCount`. */
export function childPosition(
  parent: { position?: { x: number; y: number } } | undefined,
  siblingCount: number,
): { x: number; y: number } {
  const base = parent?.position ?? { x: 0, y: 0 };
  return { x: base.x + 280, y: base.y + siblingCount * 130 };
}

/** How many nodes and mappings already read `nodeId` -- the sibling count for `childPosition`. */
export function childCount(model: EditorBlueprint, nodeId: string): number {
  let n = 0;
  for (const node of model.nodes) {
    const op = node.op;
    if (op.type === "filter" && op.input === nodeId) n++;
    else if (op.type === "join" && (op.left === nodeId || op.right === nodeId)) n++;
    else if (op.type === "union" && op.inputs.includes(nodeId)) n++;
  }
  for (const m of model.mappings) {
    if (entryMappings(m.entry)[0]?.node === nodeId) n++;
  }
  return n;
}

/** Append a new mapping node reading `sourceNodeId`. */
export function addMapping(
  model: EditorBlueprint,
  sourceNodeId: string,
  entry: MappingEntry,
): EditorBlueprint {
  const parent = model.nodes.find((n) => n.id === sourceNodeId);
  const mapping: EditorMapping = {
    id: freshId(
      "mapping",
      model.mappings.map((m) => m.id),
    ),
    entry: withEntryNode(entry, sourceNodeId),
    position: childPosition(parent, childCount(model, sourceNodeId)),
  };
  return { ...model, mappings: [...model.mappings, mapping] };
}

/** Append a new transform node reading `sourceNodeId`. */
export function addTransform(
  model: EditorBlueprint,
  sourceNodeId: string,
  kind: DraftKind,
  op?: NodeOp,
): EditorBlueprint {
  const parent = model.nodes.find((n) => n.id === sourceNodeId);
  const node: EditorNode = {
    id: freshId(
      kind,
      model.nodes.map((n) => n.id),
    ),
    op: op ?? defaultNodeOp(kind, sourceNodeId),
    position: childPosition(parent, childCount(model, sourceNodeId)),
  };
  return { ...model, nodes: [...model.nodes, node] };
}
