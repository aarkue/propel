import { describe, expect, it } from "vitest";
import { layoutModel, rerouteModel } from "../viz";
import { wasmViz } from "../viz/wasm";
import type { OCDeclareArc } from "./index";
import { arcsToModel, type DeclareFlowModel, modelArcs } from "./model";
import type { ConstraintEdgeData } from "./types";
import {
  type DeclareScreenState,
  declareBuildOptions,
  declareSvg,
  edgePolyline,
  exportOverrides,
  layoutRoutes,
  persistedRoutes,
  placeNodes,
  refsToFlowEdges,
  violationBadges,
  visibleInvolvements,
} from "./viz-layout";

const S = (object_type: string) => ({ type: "Simple" as const, object_type });
const ARCS: OCDeclareArc[] = [
  {
    from: "place order",
    to: "ship",
    arc_type: "EF",
    counts: [1, null],
    label: { each: [S("order")], any: [], all: [] },
  },
  {
    from: "ship",
    to: "invoice",
    arc_type: "AS",
    counts: [1, null],
    label: { each: [], any: [S("item")], all: [] },
  },
  {
    from: "ship",
    to: "place order",
    arc_type: "EP",
    counts: [1, null],
    label: { each: [S("order")], any: [], all: [] },
  },
  {
    from: "ship",
    to: "ship",
    arc_type: "AS",
    counts: [1, null],
    label: { each: [S("item")], any: [], all: [] },
  },
  {
    from: "<init> order",
    to: "place order",
    arc_type: "AS",
    counts: [1, 1],
    label: { each: [], any: [S("order")], all: [] },
  },
];
const OPTIONS = declareBuildOptions({ direction: "RIGHT", textLabels: true, combineEfEp: true });

async function laidOut(model: DeclareFlowModel) {
  const { arcs, edgeIds } = modelArcs(model);
  const laid = await layoutModel(wasmViz, "oc_declare", arcs, OPTIONS);
  const placed = placeNodes(model, laid);
  const routes = layoutRoutes(model, laid, edgeIds, laid.layout);
  const nodes = model.nodes.map((n) => {
    const p = placed.get(n.id);
    return {
      id: n.id,
      type: "activity" as const,
      position: p?.position ?? { x: 0, y: 0 },
      width: p?.width,
      height: p?.height,
      data: { label: n.type, kind: n.kind, objectTypes: [] },
    };
  });
  const edges = refsToFlowEdges(model, laid.edges, edgeIds).map((e) => ({
    ...e,
    data: { ...(e.data as ConstraintEdgeData), ...routes.get(e.id) },
  }));
  return { arcs, edgeIds, laid, placed, routes, nodes, edges };
}

describe("declareBuildOptions", () => {
  it("maps the view settings onto rust4pm's build options", () => {
    expect(declareBuildOptions({ direction: "DOWN", textLabels: false, combineEfEp: false })).toEqual({
      direction: "topbottom",
      labels: "dots",
      merge_mirrored_arcs: false,
      reverse_backward_arcs: true,
    });
    expect(OPTIONS).toMatchObject({ direction: "leftright", labels: "names", merge_mirrored_arcs: true });
  });

  it("draws only the involvements of visible object types", () => {
    const involvements = {
      pay: { order: { min: 1, max: 1 }, item: { min: 0, max: 3 }, worker: { min: 0, max: 0 } },
      ship: { item: { min: 1, max: 2 } },
      cancel: undefined,
    };
    expect(visibleInvolvements(involvements, new Set(["item"]))).toEqual({
      pay: { order: { min: 1, max: 1 } },
    });
  });
});

describe("modelArcs", () => {
  it("names the model edge behind each arc and skips edges without both nodes", () => {
    const model = arcsToModel(ARCS);
    model.edges.splice(1, 0, { ...model.edges[0], id: "dangling", target: "gone" });
    const { arcs, edgeIds } = modelArcs(model);
    expect(arcs).toEqual(ARCS);
    expect(edgeIds).toEqual(["e0", "e1", "e2", "e3", "e4"]);
  });
});

