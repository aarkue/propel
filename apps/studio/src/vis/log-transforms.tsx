import { PiShuffle } from "react-icons/pi";
import { makeTransformsPanel } from "./components/TransformsPanel";
import { defineDatasetPanel } from "./define-vis";

export const vis = defineDatasetPanel({
  needs: "EventLog",
  type: "logTransforms",
  name: "Log Transforms",
  description: "Filter, relabel, sample, and rescale an event log into a new derived log.",
  category: "transforms",
  icon: PiShuffle,
  supports: ["EventLog"],
  keywords: ["filter", "transform", "relabel", "sample", "derive", "clean"],
  genericExport: false,
  order: 18,
  component: makeTransformsPanel("EventLog"),
});
