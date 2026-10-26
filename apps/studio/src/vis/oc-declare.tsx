import { PiListBullets } from "react-icons/pi";
import { OCDeclareWorkbench } from "./components/OCDeclareWorkbench";
import { definePanel } from "./define-vis";

export const vis = definePanel({
  type: "ocDeclare",
  name: "OC-DECLARE",
  description: "Discover, project, edit and evaluate object-centric DECLARE constraints.",
  category: "ocel",
  tags: ["models"],
  icon: PiListBullets,
  supports: ["SlimLinkedOCEL"],
  keywords: ["declare", "constraints", "rules", "editor", "create", "evaluate"],
  order: 15,
  component: OCDeclareWorkbench,
});
