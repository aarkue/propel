import type { IDockviewPanelProps } from "dockview";
import { lazy, Suspense, useState } from "react";
import { ErrorState, LoadingState } from "@r4pm/components";
import { Button, Card, Text } from "@r4pm/components/ui";
import { useQuery } from "@tanstack/react-query";
import type { BackendContext, ObjectAttributeChanges, SlimLinkedOCELHandle } from "@r4pm/client";
import { PiWaveSine } from "react-icons/pi";
import { definePanel } from "./define-vis";
import { withSelector, datasetEmptyBox } from "./_shared";
import { useDatasetSelection } from "../panels/active-datasets";
import { useDatasetScopedState } from "../panels/panel-state";
import { backend } from "../backends";

// Lazy: keep Plotly out of the initial bundle.
const ObjectAttributeChangesChart = lazy(() =>
  import("@r4pm/components/charts").then((m) => ({ default: m.ObjectAttributeChangesChart })),
);

const GET_OCEL_OBJECT_IDS = "app_bindings::ocel::get_ocel_object_ids" as const;
const GET_OBJECT_ATTRIBUTE_CHANGES =
  "process_mining::analysis::object_centric::object_attribute_changes::get_object_attribute_changes" as const;

export interface ObjectAttributeChangesPanelProps {
  backend: BackendContext;
  ocel: SlimLinkedOCELHandle;
  committedId: string;
  onCommit: (id: string) => void;
}

export function ObjectAttributeChangesPanel({
  backend,
  ocel,
  committedId,
  onCommit,
}: ObjectAttributeChangesPanelProps) {
  const objectIdsQuery = useQuery({
    queryKey: ["ocel-object-ids", ocel],
    queryFn: async () => {
      const ids = await backend.callBinding(GET_OCEL_OBJECT_IDS, { ocel });
      return Array.from(new Set(ids)).sort();
    },
  });

  // Ephemeral input; committedId drives the fetch and persists.
  const [objectID, setObjectID] = useState(committedId);
  const changesQuery = useQuery({
    queryKey: ["ocel-object-changes", ocel, committedId],
    queryFn: () =>
      backend.callBinding(GET_OBJECT_ATTRIBUTE_CHANGES, {
        ocel,
        object_id: committedId,
      }) as Promise<ObjectAttributeChanges>,
    enabled: !!committedId,
  });
  const listId = `object-ids-${ocel}`;

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 200, padding: 8 }}>
      <Card className="relative w-full" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <Text as="div" size="4" weight="bold" mb="2">
          Object Attribute Changes over Time
        </Text>
        <div className="grow flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
          {objectIdsQuery.error ? (
            <ErrorState error={objectIdsQuery.error} onRetry={() => objectIdsQuery.refetch()} />
          ) : !objectIdsQuery.data ? (
            <LoadingState label="loading object ids" />
          ) : (
            <>
              <datalist id={listId}>
                {objectIdsQuery.data.map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
              <div className="flex w-fit items-center">
                <input
                  placeholder="Object ID"
                  style={{
                    border: "1px solid var(--gray-7)",
                    background: "var(--color-surface)",
                    color: "var(--gray-12)",
                    borderRadius: "var(--radius-2)",
                    padding: 2,
                    margin: 4,
                  }}
                  value={objectID}
                  onChange={(ev) => setObjectID(ev.currentTarget.value)}
                  onKeyDown={(ev) => ev.key === "Enter" && onCommit(objectID)}
                  list={listId}
                />
                <Button onClick={() => onCommit(objectID)}>Go</Button>
              </div>
              <div className="grow" style={{ minHeight: 0 }}>
                {changesQuery.error && (
                  <ErrorState error={changesQuery.error} onRetry={() => changesQuery.refetch()} />
                )}
                {committedId && changesQuery.isPending && <LoadingState label="loading chart" />}
                {changesQuery.data && (
                  <Suspense fallback={<LoadingState label="loading chart" />}>
                    <ObjectAttributeChangesChart data={changesQuery.data} objectID={committedId} />
                  </Suspense>
                )}
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

export function ObjectChangesDockPanel(props: IDockviewPanelProps) {
  const { id: ocel, selector } = useDatasetSelection("SlimLinkedOCEL", props);
  const [committedId, setCommittedId] = useDatasetScopedState(props, "objectID", ocel ?? "", "");
  if (!ocel) return withSelector(selector, datasetEmptyBox("OCEL"), "object-changes");
  return withSelector(
    selector,
    <Suspense fallback={<LoadingState label="loading object changes" />}>
      <ObjectAttributeChangesPanel
        key={ocel}
        backend={backend}
        ocel={ocel as SlimLinkedOCELHandle}
        committedId={committedId}
        onCommit={setCommittedId}
      />
    </Suspense>,
    "object-changes",
  );
}

export const vis = definePanel({
  type: "objectChanges",
  name: "Object Changes",
  description: "An OCEL object's attribute values over time.",
  category: "ocel",
  icon: PiWaveSine,
  supports: ["SlimLinkedOCEL"],
  keywords: ["attributes", "history", "changes"],
  order: 16,
  component: ObjectChangesDockPanel,
});
