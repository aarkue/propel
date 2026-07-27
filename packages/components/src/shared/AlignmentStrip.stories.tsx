import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { AlignmentStrip, type ResolvedMove } from "@r4pm/components";

// Trace variant: linear left-to-right run of moves (sync / log / model), hidden tau folded in.
const TRACE_MOVES: ResolvedMove[] = [
  { kind: "sync", label: "register request", hidden: false },
  { kind: "sync", label: "decide", hidden: false },
  { kind: "log", label: "send reminder", hidden: false },
  { kind: "model", label: "examine", hidden: false },
  { kind: "model", label: "τ", hidden: true },
  { kind: "sync", label: "close", hidden: false },
];

// Deviation variant: log moves sit above the axis, model moves below, sync on it; a lone
// model / log move draws a >> skip placeholder on the opposite side.
const DEVIATION_MOVES: ResolvedMove[] = [
  { kind: "sync", label: "register request", hidden: false },
  { kind: "log", label: "send reminder", hidden: false },
  { kind: "model", label: "examine", hidden: false },
  { kind: "sync", label: "decide", hidden: false },
  { kind: "model", label: "τ", hidden: true },
  { kind: "sync", label: "archive", hidden: false },
  { kind: "log", label: "cancel", hidden: false },
  { kind: "sync", label: "close", hidden: false },
];

const meta = {
  title: "Inputs & Primitives/Alignment Strip",
  component: AlignmentStrip,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true, iframeHeight: 160 } } },
} satisfies Meta<typeof AlignmentStrip>;
export default meta;

export const Trace: StoryObj = {
  name: "Trace variant",
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true, iframeHeight: 140 } } },
  render: () => <AlignmentStrip variant="trace" moves={TRACE_MOVES} />,
};

export const Deviation: StoryObj = {
  name: "Deviation variant",
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true, iframeHeight: 200 } } },
  render: () => <AlignmentStrip variant="deviation" moves={DEVIATION_MOVES} />,
};
