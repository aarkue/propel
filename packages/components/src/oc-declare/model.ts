import type { OCDeclareArc, OCDeclareArcLabel, ObjectTypeAssociation } from "./index";
import type { ArcType } from "./types";

export type EdgeTemplate =
  | "as"
  | "ef"
  | "ef-rev"
  | "df"
  | "df-rev"
  | "nas"
  | "nef"
  | "nef-rev"
  | "ndf"
  | "ndf-rev";

export interface DeclareNode {
  id: string;
  type: string;
  kind: "activity" | "init" | "exit";
  position?: { x: number; y: number };
}

/** Routed edge geometry from a layout run, kept in the model so hosts can persist it. */
export interface DeclareEdgeRoute {
  points: { x: number; y: number }[];
  /** Source/target node top-left at layout time; drag deformation is relative to these. */
  sourcePos: { x: number; y: number };
  targetPos: { x: number; y: number };
  /** Where the layout centred the edge's text label. */
  labelAnchor?: { x: number; y: number };
}

export interface DeclareEdge {
  id: string;
  source: string;
  target: string;
  template: EdgeTemplate;
  cardinality?: [number | null, number | null];
  label: OCDeclareArcLabel;
  violation?: number;
  route?: DeclareEdgeRoute;
}

export interface DeclareFlowModel {
  nodes: DeclareNode[];
  edges: DeclareEdge[];
}

export const EDGE_TEMPLATES: EdgeTemplate[] = [
  "as",
  "ef",
  "ef-rev",
  "df",
  "df-rev",
  "nas",
  "nef",
  "nef-rev",
  "ndf",
  "ndf-rev",
];

export const TEMPLATE_LABELS: Record<EdgeTemplate, string> = {
  as: "Always Succeeds",
  ef: "Eventually Follows",
  "ef-rev": "Eventually Precedes",
  df: "Directly Follows",
  "df-rev": "Directly Precedes",
  nas: "not Always Succeeds",
  nef: "not Eventually Follows",
  "nef-rev": "not Eventually Precedes",
  ndf: "not Directly Follows",
  "ndf-rev": "not Directly Precedes",
};

export const TEMPLATE_TO_ARC: Record<EdgeTemplate, { arc_type: ArcType; negated: boolean }> = {
  as: { arc_type: "AS", negated: false },
  ef: { arc_type: "EF", negated: false },
  "ef-rev": { arc_type: "EP", negated: false },
  df: { arc_type: "DF", negated: false },
  "df-rev": { arc_type: "DP", negated: false },
  nas: { arc_type: "AS", negated: true },
  nef: { arc_type: "EF", negated: true },
  "nef-rev": { arc_type: "EP", negated: true },
  ndf: { arc_type: "DF", negated: true },
  "ndf-rev": { arc_type: "DP", negated: true },
};

/** Backend counts for a template: negated templates force `[0,0]`, else the cardinality or `[1,null]`. */
export function templateCounts(
  t: EdgeTemplate,
  cardinality: [number | null, number | null] | undefined,
): [number | null, number | null] {
  if (TEMPLATE_TO_ARC[t].negated) return [0, 0];
  return cardinality ?? [1, null];
}

const PREFIX: Record<DeclareNode["kind"], string> = {
  activity: "",
  init: "<init> ",
  exit: "<exit> ",
};
/** The `<init>`/`<exit>`-prefixed display name used as a node's backend identity. */
export const nodeDisplayName = (n: DeclareNode) => `${PREFIX[n.kind]}${n.type}`;

/** `base`, or `base 2`, `base 3`, ... if a node of `kind` already has that name. rust4pm knows
 *  nodes by name, so two nodes of one name would share one place in the layout. */
