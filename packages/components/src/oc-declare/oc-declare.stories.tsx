import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import { useState } from "react";
import { OCDeclareViewer, OCDeclareViz } from "@r4pm/components";
import type { DeclareFlowModel, OCDeclareArc } from "@r4pm/components";

// A few object-centric DECLARE constraints (temporal arcs between activities).
const sample: OCDeclareArc[] = [
  {
    arc_type: "EF",
    counts: [1, null],
    from: "place order",
    to: "ship",
    label: {
      all: [{ type: "Simple", object_type: "item" }],
      any: [],
      each: [{ type: "Simple", object_type: "order" }],
    },
  },
  {
    arc_type: "DF",
    counts: [1, 1],
    from: "ship",
    to: "invoice",
    label: {
      all: [{ type: "Simple", object_type: "item" }],
      any: [{ type: "Simple", object_type: "worker" }],
      each: [{ type: "Simple", object_type: "order" }],
    },
  },
  {
    arc_type: "EP",
    counts: [0, 1],
    from: "invoice",
    to: "pay",
    label: {
      all: [{ type: "Simple", object_type: "item" }],
      any: [],
      each: [{ type: "Simple", object_type: "order" }],
    },
  },
];

const meta = {
  title: "Viewers/OC-DECLARE",
  component: OCDeclareViewer,
  parameters: { frame: { mode: "canvas", height: 420 }, docs: { story: { inline: true } } },
} satisfies Meta<typeof OCDeclareViewer>;
export default meta;

export const Default: StoryObj = {
  name: "Behavioral constraints",
  render: () => (
    <OCDeclareViewer
      data={sample}
      activityInvolvements={{
        "place order": { order: { min: 1, max: 1 }, item: { min: 1, max: 8 } },
        ship: { order: { min: 0, max: 1 }, item: { min: 0, max: 5 } },
        invoice: { order: { min: 1, max: 1 } },
      }}
    />
  ),
};

const seedModel: DeclareFlowModel = {
  nodes: [
    { id: "n1", type: "place order", kind: "activity" },
    { id: "n2", type: "ship", kind: "activity" },
    { id: "n3", type: "order", kind: "init" },
  ],
  edges: [
    {
      id: "e1",
      source: "n1",
      target: "n2",
      template: "ef",
      label: {
        each: [{ type: "Simple", object_type: "order" }],
        any: [],
        all: [{ type: "Simple", object_type: "item" }],
      },
    },
    {
      id: "e2",
      source: "n3",
      target: "n1",
      template: "as",
      label: { each: [], any: [{ type: "Simple", object_type: "order" }], all: [] },
    },
  ],
};

// Deterministic pseudo-random sample (no Math.random so the story renders stably).
const sampleInts = (n: number, seed: number, mod: number) =>
  Array.from({ length: n }, (_, i) => 1 + ((i * 7 + seed * 13) % mod));

// Stubbed backend callbacks so the Editable story exercises stats / evaluate / discover / export.
const stubs = {
  relatedTypes: (activity: string): Record<string, number> =>
    activity === "place order" ? { order: 5, item: 3 } : { order: 4, item: 2, worker: 1 },
  onActivityStatistics: async (_activity: string) => ({
    num_evs_per_ot_type: { order: sampleInts(40, 1, 4), item: sampleInts(40, 3, 6) },
    num_obs_of_ot_per_ev: { order: sampleInts(40, 2, 3), item: sampleInts(40, 5, 5) },
  }),
  onEdgeStatistics: async (_arc: OCDeclareArc) => ({
    bin_centers_ms: [30 * 60_000, 90 * 60_000, 150 * 60_000, 210 * 60_000],
    percentages: [40, 30, 20, 10],
    bin_labels: ["[0, 3600000)", "[3600000, 7200000)", "[7200000, 10800000)", "[10800000, 14400000)"],
    min_ms: 0,
    max_ms: 14_400_000,
  }),
  onEvaluate: async (arcs: OCDeclareArc[]) => arcs.map((_, i) => (i % 3) / 3),
  onTemplateString: async (arcs: OCDeclareArc[]) =>
    arcs.map((a) => `${a.from} -${a.arc_type}-> ${a.to}`).join("\n"),
  onDiscover: async (): Promise<OCDeclareArc[]> => [
    {
      arc_type: "DF",
      counts: [1, 1],
      from: "ship",
      to: "invoice",
      label: { each: [{ type: "Simple", object_type: "order" }], any: [], all: [] },
    },
  ],
};

export const Editor: StoryObj = {
  name: "Editable",
  parameters: {
    frame: { mode: "canvas", height: 620 },
    docs: { story: { iframeHeight: 660, inline: false } },
  },
  render: () => {
    const [model, setModel] = useState(seedModel);
    return (
      <div style={{ width: "100%", height: 600 }}>
        <OCDeclareViz
          editable
          value={model}
          onChange={setModel}
          eventTypes={["place order", "ship", "invoice", "pay"]}
          objectTypes={["order", "item", "worker"]}
          activityInvolvements={{
            "place order": { order: { min: 1, max: 1 }, item: { min: 1, max: 8 } },
            ship: { order: { min: 0, max: 1 }, worker: { min: 0, max: 3 } },
          }}
          relatedTypes={stubs.relatedTypes}
          onActivityStatistics={stubs.onActivityStatistics}
          onEdgeStatistics={stubs.onEdgeStatistics}
          onEvaluate={stubs.onEvaluate}
          onTemplateString={stubs.onTemplateString}
          onDiscover={stubs.onDiscover}
        />
      </div>
    );
  },
};
