import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { ProcessTreeWorkbench, type ProcessTree } from "@r4pm/components";

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
    ],
  },
};

const meta = {
  title: "Editors/Process Tree Workbench",
  component: ProcessTreeWorkbench,
  parameters: { frame: { mode: "canvas", height: 460 }, docs: { story: { iframeHeight: 500 } } },
} satisfies Meta<typeof ProcessTreeWorkbench>;
export default meta;

export const Default: StoryObj = {
  name: "View / Edit",
  render: () => <ProcessTreeWorkbench data={tree} />,
};
