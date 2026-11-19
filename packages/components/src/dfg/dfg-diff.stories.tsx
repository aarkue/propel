import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { type ComparedArc, type DfgComparison, DfgDiffViewer } from "@r4pm/components";

const meta = {
  title: "Viewers/DFG Comparison",
  component: DfgDiffViewer,
  parameters: { frame: { mode: "canvas", height: 620 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof DfgDiffViewer>;
export default meta;

/** Counts per activity and per arc on each side, as the engine compares two logs. */
function compare(
  aLabel: string,
  a: [number, string[]][],
  bLabel: string,
  b: [number, string[]][],
): DfgComparison {
  const activities = new Map<string, { a: number; b: number }>();
  const arcs = new Map<string, ComparedArc>();
  const add = (side: "a" | "b", variants: [number, string[]][]) => {
    for (const [cases, acts] of variants) {
      const arc = (kind: ComparedArc["kind"], from: string, to: string) => {
        const key = `${kind}|${from}|${to}`;
        const c = arcs.get(key) ?? { kind, from, to, a: 0, b: 0 };
        c[side] += cases;
        arcs.set(key, c);
      };
      arc("start", "", acts[0]);
      arc("end", acts[acts.length - 1], "");
      for (let i = 1; i < acts.length; i++) arc("follows", acts[i - 1], acts[i]);
      for (const act of acts) {
        const c = activities.get(act) ?? { a: 0, b: 0 };
        c[side] += cases;
        activities.set(act, c);
      }
    }
  };
  add("a", a);
  add("b", b);
  const cases = (v: [number, string[]][]) => v.reduce((s, [n]) => s + n, 0);
  return {
    a_label: aLabel,
    b_label: bLabel,
    a_cases: cases(a),
    b_cases: cases(b),
    activities: [...activities].map(([activity, c]) => ({ activity, ...c })),
    arcs: [...arcs.values()],
  };
}

const CF = "Create Fine";
const SF = "Send Fine";
const IFN = "Insert Fine Notification";
const AP = "Add penalty";
const P = "Payment";
const SCC = "Send for Credit Collection";
const IDAP = "Insert Date Appeal to Prefecture";
const SAP = "Send Appeal to Prefecture";
const AJ = "Appeal to Judge";

// Fines of 2021 and 2022: in 2022 more offenders pay right away, fewer are sent to credit
// collection, and appeals to a judge start to appear.
const Y2021: [number, string[]][] = [
  [2_410, [CF, SF, IFN, AP, SCC]],
  [1_560, [CF, P]],
  [820, [CF, SF]],
  [470, [CF, SF, IFN, AP, P]],
  [160, [CF, SF, IFN, AP, P, P]],
  [140, [CF, SF, P]],
  [95, [CF, SF, IFN, P, AP, P]],
  [60, [CF, SF, IFN, IDAP, AP, SAP]],
];
const Y2022: [number, string[]][] = [
  [1_380, [CF, SF, IFN, AP, SCC]],
  [2_310, [CF, P]],
  [690, [CF, SF]],
  [520, [CF, SF, IFN, AP, P]],
  [90, [CF, SF, IFN, AP, P, P]],
  [210, [CF, SF, P]],
  [75, [CF, P, SF]],
  [55, [CF, SF, IFN, AP, AJ]],
];

/** Two years of a road traffic fine log on one layout: orange arcs are taken by a larger share of cases in B, blue by a smaller one. */
export const Default: StoryObj = {
  name: "DFG Comparison",
  render: () => <DfgDiffViewer data={compare("Fines of 2021", Y2021, "Fines of 2022", Y2022)} />,
};

/** Logs of different sizes compare by share of cases, with a caveat in `note`. */
export const WithNote: StoryObj = {
  name: "With a note",
  render: () => (
    <DfgDiffViewer
      data={compare(
        "Created before 2022-07-01",
        Y2021.map(([n, acts]): [number, string[]] => [Math.round(n * 2.4), acts]),
        "Created from 2022-07-01",
        Y2022,
      )}
      note="Cases created in the last months of 2022 may still be running, so their later steps are underrepresented."
    />
  ),
};

/** The same behavior on both sides: every arc keeps its share, so all labels read "=". */
export const NoChange: StoryObj = {
  name: "No change",
  render: () => (
    <DfgDiffViewer
      data={compare(
        "Region North",
        Y2021,
        "Region South",
        Y2021.map(([n, acts]): [number, string[]] => [n * 3, acts]),
      )}
    />
  ),
};

/** Two logs without events: no activities or arcs to compare. */
export const Empty: StoryObj = {
  name: "Empty",
  parameters: { frame: { mode: "canvas", height: 360 } },
  render: () => <DfgDiffViewer data={compare("Fines of 2021", [], "Fines of 2022", [])} />,
};
