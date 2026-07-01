import type { IDockviewPanelProps } from "dockview";
import { withSelector, datasetEmptyBox } from "./_shared";
import { TransformBuilder } from "../transforms";
import { backend } from "../backends";
import { useDatasetSelection } from "../panels/active-datasets";
import { useDatasets } from "../stores";
import { PiShuffle } from "react-icons/pi";
import { definePanel } from "./define-vis";

export function LogTransformsDockPanel(_props: IDockviewPanelProps) {
  const { id: log, selector } = useDatasetSelection("EventLog");
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
        onResult={(handle, outName) => addDataset({ id: handle, kind: "EventLog", label: outName || handle })}
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
