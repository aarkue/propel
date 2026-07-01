import { defineViewer } from "./registry";
import { JSONViewer } from "@r4pm/components";

export const JSONViewer_Def = defineViewer<unknown>({
  id: "json",
  title: "Raw JSON",
  accepts: () => true,
  priority: -1000,
  component: JSONViewer,
});
