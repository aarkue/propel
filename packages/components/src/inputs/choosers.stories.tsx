import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "@r4pm/components/ui";
import { ViewerConfigProvider } from "@r4pm/components";
import { useState } from "react";
import { ActivityChooser, DatasetSelector } from "@r4pm/components";

const PALETTE = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#9333ea"];
const demoColorOf = (_scope: string, key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

const meta = {
  title: "Inputs & Primitives/Choosers",
  component: ActivityChooser,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof ActivityChooser>;
export default meta;

export const Activities: StoryObj = {
  name: "Activity Chooser",
  render: () => {
    const [value, setValue] = useState<Set<string>>(new Set());
    return (
      <ViewerConfigProvider value={{ colorOf: demoColorOf }}>
        <div style={{ width: 360, padding: 24 }}>
          <Card>
            <ActivityChooser
              counts={{ review: 312, decide: 740, register: 96, approve: 540, reject: 180 }}
              value={value}
              onChange={setValue}
            />
          </Card>
        </div>
      </ViewerConfigProvider>
    );
  },
};

export const Dataset: StoryObj = {
  name: "Dataset Selector",
  render: () => {
    const [value, setValue] = useState<string | null>(null);
    return (
      <div style={{ width: 300, padding: 16 }}>
        <DatasetSelector
          datasets={[
            { id: "a", label: "Road Traffic", kind: "EventLog" },
            { id: "b", label: "Order Mgmt", kind: "SlimLinkedOCEL" },
          ]}
          value={value}
          onChange={setValue}
          accept={["EventLog"]}
          onImport={() => {
            alert("import data");
            return undefined;
          }}
        />
      </div>
    );
  },
};

const SAMPLE_DATASETS = [
  { id: "a", label: "Road Traffic", kind: "EventLog" },
  { id: "b", label: "Order Mgmt", kind: "SlimLinkedOCEL" },
  { id: "c", label: "Hospital Billing", kind: "EventLog" },
  { id: "d", label: "Procure-to-Pay", kind: "SlimLinkedOCEL" },
];

export const DatasetMultiType: StoryObj = {
  name: "Dataset Selector (multiple accepted types)",
  render: () => {
    const [value, setValue] = useState<string | null>(null);
    return (
      <div style={{ width: 320, padding: 16 }}>
        <DatasetSelector
          datasets={SAMPLE_DATASETS}
          value={value}
          onChange={setValue}
          accept={["EventLog", "SlimLinkedOCEL"]}
          searchable
          onImport={() => {
            alert("import data");
            return undefined;
          }}
        />
      </div>
    );
  },
};

export const DatasetAnyType: StoryObj = {
  name: "Dataset Selector (any type)",
  render: () => {
    const [value, setValue] = useState<string | null>(null);
    return (
      <div style={{ width: 320, padding: 16 }}>
        <DatasetSelector datasets={SAMPLE_DATASETS} value={value} onChange={setValue} />
      </div>
    );
  },
};
