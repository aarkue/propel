import { Flex, Text } from "@r4pm/components/ui";
import {
  Bar,
  fmtInt,
  fmtPct,
  formatDuration,
  LegendItem,
  Metric,
  MetricRow,
  Section,
  useChartTooltip,
} from "../kit";
import { ActivitySequence } from "../shared/ActivitySequence";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import type { OcelHealth } from "./ocel-health";
import { findingsMetric, OpenLink } from "./open-link";

export interface LogThroughput {
  bin_starts_ms: number[];
  bin_width_ms: number;
  started: number[];
  finished: number[];
  median_duration_ms: (number | null)[];
}

export interface LogHealth {
  num_cases: number;
  num_events: number;
  findings: OcelHealth["findings"];
}

export interface LogOverview {
  num_cases: number;
  num_events: number;
  num_activities: number;
  num_variants: number;
  start_ms?: number | null;
  end_ms?: number | null;
  median_case_duration_ms?: number | null;
  p90_case_duration_ms?: number | null;
  top_variants: { activities: string[]; cases: number }[];
  activities: [string, number][];
  throughput: LogThroughput;
  health: LogHealth;
}

/** Detail views the board links to, by the host's view id. */
export type LogOverviewTarget =
  | "logVariants"
  | "activityChart"
  | "workload"
  | "logHealth"
  | "caseDuration"
  | "eventsPerTime"
  | "dfg"
  | "prefixTree";

const card = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid var(--gray-a4)",
  background: "var(--color-panel-solid)",
} as const;

