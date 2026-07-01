import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import type { LogAlignments } from "@r4pm/components";
import { AlignmentNetViewer } from "@r4pm/components";

// p0 -> a -> p1 -> b -> p2 -> c -> p3, with an invisible skip (tau: p1 -> p2)
// and an unfired transition (d) to exercise the dimmed state.
const sample: LogAlignments = {
  net: {
    places: [{ id: "p0" }, { id: "p1" }, { id: "p2" }, { id: "p3" }],
    transitions: [
      { id: "a", label: "register request" },
      { id: "b", label: "examine" },
      { id: "c", label: "decide" },
      { id: "tau", label: null },
      { id: "d", label: "reject (unused)" },
    ],
    arcs: [
      { nodes: ["p0", "a"] },
      { nodes: ["a", "p1"] },
      { nodes: ["p1", "b"] },
      { nodes: ["b", "p2"] },
      { nodes: ["p1", "tau"] },
      { nodes: ["tau", "p2"] },
      { nodes: ["p2", "c"] },
      { nodes: ["c", "p3"] },
      { nodes: ["p2", "d"] },
      { nodes: ["d", "p3"] },
    ],
    initial_marking: { p0: 1 },
    final_marking: { p3: 1 },
  },
  variant_alignments: [
    {
      activities: ["register request", "examine", "decide"],
      frequency: 60,
      result: {
        Ok: {
          cost: 0,
          states_visited: 8,
          moves: [
            { SyncMove: { trace_event_index: 0, transition: "a" } },
            { SyncMove: { trace_event_index: 1, transition: "b" } },
            { SyncMove: { trace_event_index: 2, transition: "c" } },
          ],
        },
      },
    },
    {
      activities: ["register request", "send reminder", "decide"],
      frequency: 40,
      result: {
        Ok: {
          cost: 2,
          states_visited: 21,
          moves: [
            { SyncMove: { trace_event_index: 0, transition: "a" } },
            { LogMove: { trace_event_index: 1 } },
            { ModelMove: { transition: "tau" } },
            { SyncMove: { trace_event_index: 2, transition: "c" } },
          ],
        },
      },
    },
  ],
  fitness: { average_fitness: 0.82, log_fitness: 0.8, perfectly_fitting_frac: 0.6, total_costs: 80 },
  aggregated: {
    total_traces: 100,
    transition_stats: {
      a: { sync_fires: 95, model_fires: 5 },
      b: { sync_fires: 60, model_fires: 40 },
      c: { sync_fires: 20, model_fires: 80 },
      tau: { sync_fires: 0, model_fires: 40 },
      // d intentionally absent -> dimmed (never fired)
    },
    log_move_counts: { "send reminder": 40, escalate: 7 },
  },
};

/** Blow the sample up to `n` variants (cycling the real ones, descending frequency) to
 *  exercise variant-picker virtualization. */
function makeLarge(n: number): LogAlignments {
  const base = sample.variant_alignments;
  const variant_alignments = Array.from({ length: n }, (_, i) => ({
    ...base[i % base.length],
    frequency: n - i,
  }));
  return { ...sample, variant_alignments };
}

const meta = {
  title: "Viewers/Alignment Net",
  component: AlignmentNetViewer,
  parameters: { frame: { mode: "canvas", height: 500 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof AlignmentNetViewer>;
export default meta;

export const Default: StoryObj = {
  name: "Aggregated + drill-down",
  render: () => <AlignmentNetViewer data={sample} />,
};

export const LargeDataset: StoryObj = {
  name: "Large dataset (5000 variants)",
  render: () => <AlignmentNetViewer data={makeLarge(5000)} />,
  parameters: { frame: { mode: "canvas", height: 600 } },
};
