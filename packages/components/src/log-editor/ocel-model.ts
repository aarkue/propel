// Editor data model for the OCEL creator. Pure: no React, no backend. `OcelJson` mirrors the
// generated `@r4pm/client` `OcelInput` (studio pins the mapping at the binding call site).

import {
  type AttrColumn,
  type AttrType,
  ATTR_TYPES,
  DEFAULT_TIME,
  nextRowId,
  type TimeConfig,
} from "./model";

export interface OcelTypeDef {
  name: string;
  attributes: AttrColumn[];
}

export interface OcelRel {
  objectId: string;
  qualifier: string;
}

export interface OcelEventRow {
  rowId: string;
  id: string;
  type: string;
  time: string;
  timeManual: boolean;
  attrs: Record<string, string>;
  /** Event-to-object relationships. */
  e2o: OcelRel[];
}

export interface OcelObjectRow {
  rowId: string;
  id: string;
  type: string;
  /** Single snapshot value per attribute; timestamped at the log start on export (v1). */
  attrs: Record<string, string>;
  /** Object-to-object relationships. */
  o2o: OcelRel[];
}

export interface OcelModel {
  eventTypes: OcelTypeDef[];
  objectTypes: OcelTypeDef[];
  events: OcelEventRow[];
  objects: OcelObjectRow[];
  time: TimeConfig;
}

/** Shape handed to the backend; structurally identical to `@r4pm/client` `OcelInput`. */
export interface OcelJson {
  eventTypes: Array<{ name: string; attributes: Array<{ name: string; type: string }> }>;
  objectTypes: Array<{ name: string; attributes: Array<{ name: string; type: string }> }>;
  events: Array<{
    id: string;
    type: string;
    time: string;
    attributes: Array<{ name: string; type: string; value: string }>;
    relationships: Array<{ objectId: string; qualifier: string }>;
  }>;
  objects: Array<{
    id: string;
    type: string;
    attributes: Array<{ name: string; type: string; value: string; time: string }>;
    relationships: Array<{ objectId: string; qualifier: string }>;
  }>;
}

export const EMPTY_OCEL: OcelModel = {
  eventTypes: [],
  objectTypes: [],
  events: [],
  objects: [],
  time: DEFAULT_TIME,
};

const isoFromMs = (ms: number): string => new Date(ms).toISOString();

/**
 * Re-stamp non-manual events in global order. A cursor walks the events: the first non-manual gets
 * `start`, each following non-manual gets `previous + step`, and a manual event both keeps its time
 * and anchors the cursor so subsequent auto events stay monotone after it.
 */
export function reflowOcelTimes(model: OcelModel): OcelModel {
  const stepMs = Math.max(0, model.time.stepSeconds) * 1000;
  const startMs = Date.parse(model.time.start);
  const base = Number.isNaN(startMs) ? Date.parse(DEFAULT_TIME.start) : startMs;
  let cursor: number | undefined;
  const events = model.events.map((ev) => {
    if (ev.timeManual && ev.time) {
      const t = Date.parse(ev.time);
      if (!Number.isNaN(t)) cursor = t;
      return ev;
    }
    const assigned = cursor === undefined ? base : cursor + stepMs;
    cursor = assigned;
    const time = isoFromMs(assigned);
    return time === ev.time ? ev : { ...ev, time };
  });
  return { ...model, events };
}

function ensureEventType(model: OcelModel, name: string): OcelModel {
  if (model.eventTypes.some((t) => t.name === name)) return model;
  return { ...model, eventTypes: [...model.eventTypes, { name, attributes: [] }] };
}

function ensureObjectType(model: OcelModel, name: string): OcelModel {
  if (model.objectTypes.some((t) => t.name === name)) return model;
  return { ...model, objectTypes: [...model.objectTypes, { name, attributes: [] }] };
}

/** Ensure an object with `id` exists; if new, mint it under `type` (declaring the type if needed). */
export function ensureObject(model: OcelModel, id: string, type: string): OcelModel {
  if (model.objects.some((o) => o.id === id)) return model;
  const withType = ensureObjectType(model, type);
  return {
    ...withType,
    objects: [...withType.objects, { rowId: nextRowId(), id, type, attrs: {}, o2o: [] }],
  };
}

/** Type of an existing object id, or undefined. */
function objectType(model: OcelModel, id: string): string | undefined {
  return model.objects.find((o) => o.id === id)?.type;
}

