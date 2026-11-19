import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { useMemo, useState } from "react";
import { PiDownloadSimple } from "react-icons/pi";
import {
  DEFAULT_REFLOW_CONTROLS,
  type ReflowCell,
  type ReflowControls,
  type ReflowSummary,
  ReflowView,
} from "@r4pm/components";
import { Button } from "@r4pm/components/ui";

const meta = {
  title: "Viewers/Reflow",
  component: ReflowView,
  parameters: { frame: { mode: "canvas", height: 720 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof ReflowView>;
export default meta;

type Via = NonNullable<ReflowCell["determinedBy"]>["reconstruction"]["via"];
const relation = (qualifier: string, reversed = false): Via => ({
  kind: "recorded",
  relations: [{ qualifier, reversed }],
});

/** A recorded participation: `[min, max]` objects of the type per event of the activity. */
const cell = (
  activity: string,
  objectType: string,
  participations: number,
  [minObjects, maxObjects]: [number, number],
  follows?: { from: string; via: Via; share: number },
): ReflowCell => ({
  activity,
  objectType,
  state: follows ? "implied" : "flow",
  recorded: true,
  participations,
  minObjects,
  maxObjects,
  determinedBy: follows
    ? { from: follows.from, reconstruction: { via: follows.via, share: follows.share } }
    : null,
});
const involved = (c: ReflowCell): ReflowCell => ({ ...c, state: "involved", determinedBy: null });

// Order management: orders, items and packages carry the flow, everything else follows or is involved.
const CELLS: ReflowCell[] = [
  cell("place order", "orders", 2000, [1, 1]),
  cell("place order", "items", 7659, [1, 10]),
  cell("place order", "customers", 2000, [1, 1], { from: "orders", via: relation("places", true), share: 1 }),
  cell("place order", "products", 6120, [1, 8], { from: "items", via: { kind: "image" }, share: 0.998 }),
  cell("confirm order", "orders", 1960, [1, 1]),
  involved(cell("confirm order", "employees", 1960, [1, 1])),
  cell("pay order", "orders", 1860, [1, 1]),
  cell("payment reminder", "orders", 545, [1, 1]),
  cell("item out of stock", "items", 610, [1, 1]),
  cell("reorder item", "items", 610, [1, 1]),
  cell("pick item", "items", 7580, [1, 1]),
  involved(cell("pick item", "employees", 7580, [1, 1])),
  cell("create package", "packages", 1325, [1, 1]),
  cell("create package", "items", 7512, [1, 12], {
    from: "packages",
    via: relation("contains"),
    share: 0.97,
  }),
  involved(cell("create package", "employees", 1325, [0, 1])),
  cell("send package", "packages", 1310, [1, 1]),
  cell("send package", "items", 7430, [1, 12], { from: "packages", via: relation("contains"), share: 0.97 }),
  involved(cell("send package", "employees", 1310, [1, 1])),
  cell("package delivered", "packages", 1285, [1, 1]),
  cell("package delivered", "items", 7290, [1, 12], {
    from: "packages",
    via: relation("contains"),
    share: 0.96,
  }),
];

/** Participations a relation determines that the log does not record, written when expanding. */
const ADDED: ReflowCell[] = [{ ...cell("package delivered", "orders", 1940, [1, 4]), recorded: false }];

/** The summary Reflow returns for these settings: an implied cell whose relation holds for fewer events than the threshold flows. */
function reflow(controls: ReflowControls, overrides: Partial<ReflowSummary["stats"]> = {}): ReflowSummary {
  const cells = [
    ...CELLS.map((c) =>
      c.state === "implied" && (c.determinedBy?.reconstruction.share ?? 1) < controls.theta
        ? { ...c, state: "flow" as const }
        : c,
    ),
    ...(controls.expand ? ADDED : []),
  ];
  const count = (s: ReflowCell["state"]) => cells.filter((c) => c.state === s).length;
  const extraArcs = cells
    .filter((c) => c.state === "flow" && c.determinedBy)
    .reduce((n, c) => n + Math.round(c.participations * 0.9), 0);
  return {
    activities: [...new Set(cells.map((c) => c.activity))],
    objectTypes: ["orders", "items", "packages", "customers", "employees", "products"],
    cells,
    stats: {
      facts: 48 + (controls.expand ? 3 : 0),
      flow: count("flow"),
      implied: count("implied"),
      involved: count("involved"),
      added: controls.expand ? ADDED.length : 0,
      arcsRecorded: 61_840,
      arcsFlow: 27_310 + extraArcs,
      seed: controls.search === "heuristic" ? "handoff" : "exact",
      repaired: controls.theta < 1 ? 2 : 0,
      work: controls.search === "heuristic" ? 1_240 : 48_210,
      limitReached: false,
      expansionCandidates: 3,
      ...overrides,
    },
  };
}

function ReflowDemo({ initial }: { initial: ReflowControls }) {
  const [controls, setControls] = useState(initial);
  const data = useMemo(() => reflow(controls), [controls]);
  return (
    <ReflowView
      data={data}
      controls={controls}
      onControlsChange={setControls}
      toolbarEnd={
        <Button size="1" variant="soft">
          <PiDownloadSimple /> Make flow log
        </Button>
      }
    />
  );
}

/** Order management at the default 95% threshold. Click a cell to see why it flows, follows or is only involved. */
export const Default: StoryObj = {
  name: "Order management",
  render: () => <ReflowDemo initial={DEFAULT_REFLOW_CONTROLS} />,
};

/** At 100%, relations that break for a few events no longer imply, so those cells flow and add arcs. */
export const StrictThreshold: StoryObj = {
  name: "Strict threshold",
  render: () => <ReflowDemo initial={{ ...DEFAULT_REFLOW_CONTROLS, theta: 1 }} />,
};

/** With unrecorded participations added: delivery joins the order's lifecycle, marked with a plus. */
export const Expanded: StoryObj = {
  name: "Unrecorded participations added",
  render: () => <ReflowDemo initial={{ ...DEFAULT_REFLOW_CONTROLS, expand: true }} />,
};

/** The exact search stopped at its work budget, so the result might not be the smallest. */
export const BudgetReached: StoryObj = {
  name: "Work budget reached",
  render: () => (
    <ReflowView
      data={reflow({ ...DEFAULT_REFLOW_CONTROLS, search: "exact" }, { limitReached: true, work: 200_000 })}
      controls={{ ...DEFAULT_REFLOW_CONTROLS, search: "exact" }}
    />
  ),
};

/** A mapping edited by hand has no search seed. Without controls the view shows no toolbar. */
export const EditedMapping: StoryObj = {
  name: "Edited mapping",
  render: () => <ReflowView data={reflow(DEFAULT_REFLOW_CONTROLS, { seed: null })} />,
};
