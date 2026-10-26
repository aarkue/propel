import { describe, expect, test } from "vitest";
import type { Dfg, OcDfg } from "../viz";
import { wasmViz } from "../viz/wasm";
import { DFG_END_ID, DFG_START_ID } from "./util/dfg-model";
import type { DfPerformance } from "./util/performance-types";
import {
  arcKey,
  arcLooks,
  caseArcs,
  columnLayout,
  dfgBuildOptions,
  dfgOverrides,
  dfgSvg,
  edgeRoutes,
  layoutDfg,
  ocActivityCounts,
  ocArcs,
  rerouteDfg,
  selectArcs,
  shownModel,
  shownRoute,
  sourceCounter,
  widthFromCount,
} from "./viz-layout";

const dfg: Dfg = {
  activities: { "register request": 6, examine: 4, decide: 6, pay: 5 },
  directly_follows_relations: [
    [["register request", "examine"], 4],
    [["register request", "decide"], 2],
    [["examine", "decide"], 4],
    [["decide", "pay"], 5],
    [["pay", "pay"], 1],
  ],
  start_activities: { "register request": 6 },
  end_activities: { pay: 5 },
};

const performance: DfPerformance = {
  arcs: [
    {
      source: "examine",
      target: "decide",
      count: 4,
      min_ms: 1,
      max_ms: 9,
      mean_ms: 5e6,
      median_ms: 5,
      p90_ms: 8,
    },
    {
      source: "decide",
      target: "pay",
      count: 5,
      min_ms: 1,
      max_ms: 9,
      mean_ms: 1e5,
      median_ms: 5,
      p90_ms: 8,
    },
  ],
};

const ocdfg: OcDfg = {
  object_type_to_dfg: {
    order: {
      activities: { "place order": 3, "confirm order": 3, ship: 2 },
      directly_follows_relations: [
        [["place order", "confirm order"], 3],
        [["confirm order", "ship"], 2],
      ],
      start_activities: { "place order": 3 },
      end_activities: { ship: 2 },
    },
    item: {
      activities: { "pick item": 5, ship: 4 },
      directly_follows_relations: [[["pick item", "ship"], 4]],
      start_activities: { "pick item": 5 },
      end_activities: { ship: 4 },
    },
    customer: {
      activities: { "place order": 1 },
      directly_follows_relations: [],
      start_activities: { "place order": 1 },
      end_activities: { "place order": 1 },
    },
  },
};

const view = { direction: "TB" as const };

function laidOut(model: Dfg) {
  const arcs = caseArcs(model, performance);
  const kept = selectArcs(arcs, null, model.activities).kept;
  const shown = shownModel({ kind: "dfg", data: model }, kept);
  const looks = arcLooks(kept, "count", sourceCounter(arcs, model.activities));
  const options = dfgBuildOptions(shown, kept, looks, model.activities, view);
  return { arcs, kept, shown, looks, options };
}

describe("arcs and the edge slider", () => {
  test("a DFG's relations, starts and ends become arcs with their durations", () => {
    const arcs = caseArcs(dfg, performance);
    expect(arcs).toHaveLength(7);
    const start = arcs.find((a) => a.kind === "start");
    expect(start).toMatchObject({ from: DFG_START_ID, to: "register request", count: 6 });
    expect(arcs.find((a) => a.kind === "end")).toMatchObject({ from: "pay", to: DFG_END_ID, count: 5 });
    expect(arcs.find((a) => a.from === "examine")?.duration?.mean_ms).toBe(5e6);
    expect(new Set(arcs.map((a) => a.key)).size).toBe(arcs.length);
  });

  test("keeps the top arcs per object type and builds the model of just those", () => {
    const types = ["item", "order"];
    const arcs = ocArcs(ocdfg, types);
    expect(new Set(arcs.map((a) => a.group))).toEqual(new Set(types));
    const { kept, slider, coverage } = selectArcs(arcs, 1, ocActivityCounts(ocdfg, types));
    expect(slider).toBe(1);
    expect(kept.map((a) => a.key).sort()).toEqual(
      [
        arcKey("item", "start", DFG_START_ID, "pick item"),
        arcKey("order", "follows", "place order", "confirm order"),
      ].sort(),
    );
    expect(coverage.edges).toMatchObject({ shown: 2, total: 7, sliderMax: 4 });
    expect(coverage.activities).toMatchObject({ shown: 3, total: 4 });

    const shown = shownModel({ kind: "ocdfg", data: ocdfg, types }, kept);
    expect(shown).toEqual({
      kind: "ocdfg",
      types,
      data: {
        object_type_to_dfg: {
          item: {
            activities: { "pick item": 5 },
            directly_follows_relations: [],
            start_activities: { "pick item": 5 },
            end_activities: {},
          },
          order: {
            activities: { "place order": 3, "confirm order": 3 },
            directly_follows_relations: [[["place order", "confirm order"], 3]],
            start_activities: {},
            end_activities: {},
          },
        },
      },
    });
  });

  test("the initial view grows N while the union stays within the cap", () => {
    expect(selectArcs(caseArcs(dfg), null, dfg.activities).slider).toBe(7);
    expect(selectArcs(caseArcs(dfg), 0, dfg.activities).kept).toEqual([]);
  });
});

