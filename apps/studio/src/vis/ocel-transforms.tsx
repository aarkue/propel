import type { IDockviewPanelProps } from "dockview";
import { withSelector, datasetEmptyBox } from "./_shared";
import { TransformBuilder } from "../transforms";
import { backend } from "../backends";
import { useDatasetSelection } from "../panels/active-datasets";
import { useDatasets } from "../stores";
import { PiShuffle } from "react-icons/pi";
import { definePanel } from "./define-vis";

export function OcelTransformsDockPanel(_props: IDockviewPanelProps) {
  const { id: ocel, selector } = useDatasetSelection("SlimLinkedOCEL");
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
        onResult={(handle, outName) =>
          addDataset({ id: handle, kind: "SlimLinkedOCEL", label: outName || handle })
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
