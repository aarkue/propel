import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import {
  JobProgressCard,
  type JobProgressReport,
  JobProgressStrip,
  type ProgressUnits,
} from "@r4pm/components";
import { Text } from "@r4pm/components/ui";
import { useEffect, useState } from "react";

const meta = {
  title: "Inputs & Primitives/Job Progress",
  component: JobProgressCard,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof JobProgressCard>;
export default meta;

const megabytes = (n: number) => (n / 1e6).toLocaleString("en", { maximumFractionDigits: n < 1e7 ? 1 : 0 });

// What each stage counts. A stage "<prefix>: <name>" uses the unit of "<name>".
const UNITS: ProgressUnits = {
  "Aligning variants": { noun: "variants" },
  "Searching schemas": { noun: "steps", totalIsLimit: true },
  Importing: { title: "Importing the file", noun: "MB", format: megabytes },
};

const Box = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 560, height: 200, border: "1px solid var(--gray-a5)", borderRadius: 8 }}>
    {children}
  </div>
);

const Strip = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 640, border: "1px solid var(--gray-a5)", borderRadius: 8, overflow: "hidden" }}>
    {children}
    <div style={{ padding: 16 }}>
      <Text size="1" color="gray">
        Partial results of the running job show here.
      </Text>
    </div>
  </div>
);

/** A running alignment that counts toward a known total, with a Cancel button. */
export const Default: StoryObj = {
  name: "Card, known total",
  render: function KnownTotal() {
    const [done, setDone] = useState(1_204);
    useEffect(() => {
      const t = setInterval(() => setDone((d) => (d >= 2_560 ? 0 : d + 37)), 400);
      return () => clearInterval(t);
    }, []);
    return (
      <Box>
        <JobProgressCard
          progress={{ stage: "Aligning variants", done, total: 2_560 }}
          units={UNITS}
          onCancel={() => setDone(0)}
        />
      </Box>
    );
  },
};

/** Before the first report: the label and an indeterminate bar. */
export const Starting: StoryObj = {
  name: "Card, before the first report",
  render: () => (
    <Box>
      <JobProgressCard progress={null} label="Discovering the OC-DECLARE model..." onCancel={() => {}} />
    </Box>
  ),
};

/** A stage without a total (e.g., the in-browser engine counting steps): the count only, no share. */
export const UnknownTotal: StoryObj = {
  name: "Card, unknown total",
  render: () => (
    <Box>
      <JobProgressCard progress={{ stage: "Mining process tree", done: 18_342 }} />
    </Box>
  ),
};

/** A total that is only a limit the search rarely reaches: shown as a plain count of steps. */
export const LimitTotal: StoryObj = {
  name: "Card, total is a limit",
  render: () => (
    <Box>
      <JobProgressCard
        progress={{ stage: "Searching schemas", done: 41_877, total: 1_000_000 }}
        units={UNITS}
        onCancel={() => {}}
      />
    </Box>
  ),
};

/** A unit with its own title and number format: reading a file in MB. */
export const FormattedUnit: StoryObj = {
  name: "Card, formatted unit",
  render: () => (
    <Box>
      <JobProgressCard
        progress={{ stage: "Importing", done: 84_200_000, total: 212_500_000 }}
        units={UNITS}
      />
    </Box>
  ),
};

const STRIP_REPORTS: { caption: string; progress: JobProgressReport | null; units?: ProgressUnits }[] = [
  { caption: "Without units", progress: { stage: "Aligning variants", done: 312, total: 1_480 } },
  { caption: "With units", progress: { stage: "Aligning variants", done: 312, total: 1_480 }, units: UNITS },
  {
    caption: "Prefixed stage",
    progress: { stage: "orders: Aligning variants", done: 57, total: 96 },
    units: UNITS,
  },
  { caption: "Unknown total", progress: { stage: "Mining process tree", done: 7_210 } },
  {
    caption: "Total is a limit",
    progress: { stage: "Searching schemas", done: 41_877, total: 1_000_000 },
    units: UNITS,
  },
  { caption: "Before the first report", progress: null },
];

/** The strip above a view that already shows partial results, in each of its states. */
export const StripStates: StoryObj = {
  name: "Strip",
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {STRIP_REPORTS.map((r) => (
        <div key={r.caption} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Text size="1" color="gray">
            {r.caption}
          </Text>
          <Strip>
            <JobProgressStrip progress={r.progress} units={r.units} onCancel={() => {}} />
          </Strip>
        </div>
      ))}
    </div>
  ),
};

/** Without `onCancel` (a backend that cannot cancel), the strip has no button. */
export const StripNoCancel: StoryObj = {
  name: "Strip, no cancel",
  render: () => (
    <Strip>
      <JobProgressStrip progress={{ stage: "Aligning variants", done: 1_904, total: 2_560 }} units={UNITS} />
    </Strip>
  ),
};
