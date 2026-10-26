import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { ObjectCentricPetriNetSimulator, type Ocpn } from "@r4pm/components";

// Mirrors the sample in object-centric-petri-net.stories.tsx: an order with three items.
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
  title: "Viewers/Object-Centric Petri Net Simulator",
  component: ObjectCentricPetriNetSimulator,
  parameters: { frame: { mode: "canvas", height: 600 }, docs: { story: { iframeHeight: 400 } } },
} satisfies Meta<typeof ObjectCentricPetriNetSimulator>;
export default meta;

export const Default: StoryObj = {
  name: "Token game (default consume-all)",
  render: () => <ObjectCentricPetriNetSimulator data={sample} />,
};
