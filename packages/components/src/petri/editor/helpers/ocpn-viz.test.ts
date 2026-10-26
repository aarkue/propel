import { describe, expect, it } from "vitest";
import { modelLayoutRequest, type Ocpn } from "../../../viz";
import { wasmViz } from "../../../viz/wasm";
import type { PetriNetNode } from "../Editor";
import {
  elementsToOcpn,
  layoutOcpnElements,
  ocpnElements,
  ocpnElementsSvg,
  ocpnGraphIds,
  ocpnTypeOverrides,
} from "./ocpn-viz";
import type { PetriElements } from "./viz-layout";
import { vizNetIds } from "./viz-net";

// Orders and items meet at "place order", whose item arcs are variable. A silent transition moves an
// item on, and one arc weighs 2.
const OCPN: Ocpn = {
  places: [
    { name: "o0", object_type: "orders" },
    { name: "o1", object_type: "orders" },
    { name: "i0", object_type: "items" },
    { name: "i1", object_type: "items" },
    { name: "i2", object_type: "items" },
  ],
  transitions: [
    { name: "place order", label: "place order" },
    { name: "items tau0", label: null },
  ],
  arcs: [
    { source: "o0", target: "place order" },
    { source: "place order", target: "o1", weight: 2 },
    { source: "i0", target: "place order", type: "variable" },
    { source: "place order", target: "i1", type: "variable" },
    { source: "i1", target: "items tau0" },
    { source: "items tau0", target: "i2" },
  ],
  initial_marking: { o0: 1, i0: 3 },
  final_marking: { o1: 1, i2: 1 },
};

const node = (els: PetriElements, id: string) => els.nodes.find((n) => n.id === id) as PetriNetNode;

describe("ocpnElements and elementsToOcpn", () => {
  it("name the nodes as in the net and carry object types, markings and variable arcs", () => {
    const els = ocpnElements(OCPN);
    expect(els.nodes.map((n) => n.id).sort()).toEqual(
      ["i0", "i1", "i2", "items tau0", "o0", "o1", "place order"].sort(),
    );
    expect(node(els, "i0").data).toMatchObject({ objectType: "items", tokens: 3 });
    expect(node(els, "o1").data).toMatchObject({ objectType: "orders", finalTokens: 1 });
    expect(node(els, "items tau0").data.label).toBeUndefined();
    expect(els.edges.map((e) => [e.source, e.target, e.data?.variable, e.data?.weight])).toEqual([
      ["o0", "place order", false, 1],
      ["place order", "o1", false, 2],
      ["i0", "place order", true, 1],
      ["place order", "i1", true, 1],
      ["i1", "items tau0", false, 1],
      ["items tau0", "i2", false, 1],
    ]);
  });

  it("round-trip a net, spelling out the arc defaults", () => {
    expect(elementsToOcpn(ocpnElements(OCPN))).toEqual({
      ...OCPN,
      arcs: OCPN.arcs.map((a) => ({ type: "normal", weight: 1, ...a })),
    });
  });

  it("give a place without an object type an empty one", () => {
    const els = ocpnElements(OCPN);
    const added: PetriNetNode = { id: "new", type: "place", data: {}, position: { x: 0, y: 0 } };
    const net = elementsToOcpn({ ...els, nodes: [...els.nodes, added] });
    expect(net.places[net.places.length - 1]).toEqual({ name: "new", object_type: "" });
    expect(net.initial_marking).not.toHaveProperty("new");
  });
});

describe("ocpnGraphIds", () => {
  it("maps the layout refs to the names, in graph order", async () => {
    const req = await modelLayoutRequest(wasmViz, "ocpn", OCPN);
    const ids = ocpnGraphIds(OCPN, req);
    expect(ids.nodes).toEqual(["o0", "o1", "i0", "i1", "i2", "place order", "items tau0"]);
    expect(ids.edges).toEqual(OCPN.arcs.map((a) => [a.source, a.target]));
    expect(vizNetIds({ model: "ocpn", net: OCPN }, req)).toEqual(ids);
  });
});

describe("layoutOcpnElements", () => {
  it("places nodes at the layout's centres and sizes and routes every arc", async () => {
    const res = await layoutOcpnElements(wasmViz, OCPN, ocpnElements(OCPN));
    const ids = ocpnGraphIds(OCPN, res.request);
    expect(res.request.edges.map((e) => e.arc)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const id of ids.nodes) expect(node(res, id).data.size).toBeDefined();
    expect(node(res, "items tau0").data.size?.width).toBeLessThan(
      node(res, "place order").data.size?.width ?? 0,
    );
    for (const e of res.edges) {
      expect(e.data?.routing?.points.length).toBeGreaterThanOrEqual(2);
      expect(e.data?.routing?.srcPos).toEqual(node(res, e.source).position);
    }
  });
});

describe("ocpnTypeOverrides", () => {
  it("colors places and arcs by their place's object type", async () => {
    const req = await modelLayoutRequest(wasmViz, "ocpn", OCPN);
    const overrides = ocpnTypeOverrides(OCPN, req, (t) => (t === "orders" ? "#ff0000" : undefined));
    // o0 and o1 are graph nodes 0 and 1, and arcs 0 and 1 touch them.
    expect(overrides.nodes).toEqual({
      0: { fill: "#ffd9d9", stroke: "#ff0000" },
      1: { fill: "#ffd9d9", stroke: "#ff0000" },
    });
    expect(overrides.edges).toEqual({ 0: { stroke: "#ff0000" }, 1: { stroke: "#ff0000" } });
  });
});

describe("ocpnElementsSvg", () => {
  it("draws the on-screen layout in the host's colors, with the given marking", async () => {
    const laid = await layoutOcpnElements(wasmViz, OCPN, ocpnElements(OCPN));
    const elements: PetriElements = {
      nodes: laid.nodes.map((n) =>
        n.id === "place order" ? { ...n, data: { ...n.data, elementStyle: { opacity: 0.35 } } } : n,
      ),
      edges: laid.edges,
    };
    const svg = await ocpnElementsSvg(wasmViz, { ...OCPN, initial_marking: { i1: 2 } }, elements, (t) =>
      t === "items" ? "#00aa00" : undefined,
    );
    expect(svg).toMatch(/<svg[\s>]/);
    expect(svg).toContain('stroke="#00aa00"');
    expect(svg).toContain('stroke-dasharray="6 3"');
    expect(svg).toContain('opacity="0.35"');
    // i1's two tokens as dots.
    expect(svg?.match(/<circle/g)).toHaveLength(2);
  });

  it("draws nothing for an empty net", async () => {
    const empty: Ocpn = { places: [], transitions: [], arcs: [], initial_marking: {}, final_marking: {} };
    expect(await ocpnElementsSvg(wasmViz, empty, { nodes: [], edges: [] })).toBeNull();
  });
});
