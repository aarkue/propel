import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { ObjectCentricPetriNetWorkbench, type ObjectCentricPetriNet } from "@r4pm/components";

// Mirrors the sample in object-centric-petri-net.stories.tsx: an order with three items.
const sample: ObjectCentricPetriNet = {
  petri_net: {
    places: [
      { id: "o_src" },
      { id: "o_mid" },
      { id: "o_done" },
      { id: "i_src" },
      { id: "i_mid" },
      { id: "i_picked" },
      { id: "i_done" },
    ],
    transitions: [
      { id: "place_order", label: "place order" },
      { id: "pick_item", label: "pick item" },
      { id: "pay", label: "pay" },
    ],
    arcs: [
      { nodes: ["o_src", "place_order"] },
      { nodes: ["i_src", "place_order"] },
      { nodes: ["place_order", "o_mid"] },
      { nodes: ["place_order", "i_mid"] },
      { nodes: ["i_mid", "pick_item"] },
      { nodes: ["pick_item", "i_picked"] },
      { nodes: ["o_mid", "pay"] },
      { nodes: ["i_picked", "pay"] },
      { nodes: ["pay", "o_done"] },
      { nodes: ["pay", "i_done"] },
    ],
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
    i_src: [{}, { place_order: true }],
    i_mid: [{ place_order: true }, {}],
    i_picked: [{}, { pay: true }],
    i_done: [{ pay: true }, {}],
  },
};

const meta = {
  title: "Editors/Object-Centric Petri Net Workbench",
  component: ObjectCentricPetriNetWorkbench,
  parameters: { frame: { mode: "canvas", height: 520 }, docs: { story: { iframeHeight: 560 } } },
} satisfies Meta<typeof ObjectCentricPetriNetWorkbench>;
export default meta;

export const Default: StoryObj = {
  name: "View / Simulate / Edit",
  render: () => <ObjectCentricPetriNetWorkbench data={sample} />,
};
