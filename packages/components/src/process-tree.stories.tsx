import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { ProcessTreeViewer, type ProcessTree } from "@r4pm/components";

const leaf = (name: string | null): ProcessTree["root"] => ({
  Leaf: { activity_label: name == null ? "Tau" : { Activity: name } },
});

// ->( register, X( approve, tau ), +( ship, bill ) )
const tree: ProcessTree = {
  root: {
    Operator: {
      operator_type: "Sequence",
      children: [
        leaf("register"),
        { Operator: { operator_type: "ExclusiveChoice", children: [leaf("approve"), leaf(null)] } },
        { Operator: { operator_type: "Concurrency", children: [leaf("ship"), leaf("bill")] } },
      ],
    },
  },
};

// One of each of rust4pm's six operators.
const everyOperator: ProcessTree = {
  root: {
    Operator: {
      operator_type: "Sequence",
      children: [
        leaf("register order"),
        {
          Operator: {
            operator_type: "Loop",
            children: [
              {
                Operator: {
                  operator_type: "Concurrency",
                  children: [leaf("check stock"), leaf("check credit")],
                },
              },
              leaf(null),
            ],
          },
        },
        { Operator: { operator_type: "ExclusiveChoice", children: [leaf("approve"), leaf("reject")] } },
        {
          Operator: {
            operator_type: "Interleaving",
            children: [leaf("pack"), leaf("send invoice to the customer")],
          },
        },
        {
          Operator: {
            operator_type: "InclusiveChoice",
            children: [leaf("notify by mail"), leaf("notify by sms")],
          },
        },
      ],
    },
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
          ? { style: { borderColor: "#2563eb", backgroundColor: "#eff6ff", color: "#2563eb" } }
          : undefined
      }
    />
  ),
};

export const EveryOperator: StoryObj = {
  name: "Every operator",
  render: () => <ProcessTreeViewer data={everyOperator} />,
};
