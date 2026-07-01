import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { ObjectAttributeChangesChart } from "@r4pm/components/charts";
import type { ObjectAttributeChanges } from "@r4pm/components/charts";

const sample: ObjectAttributeChanges = {
  traces: {
    price: [
      { time: "2024-01-01T00:00:00Z", value: 100 },
      { time: "2024-01-03T00:00:00Z", value: 120 },
      { time: "2024-01-06T00:00:00Z", value: 90 },
    ],
    status: [
      { time: "2024-01-01T00:00:00Z", value: "ordered" },
      { time: "2024-01-04T00:00:00Z", value: "shipped" },
      { time: "2024-01-06T00:00:00Z", value: "delivered" },
    ],
  },
};

const meta = {
  title: "Viewers/Object Attribute Changes",
  component: ObjectAttributeChangesChart,
  parameters: { frame: { mode: "canvas", height: 380 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof ObjectAttributeChangesChart>;
export default meta;

export const Default: StoryObj = {
  name: "Attributes over time",
  render: () => <ObjectAttributeChangesChart data={sample} objectID="order-1001" />,
};