describe("labels, widths and build options", () => {
  test("counts are drawn at rust4pm's widths and durations spread over their range", () => {
    const arcs = caseArcs(dfg, performance);
    const source = sourceCounter(arcs, dfg.activities);
    const counts = arcLooks(arcs, "count", source);
    expect(counts.get(arcKey(undefined, "start", DFG_START_ID, "register request"))).toEqual({
      label: "6",
      width: widthFromCount(6, 6),
    });
    expect(counts.get(arcKey(undefined, "follows", "pay", "pay"))?.width).toBeCloseTo(
      1.5 + 4.5 * Math.sqrt(1 / 6),
    );

    const pct = arcLooks(arcs, "pct_source", source);
    expect(pct.get(arcKey(undefined, "start", DFG_START_ID, "register request"))?.label).toBe("100%");
    expect(pct.get(arcKey(undefined, "follows", "register request", "decide"))?.label).toBe("33%");

    const mean = arcLooks(arcs, "mean", source, { heatmap: true, formatDuration: (ms) => `${ms}ms` });
    const slow = mean.get(arcKey(undefined, "follows", "examine", "decide"));
    expect(slow).toEqual({ label: "5000000ms", width: 6, heat: "#d23228" });
    expect(mean.get(arcKey(undefined, "follows", "decide", "pay"))).toMatchObject({
      width: 1.5,
      heat: "#1e64dc",
    });
    expect(mean.get(arcKey(undefined, "start", DFG_START_ID, "register request"))).toEqual({
      label: "",
      width: 1.5,
    });
  });

  test("annotations key the arcs by their end nodes and the activities by name", () => {
    const { options } = laidOut(dfg);
    expect(options.direction).toBe("topbottom");
    expect(options.layout_patch).toBeNull();
    const annotations = options.annotations as { nodes: unknown[]; edges: unknown[] };
    expect(annotations.nodes).toContainEqual([{ kind: "activity", name: "pay" }, { label: "5" }]);
    expect(annotations.edges).toContainEqual([
      [{ kind: "start" }, { kind: "activity", name: "register request" }],
      { label: "6", thickness: 6 },
    ]);
    expect(annotations.edges).toHaveLength(7);

    const types = ["item", "order"];
    const arcs = ocArcs(ocdfg, types);
    const kept = selectArcs(arcs, null, {}).kept;
    const shown = shownModel({ kind: "ocdfg", data: ocdfg, types }, kept);
    const oc = dfgBuildOptions(
      shown,
      kept,
      arcLooks(kept, "count", () => 1),
      {},
      {
        direction: "LR",
        routing: "diagonal",
      },
    );
    expect(oc).toMatchObject({
      direction: "leftright",
      object_types: types,
      layout_patch: { routing: { style: "diagonal" } },
    });
    expect((oc.annotations as { edges: unknown[] }).edges).toContainEqual([
      ["item", { kind: "activity", name: "ship" }, { kind: "end" }],
      { label: "4", thickness: widthFromCount(4, 5) },
    ]);
  });
});

