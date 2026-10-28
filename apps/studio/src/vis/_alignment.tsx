import { useEffect } from "react";
import { DatasetSelector, normalizePetriNet, transitionNodeId } from "@r4pm/components";
import type { AlignmentMove, LogAlignments } from "@r4pm/components";
import { Button, Flex, Text } from "@r4pm/components/ui";
import type { AcceptingPetriNet, EventLogHandle, ReturnTypeShape } from "@r4pm/client";
import { PiTreeStructure } from "react-icons/pi";
import { backend } from "../backends";
import { addPanelToDockview } from "../panels/registry";
import { useArtifacts } from "../stores";
import type { VisCtx } from "./define-vis";

// Shared model-selection + alignment source for the alignment-net / alignment-list / conformance
// vizzes. `_`-prefixed so the vis registry glob skips it (it exports no `vis`).

const ALIGN_EVENT_LOG = "app_bindings::alignments::align_event_log" as const;

export type ModelSource = { type: "net"; id: string };

/** Older saved panels hold `null` (auto Alpha+++) or `{ type: "log" }`. Both read as no model. */
function netId(model: unknown): string | null {
  const m = model as { type?: unknown; id?: unknown } | null;
  return m?.type === "net" && typeof m.id === "string" ? m.id : null;
}

export function useMissingModel(model: ModelSource | null): string | null {
  const id = netId(model);
  const loaded = useArtifacts((s) => !!id && s.artifacts.some((a) => a.id === id && a.kind === "PetriNet"));
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

export async function alignmentResolve(ctx: VisCtx, model: ModelSource | null): Promise<LogAlignments> {
  const id = netId(model);
  if (!id) throw new Error("No Petri net selected.");
  const net = (await backend.getArtifact(id)) as AcceptingPetriNet;
  const result = await backend.callBinding(ALIGN_EVENT_LOG, {
    event_log: ctx.datasetId as EventLogHandle,
    net,
  });
  return toFrontendAlignments(result);
}

/** Lists saved Petri nets. Discovery lives in the Petri Net panel. */
export function AlignmentModelBar({
  value,
  onChange,
  datasetId,
}: {
  value: ModelSource | null;
  onChange: (v: ModelSource | null) => void;
  datasetId: string;
}) {
  const petriNets = useArtifacts((s) => s.artifacts).filter((a) => a.kind === "PetriNet");
  const selected = netId(value);

  // Without a loaded pick, follow the newest saved net, also one saved after this panel opened.
  const newest = petriNets[petriNets.length - 1]?.id;
  const selectedLoaded = !!selected && petriNets.some((n) => n.id === selected);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-seed when the newest net changes
  useEffect(() => {
    if (!selectedLoaded && newest) onChange({ type: "net", id: newest });
  }, [newest]);

  return (
    <Flex
      align="center"
      gap="2"
      px="2"
      py="1"
      wrap="wrap"
      style={{ borderBottom: "1px solid var(--gray-5)" }}
    >
      <Text size="1" color="gray">
        Align against
      </Text>
      {petriNets.length > 0 ? (
        <div style={{ width: 220 }}>
          <DatasetSelector
            datasets={petriNets.map((n) => ({ id: n.id, label: n.label, kind: n.kind }))}
            value={selected}
            onChange={(id) => onChange({ type: "net", id })}
            searchable
          />
        </div>
      ) : (
        <Text size="1">No saved Petri nets yet. Discover one and click Save there.</Text>
      )}
      <Button
        size="1"
        variant="soft"
        onClick={() => addPanelToDockview("petriNet", undefined, { datasetId })}
        title="Open the Petri Net panel for this log"
      >
        <PiTreeStructure /> Discover a net
      </Button>
    </Flex>
  );
}
