import type { IDockviewPanelProps } from "dockview";
import type { BackendContext, EventLogHandle, SlimLinkedOCELHandle } from "@r4pm/client";
import { Button, Callout, Flex, Heading, Select, Text } from "@r4pm/components/ui";
import { ErrorState, LoadingState } from "@r4pm/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PiShuffle } from "react-icons/pi";
import { withSelector, datasetEmptyBox } from "./_shared";
import { useDatasetSelection } from "../panels/active-datasets";
import { backend } from "../backends";
import { definePanel } from "./define-vis";
import { useDatasets } from "../stores";

const GET_OCEL_INFO = "app_bindings::ocel::get_ocel_info" as const;
const FLATTEN_OCEL_ON =
  "process_mining::core::event_data::object_centric::utils::flatten::flatten_ocel_on" as const;

export interface FlattenOCELPanelProps {
  backend: BackendContext;
  /** SlimLinkedOCEL handle (every OCEL binding now operates on this). */
  ocel: SlimLinkedOCELHandle;
  /** Called with the freshly produced event-log handle after a successful flatten. */
  onFlattened?: (result: { handle: EventLogHandle; label: string }) => void;
}

/**
 * Flatten an OCEL onto a chosen object type, producing a classic event log. The binding returns
 * a NEW EventLog *handle* (results that are registry objects are stored in the engine and their id
 * returned), so the flattened log immediately becomes a loaded object usable by every event-log
 * panel and by the pipeline.
 */
export function FlattenOCELPanel({ backend, ocel, onFlattened }: FlattenOCELPanelProps) {
  const queryClient = useQueryClient();
  const [objectType, setObjectType] = useState<string | undefined>();

  const infoQuery = useQuery({
    queryKey: ["ocel-info", ocel],
    queryFn: () => backend.callBinding(GET_OCEL_INFO, { ocel }),
  });

  const { datasets, addDataset } = useDatasets();
  const flatten = useMutation({
    mutationFn: async (ot: string) => {
      const handle = await backend.callBinding(FLATTEN_OCEL_ON, { ocel, object_type: ot });
      const prev_label = datasets.find((d) => d.id === ocel)?.label ?? ocel;
      const label = `${prev_label} ${objectType}` || handle;
      addDataset({ id: handle, kind: "EventLog", label });
      return { handle, label };
    },
    onSuccess: ({ handle, label }) => {
      queryClient.invalidateQueries({ queryKey: ["loaded-objects"] });
      onFlattened?.({ handle, label });
    },
  });

  const objectTypes = infoQuery.data?.object_types ?? [];

  return (
    <div style={{ width: "100%", height: "100%", overflow: "auto", padding: 16 }}>
      <Flex direction="column" gap="3" style={{ maxWidth: 480 }}>
        <Heading size="3">Flatten OCEL to event log</Heading>
        <Text size="2" color="gray">
          Pick an object type; the OCEL is flattened onto it, yielding a new event log (one case per object).
          The result is a handle, so the new log appears as a loaded object.
        </Text>

        {infoQuery.error ? (
          <ErrorState error={infoQuery.error} onRetry={() => infoQuery.refetch()} />
        ) : !infoQuery.data ? (
          <LoadingState label="loading types..." />
        ) : (
          <Flex gap="2" align="center">
            <Select.Root value={objectType} onValueChange={setObjectType} disabled={!objectTypes.length}>
              <Select.Trigger placeholder="Select object type" />
              <Select.Content>
                {objectTypes.map((ot) => (
                  <Select.Item key={ot} value={ot}>
                    {ot}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
            <Button
              disabled={!objectType || flatten.isPending}
              onClick={() => objectType && flatten.mutate(objectType)}
            >
              {flatten.isPending ? "Flattening..." : "Flatten"}
            </Button>
          </Flex>
        )}

        {flatten.isError && (
          <Callout.Root color="red" size="1">
            <Callout.Text>{String(flatten.error)}</Callout.Text>
          </Callout.Root>
        )}
        {flatten.isSuccess && (
          <Callout.Root color="green" size="1">
            <Callout.Text>
              Flattened on <strong>{flatten.variables}</strong>.
              <br />
              New event log: <code className="">{String(flatten.data.label)}</code>.
            </Callout.Text>
          </Callout.Root>
        )}
      </Flex>
    </div>
  );
}

/** Flatten the active OCEL onto an object type, producing a new chainable event-log handle. */
export function FlattenOcelDockPanel(_props: IDockviewPanelProps) {
  const { id: ocel, selector } = useDatasetSelection("SlimLinkedOCEL");
  if (!ocel) return withSelector(selector, datasetEmptyBox("OCEL"), "flatten-ocel");
  return withSelector(
    selector,
    <FlattenOCELPanel key={ocel} backend={backend} ocel={ocel as SlimLinkedOCELHandle} />,
    "flatten-ocel",
  );
}

export const vis = definePanel({
  type: "flattenOcel",
  name: "Flatten OCEL",
  description: "Flatten an OCEL onto an object type -> a new event log.",
  category: "ocel",
  tags: ["transforms"],
  icon: PiShuffle,
  supports: ["SlimLinkedOCEL"],
  keywords: ["flatten", "convert", "derive"],
  order: 17,
  component: FlattenOcelDockPanel,
});