describe("rust4pm layout refs", () => {
  it("places every model node by its prefixed name, at the layout's size", async () => {
    const model = arcsToModel(ARCS);
    const { laid, placed } = await laidOut(model);
    expect([...laid.nodes].sort()).toEqual(["<init> order", "invoice", "place order", "ship"]);
    for (const n of model.nodes) {
      const p = placed.get(n.id);
      const name = n.kind === "init" ? `<init> ${n.type}` : n.type;
      const at = laid.layout.nodes[laid.nodes.indexOf(name)];
      expect(p).toEqual({
        position: { x: at.center.x - at.size.width / 2, y: at.center.y - at.size.height / 2 },
        width: at.size.width,
        height: at.size.height,
      });
    }
  });

  it("merges the mirrored EP arc into its EF arc's edge", async () => {
    const model = arcsToModel(ARCS);
    const { edges } = await laidOut(model);
    expect(edges).toHaveLength(4);
    const merged = edges.find((e) => e.id === "e0");
    expect(merged?.data.arcType).toBe("EFEP");
    expect(merged?.data.pair).toEqual({ forward: "e0", backward: "e2" });
    expect(edges.some((e) => e.id === "e2")).toBe(false);
    expect(edges.find((e) => e.id === "e1")?.data.arcType).toBe("AS");
  });

  it("routes every edge from its source, self-loops included", async () => {
    const model = arcsToModel(ARCS);
    const { edges, placed } = await laidOut(model);
    for (const e of edges) {
      const pts = e.data.routedPoints ?? [];
      expect(pts.length).toBeGreaterThanOrEqual(2);
      const src = placed.get(e.source);
      expect(e.data.layoutSourcePos).toEqual(src?.position);
      const box = src as { position: { x: number; y: number }; width: number; height: number };
      const onBorder =
        pts[0].x >= box.position.x - 0.5 &&
        pts[0].x <= box.position.x + box.width + 0.5 &&
        pts[0].y >= box.position.y - 0.5 &&
        pts[0].y <= box.position.y + box.height + 0.5;
      expect(onBorder).toBe(true);
      expect(e.data.labelAnchor).toBeDefined();
    }
    const loop = edges.find((e) => e.source === e.target);
    expect(loop?.data.routedPoints?.length).toBeGreaterThanOrEqual(4);
  });

  it("measures drag deformation from the positions the routes were made for", async () => {
    const model = arcsToModel(ARCS);
    const { laid, edgeIds } = await laidOut(model);
    // Routes keep the node positions they were made for, here a moved "ship".
    const ship = laid.nodes.indexOf("ship");
    const layout = {
      ...laid.layout,
      nodes: laid.layout.nodes.map((n, i) => (i === ship ? { ...n, center: { x: 1000, y: 500 } } : n)),
    };
    const routes = layoutRoutes(model, laid, edgeIds, layout);
    const shipId = model.nodes.find((n) => n.type === "ship")?.id;
    const fromShip = model.edges.find((e) => e.source === shipId && routes.has(e.id));
    expect(routes.get(fromShip?.id ?? "")?.layoutSourcePos).toEqual({ x: 925, y: 471 });
  });

  it("drops the old route of an edge the router gives no line", async () => {
    const model = arcsToModel(ARCS);
    const { laid, edgeIds } = await laidOut(model);
    const layout = {
      ...laid.layout,
      edges: laid.layout.edges.map((r, i) => (i === 0 ? { ...r, points: r.points.slice(0, 1) } : r)),
    };
    const routes = layoutRoutes(model, laid, edgeIds, layout);
    const id = edgeIds[laid.edges[0].arc];
    expect(routes.has(id)).toBe(true);
    expect(routes.get(id)?.routedPoints).toBeUndefined();
    expect(routes.get(id)?.layoutSourcePos).toBeUndefined();
  });

  it("places the activities without arcs through rust4pm", async () => {
    const model: DeclareFlowModel = {
      nodes: [
        { id: "a", type: "a", kind: "activity" },
        { id: "b", type: "b", kind: "activity" },
        { id: "x", type: "x", kind: "activity" },
      ],
      edges: [
        {
          id: "e",
          source: "a",
          target: "b",
          template: "ef",
          label: { each: [S("order")], any: [], all: [] },
        },
      ],
    };
    const { arcs, extraActivities } = modelArcs(model);
    expect(extraActivities).toEqual(["x"]);
    const options = { ...declareBuildOptions({ direction: "RIGHT", textLabels: false, combineEfEp: true }) };
    const laid = await layoutModel(wasmViz, "oc_declare", arcs, {
      ...options,
      extra_activities: extraActivities,
    });
    const placed = placeNodes(model, laid);
    expect([...placed.keys()].sort()).toEqual(["a", "b", "x"]);
  });
});

