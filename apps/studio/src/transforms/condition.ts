import type {
  AttributeCatalogEntry,
  AttributeScope,
  Condition,
  MatchQuantifier,
  TimeframeMode,
} from "@r4pm/client";

export const MATCH_QUANTIFIERS: { value: MatchQuantifier; label: string }[] = [
  { value: "Any", label: "any" },
  { value: "All", label: "all" },
  { value: "First", label: "first" },
  { value: "Last", label: "last" },
];

export function quantifierLabel(q: MatchQuantifier): string {
  return MATCH_QUANTIFIERS.find((m) => m.value === q)?.label ?? q;
}

/** A fresh `EventMatch` over related events (object / case scope), matching any event. */
export function defaultEventMatch(): Extract<Condition, { type: "EventMatch" }> {
  return { type: "EventMatch", quantifier: "Any", condition: { type: "And", conditions: [] } };
}

/** A fresh `ObjectMatch` over related objects (E2O at event scope, O2O at object scope). */
export function defaultObjectMatch(): Extract<Condition, { type: "ObjectMatch" }> {
  return { type: "ObjectMatch", quantifier: "Any", condition: { type: "And", conditions: [] } };
}

/** Selectable timeframe modes with human labels. Span-based modes use the entity's
 * `[first event, last event]` interval; event-based modes quantify over its events. */
export const TIMEFRAME_MODES: { value: TimeframeMode; label: string; span: boolean }[] = [
  { value: "AnyEvent", label: "has any event in range", span: false },
  { value: "AllEvents", label: "has all events in range", span: false },
  { value: "SpanWithin", label: "lies within range", span: true },
  { value: "SpanEncloses", label: "spans the whole range", span: true },
  { value: "StartsWithin", label: "starts within range", span: true },
  { value: "EndsWithin", label: "ends within range", span: true },
  { value: "Overlaps", label: "overlaps range", span: true },
  { value: "Before", label: "ends before range", span: true },
  { value: "After", label: "starts after range", span: true },
];

export function timeframeModeLabel(mode: TimeframeMode): string {
  return TIMEFRAME_MODES.find((m) => m.value === mode)?.label ?? mode;
}

/** A fresh `Timeframe` condition spanning the current calendar year. */
export function defaultTimeframeCondition(): Extract<Condition, { type: "Timeframe" }> {
  const year = new Date().getFullYear();
  return {
    type: "Timeframe",
    start: `${year}-01-01T00:00:00+00:00`,
    end: `${year}-12-31T23:59:59+00:00`,
    mode: "AnyEvent",
  };
}

/** Duration units with short ("sec") and long ("seconds") label forms, ascending by size. */
export const DURATION_UNITS = [
  { short: "sec", long: "seconds", ms: 1_000 },
  { short: "min", long: "minutes", ms: 60_000 },
  { short: "hours", long: "hours", ms: 3_600_000 },
  { short: "days", long: "days", ms: 86_400_000 },
] as const;

/** Format a duration as the largest unit that divides it evenly (short labels), else raw ms. */
export function fmtDurMs(ms: number): string {
  for (const u of [...DURATION_UNITS].reverse()) {
    if (ms % u.ms === 0) return `${ms / u.ms} ${u.short}`;
  }
  return `${ms} ms`;
}

// datetime-local is timezone-naive, so we fix its wall clock to UTC everywhere to match the histogram and stored RFC 3339 instants.

/** Convert an RFC 3339 instant to a UTC "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
export function rfcToLocalInput(rfc: string): string {
  const d = new Date(rfc);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Convert a "YYYY-MM-DDTHH:mm" input value (read as UTC) to an RFC 3339 UTC instant. */
export function localInputToRfc(local: string): string {
  const withZ = /Z$|[+-]\d\d:?\d\d$/.test(local) ? local : `${local}Z`;
  const d = new Date(withZ);
  if (Number.isNaN(d.getTime())) return local;
  return d.toISOString();
}

/** Parse numeric bounds from the current condition (if it's a simple GreaterThan/LessThan/And combo) */
export function parseNumericBounds(
  condition: Condition,
  key: string,
): { min: number | null; max: number | null } {
  let min: number | null = null;
  let max: number | null = null;
  const extract = (c: Condition) => {
    if (c.type === "AttributeGreaterThan" && c.key === key) min = c.value;
    if (c.type === "AttributeLessThan" && c.key === key) max = c.value;
    if (c.type === "And") c.conditions.forEach(extract);
  };
  extract(condition);
  return { min, max };
}

/** Build a condition for numeric range filtering */
export function buildNumericCondition(key: string, min: number | null, max: number | null): Condition {
  const parts: Condition[] = [];
  if (min != null) parts.push({ type: "AttributeGreaterThan", key, value: min });
  if (max != null) parts.push({ type: "AttributeLessThan", key, value: max });
  if (parts.length === 0) return { type: "And", conditions: [] };
  if (parts.length === 1) return parts[0];
  return { type: "And", conditions: parts };
}

/** Build a condition for categorical value selection */
export function buildCategoricalCondition(key: string, values: string[]): Condition {
  if (values.length === 0) return { type: "And", conditions: [] };
  if (values.length === 1) return { type: "AttributeEquals", key, value: values[0] };
  return { type: "Or", conditions: values.map((v) => ({ type: "AttributeEquals" as const, key, value: v })) };
}

/** Parse selected values from a categorical condition */
export function parseCategoricalValues(condition: Condition, key: string): string[] {
  const values: string[] = [];
  const extract = (c: Condition) => {
    if (c.type === "AttributeEquals" && c.key === key) values.push(c.value);
    if (c.type === "Or") c.conditions.forEach(extract);
    if (c.type === "And") c.conditions.forEach(extract);
  };
  extract(condition);
  return values;
}

