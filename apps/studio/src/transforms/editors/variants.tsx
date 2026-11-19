import type { BackendContext, EventLogHandle, KeepOrRemove, TraceVariants, Transform } from "@r4pm/client";
import { LogVariants } from "@r4pm/components";
import { Button, Callout, Flex, SegmentedControl, Text } from "@r4pm/components/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PiFunnel } from "react-icons/pi";

const VARIANT_KEY_SEP = "";
const variantKey = (labels: string[]) => labels.join(VARIANT_KEY_SEP);

export function FilterVariantsEditor({
  transform,
  onChange,
  objectType,
  backend,
  datasetName,
  enabledPrefix,
  totalTraces,
  totalEvents,
}: {
  transform: Extract<Transform, { type: "FilterVariants" }>;
  onChange: (t: Transform) => void;
  objectType: "EventLog" | "OCEL";
  backend: BackendContext;
  datasetName: string;
  enabledPrefix: Transform[];
  totalTraces?: number;
  totalEvents?: number;
}) {
  const variantsQuery = useQuery<TraceVariants>({
    queryKey: [datasetName, "filter-variants-list"],
    queryFn: () =>
      backend.callBinding("app_bindings::get_log_trace_variants", {
        event_log: datasetName as EventLogHandle,
      }) as Promise<TraceVariants>,
    enabled: !!datasetName && objectType === "EventLog",
  });

  // Upstream event/trace filters re-form variants, which set-math can't derive; on demand, apply the
  // enabled prefix to a hidden temp handle, read its variants, and unload the handle.
  const hasUpstream = enabledPrefix.length > 0 && objectType === "EventLog";
  const [useFiltered, setUseFiltered] = useState(false);
  const showFiltered = useFiltered && hasUpstream;
  const prefixSig = JSON.stringify(enabledPrefix);
  const filteredQuery = useQuery<TraceVariants>({
    queryKey: [datasetName, "filter-variants-filtered", prefixSig],
    enabled: showFiltered && !!datasetName,
    queryFn: async () => {
      const handle = (await backend.callBinding(
        "app_bindings::apply_event_log_transforms",
        { event_log: datasetName as EventLogHandle, transforms: enabledPrefix },
        { outputName: `variant-preview-${datasetName}` },
      )) as string;
      try {
        return (await backend.callBinding("app_bindings::get_log_trace_variants", {
          event_log: handle as EventLogHandle,
        })) as TraceVariants;
      } finally {
        await backend.unloadObject(handle).catch(() => {});
      }
    },
  });

  const activeQuery = showFiltered ? filteredQuery : variantsQuery;
  const data = activeQuery.data;

  // The transform stores activity-label sequences; LogVariants speaks variant
  // indices. These two maps bridge the gap in both directions.
  const { labelsOf, indexByKey } = useMemo(() => {
    const indexByKey = new Map<string, number>();
    const labelsOf = (i: number): string[] =>
      (data?.traces[i]?.[0] ?? []).map((j) => data?.activities[j] ?? "UNKNOWN");
    data?.traces.forEach(([indices], i) => {
      indexByKey.set(indices.map((j) => data.activities[j] ?? "UNKNOWN").join(VARIANT_KEY_SEP), i);
    });
    return { labelsOf, indexByKey };
  }, [data]);

  // Seed LogVariants' selection from the persisted transform (mount-time only;
  // LogVariants owns selection after that, and we remount it via `key`).
  const initialSelected = useMemo(
    () => transform.variants.map((v) => indexByKey.get(variantKey(v))).filter((i): i is number => i != null),
    [indexByKey, transform.variants],
  );

  return (
    <Flex direction="column" gap="3">
      <Flex align="center" gap="3">
        <Text size="2" weight="medium">
          Mode
        </Text>
        <SegmentedControl.Root
          size="1"
          value={transform.mode}
          onValueChange={(v) => onChange({ ...transform, mode: v as KeepOrRemove })}
        >
          <SegmentedControl.Item value="Keep">Keep</SegmentedControl.Item>
          <SegmentedControl.Item value="Remove">Remove</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
      <Text size="2" color="gray">
        {transform.variants.length === 0
          ? "No variants selected."
          : `${transform.mode === "Keep" ? "Keeping" : "Removing"} traces matching ${transform.variants.length} variant${transform.variants.length === 1 ? "" : "s"}.`}
      </Text>

      {hasUpstream && (
        <Callout.Root size="1" color={showFiltered ? "violet" : "amber"}>
          <Callout.Icon>
            <PiFunnel />
          </Callout.Icon>
          <Callout.Text>
            <Flex align="center" justify="between" gap="3" wrap="wrap">
              <span>
                {showFiltered
                  ? `Variants of the log after ${enabledPrefix.length} upstream step${enabledPrefix.length === 1 ? "" : "s"}.`
                  : `Variants of the full log. The ${enabledPrefix.length} upstream step${enabledPrefix.length === 1 ? "" : "s"} above ${enabledPrefix.length === 1 ? "is" : "are"} not applied here.`}
              </span>
              <Button
                size="1"
                variant={showFiltered ? "soft" : "solid"}
                color="violet"
                disabled={filteredQuery.isFetching}
                onClick={() => setUseFiltered((v) => !v)}
              >
                {filteredQuery.isFetching
                  ? "Computing…"
                  : showFiltered
                    ? "Show full log"
                    : "Recompute for filtered log"}
              </Button>
            </Flex>
          </Callout.Text>
        </Callout.Root>
      )}

      {objectType !== "EventLog" ? (
        <Text size="1" color="gray">
          Variant filtering applies to event logs only.
        </Text>
      ) : activeQuery.isLoading ? (
        <Text size="1" color="gray">
          Loading variants…
        </Text>
      ) : activeQuery.error ? (
        <Text size="1" color="red">
          {String(activeQuery.error)}
        </Text>
      ) : data ? (
        <div className="w-full" style={{ height: 520 }}>
          <LogVariants
            key={showFiltered ? `filtered-${prefixSig}` : datasetName}
            variants={data}
            numTraces={totalTraces ?? 0}
            numEvents={totalEvents ?? 0}
            initialSelectedVariantIndices={initialSelected}
            onSelectionChange={({ variantIndices }) => {
              const next = variantIndices.map(labelsOf);
              // Skip no-op writes (e.g. the mount-time emission re-deriving the
              // seeded selection) so merely opening the step doesn't dirty it.
              const a = new Set(next.map(variantKey));
              const b = new Set(transform.variants.map(variantKey));
              if (a.size === b.size && [...a].every((k) => b.has(k))) return;
              onChange({ ...transform, variants: next });
            }}
          />
        </div>
      ) : null}
    </Flex>
  );
}
