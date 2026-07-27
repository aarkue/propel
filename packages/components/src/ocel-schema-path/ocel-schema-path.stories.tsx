import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { OcelSchemaPath, type OcelSchemaPathConnector, type OcelSchemaPathNode } from "./OcelSchemaPath";

const nodes: OcelSchemaPathNode[] = [
  { name: "order", kind: "object" },
  { name: "place order", kind: "event" },
  { name: "customer", kind: "object" },
  { name: "pay order", kind: "event" },
  { name: "invoice", kind: "object" },
];

const connectors: OcelSchemaPathConnector[] = [
  { qualifier: "creates" },
  { qualifier: "by", reverse: true },
  { qualifier: "pays" },
  { qualifier: "settled-by" },
];

const meta = {
  title: "Viewers/OCEL Schema Path",
  component: OcelSchemaPath,
  parameters: {
    frame: { mode: "canvas", height: 160 },
    docs: { story: { iframeHeight: 200, inline: false } },
  },
} satisfies Meta<typeof OcelSchemaPath>;
export default meta;

export const Default: StoryObj = {
  name: "Full",
  render: () => (
    <div style={{ padding: 16 }}>
      <OcelSchemaPath nodes={nodes} connectors={connectors} />
    </div>
  ),
};

export const Compact: StoryObj = {
  name: "Compact (table row)",
  render: () => (
    <div style={{ padding: 16 }}>
      <OcelSchemaPath nodes={nodes} connectors={connectors} compact />
    </div>
  ),
};
