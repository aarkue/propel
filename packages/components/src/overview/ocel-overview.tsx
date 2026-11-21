import { Badge, Flex, Text } from "@r4pm/components/ui";
import { PiCheckCircle, PiInfo, PiWarning } from "react-icons/pi";
import { fmtInt, fmtPct, formatDuration, Metric, MetricRow, Section, TypeChip } from "../kit";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import type { EventSignatures } from "./event-signatures";
import type { LifecycleMap } from "./lifecycle-map";
import type { ObjectPopulation } from "./object-population";
import type { OcelHealth } from "./ocel-health";
import { findingsMetric, OpenLink } from "./open-link";

export interface OcelOverview {
  population: ObjectPopulation;
  signatures: EventSignatures;
  health: OcelHealth;
  lifecycles: LifecycleMap;
}

/** Detail views the board links to, by the host's view id. */
export type OcelOverviewTarget =
  | "objectPopulation"
  | "eventSignatures"
  | "ocelHealth"
  | "lifecycleMap"
  | "ocdfg"
  | "ocelTypeGraph";

const SEVERITY_ICON = { warning: <PiWarning />, info: <PiInfo /> } as const;
const SEVERITY_COLOR = { warning: "amber", info: "blue" } as const;

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  const w = 160;
  const h = 34;
  const d = values
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${((i / Math.max(1, values.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 2)).toFixed(1)}`,
    )
    .join("");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: h, display: "block" }}
      aria-hidden="true"
    >
      <path d={`${d}L${w},${h}L0,${h}Z`} fill={color} fillOpacity={0.18} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export interface OcelOverviewBoardProps extends ViewerProps<OcelOverview> {
  /** Opens a detail view; without it the board shows no links. */
  onOpen?: (target: OcelOverviewTarget) => void;
}

/**
 * The first look at an OCEL: its size and time span, each object type with how many objects are
 * alive over time and how long they live, each event type with the objects it carries, and what the
 * health check found. Each section links to its detail view.
 */
export function OcelOverviewBoard({ data, onOpen, ...config }: OcelOverviewBoardProps) {
  const cfg = useViewerConfig(config);
  const duration = cfg.format?.duration ?? formatDuration;
  const date = cfg.format?.date ?? ((ms: number) => new Date(ms).toLocaleDateString());
  const { population, signatures, health, lifecycles } = data;
  const failed = health.findings.filter((f) => f.count > 0);
  const quality = findingsMetric(health.findings);
  const lifetime = new Map(lifecycles.object_types.map((t) => [t.object_type, t]));
  const start = population.bin_starts_ms[0];
  const end = population.bin_starts_ms.length
    ? population.bin_starts_ms[population.bin_starts_ms.length - 1] + population.bin_width_ms
    : start;
  const typeColor = (t: string) => cfg.colorOf?.("objectType", t) ?? "var(--accent-9)";
  const several = signatures.event_types.filter((e) => e.events_with_several > 0).length;

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 20 }}>
      <Flex direction="column" gap="6" style={{ maxWidth: 1240 }}>
        <MetricRow>
          <Metric
            label="Events"
            value={fmtInt(health.num_events)}
            hint={`${signatures.event_types.length} event types`}
          />
          <Metric
            label="Objects"
            value={fmtInt(health.num_objects)}
            hint={`${population.object_types.length} object types`}
          />
          {start != null && (
            <Metric label="Time span" value={duration(end - start)} hint={`${date(start)} to ${date(end)}`} />
          )}
          <Metric
            label="Data quality"
            value={quality.value}
            tone={quality.tone}
            hint={`${health.findings.length} checks`}
          />
          <Metric
            label="Several objects of one type"
            value={fmtInt(several)}
            hint="event types relating several objects of one type"
          />
        </MetricRow>

        <Section
          title="Object types"
          subtitle="Objects alive over time and their median lifetime"
          actions={
            <OpenLink onOpen={onOpen} target="objectPopulation">
              Population
            </OpenLink>
          }
        >
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}
          >
            {population.object_types.map((t) => {
              const lc = lifetime.get(t.object_type);
              return (
                <div
                  key={t.object_type}
                  style={{
                    padding: 14,
                    borderRadius: 12,
                    border: "1px solid var(--gray-a4)",
                    background: "var(--color-panel-solid)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <Flex align="center" gap="2">
                    <span
                      style={{ width: 10, height: 10, borderRadius: 3, background: typeColor(t.object_type) }}
                    />
                    <Text size="2" weight="medium" truncate>
                      {t.object_type}
                    </Text>
                    <Text size="2" weight="bold" ml="auto" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {fmtInt(t.objects + t.objects_without_events)}
                    </Text>
                  </Flex>
                  <Sparkline values={t.alive} color={typeColor(t.object_type)} />
                  <Flex justify="between">
                    <Text size="1" color="gray">
                      up to {fmtInt(Math.round(Math.max(0, ...t.alive)))} alive on average
                    </Text>
                    {lc && (
                      <Text size="1" color="gray">
                        median lifetime {duration(lc.median_lifetime_ms)}
                      </Text>
                    )}
                  </Flex>
                </div>
              );
            })}
          </div>
        </Section>

        <Section
          title="Event types"
          subtitle="Events per combination of related object types, most frequent first"
          actions={
            <OpenLink onOpen={onOpen} target="eventSignatures">
              Signatures
            </OpenLink>
          }
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(140px, 220px) 90px minmax(0, 1fr)",
              gap: "8px 16px",
              alignItems: "center",
            }}
          >
            {signatures.event_types.map((et) => {
              const top = et.signatures[0];
              return (
                <div key={et.event_type} style={{ display: "contents" }}>
                  <Text size="2" truncate>
                    {et.event_type}
                  </Text>
                  <Text size="2" color="gray" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {fmtInt(et.events)}
                  </Text>
                  <Flex gap="2" wrap="wrap" align="center">
                    {top?.objects.map((o) => (
                      <TypeChip key={o.object_type} color={typeColor(o.object_type)}>
                        <span style={{ fontWeight: o.max > 1 ? 700 : 400 }}>
                          {o.min === o.max ? o.min : `${o.min}-${o.max}`} {o.object_type}
                        </span>
                      </TypeChip>
                    ))}
                    {top && top.events < et.events && (
                      <Text size="1" color="gray">
                        {fmtPct(top.events / et.events, 0)} of events
                      </Text>
                    )}
                  </Flex>
                </div>
              );
            })}
          </div>
        </Section>

        <Section
          title="Data quality"
          subtitle={failed.length ? "Data-quality findings" : "Every check passed"}
          actions={
            <OpenLink onOpen={onOpen} target="ocelHealth">
              All checks
            </OpenLink>
          }
        >
          <Flex direction="column" gap="2">
            {failed.length === 0 ? (
              <Flex align="center" gap="2">
                <Text color="green" style={{ display: "flex" }}>
                  <PiCheckCircle />
                </Text>
                <Text size="2">Nothing found in {health.findings.length} checks.</Text>
              </Flex>
            ) : (
              failed.map((f) => (
                <Flex key={f.check} align="center" gap="3">
                  <Badge color={SEVERITY_COLOR[f.severity]} variant="soft">
                    {SEVERITY_ICON[f.severity]}
                  </Badge>
                  <Text size="2">{f.title}</Text>
                  <Text size="2" weight="bold" ml="auto" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {fmtInt(f.count)}
                  </Text>
                </Flex>
              ))
            )}
          </Flex>
        </Section>

        <Flex gap="3" wrap="wrap">
          <OpenLink onOpen={onOpen} target="lifecycleMap">
            Lifecycle map
          </OpenLink>
          <OpenLink onOpen={onOpen} target="ocelTypeGraph">
            Type graph
          </OpenLink>
          <OpenLink onOpen={onOpen} target="ocdfg">
            OC-DFG
          </OpenLink>
        </Flex>
      </Flex>
    </div>
  );
}
