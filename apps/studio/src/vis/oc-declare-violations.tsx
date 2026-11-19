import { type OCDeclareArc as ClientArc, isCancelled, type SlimLinkedOCELHandle } from "@r4pm/client";
import {
  EmptyState,
  ErrorState,
  JobProgressCard,
  type OCDeclareArc,
  type ObjectLane,
  ViolationExplorer,
} from "@r4pm/components";
import { Button } from "@r4pm/components/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { IDockviewPanelProps } from "dockview";
import { useCallback, useState } from "react";
import { PiSealWarning } from "react-icons/pi";
import { backend } from "../backends";
import { useDatasetSelection } from "../panels/active-datasets";
import { usePanelState } from "../panels/panel-state";
import { addPanelToDockview } from "../panels/registry";
import { JOB_UNITS } from "../shell/job-units";
import { datasetEmptyBox, withSelector } from "./_shared";
import { useJobProgress } from "./components/use-job";
import { definePanel } from "./define-vis";

const VIOLATIONS = "app_bindings::oc_declare_violations" as const;
const EDGE_STATS = "app_bindings::oc_declare_edge_statistics" as const;
const LANES = "app_bindings::oc_declare_object_lanes" as const;

/** Params that open this panel on one constraint of an OCEL. */
export function violationPanelParams(ocel: string, arc: OCDeclareArc): Record<string, unknown> {
  return { datasetId: ocel, arc };
}

function Explorer({ ocel, arc }: { ocel: string; arc: OCDeclareArc }) {
  const handle = ocel as SlimLinkedOCELHandle;
  const clientArc = arc as unknown as ClientArc;
  const queryKey = ["oc-declare-violations", ocel, arc];
  const queryClient = useQueryClient();
  const jobs = useJobProgress();
  const [cancelled, setCancelled] = useState(false);
  const query = useQuery({
    queryKey,
    enabled: !cancelled,
    retry: false,
    queryFn: async ({ signal }) => {
      const hooks = jobs.start(signal);
      const [violations, edgeStats] = await Promise.all([
        backend.callBinding(VIOLATIONS, { ocel: handle, arc: clientArc }, hooks.job),
        backend.callBinding(EDGE_STATS, { ocel: handle, arc: clientArc }, { signal }),
      ]);
      return { violations, edgeStats };
    },
  });
  const cancel = () => {
    setCancelled(true);
    void queryClient.cancelQueries({ queryKey });
  };
  const loadLanes = useCallback(
    (ids: string[]) => backend.callBinding(LANES, { ocel: handle, object_ids: ids }) as Promise<ObjectLane[]>,
    [handle],
  );
  const openObject = useCallback(
    (objectType: string, objectId: string) =>
      addPanelToDockview("executionGraph", `Execution of ${objectId}`, {
        datasetId: ocel,
        controls: { objectType, objectId, depth: 2 },
      }),
    [ocel],
  );
  if (cancelled && !query.data)
    return (
      <EmptyState
        icon={<PiSealWarning size={40} />}
        title="Cancelled"
        description="Nothing was computed."
        action={
          <Button size="2" onClick={() => setCancelled(false)}>
            Run again
          </Button>
        }
      />
    );
  if (query.error && !isCancelled(query.error))
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data)
    return (
      <JobProgressCard
        progress={jobs.progress}
        onCancel={jobs.progress ? cancel : undefined}
        label="Checking the constraint..."
        units={JOB_UNITS}
      />
    );
  return (
    <ViolationExplorer
      data={query.data.violations}
      edgeStats={query.data.edgeStats}
      arc={arc}
      loadLanes={loadLanes}
      onOpenObject={openObject}
    />
  );
}

const isArc = (a: unknown): a is OCDeclareArc =>
  typeof a === "object" && a !== null && typeof (a as OCDeclareArc).from === "string" && "arc_type" in a;

function ViolationsPanel(props: IDockviewPanelProps) {
  const { id: ocel, selector } = useDatasetSelection("SlimLinkedOCEL", props);
  const [arc] = usePanelState<unknown>(props, "arc", null);
  if (!ocel) return withSelector(selector, datasetEmptyBox("OCEL"), "oc-declare-violations");
  if (!isArc(arc)) {
    return withSelector(
      selector,
      <EmptyState
        icon={<PiSealWarning />}
        title="Pick a constraint"
        description="In Constraints, click Evaluate and then a violation badge on an arc, or use Explore violations in an arc's edit menu."
      />,
      "oc-declare-violations",
    );
  }
  return withSelector(
    selector,
    <Explorer key={`${ocel}\n${JSON.stringify(arc)}`} ocel={ocel} arc={arc} />,
    "oc-declare-violations",
  );
}

export const vis = definePanel({
  type: "ocDeclareViolations",
  name: "Constraint Violations",
  description:
    "Violations of one OC-DECLARE constraint over time, with the objects involved and what happened instead.",
  category: "ocel",
  tags: ["conformance"],
  icon: PiSealWarning,
  supports: ["SlimLinkedOCEL"],
  keywords: ["oc-declare", "violations", "conformance", "constraint", "deviation", "root cause"],
  order: 16,
  component: ViolationsPanel,
});
