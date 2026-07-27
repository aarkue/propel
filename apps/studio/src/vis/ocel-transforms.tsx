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

export function OcelTransformsDockPanel(props: IDockviewPanelProps) {
  const { id: ocel, selector } = useDatasetSelection("SlimLinkedOCEL", props);
  const [builder, setBuilder] = useDatasetScopedState(props, "transformBuilder", ocel ?? "", INITIAL_BUILDER);
  const addDataset = useDatasets((s) => s.addDataset);
  if (!ocel) return withSelector(selector, datasetEmptyBox("OCEL"));
  return withSelector(
    selector,
    <div style={{ height: "100%", overflow: "auto" }}>
      <TransformBuilder
        key={ocel}
        backend={backend}
        datasetName={ocel}
        objectType="OCEL"
        value={builder}
        onChange={setBuilder}
        onResult={(handle, outName) =>
          addDataset({
            id: handle,
            kind: "SlimLinkedOCEL",
            label: uniqueDatasetLabel(outName || "Transformed OCEL"),
          })
        }
      />
    </div>,
  );
}

export const vis = definePanel({
  type: "ocelTransforms",
  name: "OCEL Transforms",
  description: "Filter, relabel, and sample an OCEL into a new derived OCEL.",
  category: "transforms",
  icon: PiShuffle,
  supports: ["SlimLinkedOCEL"],
  keywords: ["filter", "transform", "relabel", "sample", "derive", "ocel"],
  genericExport: false,
  order: 19,
  component: OcelTransformsDockPanel,
});
