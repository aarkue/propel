// Editor data model for the EventLog creator. Pure: no React, no backend. The `LogJson` shape
// mirrors the generated `@r4pm/client` `EventLogInput` (the studio panel pins that mapping when it
// calls the binding), so this stays node-testable with no client dependency.

export type AttrType = "string" | "int" | "float" | "boolean" | "date";

export const ATTR_TYPES: AttrType[] = ["string", "int", "float", "boolean", "date"];

export interface AttrColumn {
  name: string;
  type: AttrType;
}

/** Per-case metadata not carried on individual event rows. `count` is a multiplier weight
 *  (>= 1): the case is emitted `count` times on export, but never duplicated in the editor.
 *  `attrs` holds case-level (trace) attribute values keyed by shared `caseAttrColumns` name. */
export interface CaseMeta {
  count: number;
  attrs: Record<string, string>;
}

export const DEFAULT_CASE_META: CaseMeta = { count: 1, attrs: {} };

export interface EventRow {
  rowId: string;
  caseId: string;
  activity: string;
  /** RFC3339, or "" when unset (reflow fills non-manual rows). */
  time: string;
  /** True once the user edits the timestamp directly; reflow then leaves it alone. */
  timeManual: boolean;
  /** Raw string cell per attribute column name. */
  attrs: Record<string, string>;
}

export interface TimeConfig {
  /** RFC3339 start applied to the first (non-manual) event of every case. */
  start: string;
  stepSeconds: number;
}

export interface EventLogModel {
  rows: EventRow[];
  /** Shared event-level attribute columns. */
  attrColumns: AttrColumn[];
  /** Shared case-level (trace) attribute columns; values live per case in `caseMeta`. */
  caseAttrColumns: AttrColumn[];
  time: TimeConfig;
  /** Per-case metadata (count + case attribute values), keyed by case id. Missing entries default. */
  caseMeta: Record<string, CaseMeta>;
}

/** Shape handed to the backend; structurally identical to `@r4pm/client` `EventLogInput`. */
export interface LogJson {
  traces: Array<{
    caseId: string;
    events: Array<{
      activity: string;
      time: string;
      attributes: Array<{ name: string; type: string; value: string }>;
    }>;
    /** Case-level (trace) attributes. */
    attributes: Array<{ name: string; type: string; value: string }>;
  }>;
}

export const DEFAULT_TIME: TimeConfig = { start: "2026-01-01T09:00:00.000Z", stepSeconds: 300 };

export const EMPTY_LOG: EventLogModel = {
  rows: [],
  attrColumns: [],
  caseAttrColumns: [],
  time: DEFAULT_TIME,
  caseMeta: {},
};

/** Case metadata for `caseId`, or the shared default when the case has none stored. */
export function getCaseMeta(model: EventLogModel, caseId: string): CaseMeta {
  return model.caseMeta[caseId] ?? DEFAULT_CASE_META;
}

/** Set the export multiplier for a case (clamped to an integer >= 1). */
export function setCaseCount(model: EventLogModel, caseId: string, count: number): EventLogModel {
  const n = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
  const prev = getCaseMeta(model, caseId);
  return writeCaseMeta(model, caseId, { ...prev, count: n });
}

/** Set one case-attribute value for a case (keyed by a `caseAttrColumns` name). */
export function setCaseAttr(
  model: EventLogModel,
  caseId: string,
  name: string,
  value: string,
): EventLogModel {
  const prev = getCaseMeta(model, caseId);
  return writeCaseMeta(model, caseId, { ...prev, attrs: { ...prev.attrs, [name]: value } });
}

/** Add a shared case-attribute column (no-op on blank or duplicate name). */
export function addCaseAttrColumn(model: EventLogModel, name: string, type: AttrType): EventLogModel {
  const trimmed = name.trim();
  if (!trimmed || model.caseAttrColumns.some((c) => c.name === trimmed)) return model;
  return { ...model, caseAttrColumns: [...model.caseAttrColumns, { name: trimmed, type }] };
}

