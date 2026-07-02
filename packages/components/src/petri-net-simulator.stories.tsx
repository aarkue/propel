import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { PetriNetSimulator, type PetriNet } from "@r4pm/components";

const sample: PetriNet = {
  places: [{ id: "p0" }, { id: "p1" }, { id: "p2" }],
  transitions: [
    { id: "a", label: "register request" },
    { id: "b", label: "decide" },
    { id: "tau", label: null },
  ],
  arcs: [
    { nodes: ["p0", "a"] },
    { nodes: ["a", "p1"] },
    { nodes: ["p1", "b"] },
    { nodes: ["b", "p2"] },
    { nodes: ["p1", "tau"] },
    { nodes: ["tau", "p2"] },
  ],
  initial_marking: { p0: 1 },
  final_marking: { p2: 1 },
};

const meta = {
  title: "Viewers/Petri Net Simulator",
  component: PetriNetSimulator,
  parameters: { frame: { mode: "canvas", height: 600 }, docs: { story: { iframeHeight: 340 } } },
} satisfies Meta<typeof PetriNetSimulator>;
export default meta;

export const Default: StoryObj = {
  name: "Token game",
  render: () => (
    <PetriNetSimulator
      data={sample}
      allowForcedFiring
      onSaveAsLog={(traces) =>
        alert(`Save as log:\n${traces.map((t) => t.steps.map((s) => s.label ?? "τ").join(" → ")).join("\n")}`)
      }
    />
  ),
};
