import { PiShuffle } from "react-icons/pi";
import { makeTransformsPanel } from "./components/TransformsPanel";
import { defineDatasetPanel } from "./define-vis";

export const vis = defineDatasetPanel({
  needs: "SlimLinkedOCEL",
  type: "ocelTransforms",
  name: "OCEL Transforms",
  description: "Filter, relabel, and sample an OCEL into a new derived OCEL.",
  category: "transforms",
  icon: PiShuffle,
  supports: ["SlimLinkedOCEL"],
  keywords: ["filter", "transform", "relabel", "sample", "derive", "ocel"],
  genericExport: false,
  order: 19,
  component: makeTransformsPanel("OCEL"),
});
