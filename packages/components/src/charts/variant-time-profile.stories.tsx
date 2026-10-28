import type { Meta, StoryObj } from "@storybook/react-vite";
// Minimal example: what an external consumer imports.
import "@r4pm/components/styles.css";
import { inMemoryVariantTiming, VariantTimeProfileChart } from "@r4pm/components/charts";
import type { InMemoryVariant, StepTimeStats } from "@r4pm/components/charts";

const DAY = 86_400_000;

/** Step stats around a median (in days), with a spread that grows along the variant. */
function step(medianDays: number, spreadDays: number): StepTimeStats {
  const d = (x: number) => Math.max(0, x) * DAY;
  return {
    min_ms: d(medianDays - 2 * spreadDays),
    p10_ms: d(medianDays - 1.3 * spreadDays),
    p25_ms: d(medianDays - 0.6 * spreadDays),
    median_ms: d(medianDays),
    p75_ms: d(medianDays + 0.8 * spreadDays),
    p90_ms: d(medianDays + 1.8 * spreadDays),
    max_ms: d(medianDays + 4 * spreadDays),
    mean_ms: d(medianDays + 0.4 * spreadDays),
  };
}

// Sample data shaped exactly like the binding's return types (compiler-checked).
const variants: InMemoryVariant[] = [
  {
    activities: [
      "Create Fine",
      "Send Fine",
      "Insert Fine Notification",
      "Add penalty",
      "Send for Credit Collection",
    ],
    num_cases: 560,
    steps: [step(0, 0), step(90, 20), step(110, 25), step(170, 25), step(560, 120)],
    cases: [
      { case_id: "A100", elapsed_ms: [0, 72 * DAY, 95 * DAY, 155 * DAY, 470 * DAY] },
      { case_id: "A231", elapsed_ms: [0, 120 * DAY, 140 * DAY, 200 * DAY, 760 * DAY] },
    ],
  },
  {
    activities: ["Create Fine", "Payment"],
    num_cases: 300,
    steps: [step(0, 0), step(8, 6)],
    cases: [{ case_id: "B7", elapsed_ms: [0, 3 * DAY] }],
  },
  {
    activities: ["Create Fine", "Send Fine"],
    num_cases: 120,
    steps: [step(0, 0), step(85, 15)],
    cases: [],
  },
];
const loaders = inMemoryVariantTiming(variants, { num_untimed_cases: 4 });

const meta = {
  title: "Viewers/Variant Time Profile",
  component: VariantTimeProfileChart,
  parameters: { frame: { mode: "canvas", height: 480 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof VariantTimeProfileChart>;
export default meta;

export const Default: StoryObj = {
  name: "Variant Time Profile",
  render: () => <VariantTimeProfileChart {...loaders} />,
};
