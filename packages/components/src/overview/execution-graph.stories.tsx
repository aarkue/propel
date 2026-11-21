import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_EXECUTION_GRAPH_CONTROLS,
  type ExecutionEdge,
  type ExecutionGraph,
  type ExecutionGraphControls,
  ExecutionGraphView,
  type ExecutionObject,
  type Layout,
  LoadingState,
  layoutGraph,
  type Option,
} from "@r4pm/components";
import { wasmViz } from "@r4pm/components/viz/wasm";

const meta = {
  title: "Viewers/Execution Graph",
  component: ExecutionGraphView,
  parameters: { frame: { mode: "canvas", height: 700 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof ExecutionGraphView>;
export default meta;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.UTC(2023, 2, 6, 9, 0);

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface OcelEvent {
  id: string;
  activity: string;
  time_ms: number;
  /** `[object type, object id]` */
  objects: [string, string][];
}

const CUSTOMERS = ["c-1042", "c-1077", "c-1103", "c-1150", "c-1188", "c-1231"];
const PRODUCTS = ["laptop stand", "wireless mouse", "USB-C dock", "27in monitor", "headset", "keyboard"];
const SALES = ["Mara Holt", "Jonas Weber", "Ines Kaya"];
const WAREHOUSE = ["Tom Berger", "Ada Novak", "Luis Ortega", "Kim Sato"];

/** A small order-management OCEL: orders with items, packages that bundle items of several orders. */
function orderManagement(orders: number, seed: number): OcelEvent[] {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const events: Omit<OcelEvent, "id">[] = [];
  const picked: { item: string; time: number }[] = [];
  let itemNo = 880001;
  for (let k = 0; k < orders; k++) {
    const order = `o-${990001 + k}`;
    const t0 = START + k * 7 * HOUR + rnd() * 5 * HOUR;
    const items = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => `i-${itemNo++}`);
    const products = [...new Set(items.map(() => pick(PRODUCTS)))];
    events.push({
      activity: "place order",
      time_ms: t0,
      objects: [
        ["orders", order],
        ["customers", CUSTOMERS[k % CUSTOMERS.length]],
        ...items.map((i): [string, string] => ["items", i]),
        ...products.map((p): [string, string] => ["products", p]),
      ],
    });
    events.push({
      activity: "confirm order",
      time_ms: t0 + (2 + rnd() * 28) * HOUR,
      objects: [
        ["orders", order],
        ["employees", pick(SALES)],
      ],
    });
    for (const item of items) {
      let t = t0 + (20 + rnd() * 30) * HOUR;
      if (rnd() < 0.12) {
        events.push({ activity: "item out of stock", time_ms: t, objects: [["items", item]] });
        events.push({ activity: "reorder item", time_ms: t + 3 * HOUR, objects: [["items", item]] });
        t += (1.5 + rnd()) * DAY;
      }
      events.push({
        activity: "pick item",
        time_ms: t,
        objects: [
          ["items", item],
          ["employees", pick(WAREHOUSE)],
        ],
      });
      picked.push({ item, time: t });
    }
    let pay = t0 + (1.5 + rnd() * 5) * DAY;
    if (rnd() < 0.2) {
      events.push({ activity: "payment reminder", time_ms: t0 + 7 * DAY, objects: [["orders", order]] });
      pay = t0 + (8 + rnd() * 4) * DAY;
    }
    events.push({ activity: "pay order", time_ms: pay, objects: [["orders", order]] });
  }
  picked.sort((a, b) => a.time - b.time);
  let packageNo = 660001;
  for (let i = 0; i < picked.length; ) {
    const group = picked.slice(i, i + 2 + Math.floor(rnd() * 4));
    i += group.length;
    const pkg: [string, string] = ["packages", `p-${packageNo++}`];
    const items = group.map((g): [string, string] => ["items", g.item]);
    const created = group[group.length - 1].time + (1 + rnd() * 5) * HOUR;
    const sent = created + (4 + rnd() * 16) * HOUR;
    events.push({ activity: "create package", time_ms: created, objects: [pkg, ...items] });
    events.push({
      activity: "send package",
      time_ms: sent,
      objects: [pkg, ["employees", pick(WAREHOUSE)], ...items],
    });
    events.push({
      activity: "package delivered",
      time_ms: sent + (1 + rnd() * 2) * DAY,
      objects: [pkg, ...items],
    });
  }
  return events
    .sort((a, b) => a.time_ms - b.time_ms)
    .map((e, i) => ({ ...e, id: `e-${String(i + 1).padStart(5, "0")}` }));
}

const OCEL = orderManagement(36, 7);
/** Long-lived master data, which would connect every execution to every other one. */
const LONG_LIVED = ["customers", "employees", "products"];

/** The events around `rootId`, as the engine's `get_execution_graph` computes them, without the layout. */
function execution(
  rootId: string,
  depth: number,
  maxObjects: number,
  exclude: string[],
): Omit<ExecutionGraph, "layout"> {
  const typeOf = new Map(OCEL.flatMap((e) => e.objects.map(([t, id]) => [id, t] as const)));
  const eventsOf = new Map<string, OcelEvent[]>();
  for (const e of OCEL) for (const [, id] of e.objects) eventsOf.set(id, [...(eventsOf.get(id) ?? []), e]);
  const distance = new Map([[rootId, 0]]);
  const queue = [rootId];
  let truncated = false;
  while (queue.length) {
    const ob = queue.shift() as string;
    const d = distance.get(ob) as number;
    if (d >= depth) continue;
    for (const e of eventsOf.get(ob) ?? []) {
      for (const [t, o] of e.objects) {
        if (distance.has(o) || exclude.includes(t)) continue;
        if (distance.size >= maxObjects) {
          truncated = true;
          continue;
        }
        distance.set(o, d + 1);
        queue.push(o);
      }
    }
  }
  const objects: ExecutionObject[] = [...distance].map(([id, d]) => ({
    id,
    object_type: typeOf.get(id) ?? "",
    distance: d,
  }));
  const events = OCEL.filter((e) => e.objects.some(([, id]) => distance.has(id))).map((e) => ({
    ...e,
    objects: e.objects.filter(([, id]) => distance.has(id)),
  }));
  const position = new Map(events.map((e, i) => [e.id, i]));
  const edges = new Map<string, ExecutionEdge>();
  for (const o of objects) {
    const evs = (eventsOf.get(o.id) ?? []).map((e) => position.get(e.id) as number);
    for (let i = 1; i < evs.length; i++) {
      const key = `${evs[i - 1]}-${evs[i]}`;
      const edge = edges.get(key) ?? { from: evs[i - 1], to: evs[i], object_types: [], objects: [] };
      if (!edge.object_types.includes(o.object_type)) edge.object_types.push(o.object_type);
      edge.objects.push(o.id);
      edges.set(key, edge);
    }
  }
  return {
    root: objects[0],
    objects,
    events,
    edges: [...edges.values()]
      .map((e) => ({ ...e, object_types: e.object_types.sort() }))
      .sort((a, b) => a.from - b.from || a.to - b.to),
    truncated,
    total_events: events.length,
  };
}

/** Lays the events out left to right with rust4pm's layered layout, one box per event. */
function useExecutionGraph(
  rootType: string,
  rootId: string,
  depth: number,
  maxObjects = 60,
): ExecutionGraph | null {
  const exclude = useMemo(() => LONG_LIVED.filter((t) => t !== rootType), [rootType]);
  const graph = useMemo(
    () => execution(rootId, depth, maxObjects, exclude),
    [rootId, depth, maxObjects, exclude],
  );
  const [laid, setLaid] = useState<{ graph: typeof graph; layout: Layout } | null>(null);
  useEffect(() => {
    let alive = true;
    layoutGraph(wasmViz, {
      graph: {
        nodes: graph.events.map((e) => ({
          size: { width: Math.min(240, Math.max(96, 7 * e.activity.length + 32)), height: 44 },
          shape: "box",
        })),
        edges: graph.edges.map((e) => ({ source: e.from, target: e.to, weight: e.objects.length })),
      },
      preset: "layered",
    }).then((layout) => alive && setLaid({ graph, layout }));
    return () => {
      alive = false;
    };
  }, [graph]);
  return laid?.graph === graph ? { ...graph, layout: laid.layout } : null;
}

const countBy = (type: string) => {
  const events = new Map<string, number>();
  for (const e of OCEL)
    for (const [t, id] of e.objects) if (t === type) events.set(id, (events.get(id) ?? 0) + 1);
  return [...events].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};
const LEADING_TYPES = ["orders", "items", "packages"];
const objectTypeOptions: Option<string>[] = LEADING_TYPES.map((t) => ({
  value: t,
  label: t,
  description: `${countBy(t).length} objects`,
}));

function ExecutionGraphDemo({
  initial,
  maxObjects,
}: {
  initial: ExecutionGraphControls;
  maxObjects?: number;
}) {
  const [controls, setControls] = useState(initial);
  const type = controls.objectType ?? "orders";
  const candidates = useMemo(() => countBy(type), [type]);
  const objectId = controls.objectId ?? candidates[0][0];
  const data = useExecutionGraph(type, objectId, controls.depth, maxObjects);
  if (!data) return <LoadingState label="laying out the execution" />;
  return (
    <ExecutionGraphView
      data={data}
      objectTypeOptions={objectTypeOptions}
      objectOptions={candidates
        .slice(0, 40)
        .map(([id, n]) => ({ value: id, label: id, description: `${n} events` }))}
      longLived={LONG_LIVED.filter((t) => t !== type)}
      controls={controls}
      onControlsChange={setControls}
    />
  );
}

/** An order with its items and the packages they ship in, two hops out. Pick another order or reach. */
export const Default: StoryObj = {
  name: "Order execution",
  render: () => (
    <ExecutionGraphDemo
      initial={{ ...DEFAULT_EXECUTION_GRAPH_CONTROLS, objectType: "orders", objectId: "o-990012" }}
    />
  ),
};

/** Led by one package: the items it bundles come from several orders. */
export const PackageLed: StoryObj = {
  name: "Led by a package",
  render: () => <ExecutionGraphDemo initial={{ objectType: "packages", objectId: null, depth: 2 }} />,
};

/** Three hops reach more objects than the limit, so the graph is cut and says so. */
export const Truncated: StoryObj = {
  name: "Object limit reached",
  render: () => (
    <ExecutionGraphDemo initial={{ objectType: "orders", objectId: "o-990012", depth: 3 }} maxObjects={20} />
  ),
};

/** An object without events. */
export const NoEvents: StoryObj = {
  name: "No events",
  render: () => {
    const root: ExecutionObject = { id: "o-990999", object_type: "orders", distance: 0 };
    const empty: ExecutionGraph = {
      root,
      objects: [root],
      events: [],
      edges: [],
      truncated: false,
      total_events: 0,
      layout: {
        bounds: { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } },
        nodes: [],
        edges: [],
        layer_count: 0,
        reversed: [],
        stats: { dummy_count: 0 },
      },
    };
    return (
      <ExecutionGraphView
        data={empty}
        objectTypeOptions={objectTypeOptions}
        objectOptions={[{ value: root.id, label: root.id, description: "0 events" }]}
      />
    );
  },
};
