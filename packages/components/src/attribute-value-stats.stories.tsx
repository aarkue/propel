import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { useState } from "react";
import {
  AttributeValueStats,
  type AttributeValueSelection,
  type OcelAttributeStats,
} from "./attribute-value-stats";

const integerStat: OcelAttributeStats = {
  kind: "Integer",
  min: 0,
  max: 20,
  mean: 7.4,
  count: 4200,
  null_count: 130,
  hist_bin_edges: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  hist_counts: [820, 640, 510, 470, 390, 300, 260, 210, 180, 120],
};

const floatStat: OcelAttributeStats = {
  kind: "Float",
  min: 0.5,
  max: 9.5,
  mean: 3.8,
  count: 3100,
  null_count: 40,
  hist_bin_edges: [0.5, 1.4, 2.3, 3.2, 4.1, 5.0, 5.9, 6.8, 7.7, 8.6, 9.5],
  hist_counts: [210, 480, 620, 540, 430, 320, 260, 190, 140, 90],
};

const stringStat: OcelAttributeStats = {
  kind: "Str",
  distinct: 12,
  count: 5000,
  null_count: 60,
  top_values: [
    { value: "germany", count: 2100 },
    { value: "france", count: 1400 },
    { value: "spain", count: 900 },
    { value: "italy", count: 600 },
  ],
};

const meta = {
  title: "Viewers/Attribute Value Stats",
  component: AttributeValueStats,
  parameters: { docs: { story: { iframeHeight: 420, inline: false } } },
} satisfies Meta<typeof AttributeValueStats>;
export default meta;

function Interactive({ stat, initial }: { stat: OcelAttributeStats; initial?: AttributeValueSelection }) {
  const [sel, setSel] = useState<AttributeValueSelection | undefined>(initial);
  return (
    <div style={{ padding: 16, maxWidth: 680 }}>
      <AttributeValueStats stat={stat} value={sel} onChange={setSel} />
      <pre style={{ marginTop: 12, fontSize: 11, opacity: 0.7 }}>{JSON.stringify(sel) ?? "no selection"}</pre>
    </div>
  );
}

export const Integer: StoryObj = {
  name: "Integer (slider + histogram brush)",
  render: () => <Interactive stat={integerStat} />,
};

export const IntegerSelected: StoryObj = {
  name: "Integer with a selection",
  render: () => <Interactive stat={integerStat} initial={{ type: "Integer", min: 4, max: 12 }} />,
};

export const Float: StoryObj = {
  name: "Float (bin-snapped slider)",
  render: () => <Interactive stat={floatStat} />,
};

export const Str: StoryObj = {
  name: "String (frequency picker)",
  render: () => <Interactive stat={stringStat} />,
};

export const ReadOnly: StoryObj = {
  name: "Read-only (no onChange)",
  render: () => (
    <div style={{ padding: 16, maxWidth: 680 }}>
      <AttributeValueStats stat={integerStat} />
    </div>
  ),
};