export function nextEventId(model: OcelModel): string {
  const used = new Set(model.events.map((e) => e.id));
  let n = 1;
  while (used.has(`e${n}`)) n += 1;
  return `e${n}`;
}

export function nextObjectId(model: OcelModel): string {
  const used = new Set(model.objects.map((o) => o.id));
  let n = 1;
  while (used.has(`o${n}`)) n += 1;
  return `o${n}`;
}

interface ParsedRef {
  type?: string;
  id: string;
  qualifier?: string;
}

export interface OcelQuickAdd {
  kind: "event" | "noop";
  eventType?: string;
  refs?: ParsedRef[];
}

/**
 * Parse an OCEL event quick-add line:
 *   `place_order Order:o1 Item:i1 i2`
 * First token = event type. Each remaining token is an object ref: `Type:id`, bare `id`
 * (reuses a known id's type), and an optional `#qualifier` suffix (`Item:i1#contains`).
 */
export function parseOcelQuickAdd(input: string): OcelQuickAdd {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { kind: "noop" };
  const [eventType, ...rest] = tokens;
  const refs: ParsedRef[] = rest.map((tok) => {
    let rest2 = tok;
    let qualifier: string | undefined;
    const hash = rest2.indexOf("#");
    if (hash !== -1) {
      qualifier = rest2.slice(hash + 1) || undefined;
      rest2 = rest2.slice(0, hash);
    }
    const colon = rest2.indexOf(":");
    if (colon !== -1) {
      return { type: rest2.slice(0, colon), id: rest2.slice(colon + 1), qualifier };
    }
    return { id: rest2, qualifier };
  });
  return { kind: "event", eventType, refs: refs.filter((r) => r.id) };
}

const FALLBACK_OBJECT_TYPE = "object";

/** Apply an OCEL event quick-add: declares missing types, auto-creates referenced objects, links E2O. */
export function applyOcelQuickAdd(model: OcelModel, input: string): OcelModel {
  const parsed = parseOcelQuickAdd(input);
  if (parsed.kind === "noop" || !parsed.eventType) return model;

  let acc = ensureEventType(model, parsed.eventType);
  const e2o: OcelRel[] = [];
  for (const ref of parsed.refs ?? []) {
    const type = ref.type ?? objectType(acc, ref.id) ?? FALLBACK_OBJECT_TYPE;
    acc = ensureObject(acc, ref.id, type);
    e2o.push({ objectId: ref.id, qualifier: ref.qualifier ?? type });
  }
  const event: OcelEventRow = {
    rowId: nextRowId(),
    id: nextEventId(acc),
    type: parsed.eventType,
    time: "",
    timeManual: false,
    attrs: {},
    e2o,
  };
  return reflowOcelTimes({ ...acc, events: [...acc.events, event] });
}

/** Ensure an object with `id` exists, creating it under the first object type (or `object`) if not. */
export function ensureObjectId(model: OcelModel, id: string): OcelModel {
  if (model.objects.some((o) => o.id === id)) return model;
  const type = model.objectTypes[0]?.name ?? FALLBACK_OBJECT_TYPE;
  return ensureObject(model, id, type);
}

function moveInArray<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Reorder events (affects the global time order); re-stamps non-manual times. */
export function reorderEvents(model: OcelModel, fromIdx: number, toIdx: number): OcelModel {
  const events = moveInArray(model.events, fromIdx, toIdx);
  if (events === model.events) return model;
  return reflowOcelTimes({ ...model, events });
}

/** Reorder objects (display order only). */
export function reorderObjects(model: OcelModel, fromIdx: number, toIdx: number): OcelModel {
  const objects = moveInArray(model.objects, fromIdx, toIdx);
  if (objects === model.objects) return model;
  return { ...model, objects };
}

/** Append an empty event of the given type (declaring the type if new); time auto-stamps on reflow. */
export function addEventOfType(model: OcelModel, type: string): OcelModel {
  const t = type.trim() || (model.eventTypes[0]?.name ?? "event");
  const withType = ensureEventType(model, t);
  const event: OcelEventRow = {
    rowId: nextRowId(),
    id: nextEventId(withType),
    type: t,
    time: "",
    timeManual: false,
    attrs: {},
    e2o: [],
  };
  return reflowOcelTimes({ ...withType, events: [...withType.events, event] });
}