/** Remove a shared case-attribute column and its values from every case. */
export function removeCaseAttrColumn(model: EventLogModel, name: string): EventLogModel {
  const caseMeta: Record<string, CaseMeta> = {};
  for (const [id, meta] of Object.entries(model.caseMeta)) {
    const { [name]: _drop, ...rest } = meta.attrs;
    if (meta.count <= 1 && Object.keys(rest).length === 0) continue;
    caseMeta[id] = { count: meta.count, attrs: rest };
  }
  return { ...model, caseAttrColumns: model.caseAttrColumns.filter((c) => c.name !== name), caseMeta };
}

/** Write a case's metadata, stripping empty attribute values and pruning fully-default entries. */
function writeCaseMeta(model: EventLogModel, caseId: string, meta: CaseMeta): EventLogModel {
  const attrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta.attrs)) {
    if (v.trim() !== "") attrs[k] = v;
  }
  const caseMeta = { ...model.caseMeta };
  if (meta.count <= 1 && Object.keys(attrs).length === 0) delete caseMeta[caseId];
  else caseMeta[caseId] = { count: meta.count, attrs };
  return { ...model, caseMeta };
}

/** Rename a case id across rows and metadata (used by the editable case-id field). */
export function renameCaseId(model: EventLogModel, from: string, to: string): EventLogModel {
  if (from === to) return model;
  const rows = model.rows.map((r) => (r.caseId === from ? { ...r, caseId: to } : r));
  const caseMeta = { ...model.caseMeta };
  if (caseMeta[from]) {
    caseMeta[to] = caseMeta[from];
    delete caseMeta[from];
  }
  return { ...model, rows, caseMeta };
}

/** Remove a case: drop its rows and metadata. */
export function removeCase(model: EventLogModel, caseId: string): EventLogModel {
  const caseMeta = { ...model.caseMeta };
  delete caseMeta[caseId];
  return { ...model, rows: model.rows.filter((r) => r.caseId !== caseId), caseMeta };
}

let rowSeq = 0;
/** Monotonic client id for React keys / reorder. Not time-based, so it stays test-deterministic. */
export function nextRowId(): string {
  rowSeq += 1;
  return `r${rowSeq}`;
}

const isoFromMs = (ms: number): string => new Date(ms).toISOString();

/** Ordered case ids by first appearance, with their rows. */
export function rowsByCase(model: EventLogModel): Array<{ caseId: string; rows: EventRow[] }> {
  const order: string[] = [];
  const map = new Map<string, EventRow[]>();
  for (const row of model.rows) {
    let bucket = map.get(row.caseId);
    if (!bucket) {
      bucket = [];
      map.set(row.caseId, bucket);
      order.push(row.caseId);
    }
    bucket.push(row);
  }
  return order.map((caseId) => ({ caseId, rows: map.get(caseId)! }));
}

/** Next free `case-N` id not already used in the model. */
export function nextCaseId(model: EventLogModel): string {
  const used = new Set(model.rows.map((r) => r.caseId));
  let n = 1;
  while (used.has(`case-${n}`)) n += 1;
  return `case-${n}`;
}

/**
 * Re-stamp every non-manual row. Each case walks its own cursor: the first non-manual event gets
 * `time.start`, each following non-manual event gets `previous + step`, and a manual row both keeps
 * its value and anchors the cursor so subsequent auto rows continue from it.
 */
export function reflowTimes(model: EventLogModel): EventLogModel {
  const stepMs = Math.max(0, model.time.stepSeconds) * 1000;
  const startMs = Date.parse(model.time.start);
  const base = Number.isNaN(startMs) ? Date.parse(DEFAULT_TIME.start) : startMs;
  const cursor = new Map<string, number>();
  const rows = model.rows.map((row) => {
    if (row.timeManual && row.time) {
      const t = Date.parse(row.time);
      if (!Number.isNaN(t)) cursor.set(row.caseId, t);
      return row;
    }
    const prev = cursor.get(row.caseId);
    const assigned = prev === undefined ? base : prev + stepMs;
    cursor.set(row.caseId, assigned);
    const time = isoFromMs(assigned);
    return time === row.time ? row : { ...row, time };
  });
  return { ...model, rows };
}