describe("edgePolyline", () => {
  const box = (x: number, y: number) => ({ position: { x, y }, width: 150, height: 58 });
  const data = (routedPoints: { x: number; y: number }[]): ConstraintEdgeData => ({
    arcType: "EF",
    counts: [1, null],
    label: { each: [], any: [], all: [] },
    bundleIndex: 0,
    bundleTotal: 1,
    constraintIndex: 0,
    routedPoints,
    labelAnchor: { x: 200, y: 20 },
    layoutSourcePos: { x: 0, y: 0 },
    layoutTargetPos: { x: 300, y: 0 },
  });

  it("shows the route and its label anchor while nothing moved", () => {
    const route = [
      { x: 150, y: 29 },
      { x: 300, y: 29 },
    ];
    expect(edgePolyline(data(route), box(0, 0), box(300, 0), false)).toEqual({
      points: route,
      labelAnchor: { x: 200, y: 20 },
      moved: false,
    });
  });

  it("bends the route along with a moved node and drops the anchor", () => {
    const route = [
      { x: 150, y: 29 },
      { x: 300, y: 29 },
    ];
    const shown = edgePolyline(data(route), box(0, 0), box(300, 100), false);
    expect(shown.moved).toBe(true);
    expect(shown.labelAnchor).toBeUndefined();
    expect(shown.points[shown.points.length - 1].y).toBeGreaterThan(29);
  });

  it("moves a self-loop with its node", () => {
    const loop = [
      { x: 60, y: 0 },
      { x: 60, y: -15 },
      { x: 90, y: -15 },
      { x: 90, y: 0 },
    ];
    const d = { ...data(loop), layoutTargetPos: { x: 0, y: 0 } };
    const shown = edgePolyline(d, box(10, 20), box(10, 20), true);
    const rounded = shown.points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    expect(rounded).toEqual(loop.map((p) => ({ x: p.x + 10, y: p.y + 20 })));
  });
});

