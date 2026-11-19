import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import {
  type NetFiring,
  type NetReplay,
  PetriNetAnimation,
  type PetriNetAnimationData,
  type RustPetriNet,
} from "@r4pm/components";

const meta = {
  title: "Viewers/Petri Net Animation",
  component: PetriNetAnimation,
  parameters: { frame: { mode: "canvas", height: 560 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof PetriNetAnimation>;
export default meta;

const DAY = 86_400_000;

/** Small seeded PRNG, so the sample data is the same on every load. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Road traffic fine management. Places by index: p0 source, p6 sink. Silent transitions route the
// three moments a fine can be paid (right away, after the notification, after the penalty) to the
// one Payment transition.
const net: RustPetriNet = {
  places: Array.from({ length: 10 }, () => ({})),
  transitions: [
    { label: "Create Fine", inputs: [[0, 1]], outputs: [[1, 1]] },
    { label: "Send Fine", inputs: [[1, 1]], outputs: [[2, 1]] },
    { label: "Insert Fine Notification", inputs: [[2, 1]], outputs: [[3, 1]] },
    { label: "Add penalty", inputs: [[3, 1]], outputs: [[4, 1]] },
    { label: "Send for Credit Collection", inputs: [[4, 1]], outputs: [[6, 1]] },
    { label: "Payment", inputs: [[5, 1]], outputs: [[6, 1]] },
    { label: null, inputs: [[1, 1]], outputs: [[5, 1]] },
    { label: null, inputs: [[3, 1]], outputs: [[5, 1]] },
    { label: null, inputs: [[4, 1]], outputs: [[5, 1]] },
    { label: "Insert Date Appeal to Prefecture", inputs: [[3, 1]], outputs: [[7, 1]] },
    { label: "Send Appeal to Prefecture", inputs: [[7, 1]], outputs: [[8, 1]] },
    { label: "Receive Result Appeal from Prefecture", inputs: [[8, 1]], outputs: [[9, 1]] },
    { label: "Notify Result Appeal to Offender", inputs: [[9, 1]], outputs: [[6, 1]] },
  ],
  initial_marking: { 0: 1 },
  final_marking: { 6: 1 },
};

// What an alignment does with each variant. [transition, min days, max days] fires in sync with an
// event that many days after the previous one; [transition] is a model-only move (a silent step, or
// a skipped visible one); [activity, min days, max days] is an event the net cannot follow.
type Step = [number, number, number] | [number] | [string, number, number];
const VARIANTS: { weight: number; steps: Step[] }[] = [
  { weight: 30, steps: [[0, 0, 0], [6], [5, 2, 30]] },
  {
    weight: 28,
    steps: [
      [0, 0, 0],
      [1, 60, 110],
      [2, 8, 20],
      [3, 60, 60],
      [4, 300, 520],
    ],
  },
  { weight: 14, steps: [[0, 0, 0], [1, 60, 110], [2, 8, 20], [3, 60, 60], [8], [5, 5, 90]] },
  { weight: 9, steps: [[0, 0, 0], [1, 60, 110], [2, 8, 20], [7], [5, 3, 50]] },
  {
    weight: 7,
    steps: [
      [0, 0, 0],
      [1, 60, 110],
      [2, 8, 20],
      [9, 5, 40],
      [10, 10, 60],
      [11, 40, 120],
      [12, 5, 30],
    ],
  },
  // The notification is missing, so the net skips it.
  { weight: 5, steps: [[0, 0, 0], [1, 60, 110], [2], [3, 70, 80], [4, 300, 520]] },
  // Appeal to Judge is not in the net.
  {
    weight: 5,
    steps: [[0, 0, 0], [1, 60, 110], [2, 8, 20], [3, 60, 60], ["Appeal to Judge", 20, 90], [8], [5, 30, 200]],
  },
  // Paid twice: the second payment is an extra event.
  { weight: 2, steps: [[0, 0, 0], [6], [5, 2, 30], ["Payment", 1, 10]] },
];

function replayOf(cases: number, unaligned: number, seed: number): NetReplay {
  const r = mulberry32(seed);
  const totalWeight = VARIANTS.reduce((n, v) => n + v.weight, 0);
  const start = Date.UTC(2023, 0, 2);
  const journeys = Array.from({ length: cases }, () => {
    let pick = r() * totalWeight;
    const variant = VARIANTS.find((v) => {
      pick -= v.weight;
      return pick < 0;
    });
    let time = start + Math.floor(r() * 180) * DAY;
    const firings: NetFiring[] = [];
    const log_moves: [string, number][] = [];
    for (const step of (variant ?? VARIANTS[0]).steps) {
      if (step.length === 1) {
        firings.push({ transition: step[0], time, sync: false });
        continue;
      }
      const [what, min, max] = step;
      time += (min + Math.floor(r() * (max - min + 1))) * DAY;
      if (typeof what === "string") log_moves.push([what, time]);
      else firings.push({ transition: what, time, sync: true });
    }
    return { firings, log_moves };
  }).sort((a, b) => a.firings[0].time - b.firings[0].time);
  const times = journeys.flatMap((j) => [...j.firings.map((f) => f.time), ...j.log_moves.map((m) => m[1])]);
  return {
    journeys,
    total: cases + unaligned,
    unaligned,
    min_ms: Math.min(...times),
    max_ms: Math.max(...times),
  };
}

const fines: PetriNetAnimationData = { net, replay: replayOf(60, 2, 8) };
const oneCase: PetriNetAnimationData = {
  net,
  replay: {
    journeys: [
      {
        firings: [
          { transition: 0, time: Date.UTC(2023, 1, 14), sync: true },
          { transition: 1, time: Date.UTC(2023, 4, 2), sync: true },
          { transition: 2, time: Date.UTC(2023, 4, 15), sync: true },
          { transition: 9, time: Date.UTC(2023, 5, 1), sync: true },
          { transition: 10, time: Date.UTC(2023, 6, 10), sync: true },
          { transition: 11, time: Date.UTC(2023, 9, 3), sync: true },
          { transition: 12, time: Date.UTC(2023, 9, 20), sync: true },
        ],
        log_moves: [],
      },
    ],
    total: 1,
    unaligned: 0,
    min_ms: Date.UTC(2023, 1, 14),
    max_ms: Date.UTC(2023, 9, 20),
  },
};
const nothingAligned: PetriNetAnimationData = {
  net,
  replay: { journeys: [], total: 12, unaligned: 12, min_ms: 0, max_ms: 0 },
};

/** Sixty fines replayed on the net through their alignments, with skipped steps, extra events and two unaligned cases. */
export const Default: StoryObj = {
  name: "Road fines",
  render: () => <PetriNetAnimation data={fines} />,
};

/** A single fine that goes through the appeal to the prefecture, so its token is easy to follow. */
export const SingleCase: StoryObj = {
  name: "One case",
  render: () => <PetriNetAnimation data={oneCase} />,
};

/** No case could be aligned with the net, so there is nothing to replay. */
export const Empty: StoryObj = {
  name: "Nothing aligned",
  render: () => <PetriNetAnimation data={nothingAligned} />,
};
