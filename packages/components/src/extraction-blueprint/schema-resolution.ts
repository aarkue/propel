// Client-side mirror of validate.rs's `node_columns`, for responsive TablePicker/Template
// autocomplete (Task B7). This is the second, smaller instance of the drift-risk class model.ts's
// own header discusses for the hand-mirrored Blueprint types -- here it is one function, not
// fifteen types, and the plan's own recommendation (mirror the resolution logic rather than
// validate-then-reject) is followed because the Template editor's autocomplete wants to *suggest*
// columns, not just reject typos after a round trip to the backend.
//
// Rule (verified by reading validate.rs's `node_columns`):
// - Source: the catalog table's own columns.
// - Filter: its single input's columns, unchanged.
// - Join: left columns union right columns; a right column colliding by name with a left column
//   is added as `right_<name>` instead of overwriting the left one.
// - Union: the union of every input's columns (name-only; the Rust side null-fills a column an
//   input lacks rather than rejecting it, so from a *names* point of view this is a plain union).
//
// Resolved via fixed-point iteration over the node list (mirroring node_columns exactly) rather
// than assuming topological order, since nodes may appear in the blueprint's `nodes` array in any
// order.
import type { EditorNode } from "./model";
import type { ExtractionCatalog, NodeOp, TablePreview } from "./types";

function nodeInputs(op: NodeOp): string[] {
  switch (op.type) {
    case "source":
      return [];
    case "filter":
      return [op.input];
    case "join":
      return [op.left, op.right];
    case "union":
      return op.inputs;
  }
}

/** Memo keyed on input identity. `WeakMap`s, so entries never need invalidating: a changed model
 *  or catalog is a new key, and the old one is collectable. */
const resolveCache = new WeakMap<
  EditorNode[],
  WeakMap<ExtractionCatalog, Map<string, Set<string> | undefined>>
>();

/** Resolve every node's column set (undefined = not yet resolvable, e.g. an unknown source/table
 *  or an input whose own columns aren't resolvable).
 *
 *  Memoised on `(nodes, catalog)` identity, so it is cheap to call once per editor on screen. The
 *  returned map is shared -- callers must not mutate it. */
export function resolveAllNodeColumns(
  nodes: EditorNode[],
  catalog: ExtractionCatalog,
): Map<string, Set<string> | undefined> {
  let byCatalog = resolveCache.get(nodes);
  if (!byCatalog) {
    byCatalog = new WeakMap();
    resolveCache.set(nodes, byCatalog);
  }
  const hit = byCatalog.get(catalog);
  if (hit) return hit;
  const computed = computeAllNodeColumns(nodes, catalog);
  byCatalog.set(catalog, computed);
  return computed;
}

function computeAllNodeColumns(
  nodes: EditorNode[],
  catalog: ExtractionCatalog,
): Map<string, Set<string> | undefined> {
  const out = new Map<string, Set<string> | undefined>();
  const rounds = Math.max(nodes.length, 1);
  for (let round = 0; round < rounds; round++) {
    for (const n of nodes) {
      const op = n.op;
      let resolved: Set<string> | undefined;
      if (op.type === "source") {
        const table = catalog.tables[op.source_id]?.[op.table];
        resolved = table ? new Set(Object.keys(table.columns)) : undefined;
      } else if (op.type === "join") {
        const l = out.get(op.left);
        const r = out.get(op.right);
        if (l && r) {
          const cols = new Set(l);
          for (const c of r) cols.add(l.has(c) ? `right_${c}` : c);
          resolved = cols;
        }
      } else {
        const inputs = nodeInputs(op);
        const sets = inputs.map((i) => out.get(i));
        resolved = sets.some((s) => !s) ? undefined : new Set(sets.flatMap((s) => [...(s as Set<string>)]));
      }
      out.set(n.id, resolved);
    }
  }
  return out;
}

/** Resolved columns for one node, sorted for stable display. Empty array when unresolvable
 *  (unknown source/table, or an unresolvable ancestor) rather than throwing -- callers treat "no
 *  suggestions yet" as a normal, transient state (catalog not loaded, mid-edit graph). */
