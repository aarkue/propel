import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { Editor, type ProcessTree } from "@r4pm/components/process-tree";
import { useState } from "react";

const seed: ProcessTree = {
  root: {
    type: "Operator",
    operator_type: "Sequence",
    children: [
      { type: "Leaf", activity_label: { type: "Activity", value: "register" } },
      {
        type: "Operator",
        operator_type: "Loop",
        children: [
          { type: "Leaf", activity_label: { type: "Activity", value: "review" } },
          { type: "Leaf", activity_label: { type: "Tau" } },
        ],
      },
    ],
  },
};

const meta = {
  title: "Editors/Process Tree Editor",
  component: Editor,
  parameters: { frame: { mode: "canvas", height: 460 }, docs: { story: { iframeHeight: 500 } } },
} satisfies Meta<typeof Editor>;
export default meta;

/** Select a node to reveal its structural controls. */
export const Default: StoryObj = {
  name: "Process Tree Editor",
  render: () => {
    const [tree, setTree] = useState(seed);
    return <Editor tree={tree} editable onChange={setTree} />;
  },
};

/** A Loop with one child and a childless operator are representable, so they are badged, not blocked. */
export const Invalid: StoryObj = {
  name: "Invalid nodes are badged",
  render: () => {
    const [tree, setTree] = useState<ProcessTree>({
      root: {
        type: "Operator",
        operator_type: "Sequence",
        children: [
          {
            type: "Operator",
            operator_type: "Loop",
            children: [{ type: "Leaf", activity_label: { type: "Activity", value: "only child" } }],
          },
          { type: "Operator", operator_type: "Concurrency", children: [] },
        ],
      },
    });
    return <Editor tree={tree} editable onChange={setTree} />;
  },
};
