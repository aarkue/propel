import { Flex, Text } from "@r4pm/components/ui";
import { useId, useMemo, useRef, useState } from "react";
import { PiChartLine } from "react-icons/pi";
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
import { timeTicks } from "../kit/time-axis";
import { useViewSetting } from "../viewer/view-state";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";

export interface ObjectTypePopulation {
  object_type: string;
  objects: number;
  objects_without_events: number;
  alive: number[];
  started: number[];
  ended: number[];
}

export interface ObjectPopulation {
  bin_starts_ms: number[];
  bin_width_ms: number;
  object_types: ObjectTypePopulation[];
}

type Scale = "own" | "shared";
type Measure = "alive" | "started" | "ended";

const SCALES: Option<Scale>[] = [
  { value: "own", label: "Own", description: "Each type fills its row, to compare shapes" },
  { value: "shared", label: "Shared", description: "One scale for all types, to compare sizes" },
];
const MEASURES: Option<Measure>[] = [
  {
    value: "alive",
    label: "Alive",
    description: "Mean number of objects between their first and last event during the period",
  },
  { value: "started", label: "Started", description: "Objects whose first event falls in the period" },
  { value: "ended", label: "Ended", description: "Objects whose last event falls in the period" },
];

const W = 1000;
const ROW_H = 64;
const LABEL_W = 200;
const VALUE_W = 110;

// Reduces, since spreading a long series into Math.max overflows the argument limit.
const maxOf = (xs: number[]) => xs.reduce((m, v) => Math.max(m, v), Number.NEGATIVE_INFINITY);
const argMax = (xs: number[]) => xs.indexOf(maxOf(xs));
const fmtMean = (n: number) => n.toLocaleString("en", { maximumFractionDigits: n < 10 ? 1 : 0 });

/** A smooth (Catmull-Rom) path through the points, kept above the baseline. */
function smoothPath(xs: number[], ys: number[], base: number): string {
  if (xs.length === 0) return "";
  let d = `M${xs[0]},${ys[0]}`;
  for (let i = 0; i < xs.length - 1; i++) {
    const [x0, y0] = [xs[Math.max(0, i - 1)], ys[Math.max(0, i - 1)]];
    const [x1, y1] = [xs[i], ys[i]];
    const [x2, y2] = [xs[i + 1], ys[i + 1]];
    const [x3, y3] = [xs[Math.min(xs.length - 1, i + 2)], ys[Math.min(xs.length - 1, i + 2)]];
    const c1y = Math.min(base, y1 + (y2 - y0) / 6);
    const c2y = Math.min(base, y2 - (y3 - y1) / 6);
    d += ` C${x1 + (x2 - x0) / 6},${c1y} ${x2 - (x3 - x1) / 6},${c2y} ${x2},${y2}`;
  }
  return d;
}

export type ObjectPopulationViewProps = ViewerProps<ObjectPopulation>;

