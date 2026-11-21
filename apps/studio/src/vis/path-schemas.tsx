import type { SlimLinkedOCELHandle } from "@r4pm/client";
import {
  DEFAULT_PATH_SCHEMA_CONTROLS,
  type DiscoveredPathSchema,
  type Option,
  type PathSchemaControls,
  type PathSchemaResult,
  PathSchemaSelectors,
  PathSchemasView,
  pathSchemaTypeKey,
  pathSchemaTypeRef,
  type ViewerProps,
} from "@r4pm/components";
import { useQuery } from "@tanstack/react-query";
import { PiFlowArrow } from "react-icons/pi";
import { byLifetime, NO_OBJECT_TYPES, ocelLifecycles, ocelTypeStats } from "./components/ocel-meta";
import { defineResolvedVis } from "./define-vis";

const DISCOVER = "process_mining::discover_path_schemas" as const;

interface Data {
  result: PathSchemaResult;
  typeOptions: Option<string>[];
  eventTypes: string[];
  source: string;
  target: string | null;
}

/** The types a path can start or end at, and the default start. */
async function typeChoices(ocel: SlimLinkedOCELHandle) {
  const [stats, lifecycles] = await Promise.all([ocelTypeStats(ocel), ocelLifecycles(ocel)]);
  const byCount = (counts: Record<string, number>) => Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const objects = byCount(stats.object_type_counts as Record<string, number>);
  const events = byCount(stats.event_type_counts as Record<string, number>);
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
  // Start from the smallest short-lived type: long-lived master data and large types fan out
  // into many paths.
  const start = [...byLifetime(lifecycles.object_types).short].sort((a, b) => a.objects - b.objects)[0];
  const fallback = start ? pathSchemaTypeKey({ Object: start.object_type }) : (typeOptions[0]?.value ?? "");
  return { typeOptions, eventTypes: events.map(([t]) => t), fallback };
}

/** The controls' source and target, or the defaults when they name no type of this OCEL. */
function ends(choices: Awaited<ReturnType<typeof typeChoices>>, c: PathSchemaControls) {
  const has = (key: string | null | undefined): key is string =>
    !!key && choices.typeOptions.some((o) => o.value === key);
  return { source: has(c.source) ? c.source : choices.fallback, target: has(c.target) ? c.target : null };
}

function SelectorsBar({
  controls,
  set,
  datasetId,
}: {
  controls: PathSchemaControls;
  set: (c: PathSchemaControls) => void;
  datasetId: string;
}) {
  const { data } = useQuery({
    queryKey: ["path-schema-types", datasetId],
    queryFn: () => typeChoices(datasetId as SlimLinkedOCELHandle),
  });
  if (!data) return null;
  return (
    <PathSchemaSelectors
      typeOptions={data.typeOptions}
      controls={{ ...controls, ...ends(data, controls) }}
      onControlsChange={set}
    />
  );
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
  deferred: true,
  controls: { initial: DEFAULT_PATH_SCHEMA_CONTROLS },
  source: {
    needs: "SlimLinkedOCEL",
    resolve: async (ctx, c): Promise<Data> => {
      const ocel = ctx.datasetId as SlimLinkedOCELHandle;
      const types = await typeChoices(ocel);
      const { typeOptions, eventTypes } = types;
      const { source, target } = ends(types, c);
      if (typeOptions.length === 0) throw new Error(NO_OBJECT_TYPES);
      const sourceType = pathSchemaTypeRef(source);
      const fromEvent = "Event" in sourceType;
      // Schemas stream in as found; the final result replaces them with the complete equivalence
      // classes and the source count.
      const found: DiscoveredPathSchema[] = [];
      const result = await ctx.backend.callBinding(
        DISCOVER,
        {
          ocel,
          query: {
            source: sourceType,
            target: target ? pathSchemaTypeRef(target) : null,
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
            ctx.showPartial?.({ result: partial, typeOptions, eventTypes, source, target } satisfies Data);
          },
        },
      );
      return { result: result as PathSchemaResult, typeOptions, eventTypes, source, target };
    },
  },
  panelControlsBar: (controls, set, datasetId) => (
    <SelectorsBar controls={controls} set={set} datasetId={datasetId} />
  ),
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
      controls={{ ...controls, source: data.source, target: data.target }}
      onControlsChange={onControlsChange}
      selectors={false}
      {...config}
    />
  ),
});
