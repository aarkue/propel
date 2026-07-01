import { PiPencilSimple } from "react-icons/pi";
import { definePanel } from "./define-vis";
import { OcpnEditorPanel } from "./components/OcpnEditorPanel";

export const vis = definePanel({
  type: "ocpnEditor",
  name: "Object-Centric Petri Net Editor",
  description: "Create an object-centric Petri net from scratch and simulate it.",
  category: "models",
  icon: PiPencilSimple,
  keywords: ["ocpn", "object-centric", "petri", "net", "editor", "create", "simulate"],
  order: 9,
  component: OcpnEditorPanel,
});
