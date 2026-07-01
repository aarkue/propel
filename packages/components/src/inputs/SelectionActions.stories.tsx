import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import "@r4pm/components/styles.css";
import { SelectionActions } from "@r4pm/components";

const ALL = ["register request", "examine", "decide", "pay", "reject"];

const meta = {
  title: "Inputs & Primitives/Selection Actions",
  component: SelectionActions,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof SelectionActions>;
export default meta;

export const Default: StoryObj = {
  name: "Selection Actions",
  render: () => {
    const [value, setValue] = useState<Set<string>>(new Set(["decide"]));
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <SelectionActions allKeys={ALL} value={value} onChange={setValue} />
        <span style={{ fontSize: 12, color: "var(--gray-10)" }}>
          {value.size} / {ALL.length} selected
        </span>
      </div>
    );
  },
};
