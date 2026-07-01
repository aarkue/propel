import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { JSONViewer } from "@r4pm/components";

const sample = {
  id: "order-1001",
  customer: { name: "Acme Corp", vip: true },
  items: [
    { sku: "A-12", qty: 3 },
    { sku: "B-07", qty: 1 },
  ],
  total: 482.5,
  shipped: false,
  tags: ["priority", "export"],
};

const meta = {
  title: "Inputs & Primitives/JSON Viewer",
  component: JSONViewer,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof JSONViewer>;
export default meta;

export const Default: StoryObj = {
  name: "JSON Viewer",
  render: () => <JSONViewer data={sample} />,
};
