import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import "@r4pm/components/styles.css";
import { ObjectCentricPetriNetViewer, JSONViewer, type Ocpn } from "@r4pm/components";

// Order/item OCPN in rust4pm's flat form. Both object types start in their own source place:
//  - "place order" takes one order and many items (the order's items): its item arcs are
//    variable.
//  - "pick item" picks a single item at a time (normal arcs). A silent transition skips picking.
//  - "pay" consumes the order together with all of its picked items (variable item arcs).
const sample: Ocpn = {
  places: [
    { name: "o_src", object_type: "order" },
    { name: "o_mid", object_type: "order" },
    { name: "o_done", object_type: "order" },
    { name: "i_src", object_type: "item" },
    { name: "i_mid", object_type: "item" },
    { name: "i_picked", object_type: "item" },
    { name: "i_done", object_type: "item" },
  ],
  transitions: [
    { name: "place order", label: "place order" },
    { name: "pick item", label: "pick item" },
    { name: "item tau0", label: null },
    { name: "pay", label: "pay" },
  ],
  arcs: [
    { source: "o_src", target: "place order" },
    { source: "i_src", target: "place order", type: "variable" },
    { source: "place order", target: "o_mid" },
    { source: "place order", target: "i_mid", type: "variable" },
    { source: "i_mid", target: "pick item" },
    { source: "pick item", target: "i_picked" },
    { source: "i_mid", target: "item tau0" },
    { source: "item tau0", target: "i_picked" },
    { source: "o_mid", target: "pay" },
    { source: "i_picked", target: "pay", type: "variable" },
    { source: "pay", target: "o_done" },
    { source: "pay", target: "i_done", type: "variable" },
  ],
  // one order and three items waiting, each in its own source place
  initial_marking: { o_src: 1, i_src: 3 },
  final_marking: { o_done: 1, i_done: 3 },
};

const meta = {
  title: "Viewers/Object-Centric Petri Net",
  component: ObjectCentricPetriNetViewer,
  parameters: { frame: { mode: "canvas", height: 300 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof ObjectCentricPetriNetViewer>;
export default meta;

export const Default: StoryObj = {
  name: "Object-Centric Petri Net",
  render: () => <ObjectCentricPetriNetViewer data={sample} />,
};

export const Editable: StoryObj = {
  name: "Editable",
  parameters: { frame: { mode: "canvas", height: 620 }, docs: { story: { iframeHeight: 660 } } },
  render: function EditableStory() {
    const [net, setNet] = useState<Ocpn>(sample);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ObjectCentricPetriNetViewer data={sample} editable onChange={setNet} />
        </div>
        <div
          style={{
            height: 220,
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