export type Groups = Record<string, { label: string; entries: AttributeCatalogEntry[] }>;

export function scopeToKey(s: AttributeScope): string {
  switch (s.type) {
    case "LogGlobal":
      return "LogGlobal";
    case "Event":
      return `Event:${s.activity ?? "__all__"}`;
    case "Object":
      return `Object:${s.object_type ?? "__all__"}`;
  }
}

export function keyToScope(k: string): AttributeScope {
  if (k === "LogGlobal") return { type: "LogGlobal" };
  const [kind, rest] = k.split(":", 2);
  const value = rest === "__all__" ? null : rest;
  if (kind === "Event") return { type: "Event", activity: value };
  return { type: "Object", object_type: value };
}

export function groupEntries(entries: AttributeCatalogEntry[]): Groups {
  const groups: Groups = {};
  for (const e of entries) {
    const key = scopeToKey(e.scope);
    if (!groups[key]) {
      groups[key] = { label: scopeLabel(e.scope), entries: [] };
    }
    groups[key].entries.push(e);
  }
  return groups;
}

export function scopeLabel(s: AttributeScope): string {
  switch (s.type) {
    case "LogGlobal":
      return "Log-level attributes";
    case "Event":
      return s.activity ? `Events: ${s.activity}` : "Events (all)";
    case "Object":
      return s.object_type ? `Objects: ${s.object_type}` : "Cases / Objects (all)";
  }
}

// Three combinators map to backend nodes: all->And, any->Or, none->Not{Or} (single child collapses to Not{child}).

export type Combinator = "all" | "any" | "none";

/** Read a condition as a combinator + child list, or null if it is a leaf predicate. */
export function readGroup(c: Condition): { combinator: Combinator; children: Condition[] } | null {
  if (c.type === "And") return { combinator: "all", children: c.conditions };
  if (c.type === "Or") return { combinator: "any", children: c.conditions };
  if (c.type === "Not") {
    const inner = c.condition;
    if (inner.type === "Or") return { combinator: "none", children: inner.conditions };
    return { combinator: "none", children: [inner] };
  }
  return null;
}

/** Build the backend node for a combinator + child list. */
export function buildGroup(combinator: Combinator, children: Condition[]): Condition {
  if (combinator === "all") return { type: "And", conditions: children };
  if (combinator === "any") return { type: "Or", conditions: children };
  if (children.length === 1) return { type: "Not", condition: children[0] };
  return { type: "Not", condition: { type: "Or", conditions: children } };
}

// A fresh attribute predicate uses AttributeExists so the key survives until a value is picked.
export function defaultAttributeLeaf(): Extract<Condition, { type: "AttributeExists" }> {
  return { type: "AttributeExists", key: "" };
}

export function defaultEntityType(): Extract<Condition, { type: "EntityType" }> {
  return { type: "EntityType", value: "" };
}

export function defaultDuration(): Extract<Condition, { type: "Duration" }> {
  return { type: "Duration", min_ms: null, max_ms: null };
}

export function defaultGroup(combinator: Combinator): Condition {
  return buildGroup(combinator, []);
}

// Rich controls (activity/type set, attribute range/value-set/exists) map to small same-key subtrees, which the editor renders as one leaf and writes back to directly.

/** Selected type values if `c` is an EntityType set, else null. A single `EntityType`
 *  with an empty value still counts (a freshly added, not-yet-configured type predicate). */
export function readActivitySet(c: Condition): string[] | null {
  if (c.type === "EntityType") return [c.value];
  if (c.type === "Or" && c.conditions.length > 0 && c.conditions.every((x) => x.type === "EntityType")) {
    return c.conditions.map((x) => (x as Extract<Condition, { type: "EntityType" }>).value);
  }
  return null;
}

/** Build the smallest EntityType subtree for a set of selected type values. */
export function buildActivitySet(values: string[]): Condition {
  const vals = values.filter((v) => v !== "");
  if (vals.length === 0) return { type: "EntityType", value: "" };
  if (vals.length === 1) return { type: "EntityType", value: vals[0] };
  return { type: "Or", conditions: vals.map((v) => ({ type: "EntityType", value: v })) };
}

export type AttrDistKind = "numeric" | "categorical" | "exists";

/** The attribute + kind if `c` is a single-key predicate the distribution panel can drive (equals-set, numeric range, or exists), else null. */
export function readAttrDist(c: Condition): { key: string; kind: AttrDistKind } | null {
  const sameKey = (conds: Condition[]): string | null => {
    const key = (conds[0] as { key?: string }).key;
    if (key == null) return null;
    return conds.every((x) => (x as { key?: string }).key === key) ? key : null;
  };
  if (c.type === "AttributeExists") return { key: c.key, kind: "exists" };
  if (c.type === "AttributeGreaterThan" || c.type === "AttributeLessThan")
    return { key: c.key, kind: "numeric" };
  if (c.type === "AttributeEquals") return { key: c.key, kind: "categorical" };
  if (
    c.type === "And" &&
    c.conditions.length > 0 &&
    c.conditions.every((x) => x.type === "AttributeGreaterThan" || x.type === "AttributeLessThan")
  ) {
    const key = sameKey(c.conditions);
    if (key != null) return { key, kind: "numeric" };
  }
  if (c.type === "Or" && c.conditions.length > 0 && c.conditions.every((x) => x.type === "AttributeEquals")) {
    const key = sameKey(c.conditions);
    if (key != null) return { key, kind: "categorical" };
  }
  return null;
}
