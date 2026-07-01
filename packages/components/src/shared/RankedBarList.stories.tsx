import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "@r4pm/components/ui";
import { ViewerConfigProvider } from "@r4pm/components";
import "@r4pm/components/styles.css";
import { RankedBarList } from "@r4pm/components";

const PALETTE = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#9333ea", "#0d9488", "#db2777"];
const demoColorOf = (_scope: string, key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

const meta = {
  title: "Inputs & Primitives/Ranked Bar List",
  component: RankedBarList,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof RankedBarList>;
export default meta;

export const Default: StoryObj = {
  name: "Ranked Bar List",
  render: () => (
    <ViewerConfigProvider value={{ colorOf: demoColorOf }}>
      <div style={{ width: 360, padding: 24 }}>
        <Card>
          <RankedBarList
            items={{
              "Create Purchase Order": 1842,
              "Receive Goods": 1531,
              "Approve Invoice": 1290,
              "Send Invoice": 1104,
              "Cancel Order": 612,
            }}
          />
        </Card>
      </div>
    </ViewerConfigProvider>
  ),
};
