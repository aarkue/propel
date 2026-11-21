import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import {
  type EventSignature,
  type EventSignatures,
  EventSignaturesView,
  type EventTypeSignatures,
  type SignatureObjects,
} from "@r4pm/components";

const meta = {
  title: "Viewers/Event Signatures",
  component: EventSignaturesView,
  parameters: { frame: { mode: "canvas", height: 820 } },
} satisfies Meta<typeof EventSignaturesView>;
export default meta;

/** `n` objects of a type per event, or `[min, max, mean]` when it varies. */
const o = (object_type: string, n: number | [number, number, number]): SignatureObjects =>
  typeof n === "number"
    ? { object_type, min: n, max: n, mean: n }
    : { object_type, min: n[0], max: n[1], mean: n[2] };
const sig = (events: number, ...objects: SignatureObjects[]): EventSignature => ({ events, objects });

/** The per-type totals the engine computes over all events, here from the listed signatures. */
const withTotals = (
  et: Omit<EventTypeSignatures, "per_object_type" | "events_with_several">,
): EventTypeSignatures => {
  const acc = new Map<string, { events: number; min: number; max: number; sum: number }>();
  for (const s of et.signatures)
    for (const o of s.objects) {
      const c = acc.get(o.object_type) ?? { events: 0, min: Number.POSITIVE_INFINITY, max: 0, sum: 0 };
      acc.set(o.object_type, {
        events: c.events + s.events,
        min: Math.min(c.min, o.min),
        max: Math.max(c.max, o.max),
        sum: c.sum + o.mean * s.events,
      });
    }
  return {
    ...et,
    events_with_several: et.signatures
      .filter((s) => s.objects.some((o) => o.max > 1))
      .reduce((n, s) => n + s.events, 0),
    per_object_type: [...acc]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([object_type, c]) => ({
        object_type,
        events: c.events,
        min: c.min,
        max: c.max,
        mean: c.sum / c.events,
      })),
  };
};

// An order-management OCEL: orders batch items and products, packages batch items.
const orderManagement: EventSignatures = {
  object_types: ["customers", "employees", "items", "orders", "packages", "products"],
  event_types: [
    {
      event_type: "pick item",
      events: 7_124,
      signatures: [sig(6_950, o("employees", 1), o("items", 1)), sig(174, o("items", 1))],
      other_events: 0,
    },
    {
      event_type: "place order",
      events: 2_000,
      signatures: [
        sig(2_000, o("customers", 1), o("items", [1, 12, 3.6]), o("orders", 1), o("products", [1, 8, 2.9])),
      ],
      other_events: 0,
    },
    {
      event_type: "confirm order",
      events: 1_981,
      signatures: [sig(1_981, o("employees", 1), o("orders", 1))],
      other_events: 0,
    },
    {
      event_type: "pay order",
      events: 1_893,
      signatures: [sig(1_893, o("orders", 1))],
      other_events: 0,
    },
    {
      event_type: "create package",
      events: 1_302,
      signatures: [sig(1_302, o("employees", 1), o("items", [1, 9, 5.1]), o("packages", 1))],
      other_events: 0,
    },
    {
      event_type: "send package",
      events: 1_296,
      signatures: [sig(1_296, o("employees", 1), o("packages", 1))],
      other_events: 0,
    },
    {
      event_type: "package delivered",
      events: 1_251,
      signatures: [sig(1_183, o("employees", 1), o("packages", 1)), sig(68, o("packages", 1))],
      other_events: 0,
    },
    {
      event_type: "payment reminder",
      events: 318,
      signatures: [sig(318, o("orders", 1))],
      other_events: 0,
    },
    {
      event_type: "item out of stock",
      events: 171,
      signatures: [sig(171, o("employees", 1), o("items", 1))],
      other_events: 0,
    },
    {
      event_type: "reorder item",
      events: 168,
      signatures: [sig(162, o("employees", 1), o("items", 1)), sig(6, o("employees", 1), o("items", 2))],
      other_events: 0,
    },
  ].map(withTotals),
};

/** Which objects each event type of an order-management OCEL carries. Click a row for its mixes. */
export const OrderManagement: StoryObj = {
  render: () => <EventSignaturesView data={orderManagement} />,
};

/** A manually maintained event type with many mixes and a long name. Past the eighth mix, events count as rarer mixes. */
export const ManyMixes: StoryObj = {
  render: () => (
    <EventSignaturesView
      data={{
        ...orderManagement,
        event_types: [
          ...orderManagement.event_types.slice(0, 7),
          {
            event_type: "correct order details manually via the customer service portal",
            events: 412,
            signatures: [
              sig(141, o("employees", 1), o("orders", 1)),
              sig(77, o("customers", 1), o("employees", 1), o("orders", 1)),
              sig(52, o("employees", 1), o("items", [1, 4, 1.6]), o("orders", 1)),
              sig(38, o("orders", 1)),
              sig(29, o("employees", 1), o("items", [1, 3, 1.3]), o("orders", 1), o("products", 1)),
              sig(21, o("customers", 1), o("orders", 1)),
              sig(14, o("employees", [1, 2, 1.1]), o("orders", 1), o("packages", 1)),
              sig(9, o("employees", 1), o("orders", [2, 5, 2.8])),
              sig(8),
            ],
            other_events: 23,
          },
          ...orderManagement.event_types.slice(7),
        ].map(withTotals),
      }}
    />
  ),
};

/** An OCEL without events. */
export const Empty: StoryObj = {
  render: () => <EventSignaturesView data={{ event_types: [], object_types: [] }} />,
};
