import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { type ObjectPopulation, ObjectPopulationView, type ObjectTypePopulation } from "@r4pm/components";

const meta = {
  title: "Viewers/Object Population",
  component: ObjectPopulationView,
  parameters: { frame: { mode: "canvas", height: 640 } },
} satisfies Meta<typeof ObjectPopulationView>;
export default meta;

const DAY = 86_400_000;
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

const shop = population(simulateShop(), 60);

/** Six months of an order-management OCEL in 60 bins. The menus switch the measure and the scale. */
export const OrderManagement: StoryObj = {
  render: () => <ObjectPopulationView data={shop} />,
};

/** Coarse bins: the same data in 12 periods of about two weeks. */
export const CoarseBins: StoryObj = {
  render: () => <ObjectPopulationView data={population(simulateShop(), 12)} />,
};

/** Long object type names truncate next to their curve. */
export const LongTypeNames: StoryObj = {
  render: () => (
    <ObjectPopulationView
      data={{
        ...shop,
        object_types: shop.object_types.slice(0, 3).map((t, i) => ({
          ...t,
          object_type: [
            "customer orders placed through the partner marketplace",
            "order line items awaiting warehouse allocation",
            "outbound shipping packages (parcel service)",
          ][i],
        })),
      }}
    />
  ),
};

/** No object has an event, so there is nothing to plot. */
export const Empty: StoryObj = {
  render: () => <ObjectPopulationView data={{ bin_starts_ms: [], bin_width_ms: 1, object_types: [] }} />,
};
