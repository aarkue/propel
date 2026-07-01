import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { LogMetadataCard } from "@r4pm/components";
import type { LogGlobals } from "@r4pm/components";

const globals: LogGlobals = {
  attributes: { "concept:name": "Road Traffic Fine Management", "lifecycle:model": "standard" },
  classifiers: [{ name: "Activity", keys: ["concept:name"] }],
  extensions: [
    { name: "Concept", prefix: "concept", uri: "http://www.xes-standard.org/concept.xesext" },
    { name: "Time", prefix: "time", uri: "http://www.xes-standard.org/time.xesext" },
  ],
  global_event_attrs: { "concept:name": "__INVALID__", "time:timestamp": "1970-01-01T00:00:00Z" },
  global_trace_attrs: { "concept:name": "__INVALID__" },
};

const meta = {
  title: "Inputs & Primitives/Log Metadata Card",
  component: LogMetadataCard,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof LogMetadataCard>;
export default meta;

export const Default: StoryObj = {
  name: "Log Metadata Card",
  render: () => <LogMetadataCard globals={globals} />,
};
