import type { AttributeCatalogEntry, AttributeScope, Condition } from "@r4pm/client";

// ─── Datetime <-> input value ────────────────────────────────────────────────

/** Convert RFC 3339 to "YYYY-MM-DDTHH:mm" for <input type="datetime-local">. */
export function rfcToLocalInput(rfc: string): string {
  const d = new Date(rfc);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert "YYYY-MM-DDTHH:mm" local input to RFC 3339 string with local offset. */
export function localInputToRfc(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return local;
  return d.toISOString();
}

// ─── Numeric / categorical conditions ────────────────────────────────────────

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

// ─── Scope grouping helpers ──────────────────────────────────────────────────

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
