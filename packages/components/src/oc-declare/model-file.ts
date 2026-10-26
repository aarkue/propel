import type { OCDeclareArc } from "./index";
import { arcsToModel, type DeclareFlowModel, nodeDisplayName, parseNodeName, toArcs } from "./model";

/** A saved OC-DECLARE model: rust4pm's arcs plus every node, so the arrangement and activities
 *  without arcs survive a save. propel's engine reads the same JSON (`OCDeclareModelFile`). */
export interface OCDeclareModelFile {
  version: 1;
  arcs: OCDeclareArc[];
  /** Every node by display name (`<init> `/`<exit> ` prefixed for object nodes), with its position when laid out. */
  nodes: { name: string; position?: { x: number; y: number } }[];
}

export const OC_DECLARE_FILE_EXTENSION = "ocdeclare";

export function toModelFile(model: DeclareFlowModel): OCDeclareModelFile {
  return {
    version: 1,
    arcs: toArcs(model),
    nodes: model.nodes.map((n) =>
      n.position ? { name: nodeDisplayName(n), position: n.position } : { name: nodeDisplayName(n) },
    ),
  };
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const ARC_TYPES = new Set(["AS", "EF", "EP", "DF", "DP"]);
const isCount = (v: unknown) => v === null || (typeof v === "number" && v >= 0);
const isAssociation = (v: unknown) =>
  isObject(v) &&
  ((v.type === "Simple" && typeof v.object_type === "string") ||
    (v.type === "O2O" && typeof v.first === "string" && typeof v.second === "string"));

/** Matches what rust4pm accepts for an `OCDeclareArc`, so a loaded model always draws. */
const isArc = (v: unknown): v is OCDeclareArc =>
  isObject(v) &&
  typeof v.from === "string" &&
  typeof v.to === "string" &&
  typeof v.arc_type === "string" &&
  ARC_TYPES.has(v.arc_type) &&
  Array.isArray(v.counts) &&
  v.counts.length === 2 &&
  v.counts.every(isCount) &&
  isObject(v.label) &&
  [v.label.each, v.label.any, v.label.all].every((l) => Array.isArray(l) && l.every(isAssociation));

/** Accepts an {@link OCDeclareModelFile} or a plain `OCDeclareArc[]`. */
export function fromModelFile(input: unknown): DeclareFlowModel {
  const file = Array.isArray(input) ? { arcs: input, nodes: [] } : input;
  if (!isObject(file) || !Array.isArray(file.arcs) || !file.arcs.every(isArc)) {
    throw new Error("Not an OC-DECLARE model");
  }
  const nodes = Array.isArray(file.nodes) ? (file.nodes as OCDeclareModelFile["nodes"]) : [];
  const model = arcsToModel(file.arcs);
  const named = new Set(model.nodes.map(nodeDisplayName));
  for (const n of nodes) {
    if (typeof n?.name !== "string" || named.has(n.name)) continue;
    named.add(n.name);
    model.nodes.push({ id: `n${model.nodes.length}`, ...parseNodeName(n.name) });
  }
  const isPosition = (p: unknown): p is { x: number; y: number } =>
    typeof p === "object" &&
    p !== null &&
    Number.isFinite((p as { x: unknown }).x) &&
    Number.isFinite((p as { y: unknown }).y);
  const positionOf = new Map(nodes.filter((n) => isPosition(n?.position)).map((n) => [n.name, n.position]));
  return {
    edges: model.edges,
    nodes: model.nodes.map((n) => {
      const position = positionOf.get(nodeDisplayName(n));
      return position ? { ...n, position: { x: position.x, y: position.y } } : n;
    }),
  };
}
