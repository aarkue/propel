import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { OCDeclareViewer } from "@r4pm/components";
import type { OCDeclareArc } from "@r4pm/components";

// A few object-centric DECLARE constraints (temporal arcs between activities).
const sample: OCDeclareArc[] = [
  {
    arc_type: "EF",
    counts: [1, null],
    from: "place order",
    to: "ship",
    label: {
      all: [{ type: "Simple", object_type: "item" }],
      any: [],
      each: [{ type: "Simple", object_type: "order" }],
    },
  },
  {
    arc_type: "DF",
    counts: [1, 1],
    from: "ship",
    to: "invoice",
    label: {
      all: [{ type: "Simple", object_type: "item" }],
      any: [{ type: "Simple", object_type: "worker" }],
      each: [{ type: "Simple", object_type: "order" }],
    },
  },
  {
    arc_type: "EP",
    counts: [0, 1],
    from: "invoice",
    to: "pay",
    label: {
      all: [{ type: "Simple", object_type: "item" }],
      any: [],
      each: [{ type: "Simple", object_type: "order" }],
    },
  },
];

const meta = {
  title: "Viewers/OC-DECLARE",
  component: OCDeclareViewer,
  parameters: { frame: { mode: "canvas", height: 420 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof OCDeclareViewer>;
export default meta;

export const Default: StoryObj = {
  name: "Behavioral constraints",
  render: () => <OCDeclareViewer data={sample} />,
};
