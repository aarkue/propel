import { defineViewer } from "./registry";
import { RETURN_TYPES, type FitnessResult } from "@r4pm/client";
import { FitnessView } from "@r4pm/components";

export const FitnessViewer_Def = defineViewer<FitnessResult>({
  id: "fitness",
  title: "Conformance Fitness",
  accepts: ({ returnType }) => returnType === RETURN_TYPES.FitnessResult,
  component: FitnessView,
});
