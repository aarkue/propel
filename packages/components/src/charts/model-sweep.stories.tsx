import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { bestThreshold, ModelSweepChart, type SweepPoint } from "@r4pm/components/charts";
import { Text } from "@r4pm/components/ui";
import { useState } from "react";

const meta = {
  title: "Viewers/Model Sweep",
  component: ModelSweepChart,
  parameters: { frame: { mode: "pad", width: 820 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof ModelSweepChart>;
export default meta;

// Inductive Miner nets of a road traffic fine log, discovered at noise thresholds 0 to 1: fitness
// falls and precision rises as more infrequent behavior is filtered out.
const SWEEP: SweepPoint[] = [
  [0.0, 1.0, 0.552, 21, 16, 5, 50],
  [0.05, 0.998, 0.611, 20, 16, 5, 48],
  [0.1, 0.994, 0.648, 18, 15, 4, 44],
  [0.15, 0.991, 0.663, 18, 15, 4, 44],
  [0.2, 0.983, 0.702, 16, 14, 3, 40],
  [0.25, 0.979, 0.725, 15, 13, 2, 37],
  [0.3, 0.972, 0.741, 15, 13, 2, 37],
  [0.35, 0.958, 0.776, 14, 12, 2, 34],
  [0.4, 0.941, 0.802, 13, 11, 2, 31],
  [0.45, 0.935, 0.809, 13, 11, 2, 31],
  [0.5, 0.912, 0.838, 12, 10, 2, 28],
  [0.55, 0.887, 0.846, 11, 9, 1, 25],
  [0.6, 0.862, 0.871, 11, 9, 1, 25],
  [0.65, 0.84, 0.884, 10, 8, 1, 22],
  [0.7, 0.811, 0.902, 9, 8, 1, 21],
  [0.75, 0.786, 0.917, 9, 7, 1, 19],
  [0.8, 0.764, 0.928, 8, 7, 1, 18],
  [0.85, 0.731, 0.944, 7, 6, 1, 15],
  [0.9, 0.703, 0.951, 7, 6, 1, 15],
  [0.95, 0.682, 0.963, 6, 5, 1, 12],
  [1.0, 0.664, 0.971, 6, 5, 0, 11],
].map(([threshold, fitness, precision, places, transitions, silent, arcs]) => ({
  threshold,
  quality: {
    fitness,
    precision,
    f_score: (2 * fitness * precision) / (fitness + precision),
    places,
    transitions,
    silent_transitions: silent,
    arcs,
  },
}));

/** A finished sweep. Click a point to pick its model, the best F-score is marked. */
export const Default: StoryObj = {
  name: "Model Sweep",
  render: function Sweep() {
    const [threshold, setThreshold] = useState(bestThreshold(SWEEP));
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <ModelSweepChart data={SWEEP} threshold={threshold} onThresholdChange={setThreshold} />
        <Text size="1" color="gray">
          Selected noise threshold: {threshold?.toFixed(2) ?? "none"}
        </Text>
      </div>
    );
  },
};

/** A sweep still running: measured points, one that failed, one being measured and some waiting. */
export const Running: StoryObj = {
  name: "In progress",
  render: () => (
    <ModelSweepChart
      data={SWEEP.map(
        (p, i): SweepPoint =>
          i < 9
            ? i === 4
              ? { threshold: p.threshold, status: "error" }
              : p
            : i === 9
              ? { threshold: p.threshold, status: "running" }
              : { threshold: p.threshold },
      )}
    />
  ),
};

/** Models whose precision could not be computed: only fitness is drawn, the F-score is n/a. */
export const FitnessOnly: StoryObj = {
  name: "Fitness only",
  render: () => (
    <ModelSweepChart
      data={SWEEP.filter((_, i) => i % 2 === 0).map((p) => ({
        ...p,
        quality: p.quality && { ...p.quality, precision: null, f_score: null },
      }))}
    />
  ),
};

/** A sweep that has not started: no points yet, only the empty axes. */
export const Empty: StoryObj = {
  name: "Empty",
  render: () => <ModelSweepChart data={[]} />,
};