export function uniqueName(model: DeclareFlowModel, base: string, kind: DeclareNode["kind"]): string {
  const taken = new Set(model.nodes.map(nodeDisplayName));
  const free = (type: string) => !taken.has(nodeDisplayName({ id: "", type, kind }));
  if (free(base)) return base;
  let n = 2;
  while (!free(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
const nodeName = nodeDisplayName;

/** Derive the backend arc list from the edit model (pure). Node names carry `<init>`/`<exit>` prefixes. */
export function toArcs(model: DeclareFlowModel): OCDeclareArc[] {
  return modelArcs(model).arcs;
}

/** {@link toArcs}, with the id of the model edge behind each arc (`edgeIds[i]` for `arcs[i]`). */
export function modelArcs(model: DeclareFlowModel): {
  arcs: OCDeclareArc[];
  edgeIds: string[];
  /** Activities no arc names, which rust4pm only draws when told about them. */
  extraActivities: string[];
} {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const arcs: OCDeclareArc[] = [];
  const edgeIds: string[] = [];
  for (const e of model.edges) {
    const from = byId.get(e.source);
    const to = byId.get(e.target);
    if (!from || !to) continue;
    arcs.push({
      from: nodeName(from),
      to: nodeName(to),
      arc_type: TEMPLATE_TO_ARC[e.template].arc_type,
      counts: templateCounts(e.template, e.cardinality),
      label: e.label,
    });
    edgeIds.push(e.id);
  }
  const named = new Set(arcs.flatMap((a) => [a.from, a.to]));
  const extraActivities = [...new Set(model.nodes.map(nodeName))].filter((name) => !named.has(name));
  return { arcs, edgeIds, extraActivities };
}

const ARC_TO_TEMPLATE: Record<string, EdgeTemplate> = {
  "AS|false": "as",
  "EF|false": "ef",
  "EP|false": "ef-rev",
  "DF|false": "df",
  "DP|false": "df-rev",
  "AS|true": "nas",
  "EF|true": "nef",
  "EP|true": "nef-rev",
  "DF|true": "ndf",
  "DP|true": "ndf-rev",
};

/** A model whose nodes are all placed but some of whose arcs have no route, e.g., one loaded from a
 *  file, or a route made for positions its nodes no longer have: its arcs need routing over the
 *  saved positions rather than a fresh layout. */
export function needsReroute(model: DeclareFlowModel): boolean {
  if (model.nodes.length === 0 || !model.nodes.every((n) => n.position)) return false;
  const position = new Map(model.nodes.map((n) => [n.id, n.position]));
  const away = (p: { x: number; y: number } | undefined, at: { x: number; y: number }) =>
    !p || Math.abs(p.x - at.x) > 0.5 || Math.abs(p.y - at.y) > 0.5;
  return model.edges.some(
    (e) =>
      !e.route ||
      away(position.get(e.source), e.route.sourcePos) ||
      away(position.get(e.target), e.route.targetPos),
  );
}

/** Parse a node display name, extracting an `<init>`/`<exit>` prefix into `kind`. */
export function parseNodeName(name: string): { type: string; kind: DeclareNode["kind"] } {
  const s = name.trim();
  if (s.startsWith("<init> ")) return { type: s.slice(7).trim(), kind: "init" };
  if (s.startsWith("<exit> ")) return { type: s.slice(7).trim(), kind: "exit" };
  return { type: s, kind: "activity" };
}

/** Build an edit model from a backend arc list (import/paste). Nodes deduped by prefixed name;
 *  template chosen from `(arc_type, counts===[0,0])`. Positions unset (host/auto-layout assigns). */
export function arcsToModel(arcs: OCDeclareArc[]): DeclareFlowModel {
  const ids = new Map<string, string>();
  const nodes: DeclareNode[] = [];
  const idFor = (name: string) => {
    const ex = ids.get(name);
    if (ex) return ex;
    const id = `n${nodes.length}`;
    ids.set(name, id);
    const { type, kind } = parseNodeName(name);
    nodes.push({ id, type, kind });
    return id;
  };
  const edges: DeclareEdge[] = arcs.map((a, i) => {
    const negated = a.counts[0] === 0 && a.counts[1] === 0;
    return {
      id: `e${i}`,
      source: idFor(a.from),
      target: idFor(a.to),
      template: ARC_TO_TEMPLATE[`${a.arc_type}|${negated}`],
      cardinality: negated ? undefined : a.counts,
      label: a.label,
    };
  });
  return { nodes, edges };
}

/** Merge a backend arc list into an existing model; existing nodes are reused by prefixed name, new nodes/edges get a fresh id from `nextId`. */
export function mergeArcs(
  model: DeclareFlowModel,
  arcs: OCDeclareArc[],
  nextId: () => string,
): DeclareFlowModel {
  const sub = arcsToModel(arcs);
  const nodes = [...model.nodes];
  const idByName = new Map(nodes.map((n) => [nodeDisplayName(n), n.id]));
  const remap = new Map<string, string>();
  for (const sn of sub.nodes) {
    const name = nodeDisplayName(sn);
    let id = idByName.get(name);
    if (!id) {
      id = nextId();
      idByName.set(name, id);
      nodes.push({ ...sn, id });
    }
    remap.set(sn.id, id);
  }
  const edges = [
    ...model.edges,
    ...sub.edges.map((e) => ({
      ...e,
      id: nextId(),
      source: remap.get(e.source) ?? e.source,
      target: remap.get(e.target) ?? e.target,
    })),
  ];
  return { nodes, edges };
}

/** Human-readable cardinality range (mirrors OCPQ MinMaxSugar): `= n`, `≥ n`, `≤ n`, `min - max`, or null; `≥ 1` is the implied default, so it renders as null too. */
export function cardinalitySugar(c: [number | null, number | null] | undefined): string | null {
  if (!c) return null;
  let [min, max] = c;
  if (min === 0) min = null;
  if (max === 0) max = 0;
  if (min == null && max == null) return null;
  if (min === 1 && max == null) return null;
  if (min != null && max != null && min === max) return `= ${min}`;
  if (max == null) return `≥ ${min}`;
  if (min == null) return `≤ ${max}`;
  return `${min} – ${max}`;
}

export type { ObjectTypeAssociation };
