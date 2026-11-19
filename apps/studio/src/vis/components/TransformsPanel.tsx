import { backend } from "../../backends";
import { useDatasetScopedState } from "../../panels/panel-state";
import { uniqueDatasetLabel, useDatasets } from "../../stores";
import { TransformBuilder, type TransformBuilderValue } from "../../transforms";
import type { DatasetPanelProps } from "../define-vis";

const INITIAL_BUILDER: TransformBuilderValue = { transforms: [], outName: "" };

/** What a transforms panel works on: the registry kind it reads and writes, and how transforms name it. */
export const TRANSFORM_TARGETS = {
  EventLog: { kind: "EventLog", objectType: "EventLog" },
  OCEL: { kind: "SlimLinkedOCEL", objectType: "OCEL" },
} as const;

/** Transform builder on the panel's dataset; each run adds the result as a new dataset of the same kind. */
export function makeTransformsPanel(target: keyof typeof TRANSFORM_TARGETS) {
  const { kind, objectType } = TRANSFORM_TARGETS[target];
  return function TransformsDockPanel({ id, props }: DatasetPanelProps) {
    const [builder, setBuilder] = useDatasetScopedState(props, "transformBuilder", id, INITIAL_BUILDER);
    const addDataset = useDatasets((s) => s.addDataset);
    const sourceLabel = useDatasets((s) => s.datasets.find((d) => d.id === id)?.label);
    return (
      <TransformBuilder
        backend={backend}
        datasetName={id}
        sourceLabel={sourceLabel}
        objectType={objectType}
        value={builder}
        onChange={setBuilder}
        onResult={(handle, outName) => addDataset({ id: handle, kind, label: uniqueDatasetLabel(outName) })}
      />
    );
  };
}
