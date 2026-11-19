import { Badge, Button, Flex, Spinner, Text } from "@r4pm/components/ui";
import { useId, useMemo, useState } from "react";
import { PiArrowSquareOut, PiCheckCircle, PiGraph } from "react-icons/pi";
import { EmptyState } from "../feedback/EmptyState";
import {
  fmtInt,
  fmtPct,
  formatDuration,
  LegendItem,
  Metric,
  MetricRow,
  type Option,
  OptionMenu,
  Section,
  Segmented,
  Toolbar,
  TypeChip,
  useChartTooltip,
} from "../kit";
import { useFitText } from "../kit/fit-label";
import { useAsyncResult, useKeyedState } from "../kit/hooks";
import { timeTickLabel, timeTicks } from "../kit/time-axis";
import { describeConstraintRich } from "../oc-declare/constraintText";
import { RankedBarList } from "../shared/RankedBarList";
import type { OCDeclareArc } from "../oc-declare/index";
import type { ConstraintLabel } from "../oc-declare/types";
import { useViewSetting } from "../viewer/view-state";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import {
  type ArcViolation,
  type ArcViolations,
  type EdgeDurations,
  cardinalityText,
  type LaneWindow,
  laneRange,
  type ObjectLane,
  violationRate,
} from "./model";

type Show = "all" | "too_few" | "too_many";
const SHOW: Option<Show>[] = [
  { value: "all", label: "All violations", description: "Every violating source event" },
  { value: "too_few", label: "Too few", description: "Fewer target events than required" },
  { value: "too_many", label: "Too many", description: "More target events than allowed" },
];

const WINDOWS: Option<LaneWindow>[] = [
  { value: "focus", label: "Around it" },
  { value: "all", label: "Everything" },
];

const RED = "var(--red-9)";
const GREEN = "var(--grass-9)";
const ROWS = 200;
const MONO = "ui-monospace, monospace";
/** Room for a lane's object id, between its dot and the "+N" before the window. */
const LANE_LABEL_W = 108;
const MAX_LANES = 8;

export interface ViolationExplorerProps extends ViewerProps<ArcViolations> {
  /** The constraint `data` checks. */
  arc: OCDeclareArc;
  /** Durations from source events to their first target event. */
  edgeStats?: EdgeDurations | null;
  /** The events of the given objects, for a violation's timeline. */
  loadLanes?: (objectIds: string[]) => Promise<ObjectLane[]>;
  /** Show an object's process execution, e.g., in a host panel. */
  onOpenObject?: (objectType: string, id: string) => void;
}

/**
 * Why one OC-DECLARE constraint is violated: how many source events break it and how (too few or
 * too many target events), when, with which objects, and what the objects did instead. A violation
 * opens on a timeline of its objects.
 */
