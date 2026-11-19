import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import {
  type EventSignature,
  type EventSignatures,
  type HealthFinding,
  type LifecycleActivity,
  type ObjectPopulation,
  type ObjectTypePopulation,
  type OcelOverview,
  OcelOverviewBoard,
  type OcelOverviewTarget,
  type SignatureObjects,
} from "@r4pm/components";
import { Flex, Text } from "@r4pm/components/ui";
import { useState } from "react";

const meta = {
  title: "Viewers/OCEL Overview",
  component: OcelOverviewBoard,
  parameters: { frame: { mode: "canvas", height: 900 } },
} satisfies Meta<typeof OcelOverviewBoard>;
export default meta;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.UTC(2023, 2, 1);
const END = Date.UTC(2023, 7, 31);

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** First and last event time of each object, or null for an object no event relates to. */
type Lifetimes = Record<string, ([number, number] | null)[]>;

/** Six months of an online shop: orders peak during a June campaign, items live until their
 *  package arrives, customers from their first to their last order, products and staff throughout. */
function simulateShop(): Lifetimes {
  const rand = mulberry32(42);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const days = (median: number, sigma: number) => median * Math.exp(sigma * gauss()) * DAY;
  const clip = (t: number) => Math.min(END, t);
  const demand = (t: number) => {
    const x = (t - START) / (END - START);
    return 0.55 + 0.25 * x + 0.9 * Math.exp(-(((x - 0.6) / 0.07) ** 2));
  };
  const out: Lifetimes = { orders: [], items: [], packages: [], customers: [], products: [], employees: [] };
  const customers: ([number, number] | null)[] = Array.from({ length: 560 }, () => null);
  const products: ([number, number] | null)[] = Array.from({ length: 20 }, () => null);
  const widen = (span: [number, number] | null, t: number): [number, number] =>
    span ? [Math.min(span[0], t), Math.max(span[1], t)] : [t, t];

  while (out.orders.length < 2000) {
    const t = START + rand() * (END - START);
    if (rand() * 1.6 > demand(t)) continue;
    out.orders.push([t, clip(t + days(9, 0.5))]);
    const c = Math.floor(rand() ** 1.7 * customers.length);
    customers[c] = widen(customers[c], t);
    const packed = t + days(4, 0.4);
    const delivered = clip(packed + days(3, 0.3));
    for (let k = 1 + Math.floor(rand() * rand() * 12); k > 0; k--) {
      out.items.push([t, delivered]);
      const p = Math.floor(rand() ** 2 * products.length);
      products[p] = widen(products[p], t);
    }
    if (rand() < 0.65 && packed < END) out.packages.push([packed, delivered]);
  }
  out.customers = [...customers.filter(Boolean), ...Array.from({ length: 40 }, () => null)];
  out.products = products;
  out.employees = [
    ...Array.from({ length: 18 }, (): [number, number] => [START + rand() * DAY, END - rand() * DAY]),
    null,
    null,
  ];
  return out;
}

/** Bins lifetimes like the engine's population binding: equal bins from the first to the last event. */
function population(lives: Lifetimes, numBins: number): ObjectPopulation {
  const spans = Object.values(lives).flat();
  const min = Math.min(...spans.map((s) => s?.[0] ?? Number.POSITIVE_INFINITY));
  const max = Math.max(...spans.map((s) => s?.[1] ?? Number.NEGATIVE_INFINITY));
  const width = Math.floor((max - min) / numBins) + 1;
  const binOf = (t: number) => Math.min(numBins - 1, Math.floor((t - min) / width));
  const object_types = Object.entries(lives).map(([object_type, objects]): ObjectTypePopulation => {
    const delta = new Array(numBins + 1).fill(0);
    const started = new Array(numBins).fill(0);
    const ended = new Array(numBins).fill(0);
    let withEvents = 0;
    for (const span of objects) {
      if (!span) continue;
      withEvents++;
      const [a, b] = [binOf(span[0]), binOf(span[1])];
      delta[a]++;
      delta[b + 1]--;
      started[a]++;
      ended[b]++;
    }
    let alive = 0;
    return {
      object_type,
      objects: withEvents,
      objects_without_events: objects.length - withEvents,
      alive: delta.slice(0, numBins).map((d) => {
        alive += d;
        return alive;
      }),
      started,
      ended,
    };
  });
  return {
    bin_starts_ms: Array.from({ length: numBins }, (_, i) => min + i * width),
    bin_width_ms: width,
    object_types,
  };
}

const o = (object_type: string, n: number | [number, number, number]): SignatureObjects =>
  typeof n === "number"
    ? { object_type, min: n, max: n, mean: n }
    : { object_type, min: n[0], max: n[1], mean: n[2] };
const sig = (events: number, ...objects: SignatureObjects[]): EventSignature => ({ events, objects });
const only = (event_type: string, ...signatures: EventSignature[]) => ({
  event_type,
  events: signatures.reduce((s, x) => s + x.events, 0),
  signatures,
  other_events: 0,
});

const signatures: EventSignatures = {
  object_types: ["customers", "employees", "items", "orders", "packages", "products"],
  event_types: [
    only("pick item", sig(6_950, o("employees", 1), o("items", 1)), sig(174, o("items", 1))),
    only(
      "place order",
      sig(2_000, o("customers", 1), o("items", [1, 12, 3.6]), o("orders", 1), o("products", [1, 8, 2.9])),
    ),
    only("confirm order", sig(1_981, o("employees", 1), o("orders", 1))),
    only("pay order", sig(1_893, o("orders", 1))),
    only("create package", sig(1_302, o("employees", 1), o("items", [1, 9, 5.1]), o("packages", 1))),
    only("send package", sig(1_296, o("employees", 1), o("packages", 1))),
    only("package delivered", sig(1_183, o("employees", 1), o("packages", 1)), sig(68, o("packages", 1))),
    only("payment reminder", sig(318, o("orders", 1))),
    only("item out of stock", sig(171, o("employees", 1), o("items", 1))),
    only(
      "reorder item",
      sig(162, o("employees", 1), o("items", 1)),
      sig(6, o("employees", 1), o("items", 2)),
    ),
  ],
};

