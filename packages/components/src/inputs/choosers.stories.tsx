import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "@r4pm/components/ui";
import { useState } from "react";
import { ActivityChooser, DatasetSelector, ObjectChooser, ObjectTypeChooser } from "@r4pm/components";

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
      <div style={{ width: 360, padding: 24 }}>
        <Card>
          <ActivityChooser
            counts={{ review: 312, decide: 740, register: 96, approve: 540, reject: 180 }}
            value={value}
            onChange={setValue}
          />
        </Card>
      </div>
    );
  },
};

export const ObjectTypes: StoryObj = {
  name: "Object Type Chooser",
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true, iframeHeight: 300 } } },
  render: () => {
    const [value, setValue] = useState<Set<string>>(new Set());
    return (
      <div style={{ width: 360, padding: 24 }}>
        <Card>
          <ObjectTypeChooser
            counts={{ order: 1240, item: 3890, delivery: 620, invoice: 980, customer: 410 }}
            value={value}
            onChange={setValue}
          />
        </Card>
      </div>
    );
  },
};

export const Objects: StoryObj = {
  name: "Object Chooser",
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true, iframeHeight: 320 } } },
  render: () => {
    const [value, setValue] = useState<Set<string>>(new Set());
    return (
      <div style={{ width: 360, padding: 24 }}>
        <Card>
          <ObjectChooser
            objects={[
              { id: "order-1001", involvement: 14 },
              { id: "order-1002", involvement: 9 },
              { id: "item-5527", involvement: 6 },
              { id: "item-5531", involvement: 4 },
              { id: "customer-88", involvement: 21 },
            ]}
            value={value}
            onChange={setValue}
          />
        </Card>
      </div>
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
