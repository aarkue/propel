import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { useMemo, useState } from "react";
import {
  DEFAULT_PATH_SCHEMA_CONTROLS,
  type DiscoveredPathSchema,
  type Option,
  type PathSchemaControls,
  type PathSchemaResult,
  PathSchemasView,
  pathSchemaTypeKey,
  pathSchemaTypeRef,
} from "@r4pm/components";

const meta = {
  title: "Viewers/Path Schemas",
  component: PathSchemasView,
  parameters: { frame: { mode: "canvas", height: 620 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof PathSchemasView>;
export default meta;

// An order-management OCEL as its type graph: object counts, event counts, and for every relation the
// share of sources that have one and how many targets each has, in both directions.
const OBJECTS: Record<string, number> = {
  orders: 2000,
  items: 7659,
  packages: 1325,
  customers: 15,
  employees: 18,
  products: 20,
};
const EVENTS: Record<string, number> = {
  "place order": 2000,
  "confirm order": 1960,
  "pick item": 7580,
  "item out of stock": 610,
  "create package": 1325,
  "send package": 1310,
  "package delivered": 1285,
  "pay order": 1860,
  "payment reminder": 545,
};
/** Days from placing the order to an event of the type, for the time between path ends. */
const DAYS_IN: Record<string, number> = {
  "place order": 0,
  "confirm order": 0.6,
  "item out of stock": 1.5,
  "pick item": 2.2,
  "create package": 3.1,
  "send package": 3.8,
  "pay order": 4.5,
  "package delivered": 5.9,
  "payment reminder": 12,
};

interface Relation {
  from: string;
  to: string;
  qualifier: string;
  /** Share of `from` sources with a related `to`, and `to` per such source; then the same backwards. */
  forward: [number, number];
  backward: [number, number];
}
const RELATIONS: Relation[] = [
  { from: "customers", to: "orders", qualifier: "places", forward: [1, 133], backward: [1, 1] },
  { from: "orders", to: "items", qualifier: "comprises", forward: [1, 3.8], backward: [1, 1] },
  { from: "packages", to: "items", qualifier: "contains", forward: [1, 5.6], backward: [0.97, 1] },
  { from: "items", to: "products", qualifier: "is a", forward: [1, 1], backward: [1, 383] },
  { from: "place order", to: "orders", qualifier: "order", forward: [1, 1], backward: [1, 1] },
  { from: "place order", to: "customers", qualifier: "customer", forward: [1, 1], backward: [1, 133] },
  { from: "place order", to: "items", qualifier: "item", forward: [1, 3.8], backward: [1, 1] },
  { from: "confirm order", to: "orders", qualifier: "order", forward: [1, 1], backward: [0.98, 1] },
  {
    from: "confirm order",
    to: "employees",
    qualifier: "sales person",
    forward: [1, 1],
    backward: [0.33, 330],
  },
  { from: "pay order", to: "orders", qualifier: "order", forward: [1, 1], backward: [0.93, 1] },
  { from: "payment reminder", to: "orders", qualifier: "order", forward: [1, 1], backward: [0.21, 1.3] },
  { from: "pick item", to: "items", qualifier: "item", forward: [1, 1], backward: [0.99, 1] },
  { from: "pick item", to: "employees", qualifier: "warehouse staff", forward: [1, 1], backward: [0.5, 850] },
  { from: "item out of stock", to: "items", qualifier: "item", forward: [1, 1], backward: [0.08, 1] },
  { from: "create package", to: "packages", qualifier: "package", forward: [1, 1], backward: [1, 1] },
  { from: "create package", to: "items", qualifier: "item", forward: [1, 5.6], backward: [0.98, 1] },
  { from: "send package", to: "packages", qualifier: "package", forward: [1, 1], backward: [0.99, 1] },
  { from: "package delivered", to: "packages", qualifier: "package", forward: [1, 1], backward: [0.97, 1] },
];
const SCHEMA_LIMIT = 150;

const countOf = (t: string) => OBJECTS[t] ?? EVENTS[t] ?? 0;
const jitter = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return 0.85 + ((h >>> 0) % 1000) / 3333;
};

/** Every relation path from `source` (to `target`) without repeating a type, with its metrics. */
function discover(source: string, target: string | null, maxLength: number): PathSchemaResult {
  const total = countOf(source);
  const schemas: DiscoveredPathSchema[] = [];
  const walk = (at: string, text: string, seen: Set<string>, coverage: number, fanout: number) => {
    const length = seen.size - 1;
    if (length > 0 && (target == null || at === target)) {
      const sourcesWithPaths = Math.max(1, Math.round(total * coverage));
      const support = Math.max(sourcesWithPaths, Math.round(sourcesWithPaths * fanout));
      const bothEvents = source in EVENTS && at in EVENTS;
      const medianS = ((DAYS_IN[at] - DAYS_IN[source]) * 86_400 * jitter(text)) | 0;
      schemas.push({
        schema: text,
        length,
        is_dead: false,
        stats: {
          metrics: {
            support,
            coverage,
            selectivity: sourcesWithPaths / support,
            reach: Math.min(1, support / countOf(at)),
            exclusivity: Math.min(1, countOf(at) / support),
            sources_with_paths: sourcesWithPaths,
            total_sources: total,
          },
          throughput: bothEvents
            ? { min: medianS * 0.1, max: medianS * 4, mean: medianS * 1.25, median: medianS }
            : null,
        },
      });
    }
    if (length === maxLength) return;
    for (const r of RELATIONS) {
      const step =
        r.from === at
          ? { next: r.to, label: r.qualifier, rel: r.forward }
          : r.to === at
            ? { next: r.from, label: `<${r.qualifier}`, rel: r.backward }
            : null;
      if (!step || seen.has(step.next)) continue;
      walk(
        step.next,
        `${text} -[${step.label}]-> ${step.next}`,
        new Set([...seen, step.next]),
        coverage * step.rel[0],
        fanout * step.rel[1],
      );
    }
  };
  walk(source, source, new Set([source]), 1, 1);
  return {
    source_type: source,
    total_sources: total,
    schemas: schemas.slice(0, SCHEMA_LIMIT),
    schema_limit_reached: schemas.length > SCHEMA_LIMIT,
  };
}

const typeOptions: Option<string>[] = [
  ...Object.entries(OBJECTS).map(([t, n]) => ({
    value: pathSchemaTypeKey({ Object: t }),
    label: t,
    description: `object type, ${n.toLocaleString("en")} objects`,
  })),
  ...Object.entries(EVENTS).map(([t, n]) => ({
    value: pathSchemaTypeKey({ Event: t }),
    label: t,
    description: `event type, ${n.toLocaleString("en")} events`,
  })),
];
const eventTypes = Object.keys(EVENTS);
const nameOf = (key: string) => {
  const ref = pathSchemaTypeRef(key);
  return "Event" in ref ? ref.Event : ref.Object;
};

function PathSchemasDemo({ initial }: { initial: PathSchemaControls }) {
  const [controls, setControls] = useState(initial);
  const source = controls.source ?? typeOptions[0].value;
  const data = useMemo(
    () => discover(nameOf(source), controls.target ? nameOf(controls.target) : null, controls.maxLength),
    [source, controls.target, controls.maxLength],
  );
  return (
    <PathSchemasView
      data={data}
      typeOptions={typeOptions}
      eventTypes={eventTypes}
      controls={{ ...controls, source }}
      onControlsChange={setControls}
    />
  );
}

/** Every path from an order up to three steps, ranked by coverage. Change the menus to rediscover. */
export const Default: StoryObj = {
  name: "From an object type",
  render: () => <PathSchemasDemo initial={{ ...DEFAULT_PATH_SCHEMA_CONTROLS, source: "o:orders" }} />,
};

/** Paths between two event types also show the median time between their events. */
export const FromEventType: StoryObj = {
  name: "From an event type",
  render: () => <PathSchemasDemo initial={{ source: "e:place order", target: null, maxLength: 3 }} />,
};

/** Only the paths that end at one target type: how an item reaches its package. */
export const ToTarget: StoryObj = {
  name: "To one target type",
  render: () => <PathSchemasDemo initial={{ source: "o:items", target: "o:packages", maxLength: 4 }} />,
};

/** Long paths from a hub type hit the schema limit, which the toolbar points out. */
export const LimitReached: StoryObj = {
  name: "Schema limit reached",
  render: () => <PathSchemasDemo initial={{ source: "o:items", target: null, maxLength: 5 }} />,
};

/** No path connects the two types within the length. */
export const NoPaths: StoryObj = {
  name: "No connecting paths",
  render: () => (
    <PathSchemasDemo initial={{ source: "o:products", target: "e:payment reminder", maxLength: 2 }} />
  ),
};

/** Without `onControlsChange` the menus are read-only. */
export const ReadOnly: StoryObj = {
  name: "Read-only",
  render: () => (
    <PathSchemasView
      data={discover("packages", null, 2)}
      typeOptions={typeOptions}
      eventTypes={eventTypes}
      controls={{ source: "o:packages", target: null, maxLength: 2 }}
    />
  ),
};