export function resolveNodeColumns(
  nodes: EditorNode[],
  catalog: ExtractionCatalog,
  nodeId: string,
): string[] {
  const cols = resolveAllNodeColumns(nodes, catalog).get(nodeId);
  return cols ? [...cols].sort() : [];
}

export type ValueKind = "boolean" | "integer" | "float" | "timestamp" | "text";

/** Client mirror of `ColumnSchema::declared_kind` (catalog.rs): case-insensitive substring match
 *  over the source's raw `col_type`. Kept in sync by inspection, not generated -- a small,
 *  isolated second instance of the same drift-risk class as `resolveAllNodeColumns` above. */
export function declaredKind(colType: string): ValueKind | undefined {
  const t = colType.trim().toLowerCase();
  if (t.includes("bool")) return "boolean";
  if (t.includes("timestamp") || t.includes("datetime") || t.includes("date")) return "timestamp";
  if (t.includes("int") || t.includes("serial")) return "integer";
  if (
    t.includes("float") ||
    t.includes("double") ||
    t.includes("real") ||
    t.includes("numeric") ||
    t.includes("decimal")
  )
    return "float";
  if (t.includes("text") || t.includes("varchar") || t.includes("char") || t.includes("string"))
    return "text";
  return undefined;
}

/** Best-effort declared kind of `column` as seen at `nodeId`, for the `PredicateEditor`/
 *  `ValueExpressionEditor`'s literal-typing helper (spec 1.7a's coercion rule exists so an
 *  editor that *can't* determine this still behaves correctly; this only makes the common case --
 *  a Source or a Filter directly over one -- proactively emit the right JSON literal kind).
 *  Traces transparently through `Filter` (same columns as its input, unchanged); does not attempt
 *  to trace through `Join`/`Union`, whose derived schema can rename or merge columns, so the
 *  correct source column for a given name is ambiguous without real type propagation -- callers
 *  get `undefined` there and fall back to a text literal, exactly the case the coercion rule
 *  covers. */
export function guessColumnKind(
  nodes: EditorNode[],
  catalog: ExtractionCatalog,
  nodeId: string,
  column: string,
): ValueKind | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = byId.get(nodeId);
  while (cur) {
    const op = cur.op;
    if (op.type === "source") {
      const colType = catalog.tables[op.source_id]?.[op.table]?.columns[column]?.col_type;
      return colType ? declaredKind(colType) : undefined;
    }
    if (op.type === "filter") {
      cur = byId.get(op.input);
      continue;
    }
    return undefined;
  }
  return undefined;
}

/** Display metadata for one column as seen at a node. */
export interface ColumnInfo {
  name: string;
  /** The source's own type spelling, when it can be traced back to a table. */
  colType?: string;
  nullable?: boolean;
  kind?: ValueKind;
  /** Distinct values, when the host has fetched this column's domain into the catalog. */
  samples?: string[];
}

/** Up to `limit` distinct non-empty example values for `column`, out of a table's preview rows.
 *  `undefined` rather than `[]` when there is nothing to show, so callers can tell "no preview
 *  fetched" from "preview fetched, column is empty". Mirrors Rust's `TablePreview::column_values`. */
export function previewSamples(
  preview: TablePreview | undefined,
  column: string,
  limit = 3,
): string[] | undefined {
  if (!preview) return undefined;
  const idx = preview.columns.indexOf(column);
  if (idx < 0) return undefined;
  const out: string[] = [];
  for (const row of preview.rows) {
    const v = row[idx];
    if (v === null || v === undefined || v === "") continue;
    if (!out.includes(v)) {
      out.push(v);
      if (out.length === limit) break;
    }
  }
  return out.length > 0 ? out : undefined;
}

/** Every ancestor `Source` of `nodeId`, including itself. */
function ancestorSources(nodes: EditorNode[], nodeId: string): { sourceId: string; table: string }[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const out: { sourceId: string; table: string }[] = [];
  const stack = [nodeId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node) continue;
    if (node.op.type === "source") out.push({ sourceId: node.op.source_id, table: node.op.table });
    else stack.push(...nodeInputs(node.op));
  }
  return out;
}

