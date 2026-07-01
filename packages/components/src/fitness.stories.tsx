import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { FitnessView } from "@r4pm/components";
import type { FitnessResult } from "@r4pm/components";

const sample: FitnessResult = {
  average_fitness: 0.924,
  log_fitness: 0.881,
  perfectly_fitting_frac: 0.61,
  total_costs: 1284,
};

const meta = {
  title: "Viewers/Fitness",
  component: FitnessView,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof FitnessView>;
export default meta;

export const Default: StoryObj = {
  name: "Conformance fitness",
  render: () => <FitnessView data={sample} />,
};
