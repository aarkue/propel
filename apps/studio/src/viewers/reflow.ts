import { RETURN_TYPES } from "@r4pm/client";
import { type ReflowSummary, ReflowView } from "@r4pm/components";
import { defineViewer } from "./registry";

export const ReflowViewer_Def = defineViewer<ReflowSummary>({
  id: "reflow",
  title: "Reflow",
  accepts: ({ returnType }) => returnType === RETURN_TYPES.ReflowSummary,
  component: ReflowView,
});
