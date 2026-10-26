import type { Edge } from "@xyflow/react";
import { flattenColor, mix } from "../../../dfg/util/colors";
import {
  type ElementStyle,
  layoutModel,
  type ModelLayoutRequest,
  modelLayoutRequest,
  modelSvg,
  type Ocpn,
  type OcpnNodeRef,
  rerouteModel,
  type StyleOverrides,
  type VizTransport,
} from "../../../viz";
import type { ArcData, PetriNetNode } from "../Editor";
import {
  applyPetriLayout,
  type PetriElements,
  type PetriGraphIds,
  type PetriGraphRefs,
  petriPositions,
  petriStyleOverrides,
  screenLayout,
} from "./viz-layout";

export type OcpnLayoutRequest = ModelLayoutRequest<"ocpn">;

/** How far towards white rust4pm draws a place's fill from its object type's color. */
const PLACE_FILL_LIGHTNESS = 0.85;

/** The editor's nodes and arcs of `ocpn`, not laid out. Node ids are the names. A place carries its
 *  object type and markings, an arc its weight and whether it is variable. */
export function ocpnElements(ocpn: Ocpn): PetriElements {
  const nodes: PetriNetNode[] = [
    ...ocpn.transitions.map(
      (t): PetriNetNode => ({
        id: t.name,
        type: "transition",
        data: { label: t.label ?? undefined },
        position: { x: 0, y: 0 },
      }),
    ),
    ...ocpn.places.map(
      (p): PetriNetNode => ({
        id: p.name,
        type: "place",
        data: {
          tokens: ocpn.initial_marking[p.name],
          finalTokens: ocpn.final_marking[p.name],
          objectType: p.object_type,
        },
        position: { x: 0, y: 0 },
      }),
    ),
  ];
  const edges: Edge<ArcData>[] = ocpn.arcs.map((a, i) => ({
    id: `${a.source} ${a.target}#${i}`,
    source: a.source,
    target: a.target,
    type: "custom",
    data: { weight: a.weight ?? 1, variable: a.type === "variable" },
  }));
  return { nodes, edges };
}

/** The object-centric Petri net the editor's nodes and arcs show, in their order. A place without an
 *  object type yet gets `""`. An all-zero marking stays empty. */
export function elementsToOcpn({ nodes, edges }: PetriElements): Ocpn {
  const ocpn: Ocpn = { places: [], transitions: [], arcs: [], initial_marking: {}, final_marking: {} };
  for (const n of nodes) {
    if (n.type === "transition") {
      ocpn.transitions.push({ name: n.id, label: n.data.label || null });
      continue;
    }
    ocpn.places.push({ name: n.id, object_type: n.data.objectType ?? "" });
    if (n.data.tokens) ocpn.initial_marking[n.id] = n.data.tokens;
    if (n.data.finalTokens) ocpn.final_marking[n.id] = n.data.finalTokens;
  }
  for (const e of edges) {
    ocpn.arcs.push({
      source: e.source,
      target: e.target,
      type: e.data?.variable ? "variable" : "normal",
      weight: e.data?.weight ?? 1,
    });
  }
  return ocpn;
}

/** The node names behind `refs`, the layout refs of `ocpn`. */
export function ocpnGraphIds(ocpn: Ocpn, refs: PetriGraphRefs): PetriGraphIds {
  const name = (ref: OcpnNodeRef) =>
    (ref.kind === "place" ? ocpn.places[ref.index]?.name : ocpn.transitions[ref.index]?.name) ?? "";
  return {
    nodes: refs.nodes.map(name),
    edges: refs.edges.map((e) => [name(e.source), name(e.target)]),
  };
}

/** What a layout request depends on: markings do not change the graph. */
export function ocpnStructureKey(ocpn: Ocpn): string {
  return JSON.stringify([ocpn.places, ocpn.transitions, ocpn.arcs]);
}

/** Lay `ocpn` out with rust4pm and move `elements`, the editor's nodes and arcs of it, there. */
export async function layoutOcpnElements(
  viz: VizTransport,
  ocpn: Ocpn,
  elements: PetriElements,
): Promise<PetriElements & { request: OcpnLayoutRequest }> {
  const laid = await layoutModel(viz, "ocpn", ocpn);
  return { ...applyPetriLayout(ocpnGraphIds(ocpn, laid), laid.layout, elements), request: laid };
}

/** The host's object type colors as style overrides of `ocpn`'s graph: a place's border and light
 *  fill, and an arc's line, in the color of its place's type. Types without a color keep rust4pm's. */
export function ocpnTypeOverrides(
  ocpn: Ocpn,
  refs: PetriGraphRefs,
  typeColor: (objectType: string) => string | undefined,
): StyleOverrides {
  const colorOf = (ref: OcpnNodeRef | undefined) => {
    const type = ref?.kind === "place" ? ocpn.places[ref.index]?.object_type : undefined;
    const color = type ? typeColor(type) : undefined;
    return color ? flattenColor(color) : undefined;
  };
  const nodes: Record<number, ElementStyle> = {};
  const edges: Record<number, ElementStyle> = {};
  refs.nodes.forEach((ref, i) => {
    const color = colorOf(ref);
    if (color) nodes[i] = { fill: mix(color, "#ffffff", PLACE_FILL_LIGHTNESS), stroke: color };
  });
  refs.edges.forEach((e, j) => {
    const color = colorOf(e.source.kind === "place" ? e.source : e.target);
    if (color) edges[j] = { stroke: color };
  });
  return { nodes, edges };
}

function mergeOverrides(base: StyleOverrides, over: StyleOverrides): StyleOverrides {
  const merge = (a: Record<number, ElementStyle> = {}, b: Record<number, ElementStyle> = {}) => {
    const out = { ...a };
    for (const [i, style] of Object.entries(b)) out[Number(i)] = { ...out[Number(i)], ...style };
    return out;
  };
  return { nodes: merge(base.nodes, over.nodes), edges: merge(base.edges, over.edges) };
}

/** rust4pm's drawing of `ocpn` at the on-screen geometry of `elements`, its nodes and arcs, in the
 *  host's object type colors, with the `elementStyle`s of the elements over them. It shows `ocpn`'s
 *  markings, e.g., a simulator's current marking as the initial one. */
export async function ocpnElementsSvg(
  viz: VizTransport,
  ocpn: Ocpn,
  elements: PetriElements,
  typeColor?: (objectType: string) => string | undefined,
): Promise<string | null> {
  if (ocpn.places.length === 0 && ocpn.transitions.length === 0) return null;
  const request = await modelLayoutRequest(viz, "ocpn", ocpn);
  const ids = ocpnGraphIds(ocpn, request);
  // A re-route at the on-screen centres gives a complete layout of this graph to draw the screen's geometry over.
  const template = await rerouteModel(viz, request, petriPositions(ids, elements.nodes));
  const types = typeColor ? ocpnTypeOverrides(ocpn, request, typeColor) : {};
  return modelSvg(viz, "ocpn", ocpn, screenLayout(template, ids, elements), {
    overrides: mergeOverrides(types, petriStyleOverrides(ids, elements)),
  });
}
