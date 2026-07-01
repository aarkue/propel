import type { Meta, StoryObj } from "@storybook/react-vite";
// Minimal example: what an external consumer imports.
import "@r4pm/components/styles.css";
import { LogSummary } from "@r4pm/components";

const meta = {
  title: "Viewers/Log Summary",
  component: LogSummary,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof LogSummary>;
export default meta;

export const Default: StoryObj = {
  name: "Log Summary",
  render: () => <LogSummary data={{ num_traces: 1043, num_events: 15214 }} />,
};