/** Objects alive per type over time, one smooth area per type on a shared time axis. */
export function ObjectPopulationView({ data, colorOf, format }: ObjectPopulationViewProps) {
  const cfg = useViewerConfig({ colorOf, format });
  const [scale, setScale] = useViewSetting<Scale>("population.scale", "own");
  const [measure, setMeasure] = useViewSetting<Measure>("population.measure", "alive");
  const [hover, setHover] = useState<number | null>(null);
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const gradientId = `pop${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { show, hide, tooltip } = useChartTooltip();
  const bins = data.bin_starts_ms.length;
  const series = useMemo(
    () => data.object_types.map((t) => ({ t, values: t[measure] })),
    [data.object_types, measure],
  );

  if (bins === 0 || data.object_types.length === 0) {
    return (
      <EmptyState
        icon={<PiChartLine />}
        title="No objects with events"
        description="No object in this OCEL is related to an event, so none has a lifetime."
      />
    );
  }

  const date = cfg.format?.date ?? ((ms: number) => new Date(ms).toLocaleDateString());
  const color = (t: string) => cfg.colorOf?.("objectType", t) ?? "var(--accent-9)";
  const sharedMax = series.reduce((m, s) => s.values.reduce((sm, v) => Math.max(sm, v), m), 1);
  const x = (i: number) => (bins === 1 ? W / 2 : (i / (bins - 1)) * W);
  const totalObjects = data.object_types.reduce((s, t) => s + t.objects, 0);
  const without = data.object_types.reduce((s, t) => s + t.objects_without_events, 0);
  const peak = data.object_types
    .map((t) => ({ t, n: maxOf(t.alive), at: argMax(t.alive) }))
    .sort((a, b) => b.n - a.n)[0];
  const allAlive = data.bin_starts_ms.map((_, i) => data.object_types.reduce((s, t) => s + t.alive[i], 0));
  const busiest = argMax(allAlive);
  const measureLabel = MEASURES.find((m) => m.value === measure)?.label.toLowerCase() ?? measure;

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = plotRef.current?.getBoundingClientRect();
    if (!r) return;
    const i = Math.max(0, Math.min(bins - 1, Math.round(((e.clientX - r.left) / r.width) * (bins - 1))));
    setHover(i);
    const end = data.bin_starts_ms[i] + data.bin_width_ms;
    show(e, {
      title: `${date(data.bin_starts_ms[i])} to ${date(end)}`,
      rows: data.object_types.map((t) => ({
        label: t.object_type,
        value: `${fmtMean(t.alive[i])} alive · +${fmtInt(t.started[i])} -${fmtInt(t.ended[i])}`,
        color: color(t.object_type),
      })),
    });
  };
  const leave = () => {
    setHover(null);
    hide();
  };
  const cols = `${LABEL_W}px minmax(0, 1fr) ${VALUE_W}px`;
  // The plot spans the first to the last bin start, so ticks are times in that range.
  const first = data.bin_starts_ms[0];
  const axisSpan = Math.max(1, data.bin_starts_ms[bins - 1] - first);
  const axisTicks = bins > 1 ? timeTicks(first, first + axisSpan, 6) : [first];

  return (
    <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
      <Toolbar
        end={
          <Text size="1" color="gray">
            {data.object_types.length} object types · bins of{" "}
            {(cfg.format?.duration ?? formatDuration)(data.bin_width_ms)}
          </Text>
        }
      >
        <OptionMenu label="Show" value={measure} options={MEASURES} onChange={setMeasure} />
        <ToolbarDivider />
        <OptionMenu label="Scale" value={scale} options={SCALES} onChange={setScale} />
      </Toolbar>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
        <Flex direction="column" gap="5" style={{ maxWidth: 1400 }}>
          <MetricRow>
            <Metric label="Objects" value={fmtInt(totalObjects)} hint={`${data.object_types.length} types`} />
            <Metric
              label="Most alive"
              value={fmtMean(peak.n)}
              hint={`${peak.t.object_type}, ${date(data.bin_starts_ms[peak.at])}`}
            />
            <Metric
              label="Period with most objects alive"
              value={date(data.bin_starts_ms[busiest])}
              hint={`${fmtMean(allAlive[busiest])} objects alive on average`}
            />
            <Metric
              label="Without events"
              value={fmtInt(without)}
              hint="have no lifetime"
              tone={without > 0 ? "warn" : undefined}
            />
          </MetricRow>

          <Section
            title={`Objects ${measureLabel} over time`}
            subtitle="Number of objects per type between their first and last event. Hover over the chart to compare the types at one time."
          >
            <div data-tooltip-host style={{ position: "relative" }}>
              {series.map(({ t, values }, row) => {
                const max = scale === "shared" ? sharedMax : Math.max(1, maxOf(values));
                const y = (v: number) => ROW_H - 2 - (v / max) * (ROW_H - 8);
                const xs = values.map((_, i) => x(i));
                const ys = values.map(y);
                const line = smoothPath(xs, ys, ROW_H - 2);
                const c = color(t.object_type);
                const dim = hoverRow != null && hoverRow !== t.object_type;
                return (
                  <div
                    key={t.object_type}
                    onMouseEnter={() => setHoverRow(t.object_type)}
                    onMouseLeave={() => setHoverRow(null)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: cols,
                      gap: 16,
                      alignItems: "center",
                      padding: "6px 0",
                      borderTop: "1px solid var(--gray-a3)",
                      opacity: dim ? 0.55 : 1,
                      transition: "opacity 150ms",
                    }}
                  >
                    <Flex align="center" gap="2" style={{ minWidth: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 5, background: c, flex: "none" }} />
                      <Flex direction="column" style={{ minWidth: 0 }}>
                        <Text size="2" weight="medium" truncate>
                          {t.object_type}
                        </Text>
                        <Text size="1" color="gray">
                          {fmtInt(t.objects)} objects
                          {t.objects_without_events > 0 &&
                            ` · ${fmtInt(t.objects_without_events)} without events`}
                        </Text>
                      </Flex>
                    </Flex>
                    <svg
                      viewBox={`0 0 ${W} ${ROW_H}`}
                      preserveAspectRatio="none"
                      style={{ width: "100%", height: ROW_H, display: "block", overflow: "visible" }}
                      role="img"
                      aria-label={`${t.object_type} objects ${measureLabel} over time`}
                    >
                      <defs>
                        <linearGradient id={`${gradientId}-${row}`} x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={c} stopOpacity={0.45} />
                          <stop offset="100%" stopColor={c} stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <path d={`${line} L${W},${ROW_H} L0,${ROW_H} Z`} fill={`url(#${gradientId}-${row})`} />
                      <path
                        d={line}
                        fill="none"
                        stroke={c}
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                    <Flex direction="column" align="end">
                      <Text size="3" weight="bold" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {fmtMean(hover != null ? values[hover] : maxOf(values))}
                      </Text>
                      <Text size="1" color="gray">
                        {hover != null ? measureLabel : `peak ${measureLabel}`}
                      </Text>
                    </Flex>
                  </div>
                );
              })}
              <div
                ref={plotRef}
                onMouseMove={onMove}
                onMouseLeave={leave}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 23,
                  left: LABEL_W + 16,
                  right: VALUE_W + 16,
                  cursor: "crosshair",
                }}
              >
                {hover != null && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      bottom: 0,
                      left: `${(hover / Math.max(1, bins - 1)) * 100}%`,
                      width: 1,
                      background: "var(--gray-11)",
                      pointerEvents: "none",
                    }}
                  />
                )}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: cols,
                  gap: 16,
                  borderTop: "1px solid var(--gray-a5)",
                }}
              >
                <span />
                <div style={{ position: "relative", height: 22 }}>
                  {axisTicks.map((t) => (
                    <Text
                      key={t}
                      size="1"
                      color="gray"
                      style={{
                        position: "absolute",
                        top: 4,
                        left: `${((t - first) / axisSpan) * 100}%`,
                        transform: t === first ? undefined : "translateX(-50%)",
                        whiteSpace: "nowrap",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {date(t)}
                    </Text>
                  ))}
                </div>
                <span />
              </div>
              {tooltip}
            </div>
          </Section>
        </Flex>
      </div>
    </Flex>
  );
}
