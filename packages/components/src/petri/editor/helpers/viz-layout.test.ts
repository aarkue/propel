import { describe, expect, it } from "vitest";
import { applyOverlay, baseElements, type PetriNet } from "../../../petri-net";
import { modelLayoutRequest, rerouteModel } from "../../../viz";
import { wasmViz } from "../../../viz/wasm";
import { toRustPetriNet } from "../../net-json";
import type { PetriNetNode } from "../Editor";
import { edgeStyleCss, nodeStyleCss } from "./element-style";
import {
  applyPetriLayout,
  layoutPetriElements,
  type PetriElements,
  petriElementsSvg,
  petriGraphIds,
  petriPositions,
  petriStyleOverrides,
  screenLayout,
  withGeometryOf,
} from "./viz-layout";

// Two parallel arcs a -> t merge into one weighted graph edge. S is silent.
const NET: PetriNet = {
  places: [{ id: "a" }, { id: "b" }],
  transitions: [
    { id: "t", label: "register request" },
    { id: "s", label: null },
  ],
  arcs: [{ nodes: ["a", "t"] }, { nodes: ["a", "t"] }, { nodes: ["t", "b"] }, { nodes: ["b", "s"] }],
  initial_marking: { a: 1 },
  final_marking: { b: 1 },
};

const node = (els: PetriElements, id: string) => els.nodes.find((n) => n.id === id) as PetriNetNode;

describe("petriGraphIds", () => {
  it("maps place and transition refs to the net's ids, in graph order", async () => {
    const req = await modelLayoutRequest(wasmViz, "petri_net", toRustPetriNet(NET));
    const ids = petriGraphIds(NET, req);
    expect(ids.nodes).toEqual(req.nodes.map((r) => (r.kind === "place" ? ["a", "b"] : ["t", "s"])[r.index]));
    expect([...ids.nodes].sort()).toEqual(["a", "b", "s", "t"]);
    expect(ids.edges).toEqual(
      expect.arrayContaining([
        ["a", "t"],
        ["t", "b"],
        ["b", "s"],
      ]),
    );
    expect(ids.edges).toHaveLength(3);
    expect(req.edges[ids.edges.findIndex(([s, t]) => s === "a" && t === "t")].weight).toBe(2);
  });
});

describe("layoutPetriElements", () => {
  it("places nodes at the layout's centres and sizes and routes every arc of an edge", async () => {
    const res = await layoutPetriElements(wasmViz, NET, baseElements(NET));
    const ids = petriGraphIds(NET, res.request);
    const laid = await rerouteModel(wasmViz, res.request, petriPositions(ids, res.nodes));
    ids.nodes.forEach((id, i) => {
      expect(node(res, id).position).toEqual(laid.nodes[i].center);
      expect(node(res, id).data.size).toEqual(laid.nodes[i].size);
    });
    expect(node(res, "s").data.size?.width).toBeLessThan(node(res, "t").data.size?.width ?? 0);

    const parallel = res.edges.filter((e) => e.source === "a" && e.target === "t");
    expect(parallel).toHaveLength(2);
    expect(parallel[0].data?.routing?.points.length).toBeGreaterThanOrEqual(2);
    expect(parallel[1].data?.routing).toEqual(parallel[0].data?.routing);
    for (const e of res.edges) {
      expect(e.data?.routing?.srcPos).toEqual(node(res, e.source).position);
      expect(e.data?.routing?.tgtPos).toEqual(node(res, e.target).position);
    }
  });

  it("leaves an arc without a graph edge unrouted", async () => {
    const net: PetriNet = { ...NET, arcs: [...NET.arcs, { nodes: ["a", "b"] }] };
    const res = await layoutPetriElements(wasmViz, net, baseElements(net));
    expect(res.edges.find((e) => e.source === "a" && e.target === "b")?.data?.routing).toBeUndefined();
  });
});

