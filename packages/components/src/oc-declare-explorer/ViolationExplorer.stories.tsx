import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { useState } from "react";
import {
  type ArcViolation,
  type ArcViolations,
  type EdgeDurations,
  type OCDeclareArc,
  type ObjectLane,
  ViolationExplorer,
} from "@r4pm/components";
import { Flex, Text } from "@r4pm/components/ui";

const meta = {
  title: "Viewers/OC-DECLARE/Violation Explorer",
  component: ViolationExplorer,
  parameters: { frame: { mode: "canvas", height: 760 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof ViolationExplorer>;
export default meta;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const START = Date.UTC(2023, 2, 6, 0, 0);

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Each order must be paid exactly once after it is placed. */
const paidOnce: OCDeclareArc = {
  arc_type: "EF",
  counts: [1, 1],
  from: "place order",
  to: "pay order",
  label: { each: [{ type: "Simple", object_type: "orders" }], any: [], all: [] },
};

const CUSTOMERS = ["c-1042", "c-1077", "c-1103", "c-1150", "c-1188", "c-1231", "c-1266", "c-1302"];

interface Order {
  source: string;
  order: string;
  customer: string;
  items: string[];
  placed: number;
  confirmed: number;
  payments: number[];
  reminder: number | null;
}

/** Twelve weeks of orders; unpaid orders get more frequent towards the end. */
function simulate(n: number, seed: number): Order[] {
  const rnd = mulberry32(seed);
  let itemNo = 880001;
  return Array.from({ length: n }, (_, k) => {
    const placed = START + k * 4.8 * HOUR + rnd() * 3 * HOUR;
    const roll = rnd();
    const unpaid = roll < 0.03 + 0.09 * (k / n);
    const twice = !unpaid && roll > 0.985;
    const paid = placed + Math.exp(Math.log(4 * DAY) + 0.6 * (rnd() + rnd() + rnd() - 1.5));
    const payments = unpaid ? [] : twice ? [paid, paid + (1 + rnd() * 2) * DAY] : [paid];
    return {
      source: `e-${String(10001 + k)}`,
      order: `o-${990001 + k}`,
      customer: CUSTOMERS[Math.floor(rnd() ** 1.6 * CUSTOMERS.length)],
      items: Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => `i-${itemNo++}`),
      placed,
      confirmed: placed + (2 + rnd() * 20) * HOUR,
      payments,
      reminder: unpaid || paid - placed > 8 * DAY ? placed + 7 * DAY : null,
    };
  });
}

const ORDERS = simulate(420, 3);

/** Source and violating events per week. */
function weekly(sources: number[], violating: number[]): ArcViolations["over_time"] {
  const bins = new Map<number, { sources: number; violations: number }>();
  const bin = (t: number) => {
    const start = START + Math.floor((t - START) / WEEK) * WEEK;
    const b = bins.get(start) ?? { sources: 0, violations: 0 };
    bins.set(start, b);
    return b;
  };
  for (const t of sources) bin(t).sources++;
  for (const t of violating) bin(t).violations++;
  return [...bins].sort((a, b) => a[0] - b[0]).map(([start_ms, b]) => ({ start_ms, ...b }));
}

/** What `oc_declare_violations` returns for {@link paidOnce} on {@link ORDERS}. */
function violations(orders: Order[]): ArcViolations {
  const examples: ArcViolation[] = [];
  const bins = new Map<number, { sources: number; violations: number }>();
  const found = new Map<number, number>();
  const perCustomer = new Map<string, number>();
  const instead = new Map<string, number>();
  for (const o of orders) {
    const n = o.payments.length;
    found.set(n, (found.get(n) ?? 0) + 1);
    const bin = START + Math.floor((o.placed - START) / WEEK) * WEEK;
    const b = bins.get(bin) ?? { sources: 0, violations: 0 };
    b.sources++;
    if (n !== 1) {
      b.violations++;
      const next = n === 0 ? (o.reminder != null ? "payment reminder" : "confirm order") : null;
      if (next) instead.set(next, (instead.get(next) ?? 0) + 1);
      perCustomer.set(o.customer, (perCustomer.get(o.customer) ?? 0) + 1);
      examples.push({
        source: o.source,
        time_ms: o.placed,
        kind: n === 0 ? "too_few" : "too_many",
        found: n,
        objects: [
          ["orders", o.order],
          ["customers", o.customer],
          ...o.items.map((i): [string, string] => ["items", i]),
        ],
        instead: next,
      });
    }
    bins.set(bin, b);
  }
  const tooFew = examples.filter((v) => v.kind === "too_few").length;
  const withItems = examples.filter((v) => v.objects.some(([t]) => t === "items")).length;
  return {
    sources: orders.length,
    violating_sources: examples.length,
    too_few: tooFew,
    too_many: examples.length - tooFew,
    bindings: orders.length,
    violating_bindings: examples.length,
    found_histogram: [...found]
      .sort((a, b) => a[0] - b[0])
      .map(([n, bindings]) => ({ found: n, bindings, violating: n !== 1 })),
    over_time: [...bins].map(([start_ms, b]) => ({ start_ms, ...b })),
    bin_width_ms: WEEK,
    instead: [...instead]
      .map(([name, v]) => ({ name, violations: v }))
      .sort((a, b) => b.violations - a.violations),
    by_object_type: [
      { name: "orders", violations: examples.length },
      { name: "customers", violations: examples.length },
      { name: "items", violations: withItems },
    ],
    top_objects: [
      ...[...perCustomer]
        .sort((a, b) => b[1] - a[1])
        .map(([id, v]) => ({ object_type: "customers", id, violations: v })),
      ...examples.slice(0, 6).map((v) => ({ object_type: "orders", id: v.objects[0][1], violations: 1 })),
    ],
    examples,
  };
}

/** Time from placing an order to its first payment, in 20 bins. */
function edgeDurations(orders: Order[]): EdgeDurations {
  const ds = orders.filter((o) => o.payments.length).map((o) => o.payments[0] - o.placed);
  const lo = Math.min(...ds);
  const hi = Math.max(...ds);
  const width = (hi - lo) / 20;
  const counts = Array.from({ length: 20 }, () => 0);
  for (const d of ds) counts[Math.min(19, Math.floor((d - lo) / width))]++;
  const centers = counts.map((_, i) => lo + (i + 0.5) * width);
  return {
    bin_centers_ms: centers,
    percentages: counts.map((c) => (100 * c) / ds.length),
    bin_labels: centers.map((c) => `${(c / DAY).toFixed(1)}d`),
    min_ms: lo,
    max_ms: hi,
    total_count: ds.length,
  };
}

/** The events of the given objects, as `oc_declare_object_lanes` returns them. */
function loadLanes(ids: string[]): Promise<ObjectLane[]> {
  const lanes = ids.flatMap((id): ObjectLane[] => {
    if (id.startsWith("c-")) {
      const mine = ORDERS.filter((o) => o.customer === id);
      return [
        {
          object_type: "customers",
          id,
          events: mine.map((o) => ({ id: o.source, activity: "place order", time_ms: o.placed })),
        },
      ];
    }
    const o = ORDERS.find((x) => x.order === id || x.items.includes(id));
    if (!o) return [];
    if (id.startsWith("o-")) {
      const events = [
        { id: o.source, activity: "place order", time_ms: o.placed },
        { id: `${o.source}-c`, activity: "confirm order", time_ms: o.confirmed },
        ...o.payments.map((t, i) => ({ id: `${o.source}-p${i}`, activity: "pay order", time_ms: t })),
        ...(o.reminder != null
          ? [{ id: `${o.source}-r`, activity: "payment reminder", time_ms: o.reminder }]
          : []),
      ];
      return [{ object_type: "orders", id, events: events.sort((a, b) => a.time_ms - b.time_ms) }];
    }
    const picked = o.placed + 1.6 * DAY;
    return [
      {
        object_type: "items",
        id,
        events: [
          { id: o.source, activity: "place order", time_ms: o.placed },
          { id: `${id}-pick`, activity: "pick item", time_ms: picked },
          { id: `${id}-pack`, activity: "create package", time_ms: picked + 0.6 * DAY },
          { id: `${id}-send`, activity: "send package", time_ms: picked + 1.1 * DAY },
          { id: `${id}-done`, activity: "package delivered", time_ms: picked + 3 * DAY },
        ],
      },
    ];
  });
  return new Promise((resolve) => setTimeout(() => resolve(lanes), 300));
}

const DATA = violations(ORDERS);
const EDGES = edgeDurations(ORDERS);

function ExplorerDemo() {
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <Flex direction="column" style={{ height: "100%" }}>
      {opened && (
        <Text size="1" color="gray" style={{ padding: "6px 12px", borderBottom: "1px solid var(--gray-a4)" }}>
          onOpenObject: {opened}
        </Text>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ViolationExplorer
          data={DATA}
          arc={paidOnce}
          edgeStats={EDGES}
          loadLanes={loadLanes}
          onOpenObject={(type, id) => setOpened(`${type} ${id}`)}
        />
      </div>
    </Flex>
  );
}

/** Orders that are never paid or paid twice. Click a violation to load its objects' timeline. */
export const Default: StoryObj = {
  name: "Paid exactly once",
  render: () => <ExplorerDemo />,
};

/** Without `loadLanes`, `edgeStats` and `onOpenObject`: statistics and the violation list only. */
export const WithoutTimeline: StoryObj = {
  name: "Statistics only",
  render: () => <ViolationExplorer data={DATA} arc={paidOnce} />,
};

/** A constraint that looks back in time: every payment needs a confirmation before it. */
export const LookingBack: StoryObj = {
  name: "Looking back (EP)",
  render: () => {
    const arc: OCDeclareArc = {
      arc_type: "EP",
      counts: [1, null],
      from: "pay order",
      to: "confirm order",
      label: { each: [{ type: "Simple", object_type: "orders" }], any: [], all: [] },
    };
    const paid = ORDERS.filter((o) => o.payments.length);
    const unconfirmed = new Set(paid.filter((_, i) => i % 53 === 7).map((o) => o.order));
    const examples: ArcViolation[] = paid
      .filter((o) => unconfirmed.has(o.order))
      .map((o) => ({
        source: `${o.source}-p0`,
        time_ms: o.payments[0],
        kind: "too_few",
        found: 0,
        objects: [["orders", o.order]],
        instead: "place order",
      }));
    const data: ArcViolations = {
      ...DATA,
      sources: paid.length,
      violating_sources: examples.length,
      too_few: examples.length,
      too_many: 0,
      bindings: paid.length,
      violating_bindings: examples.length,
      found_histogram: [
        { found: 0, bindings: examples.length, violating: true },
        { found: 1, bindings: paid.length - examples.length - 31, violating: false },
        { found: 2, bindings: 31, violating: false },
      ],
      over_time: weekly(
        paid.map((o) => o.payments[0]),
        examples.map((v) => v.time_ms),
      ),
      instead: [{ name: "place order", violations: examples.length }],
      by_object_type: [{ name: "orders", violations: examples.length }],
      top_objects: examples.map((v) => ({ object_type: "orders", id: v.objects[0][1], violations: 1 })),
      examples,
    };
    const edges: EdgeDurations = {
      ...EDGES,
      bin_centers_ms: EDGES.bin_centers_ms.map((c) => -c).reverse(),
      percentages: [...EDGES.percentages].reverse(),
      bin_labels: [...EDGES.bin_labels].reverse().map((l) => `-${l}`),
      min_ms: -EDGES.max_ms,
      max_ms: -EDGES.min_ms,
    };
    const lanesWithoutConfirmation = (ids: string[]) =>
      loadLanes(ids).then((lanes) =>
        lanes.map((l) =>
          unconfirmed.has(l.id)
            ? { ...l, events: l.events.filter((e) => e.activity !== "confirm order") }
            : l,
        ),
      );
    return <ViolationExplorer data={data} arc={arc} edgeStats={edges} loadLanes={lanesWithoutConfirmation} />;
  },
};

/** A constraint every source event satisfies. */
export const NoViolations: StoryObj = {
  name: "No violations",
  render: () => {
    const paid = ORDERS.filter((o) => o.payments.length === 1);
    return (
      <ViolationExplorer
        arc={paidOnce}
        data={{
          ...DATA,
          sources: paid.length,
          violating_sources: 0,
          too_few: 0,
          too_many: 0,
          bindings: paid.length,
          violating_bindings: 0,
          found_histogram: [{ found: 1, bindings: paid.length, violating: false }],
          instead: [],
          by_object_type: [],
          top_objects: [],
          examples: [],
        }}
      />
    );
  },
};
