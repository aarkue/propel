import { Flex, Text } from "@r4pm/components/ui";
import { useMemo } from "react";
import { PiFlowArrow } from "react-icons/pi";
import { EmptyState } from "../feedback/EmptyState";
import {
  fmtInt,
  formatDuration,
  Metric,
  MetricRow,
  type Option,
  OptionMenu,
  Section,
  Toolbar,
  ToolbarDivider,
  useChartTooltip,
} from "../kit";
import {
  OcelSchemaPath,
  type OcelSchemaPathConnector,
  type OcelSchemaPathNode,
} from "../ocel-schema-path/OcelSchemaPath";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";

/** An event or object type, as the engine names a path's end. */
export type PathSchemaType = { Event: string } | { Object: string };

export interface DiscoveredPathSchema {
  schema: string;
  /** The ends of the path, with their kind. */
  source?: PathSchemaType;
  target?: PathSchemaType;
  length: number;
  is_dead: boolean;
  stats: {
    metrics: {
      support: number;
      coverage: number;
      selectivity: number;
      reach: number;
      exclusivity: number;
      sources_with_paths: number;
      total_sources: number;
    };
    throughput?: { min: number; max: number; mean: number; median: number } | null;
  };
}

export interface PathSchemaResult {
  source_type: string;
  total_sources: number;
  schemas: DiscoveredPathSchema[];
  schema_limit_reached: boolean;
}

export interface PathSchemaControls {
  /** A {@link pathSchemaTypeKey}; null for the first of `typeOptions`. */
  source?: string | null;
  /** A {@link pathSchemaTypeKey}; null for any type. */
  target?: string | null;
  maxLength: number;
}

export const DEFAULT_PATH_SCHEMA_CONTROLS: PathSchemaControls = { source: null, target: null, maxLength: 3 };

/** The key of a type in `typeOptions` and the controls: `e:<event type>` or `o:<object type>`. */
export const pathSchemaTypeKey = (r: PathSchemaType) => ("Event" in r ? `e:${r.Event}` : `o:${r.Object}`);
/** The type of a {@link pathSchemaTypeKey}. */
export const pathSchemaTypeRef = (key: string): PathSchemaType =>
  key.startsWith("e:") ? { Event: key.slice(2) } : { Object: key.slice(2) };

/** The source, target and length pickers, also usable outside the view (e.g., in a panel header). */
export function PathSchemaSelectors({
  typeOptions,
  controls,
  onControlsChange,
}: {
  typeOptions: Option<string>[];
  controls: PathSchemaControls;
  onControlsChange?: (next: PathSchemaControls) => void;
}) {
  const set = (patch: Partial<PathSchemaControls>) => onControlsChange?.({ ...controls, ...patch });
  return (
    <>
      <OptionMenu
        label="From"
        value={controls.source ?? typeOptions[0]?.value}
        options={typeOptions}
        onChange={(source) => set({ source })}
        disabled={!onControlsChange}
      />
      <OptionMenu
        label="To"
        value={controls.target ?? "__any__"}
        options={[
          { value: "__any__", label: "Any type", description: "Every type the paths reach" },
          ...typeOptions,
        ]}
        onChange={(t) => set({ target: t === "__any__" ? null : t })}
        disabled={!onControlsChange}
      />
      <ToolbarDivider />
      <OptionMenu
        label="Up to"
        value={String(controls.maxLength)}
        options={[2, 3, 4, 5].map((n) => ({
          value: String(n),
          label: `${n} steps`,
          description: n > 4 ? "Many paths, slower" : undefined,
        }))}
        onChange={(n) => set({ maxLength: Number(n) })}
        disabled={!onControlsChange}
      />
    </>
  );
}

export interface PathSchemasViewProps extends ViewerProps<PathSchemaResult> {
  /** Show the source, target and length pickers in the toolbar. Default true. */
  selectors?: boolean;
  /** The types a path can start or end at, keyed by {@link pathSchemaTypeKey}. */
  typeOptions: Option<string>[];
  /** The event types, to tell them apart from object types in a path. */
  eventTypes: string[];
  controls?: PathSchemaControls;
  onControlsChange?: (next: PathSchemaControls) => void;
}

const COLUMNS = ["Path", "Support", "Coverage", "Selectivity", "Reach", "Exclusivity", "Median time"];
/** A cell tint for a value in 0..1. */
const heat = (v: number) =>
  `color-mix(in srgb, var(--accent-9) ${Math.round(Math.max(0, Math.min(1, v)) * 35)}%, transparent)`;

/** `orders -[<places]-> customers` into chips: `<` marks a relation followed backwards. */
function parse(
  { schema, source, target }: DiscoveredPathSchema,
  eventTypes: Set<string>,
): { nodes: OcelSchemaPathNode[]; connectors: OcelSchemaPathConnector[] } {
  const parts = schema.split(/ -\[(.*?)\]-> /);
  const nodes: OcelSchemaPathNode[] = [];
  const connectors: OcelSchemaPathConnector[] = [];
  const last = parts.length - 1;
  // Inner steps have only a name, so an event type and an object type of the same name look alike.
  const kindOf = (name: string, i: number): "event" | "object" => {
    const end = i === 0 ? source : i === last ? target : undefined;
    if (end) return "Event" in end ? "event" : "object";
    return eventTypes.has(name) ? "event" : "object";
  };
  parts.forEach((p, i) => {
    if (i % 2 === 0) nodes.push({ name: p, kind: kindOf(p, i) });
    else connectors.push({ qualifier: p.replace(/^</, "") || undefined, reverse: p.startsWith("<") });
  });
  return { nodes, connectors };
}

