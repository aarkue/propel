import type { Meta, StoryObj } from "@storybook/react-vite";
// Minimal example: what an external consumer imports.
import "@r4pm/components/styles.css";
import { EventsPerTimeChart } from "@r4pm/components/charts";
import type { AggregatedEventTimestamps } from "@r4pm/components/charts";

const t0 = Date.UTC(2024, 0, 1);
const DAY = 24 * 60 * 60 * 1000;

// Sample data shaped exactly like the binding's return type (compiler-checked).
const sample: AggregatedEventTimestamps = {
  activities: ["place order", "ship", "invoice"],
  events_per_timestamp: {
    [t0]: { "place order": 12, ship: 3, invoice: 5 },
    [t0 + DAY]: { "place order": 9, ship: 7, invoice: 8 },
    [t0 + 2 * DAY]: { "place order": 4, ship: 11, invoice: 6 },
    [t0 + 3 * DAY]: { "place order": 2, ship: 9, invoice: 10 },
  },
};

const meta = {
  title: "Viewers/Events per Time",
  component: EventsPerTimeChart,
  parameters: { frame: { mode: "canvas", height: 360 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof EventsPerTimeChart>;
export default meta;

export const Default: StoryObj = {
  name: "Events per Time",
  render: () => <EventsPerTimeChart data={sample} />,
};
