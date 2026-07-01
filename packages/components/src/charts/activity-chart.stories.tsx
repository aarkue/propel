import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { ActivityChart } from "@r4pm/components/charts";

const counts: Record<string, number> = {
  "place order": 1842,
  "confirm order": 1531,
  "pick item": 3402,
  "pack item": 3301,
  ship: 1290,
  invoice: 1104,
  "register payment": 980,
  "cancel order": 96,
};

const meta = {
  title: "Viewers/Activity Chart",
  component: ActivityChart,
  parameters: { frame: { mode: "canvas", height: 360 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof ActivityChart>;
export default meta;

export const Default: StoryObj = {
  name: "Activity frequencies",
  render: () => <ActivityChart counts={counts} numEvents={13546} />,
};