/**
 * The columns available at `nodeId`, each with whatever display metadata can be traced back to the
 * table it came from: declared type, nullability and (when the host has fetched it) the column's
 * distinct values.
 *
 * `resolveAllNodeColumns` stays authoritative for *which* names exist -- it mirrors `validate.rs`
 * exactly, including a Join's `right_<name>` renaming. This only decorates those names, by looking
 * them up in every ancestor Source's table (and, for a `right_`-prefixed name, under its unprefixed
 * form). A name it cannot trace still appears, just without metadata: showing the column with no
 * type beats hiding a column that genuinely exists.
 */
export function resolveColumnInfo(
  nodes: EditorNode[],
  catalog: ExtractionCatalog,
  nodeId: string,
): ColumnInfo[] {
  const names = resolveNodeColumns(nodes, catalog, nodeId);
  const sources = ancestorSources(nodes, nodeId);

  const lookup = (name: string): ColumnInfo | undefined => {
    for (const { sourceId, table } of sources) {
      const col = catalog.tables[sourceId]?.[table]?.columns[name];
      if (!col) continue;
      return {
        name,
        colType: col.col_type,
        nullable: col.nullable,
        kind: declaredKind(col.col_type),
        // A fetched domain is the complete set, so it wins over a preview's first few rows.
        samples:
          catalog.domains[sourceId]?.[table]?.[name] ??
          previewSamples(catalog.previews?.[sourceId]?.[table], name),
      };
    }
    return undefined;
  };

  return names.map((name) => {
    const direct = lookup(name);
    if (direct) return direct;
    // A Join renames a colliding right column to `right_<name>`; its metadata lives under the
    // original name.
    if (name.startsWith("right_")) {
      const traced = lookup(name.slice("right_".length));
      if (traced) return { ...traced, name };
    }
    return { name };
  });
}

/** Rank columns so the ones a field is asking for float to the top: an id field surfaces `*_id`
 *  columns, a timestamp field surfaces date/time ones. Mirrors OCPQ's `typeHint` sorting, which is
 *  what made its column pickers feel like they knew what you meant. */
export type ColumnHint = "id" | "timestamp" | "type" | "activity" | "string";

export function scoreColumn(info: ColumnInfo, hint: ColumnHint | undefined): number {
  if (!hint) return 0;
  const name = info.name.toLowerCase();
  const kind = info.kind;
  if (hint === "id") {
    if (name === "id" || name.endsWith("_id")) return 3;
    if (name.includes("id")) return 2;
    if (kind === "integer") return 1;
  } else if (hint === "timestamp") {
    if (name.includes("timestamp") || name.includes("time")) return 3;
    if (name.includes("date") || name.includes("created")) return 2;
    if (kind === "timestamp") return 1;
  } else if (hint === "type") {
    if (name === "type" || name.endsWith("_type")) return 3;
    if (name.includes("type") || name.includes("kind") || name.includes("category")) return 2;
    if (kind === "text") return 1;
  } else if (hint === "activity") {
    // Name matches only. Every other hint falls back to "any column of the right type", but there
    // is no such thing as an activity-shaped type -- falling back to `text` made the first text
    // column in any table an activity, so `actor.first_name` became the event type.
    if (name === "activity" || name === "action" || name === "event_type") return 3;
    if (name.includes("activity") || name.includes("action") || name.includes("event")) return 2;
  } else if (hint === "string" && kind === "text") {
    return 1;
  }
  return 0;
}

/** `resolveColumnInfo`, reordered by `hint`. Ties keep their original (alphabetical) order. */
export function rankedColumnInfo(
  nodes: EditorNode[],
  catalog: ExtractionCatalog,
  nodeId: string,
  hint?: ColumnHint,
): ColumnInfo[] {
  const infos = resolveColumnInfo(nodes, catalog, nodeId);
  if (!hint) return infos;
  return infos
    .map((info, i) => ({ info, i, score: scoreColumn(info, hint) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((e) => e.info);
}