export function ViolationExplorer({
  data,
  arc,
  edgeStats,
  loadLanes,
  onOpenObject,
  ...config
}: ViolationExplorerProps) {
  const cfg = useViewerConfig(config);
  const duration = cfg.format?.duration ?? ((ms: number) => formatDuration(ms));
  const date = cfg.format?.date ?? ((ms: number) => new Date(ms).toLocaleString());
  const [show, setShow] = useViewSetting<Show>("violations.show", "all");
  // An index into `data.examples`, so a new result must not keep it.
  const [selected, setSelected] = useKeyedState<number | null>(data, null);
  const activityColor = (a: string) => cfg.colorOf?.("activity", a) ?? "var(--gray-11)";
  const typeColor = (t: string) => cfg.colorOf?.("objectType", t) ?? "var(--gray-9)";
  const rows = useMemo(
    () => data.examples.filter((v) => show === "all" || v.kind === show),
    [data.examples, show],
  );
  const picked = selected != null ? data.examples[selected] : undefined;
  const rate = violationRate(data);
  // EP and DP look back in time: what came before the source, and how long before.
  const before = arc.arc_type === "EP" || arc.arc_type === "DP";

  const sentence = describeConstraintRich(
    arc.from,
    arc.to,
    arc.arc_type,
    arc.label as unknown as ConstraintLabel,
    (n) => activityColor(n),
    (n) => typeColor(n),
  );

  return (
    <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
      <Toolbar
        end={
          <Text size="1" color="gray">
            {arc.arc_type} {arc.from} → {arc.to}, {cardinalityText(arc.counts)}
          </Text>
        }
      >
        <OptionMenu label="Show" value={show} options={SHOW} onChange={setShow} />
      </Toolbar>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
        <Flex direction="column" gap="5" style={{ maxWidth: 1280 }}>
          <div
            style={{
              padding: "14px 16px",
              borderRadius: 12,
              border: "1px solid var(--gray-a4)",
              background: `linear-gradient(135deg, var(--${rate > 0 ? "red" : "grass"}-a2), transparent 70%)`,
            }}
          >
            <span className="r4pm-eyebrow">Constraint</span>
            <Text as="p" size="3" mt="1" style={{ margin: 0 }}>
              {sentence} Required: {cardinalityText(arc.counts)}.
            </Text>
          </div>

          <MetricRow>
            <Metric
              label="Violated"
              value={fmtPct(rate)}
              tone={rate === 0 ? "good" : rate < 0.05 ? "warn" : "bad"}
              hint={`${fmtInt(data.violating_sources)} of ${fmtInt(data.sources)} ${arc.from} events`}
            />
            <Metric label="Too few" value={fmtInt(data.too_few)} hint={`fewer ${arc.to} than required`} />
            <Metric label="Too many" value={fmtInt(data.too_many)} hint={`more ${arc.to} than allowed`} />
            <Metric
              label="Bindings"
              value={fmtInt(data.violating_bindings)}
              hint={`violated, of ${fmtInt(data.bindings)} checked`}
            />
          </MetricRow>

          {data.violating_sources === 0 ? (
            <EmptyState
              icon={<PiCheckCircle />}
              title="No violations"
              description={`Every ${arc.from} event satisfies this constraint.`}
            />
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
                  gap: 24,
                }}
              >
                <Section title="Over time" subtitle={`${arc.from} events per period, violating ones in red`}>
                  <OverTime data={data} date={date} />
                </Section>
                <Section title="Target events found" subtitle={`How many ${arc.to} events each binding has`}>
                  <FoundHistogram data={data} />
                </Section>
                {data.instead.length > 0 && (
                  <Section
                    title="What happened instead"
                    subtitle={
                      before
                        ? `The objects' activity right before, where ${arc.to} was missing`
                        : `The objects' next activity, where ${arc.to} was missing`
                    }
                  >
                    <RankedBarList
                      items={rankItems(data.instead)}
                      scope="activity"
                      colorOf={cfg.colorOf}
                      max={8}
                      valueFormat={share(data.too_few)}
                    />
                  </Section>
                )}
                <Section title="Objects involved" subtitle="Object types and the objects in most violations">
                  <RankedBarList
                    items={rankItems(data.by_object_type)}
                    scope="objectType"
                    colorOf={cfg.colorOf}
                    max={8}
                    valueFormat={share(data.violating_sources)}
                  />
                  <Flex gap="1" wrap="wrap" mt="2">
                    {data.top_objects.slice(0, 12).map((o) => (
                      <TypeChip
                        key={o.id}
                        mono
                        color={typeColor(o.object_type)}
                        suffix={`${o.violations}x`}
                        title={onOpenObject ? "Open its execution graph" : undefined}
                        onClick={onOpenObject ? () => onOpenObject(o.object_type, o.id) : undefined}
                      >
                        {o.id}
                      </TypeChip>
                    ))}
                  </Flex>
                </Section>
                {edgeStats && edgeStats.bin_centers_ms.length > 0 && (
                  <Section
                    title="Time to target"
                    subtitle={
                      before
                        ? `How long before ${arc.from} its latest ${arc.to} happened, over all bindings that have one`
                        : `From ${arc.from} to its first ${arc.to}, over all bindings that have one`
                    }
                  >
                    <DurationHistogram stats={edgeStats} duration={duration} before={before} />
                  </Section>
                )}
              </div>

              <Section
                title="Violations"
                subtitle={`${fmtInt(rows.length)} shown${data.examples.length < data.violating_sources ? `, the first ${fmtInt(data.examples.length)} of ${fmtInt(data.violating_sources)} by time` : ""}. Click one for its timeline.`}
              >
                <ViolationTable
                  rows={rows.slice(0, ROWS)}
                  all={data.examples}
                  selected={selected}
                  onSelect={setSelected}
                  date={date}
                  typeColor={typeColor}
                />
                {rows.length > ROWS && (
                  <Text size="1" color="gray">
                    {fmtInt(rows.length - ROWS)} more not listed.
                  </Text>
                )}
              </Section>
              {picked && (
                <ViolationDetail
                  key={selected}
                  violation={picked}
                  arc={arc}
                  loadLanes={loadLanes}
                  onOpenObject={onOpenObject}
                  activityColor={activityColor}
                  typeColor={typeColor}
                  date={date}
                  duration={duration}
                />
              )}
            </>
          )}
        </Flex>
      </div>
    </Flex>
  );
}

