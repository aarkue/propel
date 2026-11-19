import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import {
  type PerformanceSpectrum,
  type PerformanceSpectrumControls,
  PerformanceSpectrumView,
} from "@r4pm/components/charts";
import { useMemo, useState } from "react";

const meta = {
  title: "Viewers/Performance Spectrum",
  component: PerformanceSpectrumView,
  parameters: { frame: { mode: "canvas", height: 620 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof PerformanceSpectrumView>;
export default meta;

const DAY = 86_400_000;
const START = Date.UTC(2022, 0, 3);

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Road traffic fines: [weight, activities].
const VARIANTS: [number, string[]][] = [
  [38, ["Create Fine", "Send Fine", "Insert Fine Notification", "Add penalty", "Send for Credit Collection"]],
  [31, ["Create Fine", "Payment"]],
  [13, ["Create Fine", "Send Fine"]],
  [7, ["Create Fine", "Send Fine", "Insert Fine Notification", "Add penalty", "Payment"]],
  [2.5, ["Create Fine", "Send Fine", "Insert Fine Notification", "Add penalty", "Payment", "Payment"]],
  [2.2, ["Create Fine", "Send Fine", "Payment"]],
  [1.6, ["Create Fine", "Send Fine", "Insert Fine Notification", "Payment", "Add penalty", "Payment"]],
  [1.1, ["Create Fine", "Payment", "Send Fine"]],
  [
    0.8,
    [
      "Create Fine",
      "Send Fine",
      "Insert Fine Notification",
      "Insert Date Appeal to Prefecture",
      "Add penalty",
      "Send Appeal to Prefecture",
    ],
  ],
];

type Trace = { activity: string; ms: number }[];

/** Fines created over a year. Sending and credit collection run in batches, the penalty follows the
 *  notification after exactly 60 days, everything else waits a random number of days. */
function fines(cases: number, seed: number): Trace[] {
  const rand = mulberry32(seed);
  const total = VARIANTS.reduce((s, [w]) => s + w, 0);
  const pick = () => {
    let r = rand() * total;
    for (const [w, acts] of VARIANTS) {
      r -= w;
      if (r < 0) return acts;
    }
    return VARIANTS[0][1];
  };
  const days = (lo: number, hi: number) => (lo + rand() * (hi - lo)) * DAY;
  const nextBatch = (t: number, every: number) =>
    START + Math.ceil((t - START) / (every * DAY)) * every * DAY;
  const step = (from: string, to: string, t: number): number => {
    if (to === "Send Fine") return nextBatch(t + days(45, 75), 21);
    if (to === "Send for Credit Collection") return nextBatch(t + days(150, 220), 91);
    if (from === "Insert Fine Notification" && to === "Add penalty") return t + 60 * DAY;
    if (from === "Create Fine" && to === "Payment") return t + -Math.log(1 - rand()) * 9 * DAY;
    if (to === "Insert Fine Notification") return t + days(8, 30);
    return t + days(5, 70);
  };
  return Array.from({ length: cases }, () => {
    const acts = pick();
    let t = START + Math.floor(rand() * 365) * DAY;
    return acts.map((activity, i) => {
      if (i > 0) t = step(acts[i - 1], activity, t);
      return { activity, ms: Math.round(t) };
    });
  });
}

/** The spectrum along `path` (default: the most frequent variant), as the engine computes it. */
function spectrum(traces: Trace[], path?: string[] | null): PerformanceSpectrum {
  const counts = new Map<string, { activities: string[]; cases: number }>();
  for (const t of traces) {
    const key = t.map((e) => e.activity).join("\u0000");
    const v = counts.get(key) ?? { activities: t.map((e) => e.activity), cases: 0 };
    v.cases++;
    counts.set(key, v);
  }
  const top_variants = [...counts.values()].sort((a, b) => b.cases - a.cases);
  const p = path && path.length >= 2 ? path : (top_variants[0]?.activities ?? []);
  const pairs: [string, string][] = [];
  for (let i = 1; i < p.length; i++) {
    if (!pairs.some(([a, b]) => a === p[i - 1] && b === p[i])) pairs.push([p[i - 1], p[i]]);
  }
  let min_ms = Number.POSITIVE_INFINITY;
  let max_ms = Number.NEGATIVE_INFINITY;
  const segments = pairs.map(([from, to]) => {
    const lines: [number, number][] = [];
    for (const t of traces) {
      for (let i = 1; i < t.length; i++) {
        if (t[i - 1].activity === from && t[i].activity === to) lines.push([t[i - 1].ms, t[i].ms]);
      }
    }
    lines.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [a, b] of lines) {
      min_ms = Math.min(min_ms, a);
      max_ms = Math.max(max_ms, b);
    }
    const d = lines.map(([a, b]) => b - a).sort((x, y) => x - y);
    const q = (f: number) => d[Math.round((d.length - 1) * f)] ?? 0;
    return {
      from,
      to,
      count: lines.length,
      lines,
      quartiles: [q(0.25), q(0.5), q(0.75)] as [number, number, number],
    };
  });
  if (min_ms > max_ms) [min_ms, max_ms] = [0, 0];
  return { path: p, segments, min_ms, max_ms, top_variants, num_cases: traces.length };
}

const TRACES = fines(900, 7);

/** The most frequent path of a fine log: batched sending, a fixed 60-day penalty, and credit collection in quarterly batches. Pick another variant from the menu. */
export const Default: StoryObj = {
  name: "Performance Spectrum",
  render: function Spectrum() {
    const [controls, setControls] = useState<PerformanceSpectrumControls>({ path: null });
    const data = useMemo(() => spectrum(TRACES, controls.path), [controls.path]);
    return <PerformanceSpectrumView data={data} controls={controls} onControlsChange={setControls} />;
  },
};

/** A two-step path: fines paid directly, mostly within days. */
export const ShortPath: StoryObj = {
  name: "Short path",
  parameters: { frame: { mode: "canvas", height: 300 } },
  render: () => <PerformanceSpectrumView data={spectrum(TRACES, ["Create Fine", "Payment"])} />,
};

/** A variant with a second payment, which adds a Payment to Payment segment. */
export const RepeatedActivity: StoryObj = {
  name: "Repeated payment",
  render: () => (
    <PerformanceSpectrumView
      data={spectrum(TRACES, [
        "Create Fine",
        "Send Fine",
        "Insert Fine Notification",
        "Add penalty",
        "Payment",
        "Payment",
      ])}
    />
  ),
};

/** A log without cases: no segments, so the view says so. */
export const NoSegments: StoryObj = {
  name: "Empty",
  parameters: { frame: { mode: "canvas", height: 240 } },
  render: () => <PerformanceSpectrumView data={spectrum([])} />,
};
