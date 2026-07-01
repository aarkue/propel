import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { ObjectCentricSequence, type OcSequenceStep } from "@r4pm/components";

// An order-to-delivery run: an order and its items flow through, get packed, and shipped.
const orderTrace: OcSequenceStep[] = [
  {
    transitionId: "t1",
    label: "place order",
    objects: [
      { id: "order#o1", objectType: "order" },
      { id: "item#i1", objectType: "item" },
      { id: "item#i2", objectType: "item" },
    ],
  },
  { transitionId: "t2", label: "pick item", objects: [{ id: "item#i1", objectType: "item" }] },
  { transitionId: "t3", label: "pick item", objects: [{ id: "item#i2", objectType: "item" }] },
  {
    transitionId: "t4",
    label: "pack",
    objects: [
      { id: "package#p1", objectType: "package" },
      { id: "item#i1", objectType: "item" },
      { id: "item#i2", objectType: "item" },
    ],
  },
  // A silent (tau) step still carries the objects it routed.
  { transitionId: "t5", label: null, objects: [{ id: "order#o1", objectType: "order" }] },
  {
    transitionId: "t6",
    label: "ship",
    objects: [
      { id: "package#p1", objectType: "package" },
      { id: "order#o1", objectType: "order" },
    ],
  },
];

const meta = {
  title: "Inputs & Primitives/Object-Centric Sequence",
  component: ObjectCentricSequence,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof ObjectCentricSequence>;
export default meta;

export const Default: StoryObj = {
  name: "Object-Centric Sequence",
  render: () => <ObjectCentricSequence steps={orderTrace} />,
};

export const WithoutLegend: StoryObj = {
  name: "Without legend",
  render: () => <ObjectCentricSequence steps={orderTrace} showLegend={false} />,
};

export const Empty: StoryObj = {
  name: "Empty",
  render: () => <ObjectCentricSequence steps={[]} />,
};