const rankItems = (items: { name: string; violations: number }[]) =>
  items.map((i) => ({ key: i.name, count: i.violations }));
const share = (total: number) => (n: number) => `${fmtInt(n)} · ${fmtPct(n / Math.max(1, total), 0)}`;

function OverTime({ data, date }: { data: ArcViolations; date: (ms: number) => string }) {
  const { show, hide, tooltip } = useChartTooltip();
  const max = Math.max(1, ...data.over_time.map((b) => b.sources));
  const H = 120;
  return (
    <div data-tooltip-host style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "end", gap: 2, height: H }}>
        {data.over_time.map((b) => (
          <div
            key={b.start_ms}
            onMouseMove={(e) =>
              show(e, {
                title: `${date(b.start_ms)} to ${date(b.start_ms + data.bin_width_ms)}`,
                rows: [
                  { label: "Source events", value: fmtInt(b.sources) },
                  { label: "Violating", value: fmtInt(b.violations), color: RED },
                  { label: "Rate", value: b.sources ? fmtPct(b.violations / b.sources) : "-" },
                ],
              })
            }
            onMouseLeave={hide}
            style={{
              flex: 1,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "end",
            }}
          >
            <div
              style={{
                height: (b.sources / max) * H,
                background: "var(--gray-a5)",
                borderRadius: "3px 3px 0 0",
                display: "flex",
                flexDirection: "column",
                justifyContent: "end",
                overflow: "hidden",
              }}
            >
              <div
                style={{ height: `${b.sources ? (b.violations / b.sources) * 100 : 0}%`, background: RED }}
              />
            </div>
          </div>
        ))}
      </div>
      <Flex justify="between" mt="1">
        <Text size="1" color="gray">
          {data.over_time[0] ? date(data.over_time[0].start_ms) : ""}
        </Text>
        <Text size="1" color="gray">
          {data.over_time.length
            ? date(data.over_time[data.over_time.length - 1].start_ms + data.bin_width_ms)
            : ""}
        </Text>
      </Flex>
      {tooltip}
    </div>
  );
}

function FoundHistogram({ data }: { data: ArcViolations }) {
  const { show, hide, tooltip } = useChartTooltip();
  const max = Math.max(1, ...data.found_histogram.map((b) => b.bindings));
  const H = 120;
  return (
    <div data-tooltip-host style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "end", gap: 6, height: H }}>
        {data.found_histogram.slice(0, 24).map((b) => (
          <div
            key={b.found}
            onMouseMove={(e) =>
              show(e, {
                title: `${b.found}${b.found >= 50 ? " or more" : ""} found`,
                rows: [
                  { label: "Bindings", value: fmtInt(b.bindings) },
                  { label: "Share", value: fmtPct(b.bindings / Math.max(1, data.bindings)) },
                ],
                footer: b.violating ? "Violates the constraint" : "Satisfies the constraint",
              })
            }
            onMouseLeave={hide}
            style={{
              flex: 1,
              maxWidth: 48,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                width: "100%",
                height: Math.max(2, (Math.sqrt(b.bindings) / Math.sqrt(max)) * (H - 20)),
                background: b.violating ? RED : GREEN,
                opacity: b.violating ? 0.9 : 0.55,
                borderRadius: "4px 4px 1px 1px",
              }}
            />
            <Text size="1" color="gray" style={{ fontVariantNumeric: "tabular-nums" }}>
              {b.found >= 50 ? "50+" : b.found}
            </Text>
          </div>
        ))}
      </div>
      <Flex gap="3" mt="2">
        <LegendItem shape="square" color={GREEN} label="satisfies" />
        <LegendItem shape="square" color={RED} label="violates" />
        <Text size="1" color="gray">
          height: square root of bindings
        </Text>
      </Flex>
      {tooltip}
    </div>
  );
}

