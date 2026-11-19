import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { formatDuration, type VariantOption, VariantRow, VariantSelect } from "@r4pm/components";
import { Text } from "@r4pm/components/ui";
import { useState } from "react";

const meta = {
  title: "Inputs & Primitives/Variant Select",
  component: VariantSelect,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof VariantSelect>;
export default meta;

const DAY = 86_400_000;

// The most frequent variants of a road traffic fine log, most frequent first.
const VARIANTS: VariantOption[] = [
  {
    activities: [
      "Create Fine",
      "Send Fine",
      "Insert Fine Notification",
      "Add penalty",
      "Send for Credit Collection",
    ],
    cases: 56_482,
    note: formatDuration(511 * DAY),
  },
  { activities: ["Create Fine", "Payment"], cases: 46_371, note: formatDuration(8 * DAY) },
  { activities: ["Create Fine", "Send Fine"], cases: 20_385, note: formatDuration(86 * DAY) },
  {
    activities: ["Create Fine", "Send Fine", "Insert Fine Notification", "Add penalty", "Payment"],
    cases: 9_520,
    note: formatDuration(163 * DAY),
  },
  {
    activities: ["Create Fine", "Send Fine", "Insert Fine Notification", "Add penalty", "Payment", "Payment"],
    cases: 3_736,
    note: formatDuration(240 * DAY),
  },
  { activities: ["Create Fine", "Send Fine", "Payment"], cases: 3_301, note: formatDuration(38 * DAY) },
  {
    activities: ["Create Fine", "Send Fine", "Insert Fine Notification", "Payment", "Add penalty", "Payment"],
    cases: 2_385,
    note: formatDuration(180 * DAY),
  },
  { activities: ["Create Fine", "Payment", "Send Fine"], cases: 1_646, note: formatDuration(110 * DAY) },
  {
    activities: [
      "Create Fine",
      "Send Fine",
      "Insert Fine Notification",
      "Insert Date Appeal to Prefecture",
      "Add penalty",
      "Send Appeal to Prefecture",
    ],
    cases: 1_253,
    note: formatDuration(204 * DAY),
  },
  {
    activities: ["Create Fine", "Send Fine", "Insert Fine Notification", "Add penalty", "Appeal to Judge"],
    cases: 207,
    note: formatDuration(412 * DAY),
  },
  {
    activities: [
      "Create Fine",
      "Send Fine",
      "Insert Fine Notification",
      "Insert Date Appeal to Prefecture",
      "Send Appeal to Prefecture",
      "Receive Result Appeal from Prefecture",
      "Notify Result Appeal to Offender",
      "Add penalty",
      "Payment",
    ],
    cases: 74,
    note: formatDuration(298 * DAY),
  },
  { activities: [], cases: 3 },
];
const TOTAL_CASES = 150_370;

/** A searchable variant picker with prev/next buttons. Rows show share, activities and a note. */
export const Default: StoryObj = {
  name: "Variant Select",
  render: function Picker() {
    const [value, setValue] = useState<number | null>(0);
    return (
      <div style={{ width: 640, display: "flex", flexDirection: "column", gap: 8 }}>
        <VariantSelect variants={VARIANTS} totalCases={TOTAL_CASES} value={value} onChange={setValue} />
        <Text size="1" color="gray">
          Picked:{" "}
          {value === null ? "nothing" : `#${value + 1}, ${VARIANTS[value].cases.toLocaleString("en")} cases`}
        </Text>
      </div>
    );
  },
};

/** Nothing picked yet: the trigger shows the placeholder. */
export const NothingPicked: StoryObj = {
  name: "No selection",
  render: function Empty() {
    const [value, setValue] = useState<number | null>(null);
    return (
      <div style={{ width: 640 }}>
        <VariantSelect
          variants={VARIANTS}
          totalCases={TOTAL_CASES}
          value={value}
          onChange={setValue}
          placeholder="Pick a variant to replay"
        />
      </div>
    );
  },
};

/** Disabled, e.g., while the host recomputes. */
export const Disabled: StoryObj = {
  name: "Disabled",
  render: () => (
    <div style={{ width: 640 }}>
      <VariantSelect variants={VARIANTS} totalCases={TOTAL_CASES} value={1} onChange={() => {}} disabled />
    </div>
  ),
};

/** Variant rows on their own, as in a list. `matched` dims the activities a search did not hit. */
export const Rows: StoryObj = {
  name: "Variant rows",
  render: () => (
    <div style={{ width: 720, display: "flex", flexDirection: "column", gap: 10 }}>
      {VARIANTS.slice(0, 5).map((v, i) => (
        <VariantRow
          key={v.activities.join("|")}
          rank={i}
          activities={v.activities}
          cases={v.cases}
          share={v.cases / TOTAL_CASES}
          note={v.note}
          matched={i === 3 ? [0, 4] : undefined}
        />
      ))}
      <VariantRow rank={11} activities={[]} cases={3} share={3 / TOTAL_CASES} />
    </div>
  ),
};
