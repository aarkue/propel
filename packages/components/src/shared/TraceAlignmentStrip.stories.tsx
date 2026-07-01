import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { TraceAlignmentStrip, type ResolvedMove } from "@r4pm/components";

const PALETTE = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#9333ea"];
const colorOf = (a: string) => {
  let h = 0;
  for (let i = 0; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

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
  render: () => <TraceAlignmentStrip moves={MOVES} colorOf={colorOf} />,
};