/** Append events (one per activity) to a case, contiguously after its existing rows, then reflow. */
export function appendEvents(model: EventLogModel, caseId: string, activities: string[]): EventLogModel {
  if (activities.length === 0) return model;
  const newRows: EventRow[] = activities.map((activity) => ({
    rowId: nextRowId(),
    caseId,
    activity,
    time: "",
    timeManual: false,
    attrs: {},
  }));
  let lastIdx = -1;
  for (let i = 0; i < model.rows.length; i += 1) {
    if (model.rows[i].caseId === caseId) lastIdx = i;
  }
  const rows =
    lastIdx === -1
      ? [...model.rows, ...newRows]
      : [...model.rows.slice(0, lastIdx + 1), ...newRows, ...model.rows.slice(lastIdx + 1)];
  return reflowTimes({ ...model, rows });
}

/** Move an event within its case from one position to another (reorders the trace), then reflow. */
export function reorderWithinCase(
  model: EventLogModel,
  caseId: string,
  fromIdx: number,
  toIdx: number,
): EventLogModel {
  const caseRows = model.rows.filter((r) => r.caseId === caseId);
  if (
    fromIdx < 0 ||
    fromIdx >= caseRows.length ||
    toIdx < 0 ||
    toIdx >= caseRows.length ||
    fromIdx === toIdx
  ) {
    return model;
  }
  const reordered = [...caseRows];
  const [moved] = reordered.splice(fromIdx, 1);
  reordered.splice(toIdx, 0, moved);
  let k = 0;
  const rows = model.rows.map((r) => (r.caseId === caseId ? reordered[k++] : r));
  return reflowTimes({ ...model, rows });
}

/** Clone a case (events + event attrs + case attrs) into a fresh case id; the copy is independent
 *  and starts at count 1. Cloned times reflow. Use the per-case count for weighted duplication. */
export function duplicateCase(model: EventLogModel, caseId: string): EventLogModel {
  const src = model.rows.filter((r) => r.caseId === caseId);
  if (src.length === 0) return model;
  const newId = nextCaseId(model);
  const clones: EventRow[] = src.map((r) => ({
    rowId: nextRowId(),
    caseId: newId,
    activity: r.activity,
    time: "",
    timeManual: false,
    attrs: { ...r.attrs },
  }));
  const srcAttrs = getCaseMeta(model, caseId).attrs;
  const cloned = reflowTimes({ ...model, rows: [...model.rows, ...clones] });
  return writeCaseMeta(cloned, newId, { count: 1, attrs: { ...srcAttrs } });
}

export type QuickAdd =
  | { kind: "append"; caseIds: Array<string | null>; activities: string[] }
  | { kind: "dup"; caseId: string }
  | { kind: "noop" };

/**
 * Parse a quick-add line:
 *   `c1 > Register Check Approve`  append a trace to case c1
 *   `Register Check`              append, auto-allocating a case id
 *   `c2..c5 > A B C`              one trace per case c2..c5
 *   `dup c1`                      clone case c1
 * Activity names are whitespace-separated (no spaces inside a name from the bar; rename in the grid).
 */
export function parseQuickAdd(input: string): QuickAdd {
  const text = input.trim();
  if (!text) return { kind: "noop" };

  const dup = /^dup\s+(.+)$/i.exec(text);
  if (dup) return { kind: "dup", caseId: dup[1].trim() };

  let caseSpec: string | null = null;
  let rest = text;
  const gt = text.indexOf(">");
  if (gt !== -1) {
    caseSpec = text.slice(0, gt).trim();
    rest = text.slice(gt + 1);
  }
  const activities = rest.trim().split(/\s+/).filter(Boolean);
  if (activities.length === 0) return { kind: "noop" };

  let caseIds: Array<string | null> = [null];
  if (caseSpec) {
    // `c1..c5` (prefix repeated) or `c1..5` (bare upper bound).
    const range = /^([A-Za-z._-]*)(\d+)\.\.(?:[A-Za-z._-]*)(\d+)$/.exec(caseSpec);
    if (range) {
      const [, prefix, fromStr, toStr] = range;
      const from = Number(fromStr);
      const to = Number(toStr);
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      caseIds = [];
      for (let n = lo; n <= hi; n += 1) caseIds.push(`${prefix}${n}`);
    } else {
      caseIds = [caseSpec];
    }
  }
  return { kind: "append", caseIds, activities };
}

