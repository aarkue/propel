import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { DeviationAlignmentStrip, ViewerExportFrame, type ResolvedMove } from "@r4pm/components";

const PALETTE = ["#4f46e5", "#0891b2", "#16a34a", "#d97706", "#dc2626", "#9333ea"];
const colorOf = (a: string) => {
  let h = 0;
  for (let i = 0; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

// Covers every column shape: sync on the axis, an adjacent log+model substitution,
// a lone model move (skip placeholder above), a lone log move (skip below), and a
// hidden (tau) model move.
const MOVES: ResolvedMove[] = [
  { kind: "sync", label: "register request", hidden: false },
  { kind: "log", label: "send reminder", hidden: false },
  { kind: "model", label: "examine", hidden: false },
  { kind: "sync", label: "decide", hidden: false },
  { kind: "model", label: "τ", hidden: true },
  { kind: "sync", label: "archive", hidden: false },
  { kind: "log", label: "cancel", hidden: false },
  { kind: "sync", label: "close", hidden: false },
];

// Several model moves (and one log move) at a single trace position: they stack
// in one column (log above, models below). A later position has model moves only
// -> a >> skip placeholder above.
const MULTI: ResolvedMove[] = [
  { kind: "sync", label: "register request", hidden: false },
  { kind: "log", label: "send reminder", hidden: false },
  { kind: "model", label: "examine", hidden: false },
  { kind: "model", label: "check ticket", hidden: false },
  { kind: "model", label: "τ", hidden: true },
  { kind: "sync", label: "decide", hidden: false },
  { kind: "model", label: "notify", hidden: false },
  { kind: "model", label: "escalate", hidden: false },
  { kind: "sync", label: "close", hidden: false },
];

const ALL_SYNC: ResolvedMove[] = [
  { kind: "sync", label: "register request", hidden: false },
  { kind: "sync", label: "examine", hidden: false },
  { kind: "sync", label: "decide", hidden: false },
  { kind: "sync", label: "close", hidden: false },
];

const meta = {
  title: "Inputs & Primitives/Deviation Alignment Strip",
  component: DeviationAlignmentStrip,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true, iframeHeight: 180 } } },
} satisfies Meta<typeof DeviationAlignmentStrip>;
export default meta;

export const Default: StoryObj = {
  name: "Deviation Alignment Strip",
  render: () => <DeviationAlignmentStrip moves={MOVES} colorOf={colorOf} />,
};

export const MultipleModelMoves: StoryObj = {
  name: "Multiple model moves at one position",
  render: () => <DeviationAlignmentStrip moves={MULTI} colorOf={colorOf} />,
};

export const PerfectlyFitting: StoryObj = {
  name: "Perfectly fitting (all sync)",
  render: () => <DeviationAlignmentStrip moves={ALL_SYNC} colorOf={colorOf} />,
};

export const VectorSvgExport: StoryObj = {
  name: "Vector SVG export (use the ⬇ menu)",
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true, iframeHeight: 220 } } },
  render: () => (
    <ViewerExportFrame
      filename="deviation-alignment"
      style={{ border: "1px solid var(--gray-a5)", borderRadius: 8 }}
    >
      <div style={{ padding: "40px 16px 24px" }}>
        <DeviationAlignmentStrip moves={MOVES} colorOf={colorOf} exportKey="story-deviation-strip" />
      </div>
    </ViewerExportFrame>
  ),
};
