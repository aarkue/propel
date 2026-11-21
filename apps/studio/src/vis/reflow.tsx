import type { ReflowOptions, ReflowResultHandle, SlimLinkedOCELHandle } from "@r4pm/client";
import {
  DEFAULT_REFLOW_CONTROLS,
  type ReflowControls,
  type ReflowMapping,
  type ReflowSummary,
  ReflowView,
  type ViewerProps,
} from "@r4pm/components";
import { Button } from "@r4pm/components/ui";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { PiArrowsSplit } from "react-icons/pi";
import { backend } from "../backends";
import { uniqueDatasetLabel, useDatasets } from "../stores";
import { saveArtifact } from "./components/save-artifact";
import { defineResolvedVis } from "./define-vis";

const DISCOVER = "process_mining::reflow" as const;
const CELLS = "process_mining::reflow_cells" as const;
const FLOW_LOG = "process_mining::reflow_flow_log" as const;
const WITH_FLOW = "process_mining::reflow_with_flow_layer" as const;

type Options = ReflowOptions;

interface Data {
  summary: ReflowSummary;
  ocel: SlimLinkedOCELHandle;
  options: Options;
  flow: [string, string][] | null;
  /** The flowing cells of the search result, as `activity\nobjectType` keys. */
  searchFlow: string[];
}

/** Which options the one kept result of each log was computed with. */
const kept = new Map<string, string>();
/** The run in flight per log: runs on one log wait for each other, as two do not fit in memory. */
const running = new Map<string, Promise<unknown>>();

/** Runs Reflow on `ocel` into its one named result, freeing the previous result first: on a large
 *  log the old result and the new run do not fit in memory together. */
async function runReflow(ocel: SlimLinkedOCELHandle, options: Options, job?: object) {
  await running.get(ocel)?.catch(() => {});
  const run = (async () => {
    const name = `reflow:${ocel}`;
    kept.delete(ocel);
    await backend.unloadObject(name).catch(() => {});
    const result = await backend.callBinding(DISCOVER, { ocel, options }, { ...job, outputName: name });
    kept.set(ocel, JSON.stringify(options));
    return result as ReflowResultHandle;
  })();
  running.set(ocel, run);
  try {
    return await run;
  } finally {
    if (running.get(ocel) === run) running.delete(ocel);
  }
}

/** The kept search result of `ocel` for `options`, run again if the kept one is for others, e.g.,
 *  from a cached view or another Reflow panel. */
async function searchResult(ocel: SlimLinkedOCELHandle, options: Options, job?: object) {
  await running.get(ocel)?.catch(() => {});
  return kept.get(ocel) === JSON.stringify(options)
    ? (`reflow:${ocel}` as unknown as ReflowResultHandle)
    : runReflow(ocel, options, job);
}

/** The search result under the edited flow layer `flow`, as one named result per log. */
async function editedResult(ocel: SlimLinkedOCELHandle, base: ReflowResultHandle, flow: [string, string][]) {
  const name = `reflow-edit:${ocel}`;
  await backend.unloadObject(name).catch(() => {});
  return (await backend.callBinding(
    WITH_FLOW,
    { result: base, flow: flow.map(([activity, objectType]) => ({ activity, objectType })) },
    { outputName: name },
  )) as ReflowResultHandle;
}

/** The flow log of `data` as a new dataset, and its mapping as an artifact. */
async function makeFlowLog({ summary, ocel, options, flow: edited }: Data) {
  const base = await searchResult(ocel, options);
  const result = edited ? await editedResult(ocel, base, edited) : base;
  const flow = await backend.callBinding(FLOW_LOG, { ocel, result });
  const source = useDatasets.getState().datasets.find((d) => d.id === ocel)?.label ?? ocel;
  const label = uniqueDatasetLabel(`${source} · flow`);
  useDatasets.getState().addDataset({ id: flow, kind: "SlimLinkedOCEL", label });
  const mapping: ReflowMapping = { version: 1, source, flowLog: flow, summary };
  await saveArtifact(
    `${source} · reflow`,
    `${source} · reflow`,
    "ReflowMapping",
    new TextEncoder().encode(JSON.stringify(mapping)),
    ".reflow",
  );
  return label;
}

function MakeFlowLog({ data }: { data: Data }) {
  const make = useMutation({
    mutationFn: () => makeFlowLog(data),
    onSuccess: (label) => toast.success(`Created ${label} and its Reflow mapping`),
    onError: (e) => toast.error(`Could not create the flow log: ${String(e)}`),
  });
  return (
    <Button size="2" onClick={() => make.mutate()} loading={make.isPending}>
      Create flow log
    </Button>
  );
}

export const vis = defineResolvedVis({
  type: "reflow",
  name: "Reflow",
  description:
    "Finds the object relations that carry the flow and builds a smaller log from them, with a mapping back to the full one.",
  category: "ocel",
  icon: PiArrowsSplit,
  supports: ["SlimLinkedOCEL"],
  keywords: ["reflow", "flow", "reduce", "simplify", "schema", "master data", "participations", "arcs"],
  order: 18,
  controls: { initial: DEFAULT_REFLOW_CONTROLS as ReflowControls },
  source: {
    needs: "SlimLinkedOCEL",
    resolve: async (ctx, c): Promise<Data> => {
      const ocel = ctx.datasetId as SlimLinkedOCELHandle;
      const options: Options = { theta: c.theta, search: c.search, expand: c.expand };
      // One named, hidden result per log: a rerun replaces it instead of piling up handles. An
      // edit of the flow layer reuses it, so it does not search again.
      const base = await searchResult(ocel, options, ctx.job);
      const searched = (await ctx.backend.callBinding(CELLS, { result: base })) as ReflowSummary;
      const searchFlow = searched.cells
        .filter((cell) => cell.state === "flow")
        .map((cell) => `${cell.activity}\n${cell.objectType}`);
      const flow = c.flow ?? null;
      if (!flow) return { summary: searched, ocel, options, flow, searchFlow };
      const result = await editedResult(ocel, base, flow);
      const summary = (await ctx.backend.callBinding(CELLS, { result })) as ReflowSummary;
      return { summary, ocel, options, flow, searchFlow };
    },
  },
  viewer: false,
  component: ({
    data,
    controls,
    onControlsChange,
    ...config
  }: ViewerProps<Data> & { controls: ReflowControls; onControlsChange?: (c: ReflowControls) => void }) => (
    <ReflowView
      data={data.summary}
      controls={controls}
      onControlsChange={onControlsChange}
      searchFlow={data.searchFlow}
      toolbarEnd={<MakeFlowLog data={data} />}
      {...config}
    />
  ),
});