describe("rust4pm layout, re-route and export", () => {
  test("refers every graph node and edge back to the model, with rust4pm's sizes", async () => {
    const { kept, shown, options } = laidOut(dfg);
    const laid = await layoutDfg(wasmViz, shown, options, kept);
    expect(laid.nodes.slice(0, 2)).toEqual([
      { id: "start", kind: "start", name: "", group: undefined },
      { id: "end", kind: "end", name: "", group: undefined },
    ]);
    expect(laid.nodes.map((n) => n.id).sort()).toEqual(
      ["act:decide", "act:examine", "act:pay", "act:register request", "end", "start"].sort(),
    );
    expect(laid.edges.map((e) => e.key).sort()).toEqual(kept.map((a) => a.key).sort());
    const loop = laid.edges.find((e) => e.source === "act:pay" && e.target === "act:pay");
    expect(loop).toBeDefined();
    const at = (id: string) => laid.nodes.findIndex((n) => n.id === id);
    expect(laid.layout.nodes[at("start")].size).toEqual({ width: 80, height: 36 });
    expect(laid.layout.nodes[at("act:register request")].size).toEqual({ width: 152, height: 52 });
    const routes = edgeRoutes(laid, laid.layout);
    for (const r of routes) expect(r.points.length).toBeGreaterThanOrEqual(2);
    expect(routes[laid.edges.indexOf(loop!)].labelAnchor).toBeDefined();
  });

  test("an OC-DFG has START and END per object type and its arcs by type", async () => {
    const types = ["item", "order"];
    const arcs = ocArcs(ocdfg, types);
    const kept = selectArcs(arcs, null, {}).kept;
    const shown = shownModel({ kind: "ocdfg", data: ocdfg, types }, kept);
    const options = dfgBuildOptions(
      shown,
      kept,
      arcLooks(kept, "count", () => 1),
      {},
      view,
    );
    const laid = await layoutDfg(wasmViz, shown, options, kept);
    const terminals = laid.nodes.filter((n) => n.kind !== "activity").map((n) => n.id);
    expect(terminals).toEqual(["start:item", "end:item", "start:order", "end:order"]);
    expect(laid.nodes.find((n) => n.id === "start:order")).toMatchObject({ kind: "start", group: "order" });
    const ship = laid.edges.filter((e) => e.target === "act:ship").map((e) => e.group);
    expect(ship.sort()).toEqual(["item", "order"]);
    expect(laid.edges.find((e) => e.source === "act:ship" && e.group === "item")?.target).toBe("end:item");
  });

  test("re-routes over moved centres and draws the moved layout with overrides", async () => {
    const { kept, shown, options, looks } = laidOut(dfg);
    const laid = await layoutDfg(wasmViz, shown, options, kept);
    const moved = laid.nodes.map((n, i) => {
      const c = laid.layout.nodes[i].center;
      return n.id === "act:pay" ? { x: c.x + 300, y: c.y } : c;
    });
    const layout = await rerouteDfg(wasmViz, laid, moved);
    expect(layout?.edges).toHaveLength(laid.edges.length);
    const routes = edgeRoutes(laid, layout!);

    const index = new Map(laid.nodes.map((n, i) => [n.id, i]));
    const edges = laid.edges.map((e, i) =>
      shownRoute(routes[i], moved[index.get(e.source) ?? 0], moved[index.get(e.target) ?? 0]),
    );
    const overrides = dfgOverrides(laid, {
      activityColor: (a) => (a === "pay" ? "#ff0000" : undefined),
      heat: (key) => (key === arcKey(undefined, "follows", "decide", "pay") ? "#123456" : undefined),
    });
    const pay = laid.nodes.findIndex((n) => n.id === "act:pay");
    expect(overrides.nodes).toEqual({ [pay]: { fill: "#ffd9d9", stroke: "#ff0000" } });
    expect(Object.values(overrides.edges ?? {})).toEqual([{ stroke: "#123456" }]);

    const svg = await dfgSvg(wasmViz, shown, options, laid, { centres: moved, edges }, overrides);
    for (const text of ["#ffd9d9", "#123456", "register request", ">6<"]) expect(svg).toContain(text);
    expect(looks.size).toBe(kept.length);
  });
});

describe("geometry without rust4pm", () => {
  test("an unmoved route is kept and a moved one bends along", () => {
    const route = {
      points: [
        { x: 0, y: 10 },
        { x: 0, y: 50 },
        { x: 0, y: 90 },
      ],
      labelAnchor: { x: 0, y: 50 },
      sourceCentre: { x: 0, y: 0 },
      targetCentre: { x: 0, y: 100 },
    };
    expect(shownRoute(route, { x: 0, y: 0 }, { x: 0, y: 100 })).toEqual({
      points: route.points,
      labelAnchor: route.labelAnchor,
      moved: false,
    });
    const moved = shownRoute(route, { x: 0, y: 0 }, { x: 40, y: 100 });
    expect(moved.points).toEqual([
      { x: 0, y: 10 },
      { x: 20, y: 50 },
      { x: 40, y: 90 },
    ]);
    expect(moved.labelAnchor).toEqual({ x: 20, y: 50 });
  });

  test("the fallback column has a node for every arc end and a route for every arc", () => {
    const { kept } = laidOut(dfg);
    const laid = columnLayout(kept);
    expect(laid.nodes[0].id).toBe("start");
    expect(laid.nodes[laid.nodes.length - 1].id).toBe("end");
    expect(laid.layout.nodes).toHaveLength(laid.nodes.length);
    expect(laid.layout.edges).toHaveLength(kept.length);
    const ids = new Set(laid.nodes.map((n) => n.id));
    for (const e of laid.edges) expect(ids.has(e.source) && ids.has(e.target)).toBe(true);
  });
});
