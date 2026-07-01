import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
// Minimal example: what an external consumer imports.
import "@r4pm/components/styles.css";
import { PetriNetViewer, JSONViewer, type PetriNet } from "@r4pm/components";

// A small sound Petri net (p0 -> a -> p1 -> b -> p2).
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
  title: "Viewers/Petri Net",
  component: PetriNetViewer,
  parameters: { frame: { mode: "canvas", height: 240 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof PetriNetViewer>;
export default meta;

export const Default: StoryObj = {
  name: "Sound net",
  render: () => <PetriNetViewer data={sample} />,
};

export const Editable: StoryObj = {
  name: "Editable",
  parameters: { frame: { mode: "canvas", height: 560 }, docs: { story: { iframeHeight: 600 } } },
  render: function EditableStory() {
    const [net, setNet] = useState<PetriNet>(sample);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <PetriNetViewer data={sample} editable onChange={setNet} />
        </div>
        <div
          style={{
            height: 200,
            flexShrink: 0,
            border: "1px solid var(--gray-a5)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <JSONViewer data={net} />
        </div>
      </div>
    );
  },
};
