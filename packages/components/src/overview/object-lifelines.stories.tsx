import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { useMemo, useState } from "react";
import {
  DEFAULT_OBJECT_LIFELINES_CONTROLS,
  type LifelineEvent,
  type Lifelines,
  type LifelinesWindow,
  type ObjectLifelinesControls,
  ObjectLifelinesView,
} from "@r4pm/components";

const meta = {
  title: "Viewers/Object Lifelines",
  component: ObjectLifelinesView,
  parameters: { frame: { mode: "canvas", height: 640 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof ObjectLifelinesView>;
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

const OCEL = orderManagement(48, 11);
const OBJECT_TYPES = ["customers", "employees", "items", "orders", "packages", "products"];

/** Up to `maxObjects` consecutive objects by first event, as the engine's `get_object_lifelines` picks them. */
function lifelines(
  events: OcelEvent[],
  objectType: string | null,
  window: LifelinesWindow,
  maxObjects: number,
): Lifelines {
  const byObject = new Map<string, { type: string; events: OcelEvent[] }>();
  for (const e of events) {
    for (const [type, id] of e.objects) {
      if (objectType && type !== objectType) continue;
      const entry = byObject.get(id) ?? { type, events: [] };
      entry.events.push(e);
      byObject.set(id, entry);
    }
  }
  const objects = [...byObject].sort(
    ([a, x], [b, y]) => x.events[0].time_ms - y.events[0].time_ms || a.localeCompare(b),
  );
  const total = objects.length;
  const take = Math.min(maxObjects, total);
  const start = window === "start" ? 0 : window === "middle" ? Math.floor((total - take) / 2) : total - take;
  const shown: LifelineEvent[] = [];
  const index = new Map<string, number>();
  const at = (e: OcelEvent) => {
    if (!index.has(e.id)) {
      index.set(e.id, shown.length);
      shown.push({ id: e.id, activity: e.activity, time_ms: e.time_ms });
    }
    return index.get(e.id) as number;
  };
  return {
    lifelines: objects.slice(start, start + take).map(([id, o]) => ({
      id,
      object_type: o.type,
      events: o.events.map(at),
    })),
    events: shown,
    total,
  };
}

function LifelinesDemo({
  initial,
  maxObjects = 70,
}: {
  initial: ObjectLifelinesControls;
  maxObjects?: number;
}) {
  const [controls, setControls] = useState(initial);
  const data = useMemo(
    () =>
      lifelines(
        OCEL,
        controls.objectType ?? null,
        controls.window ?? DEFAULT_OBJECT_LIFELINES_CONTROLS.window,
        maxObjects,
      ),
    [controls, maxObjects],
  );
  return (
    <ObjectLifelinesView
      data={data}
      objectTypes={OBJECT_TYPES}
      controls={controls}
      onControlsChange={setControls}
    />
  );
}

/** Objects of every type from the middle of the log. Hover an event to ring it in every row it touches. */
export const Default: StoryObj = {
  name: "All object types",
  render: () => <LifelinesDemo initial={DEFAULT_OBJECT_LIFELINES_CONTROLS} />,
};

/** Only packages, from the start of the log: short lives that each bundle a few items. */
export const OneType: StoryObj = {
  name: "One object type",
  render: () => <LifelinesDemo initial={{ objectType: "packages", window: "start" }} />,
};

/** Object ids longer than the label column are cut to fit. */
export const LongIds: StoryObj = {
  name: "Long object ids",
  render: () => {
    const renamed = OCEL.map((e) => ({
      ...e,
      objects: e.objects.map(([t, id]): [string, string] => [
        t,
        t === "orders" ? `SO-2023-EMEA-WEBSHOP-${id.slice(2)}` : id,
      ]),
    }));
    return (
      <ObjectLifelinesView
        data={lifelines(renamed, "orders", "start", 30)}
        objectTypes={OBJECT_TYPES}
        controls={{ objectType: "orders", window: "start" }}
      />
    );
  },
};

/** A type without objects that have events. */
export const Empty: StoryObj = {
  name: "No objects",
  render: () => (
    <ObjectLifelinesView
      data={{ lifelines: [], events: [], total: 0 }}
      objectTypes={OBJECT_TYPES}
      controls={{ objectType: "returns", window: "middle" }}
    />
  ),
};