/**
 * How the types of an OCEL connect: every relation path from a source type (to a target type),
 * ranked by how many sources it covers and how selective it is, with the time it spans between events.
 */
export function PathSchemasView({
  data,
  typeOptions,
  eventTypes,
  controls = DEFAULT_PATH_SCHEMA_CONTROLS,
  onControlsChange,
  selectors = true,
  ...config
}: PathSchemasViewProps) {
  const cfg = useViewerConfig(config);
  const duration = cfg.format?.duration ?? formatDuration;
  const { show, hide, tooltip } = useChartTooltip();
  const events = useMemo(() => new Set(eventTypes), [eventTypes]);
  const rows = useMemo(
    () =>
      data.schemas
        .filter((s) => !s.is_dead)
        .sort(
          (a, b) =>
            b.stats.metrics.coverage - a.stats.metrics.coverage ||
            b.stats.metrics.selectivity - a.stats.metrics.selectivity ||
            a.length - b.length,
        )
        .slice(0, 60),
    [data.schemas],
  );
  const withTime = rows.filter((r) => r.stats.throughput);
  const maxSupport = rows.reduce((m, r) => Math.max(m, r.stats.metrics.support), 1);

  return (
    <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
      <Toolbar
        end={
          data.schema_limit_reached && (
            <Text size="1" color="amber">
              Schema limit reached, shorten the paths
            </Text>
          )
        }
      >
        {selectors && (
          <PathSchemaSelectors
            typeOptions={typeOptions}
            controls={controls}
            onControlsChange={onControlsChange}
          />
        )}
      </Toolbar>
      {rows.length === 0 ? (
        <EmptyState
          icon={<PiFlowArrow />}
          title="No connecting paths"
          description="Try another target type or longer paths."
        />
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
          <Flex direction="column" gap="5" style={{ maxWidth: 1240 }}>
            <MetricRow>
              <Metric label={`${data.source_type} instances`} value={fmtInt(data.total_sources)} />
              <Metric
                label="Paths found"
                value={fmtInt(data.schemas.filter((s) => s.stats.metrics.sources_with_paths > 0).length)}
                hint={`${fmtInt(rows.length)} shown`}
              />
              <Metric
                label="Full coverage"
                value={fmtInt(
                  rows.filter(
                    (r) =>
                      data.total_sources > 0 && r.stats.metrics.sources_with_paths === data.total_sources,
                  ).length,
                )}
                hint="paths every source takes"
              />
              {withTime.length > 0 && (
                <Metric
                  label="Shortest median time"
                  value={duration(
                    Math.min(...withTime.map((r) => Math.abs(r.stats.throughput!.median))) * 1000,
                  )}
                  hint="between the end events"
                />
              )}
            </MetricRow>
            <Section
              title="Paths"
              subtitle="Support: connected source and target pairs. Coverage: share of sources with the path. Selectivity: high when a source reaches few targets. Reach: share of targets reached. Exclusivity: high when a target is reached from few sources."
            >
              <div data-tooltip-host className="r4pm-path-table">
                {COLUMNS.map((h, i) => (
                  <span key={h} className={i === 0 ? "r4pm-eyebrow r4pm-path-cell" : "r4pm-eyebrow"}>
                    {h}
                  </span>
                ))}
                {rows.map((r) => {
                  const { nodes, connectors } = parse(r, events);
                  const m = r.stats.metrics;
                  const share = (v: number) => (
                    <span className="r4pm-path-num" style={{ background: heat(v) }}>
                      {v.toFixed(2)}
                    </span>
                  );
                  return (
                    <div
                      key={r.schema}
                      style={{ display: "contents" }}
                      onMouseMove={(e) =>
                        show(e, {
                          title: `${r.length} step${r.length === 1 ? "" : "s"}`,
                          rows: [
                            {
                              label: "Sources with the path",
                              value: `${fmtInt(m.sources_with_paths)} of ${fmtInt(m.total_sources)}`,
                            },
                            ...(r.stats.throughput
                              ? [
                                  {
                                    label: "Time, mean",
                                    value: duration(Math.abs(r.stats.throughput.mean) * 1000),
                                  },
                                ]
                              : []),
                          ],
                        })
                      }
                      onMouseLeave={hide}
                    >
                      <div className="r4pm-path-cell">
                        <OcelSchemaPath nodes={nodes} connectors={connectors} colorOf={cfg.colorOf} />
                      </div>
                      <span
                        className="r4pm-path-num"
                        style={{ background: heat(Math.log1p(m.support) / Math.log1p(maxSupport)) }}
                      >
                        {fmtInt(m.support)}
                      </span>
                      {share(m.coverage)}
                      {share(m.selectivity)}
                      {share(m.reach)}
                      {share(m.exclusivity)}
                      <span className="r4pm-path-num" style={{ color: "var(--gray-11)" }}>
                        {r.stats.throughput ? duration(Math.abs(r.stats.throughput.median) * 1000) : "-"}
                      </span>
                    </div>
                  );
                })}
                {tooltip}
              </div>
            </Section>
          </Flex>
        </div>
      )}
    </Flex>
  );
}
