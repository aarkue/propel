import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { ProcessTreeViewer, type ProcessTree } from "@r4pm/components";

// ->( register, X( approve, tau ), +( ship, bill ) )
const tree: ProcessTree = {
  root: {
    type: "Operator",
    operator_type: "Sequence",
    children: [
      { type: "Leaf", activity_label: { type: "Activity", value: "register" } },
      {
        type: "Operator",
        operator_type: "ExclusiveChoice",
        children: [
          { type: "Leaf", activity_label: { type: "Activity", value: "approve" } },
          { type: "Leaf", activity_label: { type: "Tau" } },
        ],
      },
      {
        type: "Operator",
        operator_type: "Concurrency",
        children: [
          { type: "Leaf", activity_label: { type: "Activity", value: "ship" } },
          { type: "Leaf", activity_label: { type: "Activity", value: "bill" } },
        ],
      },
    ],
  },
};

const meta = {
  title: "Viewers/Process Tree",
  component: ProcessTreeViewer,
  parameters: { frame: { mode: "canvas", height: 460 }, docs: { story: { iframeHeight: 500 } } },
} satisfies Meta<typeof ProcessTreeViewer>;
export default meta;

export const Default: StoryObj = {
  name: "Process Tree",
  render: () => <ProcessTreeViewer data={tree} />,
};

export const Overlay: StoryObj = {
  name: "With a node overlay",
  render: () => (
    <ProcessTreeViewer
      data={tree}
      nodeOverlay={(_id, data) =>
        "activity_label" in data && data.activity_label.type === "Activity"
          ? { style: { borderColor: "#2563eb", color: "#2563eb" } }
          : undefined
      }
    />
  ),
};
