import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { type LifecycleActivity, type LifecycleMap, LifecycleMapView } from "@r4pm/components";

const meta = {
  title: "Viewers/Lifecycle Map",
  component: LifecycleMapView,
  parameters: { frame: { mode: "canvas", height: 640 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof LifecycleMapView>;
export default meta;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** One activity: share of objects reaching it, median and middle half of the time to it, events per object. */
const act = (
  activity: string,
  reach: number,
  medianMs: number,
  [p25Ms, p75Ms]: [number, number],
  meanCount = 1,
): LifecycleActivity => ({
  activity,
  reach,
  median_ms: medianMs,
  p25_ms: p25Ms,
  p75_ms: p75Ms,
  mean_count: meanCount,
});

const orderManagement: LifecycleMap = {
  object_types: [
    {
      object_type: "orders",
      objects: 2000,
      median_lifetime_ms: 9 * DAY,
      p90_lifetime_ms: 24 * DAY,
      activities: [
        act("place order", 1, 0, [0, 0]),
        act("confirm order", 0.98, 14 * HOUR, [6 * HOUR, 30 * HOUR]),
        act("pay order", 0.93, 4.5 * DAY, [2 * DAY, 8 * DAY]),
        act("payment reminder", 0.21, 12 * DAY, [9 * DAY, 17 * DAY], 1.3),
      ],
    },
    {
      object_type: "items",
      objects: 7659,
      median_lifetime_ms: 6 * DAY,
      p90_lifetime_ms: 15 * DAY,
      activities: [
        act("place order", 1, 0, [0, 0]),
        act("item out of stock", 0.08, 1.5 * DAY, [20 * HOUR, 2.5 * DAY]),
        act("reorder item", 0.08, 2 * DAY, [1.2 * DAY, 3 * DAY]),
        act("pick item", 0.99, 2.2 * DAY, [1.1 * DAY, 3.6 * DAY]),
        act("create package", 0.98, 3.1 * DAY, [2 * DAY, 4.8 * DAY]),
        act("send package", 0.97, 3.8 * DAY, [2.6 * DAY, 5.5 * DAY]),
        act("package delivered", 0.95, 5.9 * DAY, [4.4 * DAY, 8 * DAY]),
      ],
    },
    {
      object_type: "packages",
      objects: 1325,
      median_lifetime_ms: 2.6 * DAY,
      p90_lifetime_ms: 5 * DAY,
      activities: [
        act("create package", 1, 0, [0, 0]),
        act("send package", 0.99, 16 * HOUR, [7 * HOUR, 1.4 * DAY]),
        act("package delivered", 0.97, 2.5 * DAY, [1.8 * DAY, 3.4 * DAY]),
      ],
    },
    {
      object_type: "customers",
      objects: 15,
      median_lifetime_ms: 128 * DAY,
      p90_lifetime_ms: 140 * DAY,
      activities: [
        act("place order", 1, 58 * DAY, [26 * DAY, 96 * DAY], 133),
        act("confirm order", 1, 59 * DAY, [27 * DAY, 97 * DAY], 130),
        act("pay order", 1, 63 * DAY, [31 * DAY, 101 * DAY], 124),
        act("payment reminder", 0.87, 70 * DAY, [40 * DAY, 108 * DAY], 28),
      ],
    },
    {
      object_type: "employees",
      objects: 18,
      median_lifetime_ms: 135 * DAY,
      p90_lifetime_ms: 141 * DAY,
      activities: [
        act("confirm order", 0.33, 66 * DAY, [32 * DAY, 101 * DAY], 330),
        act("pick item", 0.5, 67 * DAY, [33 * DAY, 102 * DAY], 850),
        act("create package", 0.33, 68 * DAY, [34 * DAY, 103 * DAY], 220),
        act("send package", 0.33, 69 * DAY, [35 * DAY, 104 * DAY], 220),
      ],
    },
    {
      object_type: "products",
      objects: 20,
      median_lifetime_ms: 139 * DAY,
      p90_lifetime_ms: 142 * DAY,
      activities: [
        act("place order", 1, 70 * DAY, [35 * DAY, 105 * DAY], 383),
        act("item out of stock", 0.6, 74 * DAY, [41 * DAY, 109 * DAY], 31),
        act("reorder item", 0.6, 76 * DAY, [43 * DAY, 111 * DAY], 31),
      ],
    },
  ],
};

/** Order management: short-lived orders, items and packages next to long-lived customers, employees and products. */
export const Default: StoryObj = {
  name: "Order management",
  render: () => <LifecycleMapView data={orderManagement} />,
};

/** A single object type: the delivery steps of a package. */
export const OneType: StoryObj = {
  name: "One object type",
  render: () => <LifecycleMapView data={{ object_types: orderManagement.object_types.slice(2, 3) }} />,
};

/** Activities with long names close together: labels take free lanes, the rest show on hover. */
export const LongActivityNames: StoryObj = {
  name: "Long activity names",
  render: () => (
    <LifecycleMapView
      data={{
        object_types: [
          {
            object_type: "purchase requisitions awaiting central procurement approval",
            objects: 412,
            median_lifetime_ms: 11 * DAY,
            p90_lifetime_ms: 30 * DAY,
            activities: [
              act("create purchase requisition item", 1, 0, [0, 0]),
              act("record goods receipt for requisition", 0.71, 6 * DAY, [4 * DAY, 9 * DAY]),
              act("change approval for purchase order", 0.34, 6.5 * DAY, [5 * DAY, 8 * DAY], 1.8),
              act("record invoice receipt from vendor", 0.68, 7 * DAY, [5 * DAY, 10 * DAY]),
              act("clear invoice and archive requisition", 0.66, 10.5 * DAY, [8 * DAY, 15 * DAY]),
            ],
          },
        ],
      }}
    />
  ),
};

/** An OCEL whose objects have no events. */
export const Empty: StoryObj = {
  name: "No objects with events",
  render: () => <LifecycleMapView data={{ object_types: [] }} />,
};
