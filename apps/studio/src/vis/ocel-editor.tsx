import { PiCube } from "react-icons/pi";
import { definePanel } from "./define-vis";
import { OcelEditorPanel } from "./components/OcelEditorPanel";

export const vis = definePanel({
  type: "ocelEditor",
  name: "OCEL Creator",
  description: "Build an object-centric event log: declare types, add events and objects, link them.",
  category: "create",
  icon: PiCube,
  keywords: ["ocel", "object", "centric", "event", "log", "create", "editor", "build", "new"],
  order: 2,
  // Data-entry editor: image export is meaningless and its floating button overlaps Save.
  genericExport: false,
  component: OcelEditorPanel,
});
