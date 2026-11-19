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

type Options = ReflowOptions;

interface Data {
  summary: ReflowSummary;
  ocel: SlimLinkedOCELHandle;
  options: Options;
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

/** The flow log of `data` as a new dataset, and its mapping as an artifact. */
async function makeFlowLog({ summary, ocel, options }: Data) {
  await running.get(ocel)?.catch(() => {});
  // The kept result may come from other options: a cached view or another Reflow panel.
  const result =
    kept.get(ocel) === JSON.stringify(options)
      ? (`reflow:${ocel}` as unknown as ReflowResultHandle)
      : await runReflow(ocel, options);
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
      // One named, hidden result per log: a rerun replaces it instead of piling up handles.
      const result = await runReflow(ocel, options, ctx.job);
      const summary = (await ctx.backend.callBinding(CELLS, { result })) as ReflowSummary;
      return { summary, ocel, options };
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
      toolbarEnd={<MakeFlowLog data={data} />}
      {...config}
    />
  ),
});