describe("re-routing after a drag", () => {
  it("keeps every node where it is, including one added since the layout", async () => {
    const laid = await layoutPetriElements(wasmViz, NET, baseElements(NET));
    const t = node(laid, "t");
    const moved = { x: t.position.x, y: t.position.y + 150 };
    const added: PetriNetNode = { id: "c", type: "place", data: {}, position: { x: 900, y: 400 } };
    const elements: PetriElements = {
      nodes: [...laid.nodes.map((n) => (n.id === "t" ? { ...n, position: moved } : n)), added],
      edges: [...laid.edges, { id: "t-c", source: "t", target: "c", type: "custom" }],
    };
    const net: PetriNet = {
      ...NET,
      places: [...NET.places, { id: "c" }],
      arcs: [...NET.arcs, { nodes: ["t", "c"] }],
    };

    const request = await modelLayoutRequest(wasmViz, "petri_net", toRustPetriNet(net));
    const ids = petriGraphIds(net, request);
    const layout = await rerouteModel(wasmViz, request, petriPositions(ids, elements.nodes));
    const res = applyPetriLayout(ids, layout, elements, petriPositions(ids, elements.nodes));

    expect(node(res, "t").position).toEqual(moved);
    expect(node(res, "c").position).toEqual({ x: 900, y: 400 });
    expect(node(res, "c").data.size).toEqual(node(res, "a").data.size);
    const tc = res.edges.find((e) => e.id === "t-c")?.data?.routing;
    expect(tc?.srcPos).toEqual(moved);
    const end = tc?.points[tc.points.length - 1];
    // The arc ends on c's border.
    expect(Math.hypot((end?.x ?? 0) - 900, (end?.y ?? 0) - 400)).toBeCloseTo(26, 0);
  });
});

describe("overlays as style overrides", () => {
  it("passes an overlay's elementStyle to the nodes and arcs", () => {
    const shown = applyOverlay(baseElements(NET), NET, {
      transition: (t) => (t.id === "t" ? { elementStyle: { stroke: "#dc2626", extra_label: "#1" } } : {}),
      arc: (a) => (a.from === "t" ? { elementStyle: { opacity: 0.35 } } : undefined),
    });
    expect(node(shown, "t").data.elementStyle).toEqual({ stroke: "#dc2626", extra_label: "#1" });
    expect(node(shown, "s").data.elementStyle).toBeUndefined();
    expect(shown.edges.find((e) => e.source === "t")?.data?.elementStyle).toEqual({ opacity: 0.35 });
  });

  it("keys the styles by graph index", () => {
    const ids = {
      nodes: ["a", "t", "b"],
      edges: [
        ["a", "t"],
        ["t", "b"],
      ] as [string, string][],
    };
    const elements = applyOverlay(baseElements(NET), NET, {
      transition: () => ({ elementStyle: { fill: "#ff000030" }, style: { fontWeight: 600 } }),
      arc: (a) => (a.to === "t" ? { elementStyle: { stroke: "#00ff00" } } : undefined),
    });
    expect(petriStyleOverrides(ids, elements)).toEqual({
      nodes: { 1: { fill: "#ff000030" } },
      edges: { 0: { stroke: "#00ff00" } },
    });
  });

  it("styles the screen with only the fields that are set", () => {
    expect(nodeStyleCss({ fill: "#fff", stroke: null, opacity: 0.4 })).toEqual({
      backgroundColor: "#fff",
      opacity: 0.4,
    });
    expect(edgeStyleCss({ stroke: "#000", stroke_width: 3 })).toEqual({ stroke: "#000", strokeWidth: 3 });
    expect(nodeStyleCss(undefined)).toEqual({});
  });
});

