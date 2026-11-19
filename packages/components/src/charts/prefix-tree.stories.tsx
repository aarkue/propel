import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import {
  DEFAULT_PREFIX_TREE_CONTROLS,
  type PrefixNode,
  type PrefixTree,
  type PrefixTreeControls,
  PrefixTreeView,
} from "@r4pm/components/charts";
import { useMemo, useState } from "react";

const meta = {
  title: "Viewers/Prefix Tree",
  component: PrefixTreeView,
  parameters: { frame: { mode: "canvas", height: 640 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof PrefixTreeView>;
export default meta;

const DAY = 86_400_000;

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
  [0.5, ["Create Fine", "Send Fine", "Insert Fine Notification", "Add penalty", "Appeal to Judge"]],
  [
    0.3,
    [
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
  ],
];

// Typical wait before each activity, in days.
const WAIT: Record<string, [number, number]> = {
  "Send Fine": [60, 110],
  "Insert Fine Notification": [8, 30],
  "Add penalty": [60, 60],
  "Send for Credit Collection": [150, 400],
  Payment: [1, 60],
};

type Trace = { activity: string; ms: number }[];

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
  return Array.from({ length: cases }, () => {
    const acts = pick();
    let t = Date.UTC(2022, 0, 3) + Math.floor(rand() * 365) * DAY;
    return acts.map((activity, i) => {
      const [lo, hi] = WAIT[activity] ?? [5, 45];
      if (i > 0) t += Math.round((lo + rand() * (hi - lo)) * DAY);
      return { activity, ms: t };
    });
  });
}

const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

/** The prefix tree as the engine computes it: prefixes of fewer than `minShare` of the cases are
 *  pruned, parents come before their children, the most frequent child first. */
function prefixTree(traces: Trace[], minShare: number, maxDepth = 20): PrefixTree {
  type Building = {
    activity: string;
    children: Map<string, number>;
    cases: number;
    ending: number;
    remaining: number[];
    elapsed: number[];
  };
  const nodes: Building[] = [
    { activity: "", children: new Map(), cases: 0, ending: 0, remaining: [], elapsed: [] },
  ];
  const min_cases = Math.max(1, Math.ceil(traces.length * minShare));
  for (const trace of traces) {
    const first = trace[0]?.ms ?? 0;
    const last = trace[trace.length - 1]?.ms ?? 0;
    let at = 0;
    nodes[0].cases++;
    for (const e of trace.slice(0, maxDepth)) {
      let c = nodes[at].children.get(e.activity);
      if (c === undefined) {
        c =
          nodes.push({
            activity: e.activity,
            children: new Map(),
            cases: 0,
            ending: 0,
            remaining: [],
            elapsed: [],
          }) - 1;
        nodes[at].children.set(e.activity, c);
      }
      at = c;
      nodes[at].cases++;
      nodes[at].remaining.push(last - e.ms);
      nodes[at].elapsed.push(e.ms - first);
    }
    if (trace.length <= maxDepth) nodes[at].ending++;
  }
  const out: PrefixNode[] = [];
  const stack: [number, number | null, number][] = [[0, null, 0]];
  while (stack.length) {
    const [i, parent, depth] = stack.pop() as [number, number | null, number];
    const n = nodes[i];
    const children = [...n.children.values()].sort(
      (a, b) => nodes[b].cases - nodes[a].cases || nodes[a].activity.localeCompare(nodes[b].activity),
    );
    const kept = children.filter((c) => nodes[c].cases >= min_cases);
    out.push({
      parent,
      activity: n.activity,
      depth,
      cases: n.cases,
      ending: n.ending,
      median_remaining_ms: median(n.remaining),
      median_elapsed_ms: median(n.elapsed),
      pruned_cases: children
        .filter((c) => nodes[c].cases < min_cases)
        .reduce((s, c) => s + nodes[c].cases, 0),
    });
    const me = out.length - 1;
    for (const c of kept.reverse()) stack.push([c, me, depth + 1]);
  }
  return { nodes: out, max_depth: maxDepth, min_cases };
}

const TRACES = fines(1_200, 11);

/** Every fine as a path through shared prefixes, colored by the time left until the case ends. The slider hides rare prefixes. */
export const Default: StoryObj = {
  name: "Prefix Tree",
  render: function Tree() {
    const [controls, setControls] = useState<PrefixTreeControls>(DEFAULT_PREFIX_TREE_CONTROLS);
    const data = useMemo(() => prefixTree(TRACES, controls.minShare), [controls.minShare]);
    return <PrefixTreeView data={data} controls={controls} onControlsChange={setControls} />;
  },
};

/** Without `onControlsChange`, the toolbar states the pruning threshold instead of a slider. */
export const FixedThreshold: StoryObj = {
  name: "Fixed threshold",
  render: () => <PrefixTreeView data={prefixTree(TRACES, 0.02)} />,
};

/** A small log of eight fines with no pruning, where single cases show as their own paths. */
export const SmallLog: StoryObj = {
  name: "Small log",
  parameters: { frame: { mode: "canvas", height: 480 } },
  render: () => <PrefixTreeView data={prefixTree(fines(8, 3), 0)} />,
};

/** A log without events: only the root, so the view says there is nothing to show. */
export const Empty: StoryObj = {
  name: "Empty",
  parameters: { frame: { mode: "canvas", height: 240 } },
  render: () => <PrefixTreeView data={prefixTree([], 0.005)} />,
};
