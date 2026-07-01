import type { Meta, StoryObj } from "@storybook/react-vite";
// Minimal example: what an external consumer imports.
import "@r4pm/components/styles.css";
import { DottedChart, type DottedChartData } from "@r4pm/components/charts";

// Sample data shaped exactly like the local view-model (compiler-checked).
const sample: DottedChartData = {
  dots_per_color: {
    "place order": { x: [0, 1.5, 2.2, 3.0], y: [0, 0, 1, 2] },
    ship: { x: [1.1, 2.4, 3.3], y: [1, 1, 0] },
    invoice: { x: [0.8, 2.9], y: [2, 2] },
  },
  y_values: ["case-1001", "case-1002", "case-1003"],
};

const meta = {
  title: "Viewers/Dotted Chart",
  component: DottedChart,
  parameters: { frame: { mode: "canvas", height: 460 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof DottedChart>;
export default meta;

export const Default: StoryObj = {
  name: "Dotted Chart",
  render: () => <DottedChart data={sample} />,
};
