import { useDatasets } from "../stores";
import { DatasetSelector } from "@r4pm/components";
import type { RegistryKind } from "@r4pm/client";
import type { IDockviewPanelProps } from "dockview";
import type { ReactNode } from "react";
import { usePanelState } from "./panel-state";

// Selection lives in dockview `params` so it persists with the layout. `selector` is the compact
// picker for the panel header row (see `PanelFrame`).
export function useDatasetSelection(
  kind: RegistryKind,
  props: IDockviewPanelProps,
): { id: string | undefined; selector: ReactNode } {
  const datasets = useDatasets((s) => s.datasets);
  const ofKind = datasets.filter((d) => d.kind === kind);
  const [selectedId, setSelectedId] = usePanelState<string | null>(props, "datasetId", null);
  const id = selectedId && ofKind.some((d) => d.id === selectedId) ? selectedId : ofKind[0]?.id;
  const selector: ReactNode = (
    <div style={{ width: 230, flex: "0 0 auto" }}>
      <DatasetSelector datasets={ofKind} value={id ?? null} onChange={setSelectedId} searchable />
    </div>
  );
  return { id, selector };
}
