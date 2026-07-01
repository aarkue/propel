import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import "@r4pm/components/styles.css";
import { ObjectCentricPetriNetViewer, JSONViewer, type ObjectCentricPetriNet } from "@r4pm/components";

// Order/item OCPN. Both object types start in their own source place:
//  - "place order" takes one order and many items (order's items): the
//    item -> place_order arc is variable.
//  - "pick item" picks a single item at a time (normal arcs).
//  - "pay" consumes the order together with all of its picked items (the
//    item -> pay arc is variable).
const sample: ObjectCentricPetriNet = {
  petri_net: {
    places: [
      { id: "o_src" }, // order: to place
      { id: "o_mid" }, // order: placed, awaiting payment
      { id: "o_done" }, // order: paid
      { id: "i_src" }, // item: available (initial)
      { id: "i_mid" }, // item: ordered, to pick
      { id: "i_picked" }, // item: picked
      { id: "i_done" }, // item: paid (final)
    ],
    transitions: [
      { id: "place_order", label: "place order" },
      { id: "pick_item", label: "pick item" },
      { id: "pay", label: "pay" },
    ],
    arcs: [
      { nodes: ["o_src", "place_order"] },
      // variable: one order takes many items
      { nodes: ["i_src", "place_order"] },
      { nodes: ["place_order", "o_mid"] },
      // variable: the order's items continue to the pick queue
      { nodes: ["place_order", "i_mid"] },
      { nodes: ["i_mid", "pick_item"] },
      { nodes: ["pick_item", "i_picked"] },
      { nodes: ["o_mid", "pay"] },
      // variable: paying consumes all of the order's picked items at once
      { nodes: ["i_picked", "pay"] },
      { nodes: ["pay", "o_done"] },
      // variable: paying releases all of the order's items to the final place
      { nodes: ["pay", "i_done"] },
    ],
    // one order and three items waiting, each in its own source place
    initial_marking: { o_src: 1, i_src: 3 },
    final_marking: { o_done: 1, i_done: 3 },
  },
  place_object_type: {
    o_src: "order",
    o_mid: "order",
    o_done: "order",
    i_src: "item",
    i_mid: "item",
    i_picked: "item",
    i_done: "item",
  },
  place_in_out_mult: {
    i_src: [{}, { place_order: true }], // taken (out) by place_order, variably
    i_mid: [{ place_order: true }, {}], // produced (in) by place_order, variably
    i_picked: [{}, { pay: true }], // consumed (out) by pay, variably
    i_done: [{ pay: true }, {}], // produced (in) by pay, variably
  },
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
    const [net, setNet] = useState<ObjectCentricPetriNet>(sample);
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
