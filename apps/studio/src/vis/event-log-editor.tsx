import { PiListChecks } from "react-icons/pi";
import { definePanel } from "./define-vis";
import { EventLogEditorPanel } from "./components/EventLogEditorPanel";

export const vis = definePanel({
  type: "eventLogEditor",
  name: "Event Log Creator",
  description: "Build an event log from scratch: type traces, manage time, add typed attributes.",
  category: "create",
  icon: PiListChecks,
  keywords: ["event", "log", "xes", "trace", "create", "editor", "build", "new"],
  order: 1,
  // Data-entry editor: image export is meaningless and its floating button overlaps Save.
  genericExport: false,
  component: EventLogEditorPanel,
});
