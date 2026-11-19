import type { SlimLinkedOCELHandle } from "@r4pm/client";
import {
  DEFAULT_OBJECT_LIFELINES_CONTROLS,
  type Lifelines,
  type ObjectLifelinesControls,
  ObjectLifelinesView,
  type ViewerProps,
} from "@r4pm/components";
import { PiRows } from "react-icons/pi";
import { ocelTypeStats } from "./components/ocel-meta";
import { defineResolvedVis } from "./define-vis";

const LIFELINES = "app_bindings::get_object_lifelines" as const;

interface Data {
  lifelines: Lifelines;
  objectTypes: string[];
}

export const vis = defineResolvedVis({
  type: "objectLifelines",
  name: "Object Lifelines",
  description:
    "Events of individual objects over time, one row per object. Hovering an event highlights it in every row.",
  category: "ocel",
  tags: ["time"],
  icon: PiRows,
  supports: ["SlimLinkedOCEL"],
  keywords: ["dotted chart", "lifeline", "objects", "timeline", "gantt"],
  order: 18,
  controls: { initial: { objectType: null } as ObjectLifelinesControls },
  source: {
    needs: "SlimLinkedOCEL",
    resolve: async (ctx, c): Promise<Data> => {
      const ocel = ctx.datasetId as SlimLinkedOCELHandle;
      const [stats, lifelines] = await Promise.all([
        ocelTypeStats(ocel),
        ctx.backend.callBinding(LIFELINES, {
          ocel,
          object_types: c.objectType ? [c.objectType] : null,
          max_objects: 300,
          window: c.window ?? DEFAULT_OBJECT_LIFELINES_CONTROLS.window,
        }),
      ]);
      return { lifelines, objectTypes: Object.keys(stats.object_type_counts).sort() };
    },
  },
  viewer: false,
  component: ({
    data,
    controls,
    onControlsChange,
    ...config
  }: ViewerProps<Data> & {
    controls: ObjectLifelinesControls;
    onControlsChange?: (c: ObjectLifelinesControls) => void;
  }) => (
    <ObjectLifelinesView
      data={data.lifelines}
      objectTypes={data.objectTypes}
      controls={controls}
      onControlsChange={onControlsChange}
      {...config}
    />
  ),
});
