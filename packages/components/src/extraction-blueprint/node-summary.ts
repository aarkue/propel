// What a node shows on its face. Pure string derivation, kept out of the components so the
// summary lines a user reads at a glance are unit-testable without rendering ReactFlow.
//
// The shape is OCPQ's: a short list of `label: value` pairs per mapping node ("Type", "ID",
// "Time", "Objects", ...) and a single summary line per transform node. A column reference renders
// as `{col}` so it is visually distinct from a constant, which renders bare.
import { entryMappings, entryTargetKind, type EditorMapping } from "./model";
import type {
  CompareOp,
  Literal,
  MappingEntry,
  NodeOp,
  Operand,
  Predicate,
  Target,
  TimestampSource,
  ValueExpression,
} from "./types";

export interface SummaryLine {
  label: string;
  value: string;
}

/** The four visual families a mapping node can belong to. */
export type MappingCategory = "event" | "object" | "relation";

export function categoryOf(kind: Target["type"] | undefined): MappingCategory {
  if (kind === "event") return "event";
  if (kind === "object") return "object";
  return "relation";
}

export const TARGET_LABEL: Record<Target["type"], string> = {
  event: "Event",
  object: "Object",
  e2o: "E2O relation",
  o2o: "O2O relation",
};

/** One-line rendering of a value expression: `{col}` for a column, the text for a constant, the
 *  raw template for a template, and `a ?? b` for a coalesce. */
export function describeExpr(expr: ValueExpression | null | undefined): string | undefined {
  if (!expr) return undefined;
  switch (expr.type) {
    case "column":
      return expr.column ? `{${expr.column}}` : undefined;
    case "constant":
      return expr.value || undefined;
    case "template":
      return expr.template || undefined;
    case "coalesce": {
      const parts = expr.parts.map(describeExpr).filter((p): p is string => !!p);
      return parts.length > 0 ? parts.join(" ?? ") : undefined;
    }
  }
}

export function describeTimestamp(ts: TimestampSource | null | undefined): string | undefined {
  if (!ts) return undefined;
  if (ts.type === "value") return describeExpr(ts.source);
  const date = (ts.date && describeExpr(ts.date.source)) || "?";
  const time = (ts.time && describeExpr(ts.time.source)) || "?";
  return `${date} + ${time}`;
}

/** Compact rendering of a predicate tree, for a Filter node's face and a mapping's `when` badge. */
export function describePredicate(p: Predicate | null | undefined): string | undefined {
  if (!p) return undefined;
  switch (p.type) {
    case "and":
    case "or": {
      const parts = p.conditions.map(describePredicate).filter((s): s is string => !!s);
      if (parts.length === 0) return `empty ${p.type.toUpperCase()}`;
      if (parts.length === 1) return parts[0];
      return `${parts.length} ${p.type.toUpperCase()} conditions`;
    }
    case "not": {
      const inner = describePredicate(p.condition);
      return inner ? `NOT (${inner})` : "NOT";
    }
    case "is-null":
      return `{${p.column || "?"}} is null`;
    case "is-empty":
      return `{${p.column || "?"}} is empty`;
    case "compare":
      return `${describeOperand(p.left)} ${COMPARE_SYMBOL[p.op] ?? p.op} ${describeOperand(p.right)}`;
    case "in": {
      const n = p.values.length;
      return `{${p.column || "?"}} in ${n} value${n === 1 ? "" : "s"}`;
    }
    case "matches":
      return `{${p.column || "?"}} matches /${p.regex}/`;
  }
}

const COMPARE_SYMBOL: Record<CompareOp, string> = {
  eq: "=",
  ne: "!=",
  lt: "<",
  le: "<=",
  gt: ">",
  ge: ">=",
};

export function describeOperand(op: Operand): string {
  if (op.type === "column") return op.column ? `{${op.column}}` : "?";
  return describeLiteral(op.value);
}

export function describeLiteral(v: Literal): string {
  if (v != null && typeof v === "object" && "timestamp" in v) return v.timestamp;
  return typeof v === "string" ? `"${v}"` : String(v);
}

