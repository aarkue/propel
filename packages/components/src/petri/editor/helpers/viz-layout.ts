import type { Edge } from "@xyflow/react";
import { edgeRawPoints } from "../../../graph-edit/routing";
import type { PetriNet } from "../../../petri-net";
import {
  type ElementStyle,
  type Layout,
  layoutModel,
  type ModelLayoutRequest,
  modelLayoutRequest,
  modelSvg,
  type PetriNodeRef,
  type Point,
  type Rect,
  rerouteModel,
  type StyleOverrides,
  type VizTransport,
} from "../../../viz";
import { normalizePetriNet, type RustPetriNet, toRustPetriNet } from "../../net-json";
import type { ArcData, PetriNetNode } from "../Editor";
import { geomOfNode, nodeSizeOf } from "./edge-geometry";

/** The editor's nodes and arcs of a net. */
export type PetriElements = { nodes: PetriNetNode[]; edges: Edge<ArcData>[] };

export type PetriLayoutRequest = ModelLayoutRequest<"petri_net">;

/** The editor ids behind a net's layout graph, in graph order: the node id of each graph node and
 *  the (source, target) node ids of each graph edge. */
export interface PetriGraphIds {
  nodes: string[];
  edges: [string, string][];
}

/** The places and transitions (by index) behind a layout graph's nodes and edges, e.g., the refs of a
 *  Petri net's or an object-centric Petri net's layout. */
export interface PetriGraphRefs {
  nodes: PetriNodeRef[];
  edges: { source: PetriNodeRef; target: PetriNodeRef }[];
}

const arcKey = (source: string, target: string) => `${source}\u0000${target}`;

/** The ids behind `refs`. `net` is the net the refs are of: they index its places and transitions,
 *  which keep their order through {@link toRustPetriNet}. */
export function petriGraphIds(net: PetriNet, refs: PetriGraphRefs): PetriGraphIds {
  const n = normalizePetriNet(net);
  const id = (ref: PetriNodeRef) =>
    (ref.kind === "place" ? n.places[ref.index]?.id : n.transitions[ref.index]?.id) ?? "";
  return {
    nodes: refs.nodes.map(id),
    edges: refs.edges.map((e) => [id(e.source), id(e.target)]),
  };
}

/** The current centre of each graph node, for {@link rerouteModel}. */
export function petriPositions(ids: PetriGraphIds, nodes: PetriNetNode[]): Point[] {
  const position = new Map(nodes.map((n) => [n.id, n.position]));
  return ids.nodes.map((id) => {
    const p = position.get(id);
    return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
  });
}

/** `elements` at `layout`'s node centres and sizes and along its edge routes. For a re-route,
 *  `routedOver` are the centres it was given: a node the engine left there keeps its current
 *  position, which a drag may have changed since. One it moved goes to its new centre. Parallel
 *  arcs share their merged graph edge's route. Arcs without a graph edge (e.g., place to place)
 *  lose their route and draw straight. */
export function applyPetriLayout(
  ids: PetriGraphIds,
  layout: Layout,
  elements: PetriElements,
  routedOver?: Point[],
): PetriElements {
  const index = new Map(ids.nodes.map((id, i) => [id, i]));
  const placement = new Map(ids.nodes.map((id, i) => [id, layout.nodes[i]]));
  const route = new Map(ids.edges.map(([s, t], j) => [arcKey(s, t), layout.edges[j]]));
  const nodes = elements.nodes.map((n): PetriNetNode => {
    const p = placement.get(n.id);
    if (!p) return n;
    const sent = routedOver?.[index.get(n.id) ?? -1];
    const kept = sent && sent.x === p.center.x && sent.y === p.center.y;
    return {
      ...n,
      position: kept ? n.position : { ...p.center },
      data: { ...n.data, size: { ...p.size } },
    } as PetriNetNode;
  });
  const edges = elements.edges.map((e): Edge<ArcData> => {
    const r = route.get(arcKey(e.source, e.target));
    const src = placement.get(e.source);
    const tgt = placement.get(e.target);
    const routing =
      r && src && tgt && r.points.length >= 2
        ? {
            kind: "polyline" as const,
            points: r.points.map((p) => ({ x: p.x, y: p.y })),
            srcPos: { ...src.center },
            tgtPos: { ...tgt.center },
          }
        : undefined;
    return { ...e, data: { ...e.data, routing } };
  });
  return { nodes, edges };
}

/** Lay `net` out with rust4pm and move `elements`, the editor's nodes and arcs of `net`, there. */
export async function layoutPetriElements(
  viz: VizTransport,
  net: PetriNet,
  elements: PetriElements,
): Promise<PetriElements & { request: PetriLayoutRequest }> {
  const laid = await layoutModel(viz, "petri_net", toRustPetriNet(net));
  return { ...applyPetriLayout(petriGraphIds(net, laid), laid.layout, elements), request: laid };
}

/** What a layout request depends on: markings do not change the graph. */
export function petriStructureKey(net: RustPetriNet): string {
  return JSON.stringify([net.places, net.transitions]);
}