function DurationHistogram({
  stats,
  duration,
  before,
}: {
  stats: EdgeDurations;
  duration: (ms: number) => string;
  before: boolean;
}) {
  const { show, hide, tooltip } = useChartTooltip();
  const max = Math.max(1, ...stats.percentages);
  const H = 100;
  return (
    <div data-tooltip-host style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "end", gap: 2, height: H }}>
        {stats.bin_centers_ms.map((c, i) => (
          <div
            key={c}
            onMouseMove={(e) =>
              show(e, {
                title: `about ${duration(Math.abs(c))}${before ? " before" : ""}`,
                rows: [{ label: "Share", value: `${stats.percentages[i].toFixed(1)}%` }],
              })
            }
            onMouseLeave={hide}
            style={{
              flex: 1,
              height: (stats.percentages[i] / max) * H,
              background: "var(--accent-8)",
              borderRadius: "3px 3px 0 0",
            }}
          />
        ))}
      </div>
      <Flex justify="between" mt="1">
        <Text size="1" color="gray">
          {before ? `${duration(Math.abs(stats.min_ms))} before` : duration(stats.min_ms)}
        </Text>
        <Text size="1" color="gray">
          {stats.total_count != null ? `${fmtInt(stats.total_count)} durations` : ""}
        </Text>
        <Text size="1" color="gray">
          {before ? `${duration(Math.abs(stats.max_ms))} before` : duration(stats.max_ms)}
        </Text>
      </Flex>
      {tooltip}
    </div>
  );
}