/** An activity at `median` (p25 to p75) after an object's first event, reached by `reach` of them. */
const at = (
  activity: string,
  reach: number,
  [p25, median, p75]: [number, number, number],
  mean_count = 1,
): LifecycleActivity => ({ activity, reach, median_ms: median, p25_ms: p25, p75_ms: p75, mean_count });

const LIFECYCLES: Record<string, [number, number, LifecycleActivity[]]> = {
  orders: [
    9 * DAY,
    19 * DAY,
    [
      at("place order", 1, [0, 0, 0]),
      at("confirm order", 0.99, [1.5 * HOUR, 3 * HOUR, 6 * HOUR]),
      at("pay order", 0.95, [1 * DAY, 2.5 * DAY, 5 * DAY]),
      at("payment reminder", 0.16, [12 * DAY, 14 * DAY, 17 * DAY], 1.2),
    ],
  ],
  items: [
    7 * DAY,
    13 * DAY,
    [
      at("place order", 1, [0, 0, 0]),
      at("pick item", 1, [1 * DAY, 2 * DAY, 3 * DAY]),
      at("item out of stock", 0.024, [0.5 * DAY, 1 * DAY, 2 * DAY]),
      at("create package", 0.98, [3 * DAY, 4 * DAY, 5.5 * DAY]),
      at("package delivered", 0.96, [5.5 * DAY, 7 * DAY, 9 * DAY]),
    ],
  ],
  packages: [
    3 * DAY,
    5 * DAY,
    [
      at("create package", 1, [0, 0, 0]),
      at("send package", 0.99, [4 * HOUR, 9 * HOUR, 20 * HOUR]),
      at("package delivered", 0.96, [2 * DAY, 3 * DAY, 4 * DAY]),
    ],
  ],
  customers: [58 * DAY, 140 * DAY, [at("place order", 1, [0, 30 * DAY, 90 * DAY], 3.6)]],
  products: [178 * DAY, 183 * DAY, [at("place order", 1, [40 * DAY, 90 * DAY, 140 * DAY], 290)]],
  employees: [
    182 * DAY,
    183 * DAY,
    [
      at("confirm order", 0.11, [45 * DAY, 90 * DAY, 135 * DAY], 990),
      at("pick item", 0.33, [45 * DAY, 90 * DAY, 135 * DAY], 1_160),
      at("send package", 0.11, [45 * DAY, 90 * DAY, 135 * DAY], 590),
    ],
  ],
};

const finding = (
  check: string,
  title: string,
  category: string,
  severity: HealthFinding["severity"],
  count: number,
): HealthFinding => ({ check, title, category, description: "", severity, count, examples: [], fixes: [] });

function shopOverview(findings: HealthFinding[]): OcelOverview {
  const pop = population(simulateShop(), 60);
  return {
    population: pop,
    signatures,
    health: {
      num_events: signatures.event_types.reduce((s, e) => s + e.events, 0),
      num_objects: pop.object_types.reduce((s, t) => s + t.objects + t.objects_without_events, 0),
      findings,
    },
    lifecycles: {
      object_types: pop.object_types.map((t) => {
        const [median, p90, activities] = LIFECYCLES[t.object_type];
        return {
          object_type: t.object_type,
          objects: t.objects,
          median_lifetime_ms: median,
          p90_lifetime_ms: p90,
          activities,
        };
      }),
    },
  };
}

const checks = (counts: number[]) =>
  [
    finding(
      "type_mismatch",
      "Values of another type than declared",
      "Incorrect attribute value",
      "warning",
      37,
    ),
    finding("objects_without_events", "Objects without events", "Irrelevant object", "info", 42),
    finding("same_time_events", "Objects with simultaneous events", "Imprecise time", "info", 1_408),
    finding("epoch_timestamps", "Events at 1970-01-01", "Incorrect time", "warning", 0),
    finding("events_without_objects", "Events without objects", "Missing relation", "warning", 0),
    finding("unused_types", "Types without instances", "Irrelevant type", "info", 0),
  ].map((f, i) => ({ ...f, count: counts[i] ?? f.count }));

const shop = shopOverview(checks([]));

/** Opens the detail views through `onOpen`; here the story only shows which one was asked for. */
function WithLinks({ data }: { data: OcelOverview }) {
  const [opened, setOpened] = useState<OcelOverviewTarget | null>(null);
  return (
    <Flex direction="column" style={{ height: "100%" }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <OcelOverviewBoard data={data} onOpen={setOpened} />
      </div>
      <Text size="1" color="gray" style={{ padding: "8px 16px", borderTop: "1px solid var(--gray-a4)" }}>
        {opened ? `Host asked to open: ${opened}` : "Click a link to open a detail view"}
      </Text>
    </Flex>
  );
}

/** Six months of an order-management OCEL at a glance, with links to the detail views. */
export const OrderManagement: StoryObj = {
  render: () => <WithLinks data={shop} />,
};

/** Every health check passed, and without `onOpen` the board shows no links. */
export const AllChecksPassed: StoryObj = {
  render: () => <OcelOverviewBoard data={shopOverview(checks([0, 0, 0]))} />,
};
