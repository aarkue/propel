import type { SlimLinkedOCELHandle } from "@r4pm/client";
import { PiListBullets } from "react-icons/pi";
import { OC_DECLARE_DEFAULTS, OC_DECLARE_DISCOVER } from "./_oc-declare-discovery";
import { OCDeclarePanel } from "./components/OCDeclarePanel";
import { defineVis } from "./define-vis";

// Read-only viewer for OC-DECLARE results outside the OC-DECLARE panel (`oc-declare.tsx`), e.g.,
// pipeline outputs.
export const vis = defineVis({
  type: "ocDeclareOutput",
  name: "OC-DECLARE",
  description: "Object-centric DECLARE behavioral constraints.",
  category: "ocel",
  icon: PiListBullets,
  supports: ["SlimLinkedOCEL"],
  panel: false,
  source: {
    binding: OC_DECLARE_DISCOVER,
    needs: "SlimLinkedOCEL",
    args: (ctx) => ({ locel: ctx.datasetId as SlimLinkedOCELHandle, options: OC_DECLARE_DEFAULTS }),
  },
  component: OCDeclarePanel,
});