function ViolationTable({
  rows,
  all,
  selected,
  onSelect,
  date,
  typeColor,
}: {
  rows: ArcViolation[];
  all: ArcViolation[];
  selected: number | null;
  onSelect: (i: number) => void;
  date: (ms: number) => string;
  typeColor: (t: string) => string;
}) {
  const index = useMemo(() => new Map(all.map((v, i) => [v, i])), [all]);
  const cols = "170px minmax(90px, 140px) 90px 60px minmax(0, 1fr) minmax(0, 160px)";
  return (
    <div style={{ border: "1px solid var(--gray-a4)", borderRadius: 10, overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: cols,
          gap: 12,
          padding: "8px 12px",
          background: "var(--gray-a2)",
        }}
      >
        {["Time", "Source event", "Kind", "Found", "Objects", "Instead"].map((h) => (
          <span key={h} className="r4pm-eyebrow">
            {h}
          </span>
        ))}
      </div>
      <div style={{ maxHeight: 360, overflow: "auto" }}>
        {rows.map((v) => {
          const i = index.get(v) ?? -1;
          const active = i === selected;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              style={{
                all: "unset",
                boxSizing: "border-box",
                width: "100%",
                display: "grid",
                gridTemplateColumns: cols,
                gap: 12,
                alignItems: "center",
                padding: "6px 12px",
                cursor: "pointer",
                borderTop: "1px solid var(--gray-a3)",
                background: active ? "var(--accent-a3)" : undefined,
              }}
            >
              <Text size="1" color="gray" style={{ fontVariantNumeric: "tabular-nums" }}>
                {date(v.time_ms)}
              </Text>
              <Text size="1" truncate style={{ fontFamily: "var(--code-font-family)" }}>
                {v.source}
              </Text>
              <Badge size="1" color={v.kind === "too_few" ? "red" : "amber"} variant="soft">
                {v.kind === "too_few" ? "too few" : "too many"}
              </Badge>
              <Text size="2" weight="medium" style={{ fontVariantNumeric: "tabular-nums" }}>
                {v.found}
              </Text>
              <Flex gap="1" style={{ minWidth: 0, overflow: "hidden" }}>
                {v.objects.slice(0, 3).map(([t, id]) => (
                  <TypeChip key={id} mono color={typeColor(t)}>
                    {id}
                  </TypeChip>
                ))}
                {v.objects.length > 3 && (
                  <Text size="1" color="gray">
                    +{v.objects.length - 3}
                  </Text>
                )}
              </Flex>
              <Text size="1" color="gray" truncate>
                {v.instead ?? ""}
              </Text>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ViolationDetail({
  violation,
  arc,
  loadLanes,
  onOpenObject,
  activityColor,
  typeColor,
  date,
  duration,
}: {
  violation: ArcViolation;
  arc: OCDeclareArc;
  loadLanes?: (objectIds: string[]) => Promise<ObjectLane[]>;
  onOpenObject?: (objectType: string, id: string) => void;
  activityColor: (a: string) => string;
  typeColor: (t: string) => string;
  date: (ms: number) => string;
  duration: (ms: number) => string;
}) {
  const { show, hide, tooltip } = useChartTooltip();
  const clipId = `lanes${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const run = useMemo(
    () => (loadLanes ? () => loadLanes(violation.objects.slice(0, MAX_LANES).map(([, id]) => id)) : null),
    [loadLanes, violation],
  );
  const { value: lanes, error } = useAsyncResult(run);
  const fitId = useFitText(12, 400, MONO);
  const failed = error != null;

  const [mode, setMode] = useState<LaneWindow>("focus");
  const [lo, hi] = lanes ? laneRange(lanes, violation.time_ms, mode) : [0, 1];
  const W = 1000;
  const LEFT = 150;
  const RIGHT = W - 56;
  const LANE = 34;
  const plotH = (lanes?.length ?? 0) * LANE + 6;
  const x = (t: number) => LEFT + ((t - lo) / (hi - lo)) * (RIGHT - LEFT);
  const ticks = lanes ? timeTicks(lo, hi, 5).filter((t) => t > lo && t < hi) : [];

  return (
    <Section
      title="Violation"
      subtitle={`${violation.source} at ${date(violation.time_ms)}: ${violation.found} ${arc.to}, required ${cardinalityText(arc.counts)}${violation.instead ? `; next was ${violation.instead}` : ""}`}
      actions={
        <Flex gap="2" align="center">
          {lanes && <Segmented value={mode} options={WINDOWS} onChange={setMode} aria-label="Time window" />}
          {onOpenObject && violation.objects[0] && (
            <Button
              size="1"
              variant="soft"
              onClick={() => onOpenObject(violation.objects[0][0], violation.objects[0][1])}
            >
              <PiGraph /> Execution graph of {violation.objects[0][1]} <PiArrowSquareOut />
            </Button>
          )}
        </Flex>
      }
    >
      {!loadLanes ? null : failed ? (
        <Text size="1" color="red">
          Could not load the objects' events.
        </Text>
      ) : !lanes ? (
        <Spinner />
      ) : (
        <div
          data-tooltip-host
          style={{
            position: "relative",
            border: "1px solid var(--gray-a4)",
            borderRadius: 10,
            padding: "8px 0",
            background: "var(--gray-a2)",
          }}
        >
          <svg
            viewBox={`0 0 ${W} ${plotH + 24}`}
            style={{ width: "100%", display: "block" }}
            role="img"
            aria-label="Events of the violation's objects"
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={LEFT - 10} y={0} width={RIGHT - LEFT + 20} height={plotH} />
              </clipPath>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={0} y2={plotH} stroke="var(--gray-a4)" />
                <text x={x(t)} y={plotH + 14} fontSize="10" textAnchor="middle" fill="var(--gray-10)">
                  {timeTickLabel(t, hi - lo)}
                </text>
              </g>
            ))}
            <line
              x1={x(violation.time_ms)}
              x2={x(violation.time_ms)}
              y1={0}
              y2={plotH}
              stroke={RED}
              strokeDasharray="4 3"
            />
            {lanes.map((l, r) => {
              const y = r * LANE + 18;
              const inside = l.events.filter((e) => e.time_ms >= lo && e.time_ms <= hi);
              const before = l.events.filter((e) => e.time_ms < lo).length;
              const after = l.events.length - inside.length - before;
              const dense = inside.length > 60;
              const first = inside[0]?.time_ms;
              const last = inside[inside.length - 1]?.time_ms;
              return (
                <g key={l.id}>
                  <circle cx={10} cy={y} r={4} fill={typeColor(l.object_type)} />
                  <text
                    x={20}
                    y={y + 4}
                    fontSize="12"
                    fill="var(--gray-12)"
                    fontFamily="var(--code-font-family)"
                  >
                    {fitId(l.id, LANE_LABEL_W)}
                  </text>
                  {before > 0 && (
                    <text x={LEFT - 14} y={y + 4} fontSize="10" textAnchor="end" fill="var(--gray-9)">
                      +{fmtInt(before)}
                    </text>
                  )}
                  {after > 0 && (
                    <text x={RIGHT + 14} y={y + 4} fontSize="10" fill="var(--gray-9)">
                      +{fmtInt(after)}
                    </text>
                  )}
                  <g clipPath={`url(#${clipId})`}>
                    {first !== undefined && last !== undefined && (
                      <line
                        x1={before > 0 ? LEFT - 10 : x(first)}
                        x2={after > 0 ? RIGHT + 10 : x(last)}
                        y1={y}
                        y2={y}
                        stroke={typeColor(l.object_type)}
                        strokeWidth={4}
                        strokeOpacity={0.3}
                        strokeLinecap="round"
                      />
                    )}
                    {inside.map((e) => {
                      const isSource = e.id === violation.source;
                      const isTarget = e.activity === arc.to;
                      const size = dense && !isSource ? 0.6 : 1;
                      return (
                        <g
                          key={e.id}
                          onMouseMove={(m) =>
                            show(m, {
                              title: e.activity,
                              rows: [
                                { label: "Time", value: date(e.time_ms) },
                                {
                                  label: "From the source",
                                  value: `${e.time_ms >= violation.time_ms ? "+" : "-"}${duration(Math.abs(e.time_ms - violation.time_ms))}`,
                                },
                              ],
                              footer: `event ${e.id}`,
                            })
                          }
                          onMouseLeave={hide}
                        >
                          {isTarget ? (
                            <rect
                              x={x(e.time_ms) - 6 * size}
                              y={y - 6 * size}
                              width={12 * size}
                              height={12 * size}
                              transform={`rotate(45 ${x(e.time_ms)} ${y})`}
                              fill={activityColor(e.activity)}
                              stroke="var(--gray-12)"
                              strokeWidth={1.2}
                            />
                          ) : (
                            <circle
                              cx={x(e.time_ms)}
                              cy={y}
                              r={isSource ? 7 : 5 * size}
                              fill={activityColor(e.activity)}
                              stroke={isSource ? RED : "var(--color-panel-solid)"}
                              strokeWidth={isSource ? 2.5 : dense ? 0.8 : 1.5}
                            />
                          )}
                        </g>
                      );
                    })}
                  </g>
                </g>
              );
            })}
          </svg>
          {tooltip}
          <Flex gap="3" px="3" pt="1" wrap="wrap" align="center">
            <LegendItem color={RED} label="source event" />
            <LegendItem shape="square" color="var(--gray-11)" label={`${arc.to} (diamond)`} />
            {mode === "focus" && (
              <Text size="1" color="gray">
                +N: events outside the window
              </Text>
            )}
            {violation.objects.length > MAX_LANES && (
              <Text size="1" color="gray">
                first {MAX_LANES} of {violation.objects.length} objects
              </Text>
            )}
            {onOpenObject && (
              <Flex gap="1" ml="auto" wrap="wrap">
                {lanes.map((l) => (
                  <TypeChip
                    key={l.id}
                    mono
                    color={typeColor(l.object_type)}
                    suffix="graph"
                    title="Open its execution graph"
                    onClick={() => onOpenObject(l.object_type, l.id)}
                  >
                    {l.id}
                  </TypeChip>
                ))}
              </Flex>
            )}
          </Flex>
        </div>
      )}
    </Section>
  );
}