/** The single line a Filter/Join/Union node shows under its title. */
export function describeNodeOp(op: NodeOp): string {
  switch (op.type) {
    case "source":
      return op.table || "no table";
    case "filter":
      return describePredicate(op.condition) ?? "no condition";
    case "join": {
      const pairs = op.on.map(([l, r]) => `${l} = ${r}`).join(", ");
      return pairs || "no join columns";
    }
    case "union":
      return `${op.inputs.length} input${op.inputs.length === 1 ? "" : "s"}`;
  }
}

/** The `label: value` lines a mapping node shows. Mirrors OCPQ's `ExtractorNode` config summary:
 *  only fields that are actually set appear, so an unconfigured node is visibly empty rather than
 *  full of placeholder rows. */
export function mappingSummaryLines(entry: MappingEntry): SummaryLine[] {
  if (entry.type === "ordered") {
    const kinds = entry.mappings.map((m) => TARGET_LABEL[m.target.type]);
    const shown = [...new Set(kinds)].slice(0, 2).join(", ");
    return [
      { label: "Group", value: `${entry.mappings.length} ordered, first match wins` },
      ...(shown ? [{ label: "Kinds", value: shown }] : []),
    ];
  }
  const [mapping] = entryMappings(entry);
  if (!mapping) return [];
  const lines: SummaryLine[] = [];
  const push = (label: string, value: string | undefined) => {
    if (value) lines.push({ label, value });
  };
  const t = mapping.target;
  switch (t.type) {
    case "event":
      push("Type", describeExpr(t.event_type));
      lines.push({ label: "ID", value: describeExpr(t.id) ?? "auto (UUID)" });
      push("Time", describeTimestamp(t.timestamp));
      if (t.attributes?.length) push("Attrs", `${t.attributes.length} mapped`);
      if (t.objects?.length) push("Objects", `${t.objects.length} related`);
      break;
    case "object":
      push("Type", describeExpr(t.object_type));
      push("ID", describeExpr(t.id));
      push("Time", describeTimestamp(t.timestamp));
      if (t.attributes?.length) push("Attrs", `${t.attributes.length} mapped`);
      break;
    case "e2o":
      push("Event", describeExpr(t.event.id));
      push("Object", describeExpr(t.object.id));
      push("Qual", describeExpr(t.qualifier));
      if (t.object.split) push("Split", "multi-valued");
      break;
    case "o2o":
      push("Source", describeExpr(t.source.id));
      push("Target", describeExpr(t.target.id));
      push("Qual", describeExpr(t.qualifier));
      if (t.source.split || t.target.split) push("Split", "multi-valued");
      break;
  }
  const when = describePredicate(mapping.when);
  if (when) lines.push({ label: "When", value: when });
  return lines;
}

/** The title a mapping node shows: its own label, else the target kind. */
export function mappingTitle(entry: MappingEntry): string {
  const [first] = entryMappings(entry);
  if (first?.label) return first.label;
  if (entry.type === "ordered") return "Ordered group";
  // A constant type name says far more than the kind does: a canvas of "Object, Object, Object"
  // is unreadable where "order, customer, item" is not. Only a constant qualifies -- a column or
  // template resolves per row, so there is no one name to show.
  const t = first?.target;
  const typeExpr = t?.type === "object" ? t.object_type : t?.type === "event" ? t.event_type : undefined;
  if (typeExpr?.type === "constant" && typeExpr.value) return typeExpr.value;
  const kind = entryTargetKind(entry);
  return kind ? TARGET_LABEL[kind] : "Mapping";
}

/** Mappings grouped by the node they read, for a source node's "N mappings" affordance. */
export function mappingsByNode(mappings: EditorMapping[]): Map<string, EditorMapping[]> {
  const out = new Map<string, EditorMapping[]>();
  for (const m of mappings) {
    const [first] = entryMappings(m.entry);
    if (!first) continue;
    const list = out.get(first.node);
    if (list) list.push(m);
    else out.set(first.node, [m]);
  }
  return out;
}