export function addObject(model: OcelModel, type: string): OcelModel {
  const t = type || (model.objectTypes[0]?.name ?? FALLBACK_OBJECT_TYPE);
  const withType = ensureObjectType(model, t);
  return {
    ...withType,
    objects: [
      ...withType.objects,
      { rowId: nextRowId(), id: nextObjectId(withType), type: t, attrs: {}, o2o: [] },
    ],
  };
}

function attrsOf(type: OcelTypeDef | undefined, attrs: Record<string, string>) {
  if (!type) return [];
  return type.attributes
    .filter((c) => (attrs[c.name] ?? "").trim() !== "")
    .map((c) => ({ name: c.name, type: c.type, value: attrs[c.name] }));
}

export function toOcelJson(model: OcelModel): OcelJson {
  const evType = new Map(model.eventTypes.map((t) => [t.name, t]));
  const obType = new Map(model.objectTypes.map((t) => [t.name, t]));
  const mapTypeDef = (t: OcelTypeDef) => ({
    name: t.name,
    attributes: t.attributes.map((a) => ({ name: a.name, type: a.type })),
  });
  return {
    eventTypes: model.eventTypes.map(mapTypeDef),
    objectTypes: model.objectTypes.map(mapTypeDef),
    events: model.events.map((e) => ({
      id: e.id,
      type: e.type,
      time: e.time,
      attributes: attrsOf(evType.get(e.type), e.attrs),
      relationships: e.e2o.map((r) => ({ objectId: r.objectId, qualifier: r.qualifier })),
    })),
    objects: model.objects.map((o) => ({
      id: o.id,
      type: o.type,
      attributes: attrsOf(obType.get(o.type), o.attrs).map((a) => ({ ...a, time: model.time.start })),
      relationships: o.o2o.map((r) => ({ objectId: r.objectId, qualifier: r.qualifier })),
    })),
  };
}

/** Accept the editor's own types plus canonical OCEL 2.0 spellings (`integer`/`time`/`number`). */
function coerceAttrType(t: string): AttrType {
  const canonical: Record<string, AttrType> = { integer: "int", time: "date", number: "float" };
  const v = canonical[t] ?? t;
  return (ATTR_TYPES as string[]).includes(v) ? (v as AttrType) : "string";
}

/** Loose form of the backend OCEL, matching the generated `OcelInput` (optional arrays). */
export interface OcelJsonIn {
  eventTypes?: Array<{ name: string; attributes?: Array<{ name: string; type: string }> }>;
  objectTypes?: Array<{ name: string; attributes?: Array<{ name: string; type: string }> }>;
  events?: Array<{
    id: string;
    type: string;
    time: string;
    attributes?: Array<{ name: string; type: string; value: string }>;
    relationships?: Array<{ objectId: string; qualifier: string }>;
  }>;
  objects?: Array<{
    id: string;
    type: string;
    attributes?: Array<{ name: string; type: string; value: string }>;
    relationships?: Array<{ objectId: string; qualifier: string }>;
  }>;
}

export function fromOcelJson(json: OcelJsonIn): OcelModel {
  const mapType = (t: { name: string; attributes?: Array<{ name: string; type: string }> }): OcelTypeDef => ({
    name: t.name,
    attributes: (t.attributes ?? []).map((a) => ({ name: a.name, type: coerceAttrType(a.type) })),
  });
  return {
    eventTypes: (json.eventTypes ?? []).map(mapType),
    objectTypes: (json.objectTypes ?? []).map(mapType),
    events: (json.events ?? []).map((e) => ({
      rowId: nextRowId(),
      id: e.id,
      type: e.type,
      time: e.time,
      timeManual: e.time !== "",
      attrs: Object.fromEntries((e.attributes ?? []).map((a) => [a.name, a.value])),
      e2o: (e.relationships ?? []).map((r) => ({ objectId: r.objectId, qualifier: r.qualifier })),
    })),
    objects: (json.objects ?? []).map((o) => ({
      rowId: nextRowId(),
      id: o.id,
      type: o.type,
      attrs: Object.fromEntries((o.attributes ?? []).map((a) => [a.name, a.value])),
      o2o: (o.relationships ?? []).map((r) => ({ objectId: r.objectId, qualifier: r.qualifier })),
    })),
    time: DEFAULT_TIME,
  };
}
