import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { RECORDED_TIME, TimeZonePicker, timeZoneArg } from "@r4pm/components";
import { Text } from "@r4pm/components/ui";
import { useState } from "react";

const meta = {
  title: "Inputs & Primitives/Time Zone Picker",
  component: TimeZonePicker,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof TimeZonePicker>;
export default meta;

// Recorded in UTC, on the night Europe switched to summer time.
const EVENTS = [
  { activity: "place order", ms: Date.UTC(2023, 2, 26, 0, 40) },
  { activity: "confirm order", ms: Date.UTC(2023, 2, 26, 1, 20) },
  { activity: "pay order", ms: Date.UTC(2023, 2, 26, 7, 5) },
];

function readIn(zone: string, ms: number): string {
  const timeZone = zone === RECORDED_TIME ? "UTC" : zone;
  return new Intl.DateTimeFormat("en-GB", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(ms);
}

/** Picks the zone event times are read in. The list below shows three events in the chosen zone. */
export const Default: StoryObj = {
  name: "Time Zone Picker",
  render: function Picker() {
    const [zone, setZone] = useState("Europe/Berlin");
    const offsets = timeZoneArg(zone);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 420 }}>
        <TimeZonePicker value={zone} onChange={setZone} />
        {EVENTS.map((e) => (
          <Text key={e.activity} size="1">
            <span style={{ display: "inline-block", width: 110, color: "var(--gray-10)" }}>{e.activity}</span>
            {readIn(zone, e.ms)}
          </Text>
        ))}
        <Text size="1" color="gray">
          {offsets
            ? `Passed to the engine as ${offsets.length.toLocaleString("en")} offset changes.`
            : "Passed to the engine as no zone: each event keeps its recorded offset."}
        </Text>
      </div>
    );
  },
};

/** "As recorded" keeps each event's stored offset, the default for logs with offsets. */
export const AsRecorded: StoryObj = {
  name: "As recorded",
  render: function Recorded() {
    const [zone, setZone] = useState(RECORDED_TIME);
    return <TimeZonePicker value={zone} onChange={setZone} />;
  },
};

/** Disabled, e.g., for a log whose events have dates only. */
export const Disabled: StoryObj = {
  name: "Disabled",
  render: () => <TimeZonePicker value="UTC" onChange={() => {}} disabled />,
};
