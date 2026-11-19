import { normalizePetriNet, transitionNodeId } from "@r4pm/components";
import type {
  AlignmentAggregate,
  AlignmentMove,
  LogAlignments,
  PetriNet,
  VariantAlignmentResult,
} from "@r4pm/components";
import type { AcceptingPetriNetHandle, EventLogHandle, ReturnTypeShape } from "@r4pm/client";
import { backend } from "../backends";
import { getModelValue } from "../models";
import { useDatasets } from "../stores";
import { PETRI_NET_SOURCES } from "./components/DiscoverModelButton";
import { SavedModelPicker } from "./components/SavedModelPicker";
import type { VisCtx } from "./define-vis";

// Shared model-selection + alignment source for the alignment-net / alignment-list / conformance
// vizzes. `_`-prefixed so the vis registry glob skips it (it exports no `vis`).

const ALIGN_EVENT_LOG = "app_bindings::align_event_log" as const;
const NET_KIND = "AcceptingPetriNet";

export type ModelSource = { type: "net"; id: string };

/** Older saved panels hold `null` (auto Alpha+++) or `{ type: "log" }`. Both read as no model. */
export function netId(model: unknown): string | null {
  const m = model as { type?: unknown; id?: unknown } | null;
  return m?.type === "net" && typeof m.id === "string" ? m.id : null;
}

export function useMissingModel(model: ModelSource | null): string | null {
  const id = netId(model);
  const loaded = useDatasets((s) => !!id && s.datasets.some((d) => d.id === id && d.kind === NET_KIND));
  return loaded ? null : "Pick a saved Petri net to align against";
}

type RawMove = ReturnTypeShape["LogAlignments"]["variant_alignments"][number] extends {
  result: infer R;
}
  ? R extends { Ok: { moves: (infer M)[] } }
    ? M
    : never
  : never;

/** rust4pm addresses transitions by index. The components' net uses `transitionNodeId` ids. */
function toFrontendMove(move: RawMove): AlignmentMove {
  if ("SyncMove" in move)
    return {
      SyncMove: {
        transition: transitionNodeId(move.SyncMove.transition),
        trace_event_index: move.SyncMove.trace_event_index,
      },
    };
  if ("ModelMove" in move) return { ModelMove: { transition: transitionNodeId(move.ModelMove.transition) } };
  return move;
}

/** Raw `align_event_log` payload (index-addressed net) -> the components' view-model (array net
 *  with string ids). */
export function toFrontendAlignments(raw: ReturnTypeShape["LogAlignments"]): LogAlignments {
  return {
    ...raw,
    net: normalizePetriNet(raw.net),
    variant_alignments: raw.variant_alignments.map((va) => ({
      ...va,
      result:
        "Ok" in va.result
          ? { Ok: { ...va.result.Ok, moves: va.result.Ok.moves.map(toFrontendMove) } }
          : va.result,
    })),
    aggregated: {
      ...raw.aggregated,
      transition_stats: Object.fromEntries(
        Object.entries(raw.aggregated.transition_stats).map(([index, stats]) => [
          transitionNodeId(Number(index)),
          stats,
        ]),
      ),
    },
  };
}

type RawVariant = ReturnTypeShape["LogAlignments"]["variant_alignments"][number];

const frontendVariant = (va: RawVariant): VariantAlignmentResult => ({
  ...va,
  result:
    "Ok" in va.result
      ? { Ok: { ...va.result.Ok, moves: va.result.Ok.moves.map(toFrontendMove) } }
      : va.result,
});

/** The firing counts of `variants`, as `align_event_log` aggregates them. */
export function aggregateAlignments(variants: VariantAlignmentResult[]): AlignmentAggregate {
  const transition_stats: AlignmentAggregate["transition_stats"] = {};
  const log_move_counts: Record<string, number> = {};
  let total_traces = 0;
  for (const va of variants) {
    total_traces += va.frequency;
    if (!("Ok" in va.result)) continue;
    for (const m of va.result.Ok.moves) {
      if ("LogMove" in m) {
        const act = va.activities[m.LogMove.trace_event_index];
        if (act !== undefined) log_move_counts[act] = (log_move_counts[act] ?? 0) + va.frequency;
        continue;
      }
      const t = "SyncMove" in m ? m.SyncMove.transition : m.ModelMove.transition;
      const stats = transition_stats[t] ?? { sync_fires: 0, model_fires: 0 };
      transition_stats[t] = stats;
      if ("SyncMove" in m) stats.sync_fires += va.frequency;
      else stats.model_fires += va.frequency;
    }
  }
  return { transition_stats, log_move_counts, total_traces };
}

export async function alignmentResolve(ctx: VisCtx, model: ModelSource | null): Promise<LogAlignments> {
  const id = netId(model);
  if (!id) throw new Error("No Petri net selected.");
  // Aligned variants stream in by index; the net is fetched alongside to draw them before the end.
  const done = new Map<number, VariantAlignmentResult>();
  let net: PetriNet | undefined;
  const show = () => {
    if (!net || done.size === 0 || !ctx.showPartial) return;
    const variants = [...done.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    ctx.showPartial({ net, variant_alignments: variants, aggregated: aggregateAlignments(variants) });
  };
  if (ctx.showPartial) {
    getModelValue(id)
      .then((value) => {
        net = normalizePetriNet(value as ReturnTypeShape["LogAlignments"]["net"]);
        show();
      })
      .catch(() => {});
  }
  // Several panels align the same log and net at once; they share one run.
  const key = `${ctx.datasetId}\n${id}`;
  let run = inflight.get(key);
  if (!run) {
    run = backend
      .callBinding(
        ALIGN_EVENT_LOG,
        { event_log: ctx.datasetId as EventLogHandle, net: id as AcceptingPetriNetHandle },
        {
          ...ctx.job,
          onPartial: (values) => {
            for (const v of values as { variant: number; result: RawVariant }[])
              done.set(v.variant, frontendVariant(v.result));
            show();
          },
        },
      )
      .finally(() => inflight.delete(key));
    inflight.set(key, run);
  }
  return toFrontendAlignments(await run);
}

const inflight = new Map<string, Promise<ReturnTypeShape["LogAlignments"]>>();

/** Lists saved Petri nets. Discovery lives in the Petri Net panel. */
export function AlignmentModelBar({
  value,
  onChange,
  datasetId,
  label = "Align against",
}: {
  value: ModelSource | null;
  onChange: (v: ModelSource | null) => void;
  datasetId: string;
  label?: string;
}) {
  return (
    <SavedModelPicker
      kind={NET_KIND}
      value={netId(value)}
      onChange={(id) => onChange({ type: "net", id })}
      datasetId={datasetId}
      label={label}
      empty="No saved Petri net yet."
      discover={{ label: "Make a net", sources: PETRI_NET_SOURCES }}
    />
  );
}
