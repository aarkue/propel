import type { SlimLinkedOCELHandle } from "@r4pm/client";
import { type OcelOverview, OcelOverviewBoard, type ViewerProps } from "@r4pm/components";
import { PiSquaresFour } from "react-icons/pi";
import { addPanelToDockview } from "../panels/registry";
import { defineResolvedVis } from "./define-vis";

const B = "app_bindings" as const;

export const vis = defineResolvedVis({
  type: "ocelOverview",
  name: "OCEL Overview",
  description: "Types, objects over time, event mixes and data-quality findings of an OCEL.",
  category: "ocel",
  tags: ["overview"],
  icon: PiSquaresFour,
  supports: ["SlimLinkedOCEL"],
  keywords: ["overview", "summary", "dashboard", "start", "types", "health"],
  order: 0,
  source: {
    needs: "SlimLinkedOCEL",
    resolve: async (ctx): Promise<OcelOverview> => {
      const ocel = ctx.datasetId as SlimLinkedOCELHandle;
      const [population, signatures, health, lifecycles] = await Promise.all([
        ctx.backend.callBinding(`${B}::get_object_population`, { ocel, num_bins: 40 }),
        ctx.backend.callBinding(`${B}::get_event_signatures`, { ocel }),
        ctx.backend.callBinding(`${B}::get_ocel_health`, { ocel }),
        ctx.backend.callBinding(`${B}::get_lifecycle_map`, { ocel }),
      ]);
      return { population, signatures, health, lifecycles };
    },
  },
  viewer: false,
  component: ({ data, handle, ...config }: ViewerProps<OcelOverview>) => (
    <OcelOverviewBoard
      data={data}
      onOpen={(target) => addPanelToDockview(target, undefined, handle ? { datasetId: handle } : undefined)}
      {...config}
    />
  ),
});