/** `template`, a layout of the same graph, with the on-screen geometry of `elements`: node
 *  positions and sizes, and arcs as drawn (routed, or straight when unrouted). */
export function screenLayout(template: Layout, ids: PetriGraphIds, elements: PetriElements): Layout {
  const nodeById = new Map(elements.nodes.map((n) => [n.id, n]));
  const edgeByKey = new Map<string, Edge<ArcData>>();
  for (const e of elements.edges) {
    const key = arcKey(e.source, e.target);
    if (!edgeByKey.has(key)) edgeByKey.set(key, e);
  }
  const nodes = template.nodes.map((p, i) => {
    const n = nodeById.get(ids.nodes[i]);
    return n ? { ...p, center: { x: n.position.x, y: n.position.y }, size: { ...nodeSizeOf(n) } } : p;
  });
  const edges = template.edges.map((r, j) => {
    const [s, t] = ids.edges[j];
    const e = edgeByKey.get(arcKey(s, t));
    const src = nodeById.get(s);
    const tgt = nodeById.get(t);
    if (!e || !src || !tgt) return r;
    const points = edgeRawPoints({
      sourceCenter: src.position,
      targetCenter: tgt.position,
      source: geomOfNode(src),
      target: geomOfNode(tgt),
      routing: e.data?.routing,
    });
    // The screen draws arc labels at the polyline's middle, which is where rust4pm puts them without an anchor.
    return { ...r, points, label_anchor: null };
  });
  return { ...template, nodes, edges, bounds: boundsOf(nodes, edges) ?? template.bounds };
}

function boundsOf(nodes: Layout["nodes"], edges: Layout["edges"]): Rect | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const { center, size } of nodes) {
    xs.push(center.x - size.width / 2, center.x + size.width / 2);
    ys.push(center.y - size.height / 2, center.y + size.height / 2);
  }
  for (const p of edges.flatMap((e) => e.points)) {
    xs.push(p.x);
    ys.push(p.y);
  }
  if (xs.length === 0) return null;
  return { min: { x: Math.min(...xs), y: Math.min(...ys) }, max: { x: Math.max(...xs), y: Math.max(...ys) } };
}

/** The `elementStyle`s of `elements` as style overrides of the graph. Parallel arcs share one graph
 *  edge, which takes the first of their styles. */
export function petriStyleOverrides(ids: PetriGraphIds, elements: PetriElements): StyleOverrides {
  const nodeStyle = new Map(elements.nodes.map((n) => [n.id, n.data.elementStyle]));
  const edgeStyle = new Map<string, ElementStyle>();
  for (const e of elements.edges) {
    const key = arcKey(e.source, e.target);
    const style = e.data?.elementStyle;
    if (style && !edgeStyle.has(key)) edgeStyle.set(key, style);
  }
  const nodes: Record<number, ElementStyle> = {};
  const edges: Record<number, ElementStyle> = {};
  ids.nodes.forEach((id, i) => {
    const style = nodeStyle.get(id);
    if (style) nodes[i] = style;
  });
  ids.edges.forEach(([s, t], j) => {
    const style = edgeStyle.get(arcKey(s, t));
    if (style) edges[j] = style;
  });
  return { nodes, edges };
}

/** rust4pm's drawing of `net` at the on-screen geometry of `elements`, its nodes and arcs, with their
 *  `elementStyle`s. It shows `net`'s markings, e.g., a simulator's current marking as the initial one. */
export async function petriElementsSvg(
  viz: VizTransport,
  net: PetriNet,
  elements: PetriElements,
): Promise<string | null> {
  const n = normalizePetriNet(net);
  if (n.places.length === 0 && n.transitions.length === 0) return null;
  const rust = toRustPetriNet(n);
  const request = await modelLayoutRequest(viz, "petri_net", rust);
  const ids = petriGraphIds(n, request);
  // A re-route at the on-screen centres gives a complete layout of this graph to draw the screen's geometry over.
  const template = await rerouteModel(viz, request, petriPositions(ids, elements.nodes));
  return modelSvg(viz, "petri_net", rust, screenLayout(template, ids, elements), {
    overrides: petriStyleOverrides(ids, elements),
  });
}

/** `base` with the node positions and sizes and the arc routes of `changed`, matched by id. Keeps
 *  everything else of `base`, e.g., so a host re-skinning `base` keeps a drag the editor re-routed. */
export function withGeometryOf(base: PetriElements, changed: PetriElements): PetriElements {
  const nodeById = new Map(changed.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(changed.edges.map((e) => [e.id, e]));
  return {
    nodes: base.nodes.map((n) => {
      const c = nodeById.get(n.id);
      return c ? ({ ...n, position: c.position, data: { ...n.data, size: c.data.size } } as PetriNetNode) : n;
    }),
    edges: base.edges.map((e) => {
      const c = edgeById.get(e.id);
      return c ? { ...e, data: { ...e.data, routing: c.data?.routing } } : e;
    }),
  };
}
