import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { LogVariants } from "@r4pm/components";
import type { TraceVariants } from "@r4pm/components";

const variants: TraceVariants = {
  act_to_index: { "register request": 0, examine: 1, decide: 2, pay: 3, reject: 4 },
  activities: ["register request", "examine", "decide", "pay", "reject"],
  traces: [
    [[0, 1, 2, 3], 540],
    [[0, 2, 3], 220],
    [[0, 1, 2, 4], 130],
    [[0, 1, 1, 2, 3], 60],
  ],
};

const meta = {
  title: "Viewers/Log Variants",
  component: LogVariants,
  parameters: { frame: { mode: "canvas", height: 460 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof LogVariants>;
export default meta;

export const Default: StoryObj = {
  name: "Trace variants",
  render: () => <LogVariants variants={variants} numTraces={950} numEvents={3490} />,
};