/** Apply a quick-add line, allocating ids for `null` cases. Returns the model unchanged on noop. */
export function applyQuickAdd(model: EventLogModel, input: string): EventLogModel {
  const parsed = parseQuickAdd(input);
  if (parsed.kind === "noop") return model;
  if (parsed.kind === "dup") return duplicateCase(model, parsed.caseId);
  let acc = model;
  for (const caseId of parsed.caseIds) {
    const resolved = caseId ?? nextCaseId(acc);
    acc = appendEvents(acc, resolved, parsed.activities);
  }
  return acc;
}

/**
 * Group rows into the backend JSON shape. Empty attribute cells are dropped (per event and per
 * case). A case with `count > 1` is expanded here into `count` identical traces named
 * `${caseId}-1..${caseId}-count` - the only place multiplication materializes.
 */
export function toLogJson(model: EventLogModel): LogJson {
  const traces: LogJson["traces"] = [];
  for (const { caseId, rows } of rowsByCase(model)) {
    const meta = getCaseMeta(model, caseId);
    const events = rows.map((r) => ({
      activity: r.activity,
      time: r.time,
      attributes: model.attrColumns
        .filter((c) => (r.attrs[c.name] ?? "").trim() !== "")
        .map((c) => ({ name: c.name, type: c.type, value: r.attrs[c.name] })),
    }));
    const attributes = model.caseAttrColumns
      .filter((c) => (meta.attrs[c.name] ?? "").trim() !== "")
      .map((c) => ({ name: c.name, type: c.type, value: meta.attrs[c.name] }));
    const count = Math.max(1, Math.floor(meta.count));
    if (count === 1) {
      traces.push({ caseId, events, attributes });
    } else {
      for (let i = 1; i <= count; i += 1) {
        traces.push({ caseId: `${caseId}-${i}`, events, attributes });
      }
    }
  }
  return { traces };
}

/** Loose form of the backend log, matching the generated `EventLogInput` (optional arrays). */
export interface LogJsonIn {
  traces?: Array<{
    caseId: string;
    events?: Array<{
      activity: string;
      time: string;
      attributes?: Array<{ name: string; type: string; value: string }>;
    }>;
    attributes?: Array<{ name: string; type: string; value: string }>;
  }>;
}

/** Seed the editor from a backend log (import-to-seed). Existing times are kept (treated manual).
 *  Case-level attributes are read back; count always seeds at 1 (no duplicate detection). */
export function fromLogJson(json: LogJsonIn): EventLogModel {
  const columns = new Map<string, AttrType>();
  const caseColumns = new Map<string, AttrType>();
  const rows: EventRow[] = [];
  const caseMeta: Record<string, CaseMeta> = {};
  for (const trace of json.traces ?? []) {
    for (const ev of trace.events ?? []) {
      const attrs: Record<string, string> = {};
      for (const a of ev.attributes ?? []) {
        if (!columns.has(a.name)) columns.set(a.name, coerceAttrType(a.type));
        attrs[a.name] = a.value;
      }
      rows.push({
        rowId: nextRowId(),
        caseId: trace.caseId,
        activity: ev.activity,
        time: ev.time,
        timeManual: ev.time !== "",
        attrs,
      });
    }
    const caseAttrs: Record<string, string> = {};
    for (const a of trace.attributes ?? []) {
      if (!caseColumns.has(a.name)) caseColumns.set(a.name, coerceAttrType(a.type));
      caseAttrs[a.name] = a.value;
    }
    if (Object.keys(caseAttrs).length > 0) caseMeta[trace.caseId] = { count: 1, attrs: caseAttrs };
  }
  const attrColumns: AttrColumn[] = [...columns].map(([name, type]) => ({ name, type }));
  const caseAttrColumns: AttrColumn[] = [...caseColumns].map(([name, type]) => ({ name, type }));
  return { rows, attrColumns, caseAttrColumns, time: DEFAULT_TIME, caseMeta };
}

function coerceAttrType(t: string): AttrType {
  return (ATTR_TYPES as string[]).includes(t) ? (t as AttrType) : "string";
}
