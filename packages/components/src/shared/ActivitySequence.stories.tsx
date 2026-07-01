import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { ActivitySequence } from "@r4pm/components";

const PALETTE = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#9333ea"];
const colorOf = (a: string) => {
  let h = 0;
  for (let i = 0; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

const meta = {
  title: "Inputs & Primitives/Activity Sequence",
  component: ActivitySequence,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof ActivitySequence>;
export default meta;

export const Default: StoryObj = {
  name: "Activity Sequence",
  render: () => (
    <ActivitySequence activities={["register request", "examine", "decide", "pay"]} colorOf={colorOf} />
  ),
};
