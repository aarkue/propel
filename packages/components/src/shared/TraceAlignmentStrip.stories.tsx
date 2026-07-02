import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { TraceAlignmentStrip, type ResolvedMove } from "@r4pm/components";

const MOVES: ResolvedMove[] = [
  { kind: "sync", label: "register request", hidden: false },
  { kind: "sync", label: "decide", hidden: false },
  { kind: "log", label: "send reminder", hidden: false },
  { kind: "model", label: "a", hidden: false },
  { kind: "model", label: "τ", hidden: true },
  { kind: "sync", label: "close", hidden: false },
  { kind: "sync", label: "b", hidden: false },
];

const meta = {
  title: "Inputs & Primitives/Trace Alignment Strip",
  component: TraceAlignmentStrip,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true, iframeHeight: 130 } } },
} satisfies Meta<typeof TraceAlignmentStrip>;
export default meta;

export const Default: StoryObj = {
  name: "Trace Alignment Strip",
  render: () => <TraceAlignmentStrip moves={MOVES} />,
};
