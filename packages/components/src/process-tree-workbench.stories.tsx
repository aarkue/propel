import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { ProcessTreeWorkbench, type ProcessTree } from "@r4pm/components";

const tree: ProcessTree = {
  root: {
    Operator: {
      operator_type: "Sequence",
      children: [
        { Leaf: { activity_label: { Activity: "register" } } },
        {
          Operator: {
            operator_type: "ExclusiveChoice",
            children: [
              { Leaf: { activity_label: { Activity: "approve" } } },
              { Leaf: { activity_label: "Tau" } },
            ],
          },
        },
      ],
    },
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