describe("export", () => {
  async function screen(): Promise<DeclareScreenState & { edgeIds: string[] }> {
    const model = arcsToModel(ARCS);
    const { nodes, edges, edgeIds } = await laidOut(model);
    return {
      model,
      nodes,
      edges,
      edgeIds,
      options: OPTIONS,
      hiddenArcTypes: new Set(),
      hiddenObjectTypes: new Set(),
      focusedNodeId: null,
    };
  }

  it("hides what the screen hides and dims what focus dims", async () => {
    const s = await screen();
    const { laid } = await laidOut(s.model);
    const invoice = s.model.nodes.find((n) => n.type === "invoice")?.id;
    const shipId = s.model.nodes.find((n) => n.type === "ship")?.id;
    s.nodes = s.nodes.map((n) => (n.id === invoice ? { ...n, hidden: true } : n));
    s.edges = s.edges.map((e) =>
      e.target === invoice
        ? { ...e, hidden: true }
        : e.id === "e4"
          ? { ...e, data: { ...(e.data as ConstraintEdgeData), violation: 0.25 } }
          : e,
    );
    s.hiddenObjectTypes = new Set(["item"]);
    const graphEdge = (id: string) => laid.edges.findIndex((r) => s.edgeIds[r.arc] === id);
    const graphNode = (name: string) => laid.nodes.indexOf(name);

    const o = exportOverrides(laid, s.edgeIds, s);
    expect(o.nodes?.[graphNode("invoice")]).toEqual({ opacity: 0 });
    expect(o.edges?.[graphEdge("e1")]).toEqual({ opacity: 0 });
    // Its only type is hidden.
    expect(o.edges?.[graphEdge("e3")]).toEqual({ opacity: 0 });
    expect(o.edges?.[graphEdge("e0")]).toBeUndefined();
    // Violation badges are drawn from the screen, not as rust4pm's extra label.
    expect(o.edges?.[graphEdge("e4")]).toBeUndefined();

    s.hiddenObjectTypes = new Set();
    s.hiddenArcTypes = new Set(["EFEP"]);
    s.focusedNodeId = shipId ?? null;
    const f = exportOverrides(laid, s.edgeIds, s);
    expect(f.edges?.[graphEdge("e0")]).toEqual({ opacity: 0 });
    expect(f.nodes?.[graphNode("place order")]).toEqual({ opacity: 0.4 });
    expect(f.nodes?.[graphNode("ship")]).toBeUndefined();
    expect(f.edges?.[graphEdge("e4")]).toEqual({ opacity: 0.1 });
  });

  it("tints the nodes whose host color differs", async () => {
    const s = await screen();
    const { laid } = await laidOut(s.model);
    s.hostColor = (name, kind) => (name === "ship" ? "#ff0000" : kind === "init" ? "#0000ff" : undefined);
    const o = exportOverrides(laid, s.edgeIds, s);
    expect(o.nodes?.[laid.nodes.indexOf("ship")]).toEqual({ fill: "#ffd9d9", stroke: "#ff0000" });
    expect(o.nodes?.[laid.nodes.indexOf("<init> order")]).toEqual({ fill: "#d9d9ff", stroke: "#0000ff" });
    expect(o.nodes?.[laid.nodes.indexOf("invoice")]).toBeUndefined();
  });

  it("draws the current positions with rust4pm", async () => {
    const s = await screen();
    const moved = s.nodes[0].id;
    s.nodes = s.nodes.map((n) => (n.id === moved ? { ...n, position: { x: 2000, y: 1500 } } : n));
    s.nodes = s.nodes.map((n) => (n.id === s.model.nodes[1].id ? { ...n, hidden: true } : n));
    const svg = await declareSvg(wasmViz, s);
    expect(svg).toMatch(/<svg[\s>]/);
    const viewBox =
      svg
        ?.match(/viewBox="([^"]+)"/)?.[1]
        .split(" ")
        .map(Number) ?? [];
    expect(viewBox[0] + viewBox[2]).toBeGreaterThan(2000);
    expect(svg).toContain('opacity="0"');
    expect(svg).toContain('data-arc-type="EF+EP"');
  });

  it("keeps overlapping nodes where the screen has them", async () => {
    const s = await screen();
    const [a, b] = s.nodes;
    s.nodes = s.nodes.map((n) =>
      n.id === b.id ? { ...n, position: { x: a.position.x + 20, y: a.position.y + 10 } } : n,
    );
    const svg = (await declareSvg(wasmViz, s)) ?? "";
    const rects = [...svg.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="150.00"/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    expect(rects).toContainEqual([a.position.x, a.position.y]);
    expect(rects).toContainEqual([a.position.x + 20, a.position.y + 10]);
  });

  it("draws the violation badges where the screen has them, over the arcs", async () => {
    const s = await screen();
    s.badges = [{ text: "12.5%", color: "#d97706", x: 321, y: 123, width: 35 }];
    const svg = (await declareSvg(wasmViz, s)) ?? "";
    const badge = svg.slice(svg.lastIndexOf("<g data-violation-badges"));
    expect(badge).toContain('fill="#d97706"');
    expect(badge).toContain(">12.5%</text>");
    expect(badge).toMatch(/<text x="321.00" y="[\d.]+"/);
    expect(svg.indexOf("<g data-violation-badges")).toBeGreaterThan(svg.lastIndexOf("<path"));
  });

  it("draws activities without arcs, and nothing for an empty model", async () => {
    const s = await screen();
    const svg = await declareSvg(wasmViz, { ...s, model: { nodes: s.model.nodes, edges: [] } });
    expect(svg).toMatch(/<svg[\s>]/);
    expect(await declareSvg(wasmViz, { ...s, model: { nodes: [], edges: [] } })).toBeNull();
  });
});

