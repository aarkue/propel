import type { IDockviewPanelProps } from "dockview";
import { withSelector, datasetEmptyBox } from "./_shared";
import { TransformBuilder, type TransformBuilderValue } from "../transforms";
import { backend } from "../backends";
import { useDatasetSelection } from "../panels/active-datasets";
import { useDatasetScopedState } from "../panels/panel-state";
import { useDatasets, uniqueDatasetLabel } from "../stores";
import { PiShuffle } from "react-icons/pi";
import { definePanel } from "./define-vis";

const INITIAL_BUILDER: TransformBuilderValue = { transforms: [], outName: "transformed" };

export function LogTransformsDockPanel(props: IDockviewPanelProps) {
  const { id: log, selector } = useDatasetSelection("EventLog", props);
  const [builder, setBuilder] = useDatasetScopedState(props, "transformBuilder", log ?? "", INITIAL_BUILDER);
  const addDataset = useDatasets((s) => s.addDataset);
  if (!log) return withSelector(selector, datasetEmptyBox("EventLog"));
  return withSelector(
    selector,
    <div style={{ height: "100%", overflow: "auto" }}>
      <TransformBuilder
        key={log}
        backend={backend}
        datasetName={log}
        objectType="EventLog"
        value={builder}
        onChange={setBuilder}
        onResult={(handle, outName) =>
          addDataset({
            id: handle,
            kind: "EventLog",
            label: uniqueDatasetLabel(outName || "Transformed log"),
          })
        }
      />
    </div>,
  );
}

export const vis = definePanel({
  type: "logTransforms",
  name: "Log Transforms",
  description: "Filter, relabel, sample, and rescale an event log into a new derived log.",
  category: "transforms",
  icon: PiShuffle,
  supports: ["EventLog"],
  keywords: ["filter", "transform", "relabel", "sample", "derive", "clean"],
  genericExport: false,
  order: 18,
  component: LogTransformsDockPanel,
});
