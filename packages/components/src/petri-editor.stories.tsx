import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { Editor, type ArcData, type PetriNetNode } from "@r4pm/components/petri";
import type { Edge } from "@xyflow/react";

// A tiny seed net to edit: place (1 token) -> transition -> place (final marking 1).
const nodes: PetriNetNode[] = [
  { id: "p0", type: "place", data: { tokens: 1 }, position: { x: 0, y: 0 } },
  { id: "t0", type: "transition", data: { label: "do work" }, position: { x: 0, y: 120 } },
  { id: "p1", type: "place", data: { finalTokens: 1 }, position: { x: 0, y: 240 } },
];
const edges: Edge<ArcData>[] = [
  { id: "p0-t0", source: "p0", target: "t0", type: "custom" },
  { id: "t0-p1", source: "t0", target: "p1", type: "custom" },
];

const meta = {
  title: "Editors/Petri Net Editor",
  component: Editor,
  parameters: { frame: { mode: "canvas", height: 460 }, docs: { story: { iframeHeight: 500 } } },
} satisfies Meta<typeof Editor>;
export default meta;

export const Default: StoryObj = {
  name: "Petri Net Editor",
  render: () => <Editor editable showExportControls={false} initialNodes={nodes} initialEdges={edges} />,
};
