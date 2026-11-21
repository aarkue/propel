import type { SlimLinkedOCELHandle } from "@r4pm/client";
import {
  DEFAULT_EXECUTION_GRAPH_CONTROLS,
  type ExecutionGraph,
  type ExecutionGraphControls,
  ExecutionGraphView,
  type Option,
  type ViewerProps,
} from "@r4pm/components";
import { PiGraph } from "react-icons/pi";
import { byLifetime, NO_OBJECT_TYPES, ocelLifecycles, ocelTypeStats } from "./components/ocel-meta";
import { defineResolvedVis } from "./define-vis";

const CANDIDATES = "app_bindings::get_objects_by_event_count" as const;
const GRAPH = "app_bindings::get_execution_graph" as const;

interface Data {
  graph: ExecutionGraph;
  objectTypeOptions: Option<string>[];
  objectOptions: Option<string>[];
  longLived: string[];
}

export const vis = defineResolvedVis({
  type: "executionGraph",
  name: "Execution Graph",
  description: "The events of one object and its related objects as a partial order.",
  category: "ocel",
  icon: PiGraph,
  supports: ["SlimLinkedOCEL"],
  keywords: ["process execution", "partial order", "instance", "object", "trace", "case"],
  order: 17,
  controls: { initial: DEFAULT_EXECUTION_GRAPH_CONTROLS },
  source: {
    needs: "SlimLinkedOCEL",
    resolve: async (ctx, c): Promise<Data> => {
      const ocel = ctx.datasetId as SlimLinkedOCELHandle;
      const [stats, lifecycles] = await Promise.all([ocelTypeStats(ocel), ocelLifecycles(ocel)]);
      const counts = stats.object_type_counts as Record<string, number>;
      if (Object.keys(counts).length === 0) throw new Error(NO_OBJECT_TYPES);
      // Long-lived types are left out of executions, unless every type is long-lived.
      const { short, long } = byLifetime(lifecycles.object_types);
      const longLived = short.length ? long.map((t) => t.object_type) : [];
      // The type with the richest lifecycle is the default.
      const leading = [...short].sort(
        (a, b) => b.activities.length - a.activities.length || a.objects - b.objects,
      )[0];
      const objectType =
        c.objectType && counts[c.objectType]
          ? c.objectType
          : (leading?.object_type ??
            Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
      const others = longLived.filter((t) => t !== objectType);
      const excluded = others.filter((t) => !c.included?.includes(t));
      const list = await ctx.backend.callBinding(CANDIDATES, { ocel, object_type: objectType, limit: 100 });
      const objectId = c.objectId && list.some(([id]) => id === c.objectId) ? c.objectId : list[0]?.[0];
      if (!objectId) throw new Error(`No ${objectType} objects.`);
      const graph = await ctx.backend.callBinding(GRAPH, {
        ocel,
        object_id: objectId,
        depth: c.depth,
        exclude_types: excluded,
      });
      return {
        graph,
        objectTypeOptions: Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([t, n]) => ({ value: t, label: t, description: `${n.toLocaleString("en")} objects` })),
        objectOptions: list.map(([id, n]) => ({ value: id, label: id, description: `${n} events` })),
        longLived: others,
      };
    },
  },
  viewer: false,
  component: ({
    data,
    controls,
    onControlsChange,
    ...config
  }: ViewerProps<Data> & {
    controls: ExecutionGraphControls;
    onControlsChange?: (c: ExecutionGraphControls) => void;
  }) => (
    <ExecutionGraphView
      data={data.graph}
      objectTypeOptions={data.objectTypeOptions}
      objectOptions={data.objectOptions}
      longLived={data.longLived}
      controls={controls}
      onControlsChange={onControlsChange}
      {...config}
    />
  ),
});
