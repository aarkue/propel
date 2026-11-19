import type { SlimLinkedOCELHandle } from "@r4pm/client";
import {
  DEFAULT_PATH_SCHEMA_CONTROLS,
  type DiscoveredPathSchema,
  type Option,
  type PathSchemaControls,
  type PathSchemaResult,
  PathSchemasView,
  pathSchemaTypeKey,
  pathSchemaTypeRef,
  type ViewerProps,
} from "@r4pm/components";
import { PiFlowArrow } from "react-icons/pi";
import { byLifetime, NO_OBJECT_TYPES, ocelLifecycles, ocelTypeStats } from "./components/ocel-meta";
import { defineResolvedVis } from "./define-vis";

const DISCOVER = "process_mining::discover_path_schemas" as const;

interface Data {
  result: PathSchemaResult;
  typeOptions: Option<string>[];
  eventTypes: string[];
  source: string;
}

export const vis = defineResolvedVis({
  type: "pathSchemas",
  name: "Path Schemas",
  description: "Relation paths between the types of an OCEL, ranked by coverage and selectivity.",
  category: "ocel",
  icon: PiFlowArrow,
  supports: ["SlimLinkedOCEL"],
  keywords: ["paths", "schema", "relations", "e2o", "o2o", "connections", "lead time"],
  order: 19,
  controls: { initial: DEFAULT_PATH_SCHEMA_CONTROLS },
  source: {
    needs: "SlimLinkedOCEL",
    resolve: async (ctx, c): Promise<Data> => {
      const ocel = ctx.datasetId as SlimLinkedOCELHandle;
      const [stats, lifecycles] = await Promise.all([ocelTypeStats(ocel), ocelLifecycles(ocel)]);
      // Start from the smallest short-lived type: long-lived master data and large types fan out
      // into many paths.
      const start = [...byLifetime(lifecycles.object_types).short].sort((a, b) => a.objects - b.objects)[0];
      const objects = Object.entries(stats.object_type_counts as Record<string, number>).sort(
        (a, b) => b[1] - a[1],
      );
      const events = Object.entries(stats.event_type_counts as Record<string, number>).sort(
        (a, b) => b[1] - a[1],
      );
      const typeOptions: Option<string>[] = [
        ...objects.map(([t, n]) => ({
          value: pathSchemaTypeKey({ Object: t }),
          label: t,
          description: `object type, ${n.toLocaleString("en")} objects`,
        })),
        ...events.map(([t, n]) => ({
          value: pathSchemaTypeKey({ Event: t }),
          label: t,
          description: `event type, ${n.toLocaleString("en")} events`,
        })),
      ];
      if (typeOptions.length === 0) throw new Error(NO_OBJECT_TYPES);
      const fallback = start ? pathSchemaTypeKey({ Object: start.object_type }) : typeOptions[0].value;
      const source = c.source && typeOptions.some((o) => o.value === c.source) ? c.source : fallback;
      const sourceType = pathSchemaTypeRef(source);
      const fromEvent = "Event" in sourceType;
      const eventTypes = events.map(([t]) => t);
      // Schemas stream in as found; the final result replaces them with the complete equivalence
      // classes and the source count.
      const found: DiscoveredPathSchema[] = [];
      const result = await ctx.backend.callBinding(
        DISCOVER,
        {
          ocel,
          query: {
            source: sourceType,
            target: c.target ? pathSchemaTypeRef(c.target) : null,
            max_length: c.maxLength,
            allow_cycles: false,
            params: { temporal: fromEvent ? "Forward" : "None", selection: "All", dedup_targets: true },
          },
        } as never,
        {
          ...ctx.job,
          onPartial: (values) => {
            found.push(...(values as DiscoveredPathSchema[]));
            const partial: PathSchemaResult = {
              source_type: "Event" in sourceType ? sourceType.Event : sourceType.Object,
              total_sources: found[0]?.stats.metrics.total_sources ?? 0,
              schemas: [...found],
              schema_limit_reached: false,
            };
            ctx.showPartial?.({ result: partial, typeOptions, eventTypes, source } satisfies Data);
          },
        },
      );
      return { result: result as PathSchemaResult, typeOptions, eventTypes, source };
    },
  },
  viewer: false,
  component: ({
    data,
    controls,
    onControlsChange,
    ...config
  }: ViewerProps<Data> & {
    controls: PathSchemaControls;
    onControlsChange?: (c: PathSchemaControls) => void;
  }) => (
    <PathSchemasView
      data={data.result}
      typeOptions={data.typeOptions}
      eventTypes={data.eventTypes}
      controls={{ ...controls, source: data.source }}
      onControlsChange={onControlsChange}
      {...config}
    />
  ),
});
