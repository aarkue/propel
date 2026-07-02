import { useEffect } from "react";
import { DatasetSelector, normalizePetriNet } from "@r4pm/components";
import type { LogAlignments } from "@r4pm/components";
import { Flex, Text } from "@r4pm/components/ui";
import type { EventLogHandle, PetriNet, ReturnTypeShape } from "@r4pm/client";
import { backend } from "../backends";
import { useArtifacts, useDatasets } from "../stores";
import type { VisCtx } from "./define-vis";

// Shared model-selection + alignment source for the alignment-net / alignment-list / conformance
// vizzes. `_`-prefixed so the vis registry glob skips it (it exports no `vis`).

const DISCOVER_PETRI = "app_bindings::discover_petri_net" as const;
const ALIGN_EVENT_LOG = "app_bindings::alignments::align_event_log" as const;

/** Model to align against: a loaded PetriNet artifact, or a log to discover Alpha+++ from. */
export type ModelSource = { type: "net"; id: string } | { type: "log"; id: string };

/** Raw `align_event_log` payload (id-keyed net maps) -> the components' view-model (array net).
 *  Used by the panel resolve and as the pipeline viewer adapter. */
export function toFrontendAlignments(raw: ReturnTypeShape["LogAlignments"]): LogAlignments {
  return { ...raw, net: normalizePetriNet(raw.net) };
}

/** Align the selected log against the chosen model. `null` model = Alpha+++ from the selected log. */
export async function alignmentResolve(ctx: VisCtx, model: ModelSource | null): Promise<LogAlignments> {
  const m = model ?? { type: "log", id: ctx.datasetId };
  const net: PetriNet =
    m.type === "net"
      ? ((await backend.getArtifact(m.id)) as PetriNet)
      : await backend.callBinding(DISCOVER_PETRI, { event_log: m.id as EventLogHandle });
  const result = await backend.callBinding(ALIGN_EVENT_LOG, {
    event_log: ctx.datasetId as EventLogHandle,
    net,
  });
  return toFrontendAlignments(result);
}

/** Store-coupled override bar. `null` means "Alpha+++ from the selected log" (the resolve default). */
export function AlignmentModelBar({
  value,
  onChange,
}: {
  value: ModelSource | null;
  onChange: (v: ModelSource | null) => void;
}) {
  const datasets = useDatasets((s) => s.datasets);
  const petriNets = useArtifacts((s) => s.artifacts).filter((a) => a.kind === "PetriNet");
  const logs = datasets.filter((d) => d.kind === "EventLog");

  // Default to the newest uploaded net if one exists at mount; otherwise stay on auto-discovery.
  // Mount-only so a later user pick of "Auto-discover" (null) is never hijacked back to a net.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seed the default once at mount only
  useEffect(() => {
    if (value === null && petriNets.length > 0) {
      onChange({ type: "net", id: petriNets[petriNets.length - 1].id });
    }
  }, []);

  // `null` = auto-discover (Alpha+++) from the selected log; a first-class, explicitly-shown option
  // so the displayed selection always matches what actually gets computed.
  const options = [
    { id: "auto", label: "Auto-discover (Alpha+++)", kind: "" },
    ...petriNets.map((n) => ({ id: `net:${n.id}`, label: n.label, kind: "PetriNet" })),
    ...logs.map((l) => ({ id: `log:${l.id}`, label: `${l.label} (Alpha+++)`, kind: "EventLog" })),
  ];
  const encoded = value ? `${value.type}:${value.id}` : "auto";

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
      <div style={{ width: 220 }}>
        <DatasetSelector
          datasets={options}
          value={encoded}
          onChange={(e) =>
            onChange(
              e.startsWith("net:")
                ? { type: "net", id: e.slice(4) }
                : e.startsWith("log:")
                  ? { type: "log", id: e.slice(4) }
                  : null,
            )
          }
          searchable
        />
      </div>
    </Flex>
  );
}
