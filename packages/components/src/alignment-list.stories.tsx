import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { AlignmentListViewer } from "@r4pm/components";
import type { LogAlignments } from "@r4pm/components";

const sample: LogAlignments = {
  net: {
    places: [{ id: "p0" }, { id: "p1" }, { id: "p2" }],
    transitions: [
      { id: "a", label: "register request" },
      { id: "b", label: "decide" },
    ],
    arcs: [
      { nodes: ["p0", "a"] as [string, string], weight: 1 },
      { nodes: ["a", "p1"] as [string, string], weight: 1 },
      { nodes: ["p1", "b"] as [string, string], weight: 1 },
      { nodes: ["b", "p2"] as [string, string], weight: 1 },
    ],
    initial_marking: { p0: 1 },
    final_marking: { p2: 1 },
  },
  variant_alignments: [
    {
      activities: ["register request", "decide"],
      frequency: 60,
      result: {
        Ok: {
          cost: 0,
          states_visited: 5,
          moves: [
            { SyncMove: { trace_event_index: 0, transition: "a" } },
            { SyncMove: { trace_event_index: 1, transition: "b" } },
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
          states_visited: 11,
          moves: [
            { SyncMove: { trace_event_index: 0, transition: "a" } },
            { LogMove: { trace_event_index: 1 } },
            { SyncMove: { trace_event_index: 2, transition: "b" } },
          ],
        },
      },
    },
  ],
  fitness: { average_fitness: 0.85, log_fitness: 0.82, perfectly_fitting_frac: 0.6, total_costs: 80 },
  aggregated: {
    total_traces: 100,
    transition_stats: { a: { sync_fires: 100, model_fires: 0 }, b: { sync_fires: 80, model_fires: 20 } },
    log_move_counts: { "send reminder": 40 },
  },
};

/** Blow the sample up to `n` variants (cycling the real ones, descending frequency) to
 *  exercise row virtualization. */
function makeLarge(n: number): LogAlignments {
  const base = sample.variant_alignments;
  const variant_alignments = Array.from({ length: n }, (_, i) => ({
    ...base[i % base.length],
    frequency: n - i,
  }));
  return { ...sample, variant_alignments };
}

const meta = {
  title: "Viewers/Alignment List",
  component: AlignmentListViewer,
  parameters: { frame: { mode: "canvas", height: 440 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof AlignmentListViewer>;
export default meta;

export const Default: StoryObj = {
  name: "Per-variant alignments",
  render: () => <AlignmentListViewer data={sample} />,
};

export const LargeDataset: StoryObj = {
  name: "Large dataset (5000 variants)",
  render: () => <AlignmentListViewer data={makeLarge(5000)} />,
  parameters: { frame: { mode: "canvas", height: 600 } },
};
