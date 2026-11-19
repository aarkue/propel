import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import {
  type Dfg,
  type Journey,
  type Journeys,
  type OcDfg,
  ProcessMapAnimation,
  type ProcessMapAnimationData,
} from "@r4pm/components";

const meta = {
  title: "Viewers/Process Map Animation",
  component: ProcessMapAnimation,
  parameters: { frame: { mode: "canvas", height: 600 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof ProcessMapAnimation>;
export default meta;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Small seeded PRNG, so the sample data is the same on every load. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Road traffic fine management: the main variants, each step as [activity, min days, max days] after
// the previous one. The log records dates only, so every event is at midnight.
const FINE_VARIANTS: { weight: number; steps: [string, number, number][] }[] = [
  {
    weight: 34,
    steps: [
      ["Create Fine", 0, 0],
      ["Payment", 2, 30],
    ],
  },
  {
    weight: 30,
    steps: [
      ["Create Fine", 0, 0],
      ["Send Fine", 60, 110],
      ["Insert Fine Notification", 8, 20],
      ["Add penalty", 60, 60],
      ["Send for Credit Collection", 300, 520],
    ],
  },
  {
    weight: 14,
    steps: [
      ["Create Fine", 0, 0],
      ["Send Fine", 60, 110],
      ["Insert Fine Notification", 8, 20],
      ["Add penalty", 60, 60],
      ["Payment", 5, 90],
    ],
  },
  {
    weight: 9,
    steps: [
      ["Create Fine", 0, 0],
      ["Send Fine", 60, 110],
      ["Insert Fine Notification", 8, 20],
      ["Payment", 3, 50],
    ],
  },
  {
    weight: 7,
    steps: [
      ["Create Fine", 0, 0],
      ["Send Fine", 60, 110],
      ["Insert Fine Notification", 8, 20],
      ["Insert Date Appeal to Prefecture", 5, 40],
      ["Send Appeal to Prefecture", 10, 60],
      ["Receive Result Appeal from Prefecture", 40, 120],
      ["Notify Result Appeal to Offender", 5, 30],
    ],
  },
  {
    weight: 6,
    steps: [
      ["Create Fine", 0, 0],
      ["Send Fine", 60, 110],
      ["Insert Fine Notification", 8, 20],
      ["Add penalty", 60, 60],
      ["Appeal to Judge", 20, 90],
      ["Payment", 30, 200],
    ],
  },
];

function fineCases(count: number, seed: number): Journey[] {
  const r = mulberry32(seed);
  const totalWeight = FINE_VARIANTS.reduce((n, v) => n + v.weight, 0);
  const start = Date.UTC(2023, 0, 2);
  return Array.from({ length: count }, (_, i) => {
    let pick = r() * totalWeight;
    const variant =
      FINE_VARIANTS.find((v) => {
        pick -= v.weight;
        return pick < 0;
      }) ?? FINE_VARIANTS[0];
    let day = Math.floor(r() * 180);
    const events = variant.steps.map(([activity, min, max]): [string, number] => {
      day += min + Math.floor(r() * (max - min + 1));
      return [activity, start + day * DAY];
    });
    return { id: `A${10021 + i * 37}`, object_type: null, events };
  });
}

/** Journeys as the binding returns them: ordered by start, sampled evenly down to `max`. */
function journeysOf(all: Journey[], max = Number.POSITIVE_INFINITY): Journeys {
  const sorted = [...all].sort((a, b) => a.events[0][1] - b.events[0][1]);
  const journeys =
    sorted.length > max
      ? Array.from({ length: max }, (_, i) => sorted[Math.floor((i * sorted.length) / max)])
      : sorted;
  return {
    journeys,
    total: sorted.length,
    min_ms: Math.min(...sorted.map((j) => j.events[0][1])),
    max_ms: Math.max(...sorted.map((j) => j.events[j.events.length - 1][1])),
  };
}

/** The DFG of a set of journeys, as discovery would return it. */
function dfgOf(journeys: Journey[]): Dfg {
  const dfg: Dfg = {
    activities: {},
    directly_follows_relations: [],
    start_activities: {},
    end_activities: {},
  };
  const follows = new Map<string, [[string, string], number]>();
  for (const { events } of journeys) {
    if (events.length === 0) continue;
    events.forEach(([a], i) => {
      dfg.activities[a] = (dfg.activities[a] ?? 0) + 1;
      if (i === 0) return;
      const from = events[i - 1][0];
      const arc = follows.get(`${from}>${a}`) ?? [[from, a], 0];
      arc[1] += 1;
      follows.set(`${from}>${a}`, arc);
    });
    const first = events[0][0];
    const last = events[events.length - 1][0];
    dfg.start_activities[first] = (dfg.start_activities[first] ?? 0) + 1;
    dfg.end_activities[last] = (dfg.end_activities[last] ?? 0) + 1;
  }
  dfg.directly_follows_relations = [...follows.values()];
  return dfg;
}

const fines = fineCases(48, 7);
const fineMap: ProcessMapAnimationData = {
  source: { kind: "dfg", data: dfgOf(fines) },
  journeys: journeysOf(fines),
};
const manyFines = fineCases(1200, 11);
const sampledMap: ProcessMapAnimationData = {
  source: { kind: "dfg", data: dfgOf(manyFines) },
  journeys: journeysOf(manyFines, 60),
};

type OcEvent = { activity: string; time: number; objects: [type: string, id: string][] };

// Order management: customers place orders of 1-4 items; employees confirm, pick and pack; each order
// ships in one package. A few items are out of stock and get reordered, a few orders need a reminder.
function orderEvents(orders: number, seed: number): OcEvent[] {
  const r = mulberry32(seed);
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);
  const employees = ["Lena Brandt", "Tom Okafor", "Mia Kovac"];
  const staff = (): [string, string] => ["employees", employees[Math.floor(r() * employees.length)]];
  const events: OcEvent[] = [];
  let item = 880001;
  let t = Date.UTC(2023, 2, 6, 9, 0);
  for (let k = 0; k < orders; k++) {
    t += between(4, 30) * HOUR;
    const order: [string, string] = ["orders", `o-${990001 + k}`];
    const customer: [string, string] = ["customers", `c-${1040 + Math.floor(r() * 5)}`];
    const items = Array.from({ length: 1 + Math.floor(r() * 4) }, (): [string, string] => [
      "items",
      `i-${item++}`,
    ]);
    const pkg: [string, string] = ["packages", `p-${660001 + k}`];
    events.push({ activity: "place order", time: t, objects: [order, customer, ...items] });
    const confirmed = t + between(1, 20) * HOUR;
    events.push({ activity: "confirm order", time: confirmed, objects: [order, staff()] });
    let paid = confirmed + between(0.5, 4) * DAY;
    if (r() < 0.25) {
      const reminder = confirmed + between(5, 8) * DAY;
      events.push({ activity: "payment reminder", time: reminder, objects: [order] });
      paid = reminder + between(1, 3) * DAY;
    }
    events.push({ activity: "pay order", time: paid, objects: [order] });
    let ready = paid;
    for (const it of items) {
      let pickAt = confirmed + between(2, 60) * HOUR;
      if (r() < 0.12) {
        const out = confirmed + between(1, 6) * HOUR;
        events.push({ activity: "item out of stock", time: out, objects: [it, staff()] });
        const reorder = out + between(1, 3) * DAY;
        events.push({ activity: "reorder item", time: reorder, objects: [it] });
        pickAt = reorder + between(1, 2) * DAY;
      }
      events.push({ activity: "pick item", time: pickAt, objects: [it, staff()] });
      ready = Math.max(ready, pickAt);
    }
    const packed = ready + between(1, 6) * HOUR;
    events.push({ activity: "create package", time: packed, objects: [pkg, ...items, staff()] });
    const sent = packed + between(2, 24) * HOUR;
    events.push({ activity: "send package", time: sent, objects: [pkg, ...items, staff()] });
    const delivered = sent + between(1, 4) * DAY;
    events.push({ activity: "package delivered", time: delivered, objects: [pkg, ...items] });
  }
  return events.map((e) => ({ ...e, time: Math.round(e.time) })).sort((a, b) => a.time - b.time);
}

/** One journey per object: its events by time. */
function objectJourneys(events: OcEvent[]): Journey[] {
  const byObject = new Map<string, Journey>();
  for (const e of events) {
    for (const [type, id] of e.objects) {
      const j = byObject.get(id) ?? { id, object_type: type, events: [] };
      j.events.push([e.activity, e.time]);
      byObject.set(id, j);
    }
  }
  return [...byObject.values()];
}

function ocdfgOf(journeys: Journey[]): OcDfg {
  const types = [...new Set(journeys.map((j) => j.object_type ?? ""))].sort();
  return {
    object_type_to_dfg: Object.fromEntries(
      types.map((t) => [t, dfgOf(journeys.filter((j) => j.object_type === t))]),
    ),
  };
}

const objects = objectJourneys(orderEvents(16, 3));
const ocdfg = ocdfgOf(objects);
const objectMap: ProcessMapAnimationData = {
  source: { kind: "ocdfg", data: ocdfg, types: Object.keys(ocdfg.object_type_to_dfg) },
  journeys: journeysOf(objects),
};
const nothingTimed: ProcessMapAnimationData = {
  source: { kind: "dfg", data: dfgOf(fines) },
  journeys: { journeys: [], total: 0, min_ms: 0, max_ms: 0 },
};

/** Fines of the road traffic fine log moving over its DFG, one dot per case along the real timeline. */
export const Default: StoryObj = {
  name: "Road fines",
  render: () => <ProcessMapAnimation data={fineMap} />,
};

/** A larger log: the map counts all 1,200 cases, the animation plays an even sample of 60. */
export const Sampled: StoryObj = {
  name: "Sampled cases",
  render: () => <ProcessMapAnimation data={sampledMap} />,
};

/** Orders, items, packages and customers over an OC-DFG. Employees are rare, so they start hidden. */
export const ObjectCentric: StoryObj = {
  name: "Object-centric",
  render: () => <ProcessMapAnimation data={objectMap} />,
};

/** No case has a timed event, so there is nothing to play. */
export const Empty: StoryObj = {
  name: "No timed events",
  render: () => <ProcessMapAnimation data={nothingTimed} />,
};