describe("screenLayout", () => {
  it("takes positions, sizes and drawn arcs from the screen", async () => {
    const laid = await layoutPetriElements(wasmViz, NET, baseElements(NET));
    const ids = petriGraphIds(NET, laid.request);
    const template = await rerouteModel(wasmViz, laid.request, petriPositions(ids, laid.nodes));
    // b moved by hand without a re-route, and t -> b lost its route: it draws straight.
    const b = node(laid, "b");
    const elements: PetriElements = {
      nodes: laid.nodes.map((n) => (n.id === "b" ? { ...n, position: { x: b.position.x, y: 300 } } : n)),
      edges: laid.edges.map((e) =>
        e.source === "t" ? { ...e, data: { ...e.data, routing: undefined } } : e,
      ),
    };
    const layout = screenLayout(template, ids, elements);

    const bi = ids.nodes.indexOf("b");
    expect(layout.nodes[bi].center).toEqual({ x: b.position.x, y: 300 });
    const tb = layout.edges[ids.edges.findIndex(([s, t]) => s === "t" && t === "b")];
    expect(tb.points).toHaveLength(2);
    expect(tb.label_anchor).toBeNull();
    expect(Math.hypot(tb.points[1].x - b.position.x, tb.points[1].y - 300)).toBeCloseTo(26, 0);
    // b -> s keeps its route, its start shifted with b.
    const bs = layout.edges[ids.edges.findIndex(([s]) => s === "b")];
    const route = elements.edges.find((e) => e.source === "b")?.data?.routing?.points ?? [];
    expect(bs.points[0].y).toBeCloseTo(route[0].y + (300 - b.position.y));
    expect(layout.bounds.max.y).toBeGreaterThanOrEqual(326);
  });
});

describe("petriElementsSvg", () => {
  it("draws the on-screen layout with the overlay and the given marking", async () => {
    const laid = await layoutPetriElements(wasmViz, NET, baseElements(NET));
    const elements = applyOverlay(laid, NET, {
      transition: (t) =>
        t.id === "t"
          ? { elementStyle: { stroke: "#dc2626", stroke_width: 3, extra_label: "#1 #3" } }
          : { elementStyle: { opacity: 0.35 } },
    });
    const a = node(elements, "a");
    const moved: PetriElements = {
      ...elements,
      nodes: elements.nodes.map((n) => (n.id === "a" ? { ...n, position: { x: a.position.x, y: 211 } } : n)),
    };
    const svg = await petriElementsSvg(wasmViz, { ...NET, initial_marking: { a: 2, b: 1 } }, moved);
    expect(svg).toMatch(/<svg[\s>]/);
    expect(svg).toContain('stroke="#dc2626"');
    expect(svg).toContain(">#1 #3</text>");
    expect(svg).toContain('opacity="0.35"');
    expect(svg).toContain(`cy="211.00"`);
    // Three initial tokens as dots. B's final token as a square.
    expect(svg?.match(/<circle/g)).toHaveLength(3);
  });

  it("draws nothing for an empty net", async () => {
    const empty: PetriElements = { nodes: [], edges: [] };
    expect(await petriElementsSvg(wasmViz, { places: [], transitions: [], arcs: [] }, empty)).toBeNull();
  });
});

describe("withGeometryOf", () => {
  it("takes positions, sizes and routes, and keeps the rest of the base", () => {
    const base = applyOverlay(baseElements(NET), NET, {
      transition: () => ({ elementStyle: { opacity: 0.4 } }),
      arc: () => ({ elementStyle: { stroke: "#00ff00" } }),
    });
    const routing = { kind: "polyline" as const, points: [], srcPos: { x: 0, y: 0 }, tgtPos: { x: 1, y: 1 } };
    const changed: PetriElements = {
      nodes: base.nodes.map((n) =>
        n.id === "t"
          ? ({ ...n, position: { x: 5, y: 6 }, data: { size: { width: 1, height: 2 } } } as PetriNetNode)
          : n,
      ),
      edges: base.edges.map((e) => ({ ...e, data: { routing } })),
    };
    const res = withGeometryOf(base, changed);
    expect(node(res, "t").position).toEqual({ x: 5, y: 6 });
    expect(node(res, "t").data).toMatchObject({
      size: { width: 1, height: 2 },
      elementStyle: { opacity: 0.4 },
    });
    expect(
      res.edges.every((e) => e.data?.routing === routing && e.data?.elementStyle?.stroke === "#00ff00"),
    ).toBe(true);
  });
});