function ThroughputChart({
  t,
  duration,
  date,
}: {
  t: LogThroughput;
  duration: (ms: number) => string;
  date: (ms: number) => string;
}) {
  const { show, hide, tooltip } = useChartTooltip();
  const n = t.started.length;
  if (n === 0) return null;
  const W = 1000;
  const H = 120;
  const DH = 46;
  const max = [...t.started, ...t.finished].reduce((m, v) => Math.max(m, v), 1);
  const maxD = t.median_duration_ms.reduce<number>((m, d) => Math.max(m, d ?? 0), 1);
  const bw = W / n;
  const line = t.median_duration_ms
    .map((d, i) => (d == null ? null : `${(i + 0.5) * bw},${DH - 4 - (d / maxD) * (DH - 10)}`))
    .filter(Boolean)
    .map((p, i) => `${i ? "L" : "M"}${p}`)
    .join("");
  return (
    <div data-tooltip-host style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Cases started and finished per period"
      >
        {t.started.map((s, i) => (
          <g
            key={t.bin_starts_ms[i]}
            onMouseMove={(e) =>
              show(e, {
                title: `${date(t.bin_starts_ms[i])} to ${date(t.bin_starts_ms[i] + t.bin_width_ms)}`,
                rows: [
                  { label: "Started", value: fmtInt(s), color: "var(--accent-9)" },
                  { label: "Finished", value: fmtInt(t.finished[i]), color: "var(--gray-9)" },
                  ...(t.median_duration_ms[i] != null
                    ? [{ label: "Median duration", value: duration(t.median_duration_ms[i] as number) }]
                    : []),
                ],
              })
            }
            onMouseLeave={hide}
          >
            <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" />
            <rect
              x={i * bw + bw * 0.12}
              y={H - (s / max) * (H - 4)}
              width={bw * 0.38}
              height={(s / max) * (H - 4)}
              rx={2}
              fill="var(--accent-9)"
            />
            <rect
              x={i * bw + bw * 0.5}
              y={H - (t.finished[i] / max) * (H - 4)}
              width={bw * 0.38}
              height={(t.finished[i] / max) * (H - 4)}
              rx={2}
              fill="var(--gray-8)"
            />
          </g>
        ))}
      </svg>
      <Text as="div" size="1" color="gray" mt="3" mb="1">
        Median duration of the cases started in each period
      </Text>
      <svg
        viewBox={`0 0 ${W} ${DH}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: DH, display: "block" }}
        role="img"
        aria-label="Median case duration per start period"
      >
        <line
          x1={0}
          x2={W}
          y1={DH - 2}
          y2={DH - 2}
          stroke="var(--gray-6)"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={line}
          fill="none"
          stroke="var(--orange-9)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <Flex justify="between" mt="1">
        <Text size="1" color="gray">
          {date(t.bin_starts_ms[0])}
        </Text>
        <Text size="1" color="gray">
          peak {duration(maxD)}
        </Text>
        <Text size="1" color="gray">
          {date(t.bin_starts_ms[n - 1] + t.bin_width_ms)}
        </Text>
      </Flex>
      {tooltip}
    </div>
  );
}

export interface LogOverviewBoardProps extends ViewerProps<LogOverview> {
  /** Opens a detail view; without it the board shows no links. */
  onOpen?: (target: LogOverviewTarget) => void;
}

/**
 * The first look at an event log: its size and time span, how cases arrive and finish over time,
 * and the most common variants and activities.
 * Each section links to its detail view.
 */
export function LogOverviewBoard({ data, onOpen, ...config }: LogOverviewBoardProps) {
  const cfg = useViewerConfig(config);
  const duration = cfg.format?.duration ?? formatDuration;
  const date = cfg.format?.date ?? ((ms: number) => new Date(ms).toLocaleDateString());
  const failed = data.health.findings.filter((f) => f.count > 0);
  const actColor = (a: string) => cfg.colorOf?.("activity", a) ?? "var(--accent-9)";
  const maxAct = data.activities.reduce((m, a) => Math.max(m, a[1]), 1);
  const quality = findingsMetric(data.health.findings);

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 20 }}>
      <Flex direction="column" gap="6" style={{ maxWidth: 1600 }}>
        <MetricRow>
          <Metric label="Cases" value={fmtInt(data.num_cases)} hint={`${fmtInt(data.num_events)} events`} />
          <Metric label="Variants" value={fmtInt(data.num_variants)} />
          <Metric label="Activities" value={fmtInt(data.num_activities)} />
          {data.start_ms != null && data.end_ms != null && (
            <Metric
              label="Time span"
              value={duration(data.end_ms - data.start_ms)}
              hint={`${date(data.start_ms)} to ${date(data.end_ms)}`}
            />
          )}
          {data.median_case_duration_ms != null && (
            <Metric
              label="Median case"
              value={duration(data.median_case_duration_ms)}
              hint={
                data.p90_case_duration_ms != null ? `p90 ${duration(data.p90_case_duration_ms)}` : undefined
              }
            />
          )}
          <Metric
            label="Data quality"
            value={quality.value}
            tone={quality.tone}
            hint={
              onOpen ? (
                <OpenLink onOpen={onOpen} target="logHealth">
                  {failed.length ? failed[0].title : `${data.health.findings.length} checks`}
                </OpenLink>
              ) : undefined
            }
          />
        </MetricRow>

        <Section
          title="Throughput"
          subtitle="Cases started and finished per period. Recent periods hold cases that may still be running, so their durations read short."
          actions={
            <Flex gap="3" align="center">
              <LegendItem shape="square" color="var(--accent-9)" label="started" />
              <LegendItem shape="square" color="var(--gray-8)" label="finished" />
              <OpenLink onOpen={onOpen} target="caseDuration">
                Case durations
              </OpenLink>
            </Flex>
          }
        >
          <div style={card}>
            <ThroughputChart t={data.throughput} duration={duration} date={date} />
          </div>
        </Section>

        <Section
          title="Top variants"
          subtitle={`${fmtInt(data.num_variants)} distinct activity sequences`}
          actions={
            <Flex gap="3" align="center">
              <OpenLink onOpen={onOpen} target="logVariants">
                Variants
              </OpenLink>
              <OpenLink onOpen={onOpen} target="prefixTree">
                Prefix tree
              </OpenLink>
            </Flex>
          }
        >
          <Flex direction="column" gap="2">
            {data.top_variants.map((v) => {
              const share = v.cases / Math.max(1, data.num_cases);
              return (
                <div
                  key={v.activities.join("\u0000")}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "56px 72px minmax(0, 1fr)",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <Text size="2" weight="bold" align="right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {fmtPct(share)}
                  </Text>
                  <Bar value={share} height={4} />
                  <ActivitySequence
                    activities={v.activities}
                    colorOf={actColor}
                    widthClass="max-w-[12rem]"
                    singleLine
                  />
                </div>
              );
            })}
          </Flex>
        </Section>

        <Section
          title="Activities"
          subtitle="Events per activity"
          actions={
            <Flex gap="3" align="center">
              <OpenLink onOpen={onOpen} target="activityChart">
                Activity counts
              </OpenLink>
              <OpenLink onOpen={onOpen} target="dfg">
                DFG
              </OpenLink>
            </Flex>
          }
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 420px), 1fr))",
              columnGap: 40,
              rowGap: 6,
            }}
          >
            {data.activities.slice(0, 20).map(([a, n]) => (
              <div
                key={a}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) 120px 64px",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <Flex align="center" gap="2" style={{ minWidth: 0 }}>
                  <span
                    style={{ width: 8, height: 8, borderRadius: 4, background: actColor(a), flex: "none" }}
                  />
                  <Text size="2" truncate>
                    {a}
                  </Text>
                </Flex>
                <Bar value={n / maxAct} color={actColor(a)} />
                <Text size="1" color="gray" align="right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {fmtInt(n)}
                </Text>
              </div>
            ))}
          </div>
          {data.activities.length > 20 && (
            <Text size="1" color="gray">
              and {data.activities.length - 20} more
            </Text>
          )}
        </Section>
      </Flex>
    </div>
  );
}
