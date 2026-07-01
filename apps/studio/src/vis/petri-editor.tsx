import { PiPencilSimple } from "react-icons/pi";
import { definePanel } from "./define-vis";
import { PetriEditorPanel } from "./components/PetriEditorPanel";

export const vis = definePanel({
  type: "petriNetEditor",
  name: "Petri Net Editor",
  description: "Create a Petri net from scratch or import a PNML, then save or export it.",
  category: "models",
  icon: PiPencilSimple,
  keywords: ["petri", "net", "editor", "create", "pnml", "import", "build"],
  order: 8,
  component: PetriEditorPanel,
});
