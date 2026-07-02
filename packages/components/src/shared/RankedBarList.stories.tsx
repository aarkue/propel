import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "@r4pm/components/ui";
import "@r4pm/components/styles.css";
import { RankedBarList } from "@r4pm/components";

const meta = {
  title: "Inputs & Primitives/Ranked Bar List",
  component: RankedBarList,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof RankedBarList>;
export default meta;

export const Default: StoryObj = {
  name: "Ranked Bar List",
  render: () => (
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
  ),
};