describe("rerouting", () => {
  it("keeps an arc out of a target dropped above or below its source", async () => {
    const chain = [ARCS[0], { ...ARCS[0], from: "ship", to: "invoice" }];
    const laid = await layoutModel(wasmViz, "oc_declare", chain, OPTIONS);
    const ship = laid.nodes.indexOf("ship");
    const invoice = laid.nodes.indexOf("invoice");
    for (const dy of [-120, 120]) {
      const centres = laid.layout.nodes.map((n) => ({ ...n.center }));
      centres[invoice] = { x: centres[ship].x, y: centres[ship].y + dy };
      const layout = await rerouteModel(wasmViz, laid, centres);
      const arc = laid.edges.findIndex((r) => chain[r.arc].to === "invoice");
      const { width, height } = laid.layout.nodes[invoice].size;
      const inside = layout.edges[arc].points
        .slice(1, -1)
        .some(
          (p) =>
            Math.abs(p.x - centres[invoice].x) < width / 2 - 2 &&
            Math.abs(p.y - centres[invoice].y) < height / 2 - 2,
        );
      const crosses = layout.edges[arc].points.some((p, i, pts) => {
        const q = pts[i + 1];
        if (!q) return false;
        return [0.25, 0.5, 0.75].some((t) => {
          const x = p.x + t * (q.x - p.x);
          const y = p.y + t * (q.y - p.y);
          return (
            Math.abs(x - centres[invoice].x) < width / 2 - 2 &&
            Math.abs(y - centres[invoice].y) < height / 2 - 2
          );
        });
      });
      expect(inside || crosses).toBe(false);
    }
  });
});

describe("violationBadges", () => {
  const line = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
  ];
  const data = (extra: Partial<ConstraintEdgeData>) => ({ ...extra }) as ConstraintEdgeData;

  it("puts the badge on the arc, right after the dots", () => {
    const [b] = violationBadges(data({ violation: 0.125 }), line, { half: 20 });
    expect(b.text).toBe("12.5%");
    expect(b.color).toBe("#d97706");
    expect(b.y).toBe(0);
    // Its left end is clear of the dots, which end 20px after the middle.
    expect(b.x - b.width / 2).toBeGreaterThan(120);
    expect(b.x - b.width / 2).toBeLessThan(128);
  });

  it("puts it right after a text label on the arc", () => {
    const [b] = violationBadges(data({ violation: 0 }), line, { half: 30, at: { x: 90, y: 2 } });
    expect(b.text).toBe("0%");
    expect(b.color).toBe("#16a34a");
    expect(b.y).toBe(0);
    expect(b.x - b.width / 2).toBeGreaterThan(120);
    expect(b.x - b.width / 2).toBeLessThan(128);
  });

  it("puts a collapsed pair's badges either side of the label: backward before, forward after", () => {
    const pair = data({
      pair: {} as ConstraintEdgeData["pair"],
      pairViolation: { forward: 0.6, backward: 0.02 },
    });
    const [forward, backward] = violationBadges(pair, line, { half: 20 });
    expect([forward.text, backward.text]).toEqual(["60.0%", "2.0%"]);
    expect(forward.color).toBe("#dc2626");
    expect(forward.x - forward.width / 2).toBeGreaterThan(120);
    expect(backward.x + backward.width / 2).toBeLessThan(80);
    expect(backward.x + backward.width / 2).toBeGreaterThan(72);
  });

  it("gives none to an arc that was not evaluated", () => {
    expect(violationBadges(data({}), line, { half: 20 })).toEqual([]);
  });
});

describe("persistedRoutes", () => {
  const route = {
    routedPoints: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 20 },
    ],
    layoutSourcePos: { x: 1, y: 2 },
    layoutTargetPos: { x: 3, y: 4 },
  };
  const edge = (id: string, extra: Partial<ConstraintEdgeData>) =>
    ({ id, source: "a", target: "b", data: { ...route, ...extra } }) as never;

  it("stores a merged pair's route for both of its arcs, the backward one reversed", () => {
    const routes = persistedRoutes([edge("f", { pair: { forward: "f", backward: "b" } })]);
    expect(routes.get("f")?.points).toEqual(route.routedPoints);
    expect(routes.get("b")).toEqual({
      points: [...route.routedPoints].reverse(),
      sourcePos: route.layoutTargetPos,
      targetPos: route.layoutSourcePos,
      labelAnchor: undefined,
    });
  });

  it("skips edges without a complete route", () => {
    expect(persistedRoutes([edge("x", { layoutSourcePos: undefined })]).size).toBe(0);
  });
});
