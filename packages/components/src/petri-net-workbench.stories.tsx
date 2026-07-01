import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { PetriNetWorkbench, type PetriNet } from "@r4pm/components";

const net: PetriNet = {
  places: [{ id: "p0" }, { id: "p1" }],
  transitions: [{ id: "t0", label: "do work" }],
  arcs: [{ nodes: ["p0", "t0"] }, { nodes: ["t0", "p1"] }],
  initial_marking: { p0: 1 },
  final_marking: { p1: 1 },
};

const meta = {
  title: "Editors/Petri Net Workbench",
  component: PetriNetWorkbench,
  parameters: { frame: { mode: "canvas", height: 460 }, docs: { story: { iframeHeight: 500 } } },
} satisfies Meta<typeof PetriNetWorkbench>;
export default meta;

export const Default: StoryObj = {
  name: "View / Simulate / Edit",
  render: () => <PetriNetWorkbench data={net} />,
};
