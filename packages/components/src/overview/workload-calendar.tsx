import { Callout, Flex, Text } from "@r4pm/components/ui";
import { useMemo, useState } from "react";
import { PiCalendarDots } from "react-icons/pi";
import { EmptyState } from "../feedback/EmptyState";
import {
  Bar,
  fmtInt,
  fmtPct,
  Metric,
  MetricRow,
  type Option,
  OptionMenu,
  RampLegend,
  RECORDED_TIME,
  rampColor,
  Section,
  Toolbar,
  TimeZonePicker,
  ToolbarDivider,
  useChartTooltip,
} from "../kit";
import { useViewSetting } from "../viewer/view-state";
import type { ViewerProps } from "../viewer/viewer-config";

export interface WorkloadGroup {
  key: string;
  total: number;
  /** 168 counts, `counts[day * 24 + hour]` with Monday as day 0. */
  counts: number[];
}

export interface Workload {
  groups: WorkloadGroup[];
  events_without_time: number;
  /** Every event is at midnight in its own offset: the log records dates only. */
  date_only: boolean;
  span_ms?: [number, number] | null;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const ALL = "__all__";
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function sumCounts(groups: WorkloadGroup[]): number[] {
  const out = new Array(168).fill(0);
  for (const g of groups) for (let i = 0; i < 168; i++) out[i] += g.counts[i] ?? 0;
  return out;
}

export interface WorkloadControls {
  /** The attribute the groups are of, one of `groupByOptions`. */
  groupBy?: string;
  /** IANA zone the counts are in, or `RECORDED_TIME` for each event's own offset. */
  timeZone?: string;
}

export interface WorkloadCalendarProps extends ViewerProps<Workload> {
  /** What the groups are, e.g., "Activity". */
  groupLabel?: string;
  /** The attributes the host can group by; with `onControlsChange` and a `groupBy`, a menu offers them. */
  groupByOptions?: Option<string>[];
  controls?: WorkloadControls;
  /** With it, a menu offers `groupByOptions` and a picker the time zones. */
  onControlsChange?: (next: WorkloadControls) => void;
}

/** Events by weekday and hour of day, with the hourly profile above and daily totals beside. */
export function WorkloadCalendar({
  data,
  groupLabel = "Activity",
  groupByOptions,
  controls = {},
  onControlsChange,
}: WorkloadCalendarProps) {
  const { groupBy } = controls;
  const timeZone = controls.timeZone ?? RECORDED_TIME;
  const [selected, setSelected] = useViewSetting<string>("workload.group", ALL);
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const { show, hide, tooltip } = useChartTooltip();
  const group = data.groups.find((g) => g.key === selected);
  const counts = useMemo(() => (group ? group.counts : sumCounts(data.groups)), [group, data.groups]);

  if (data.groups.length === 0) {
    return (
      <EmptyState
        icon={<PiCalendarDots />}
        title="No timestamped events"
        description="This log has no events with a readable time."
      />
    );
  }

  const hourTotals = Array.from({ length: 24 }, (_, h) => sum(DAYS.map((_d, d) => counts[d * 24 + h])));
  const dayTotals = DAYS.map((_d, d) => sum(counts.slice(d * 24, d * 24 + 24)));
  const total = sum(dayTotals);
  const max = Math.max(1, ...counts);
  const maxHour = Math.max(1, ...hourTotals);
  const maxDay = Math.max(1, ...dayTotals);
  const dateOnly = data.date_only;
  const peak = counts.indexOf(Math.max(...counts));
  const busiestDay = dayTotals.indexOf(Math.max(...dayTotals));
  const share = (n: number) => fmtPct(n / Math.max(1, total));

  const groupOptions: Option<string>[] = [
    { value: ALL, label: "All", description: `${fmtInt(sum(data.groups.map((g) => g.total)))} events` },
    ...data.groups.map((g) => ({
      value: g.key,
      label: g.key === "" ? "(none)" : g.key,
      description: `${fmtInt(g.total)} events`,
    })),
  ];

  return (
    <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
      <Toolbar
        end={
          <Text size="1" color="gray">
            {dateOnly
              ? "Recorded dates"
              : timeZone === RECORDED_TIME
                ? "Times as recorded"
                : `Times in ${timeZone.split("_").join(" ")}`}
            {data.events_without_time > 0 && ` · ${fmtInt(data.events_without_time)} without time left out`}
          </Text>
        }
      >
        {groupByOptions && onControlsChange && groupBy && (
          <>
            <OptionMenu
              label="Group by"
              value={groupBy}
              options={groupByOptions}
              onChange={(g) => onControlsChange({ ...controls, groupBy: g })}
            />
            <ToolbarDivider />
          </>
        )}
        <OptionMenu
          label={groupLabel}
          value={group ? selected : ALL}
          options={groupOptions}
          onChange={setSelected}
        />
        {onControlsChange && (
          <>
            <ToolbarDivider />
            <span title={dateOnly ? "This log has dates only, so a time zone does not apply" : undefined}>
              <TimeZonePicker
                value={timeZone}
                onChange={(zone) => onControlsChange({ ...controls, timeZone: zone })}
                disabled={dateOnly}
              />
            </span>
          </>
        )}
      </Toolbar>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
        <Flex direction="column" gap="5" style={{ maxWidth: 1200 }}>
          <MetricRow>
            <Metric label="Events" value={fmtInt(total)} />
            <Metric
              label="Busiest day"
              value={DAYS[busiestDay]}
              hint={`${share(dayTotals[busiestDay])} of events`}
            />
            {!dateOnly && (
              <Metric
                label="Peak hour"
                value={`${DAYS[Math.floor(peak / 24)].slice(0, 3)} ${hh(peak % 24)}`}
                hint={`${fmtInt(counts[peak])} events`}
              />
            )}
            <Metric label="Weekend" value={share(dayTotals[5] + dayTotals[6])} hint="Saturday and Sunday" />
            {!dateOnly && (
              <Metric
                label="Night"
                value={share(sum(hourTotals.filter((_n, h) => h < 6 || h >= 20)))}
                hint="20:00 to 06:00"
              />
            )}
          </MetricRow>

          {dateOnly ? (
            <>
              <Callout.Root size="1" color="gray" variant="surface">
                <Callout.Text>
                  All events are at midnight, so this log has dates but no times of day. The calendar shows
                  weekdays only.
                </Callout.Text>
              </Callout.Root>
              <WeekdayBars totals={dayTotals} />
            </>
          ) : (
            <Section
              title="Week"
              subtitle="Hover a cell for its count. The bars show the totals per hour and per day."
            >
              <div data-tooltip-host style={{ position: "relative" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "84px repeat(24, minmax(0, 1fr)) 120px",
                    gap: 3,
                    alignItems: "end",
                  }}
                >
                  <span />
                  {hourTotals.map((n, h) => (
                    <div
                      key={`h${h}`}
                      style={{
                        height: 6 + (n / maxHour) * 54,
                        borderRadius: "4px 4px 1px 1px",
                        background: hover?.h === h ? "var(--accent-10)" : "var(--accent-7)",
                        transition: "background 120ms",
                      }}
                      onMouseMove={(e) =>
                        show(e, {
                          title: `${hh(h)} to ${hh((h + 1) % 24)}`,
                          rows: [
                            { label: "Events", value: fmtInt(n) },
                            { label: "Share", value: share(n) },
                          ],
                        })
                      }
                      onMouseLeave={hide}
                    />
                  ))}
                  <span />
                  {DAYS.map((day, d) => (
                    <div key={day} style={{ display: "contents" }}>
                      <Text
                        size="1"
                        weight={hover?.d === d ? "bold" : "regular"}
                        color={hover?.d === d ? undefined : "gray"}
                        style={{ alignSelf: "center" }}
                      >
                        {day}
                      </Text>
                      {Array.from({ length: 24 }, (_, h) => {
                        const n = counts[d * 24 + h];
                        const active = hover?.d === d && hover?.h === h;
                        return (
                          <div
                            key={`${day}${h}`}
                            onMouseMove={(e) => {
                              setHover({ d, h });
                              show(e, {
                                title: `${day}, ${hh(h)} to ${hh((h + 1) % 24)}`,
                                rows: [
                                  { label: "Events", value: fmtInt(n) },
                                  { label: "Of the week", value: share(n) },
                                  { label: "Of the peak hour", value: fmtPct(n / max, 0) },
                                ],
                              });
                            }}
                            onMouseLeave={() => {
                              setHover(null);
                              hide();
                            }}
                            style={{
                              height: 30,
                              borderRadius: 5,
                              background: rampColor(Math.sqrt(n / max)),
                              outline: active ? "2px solid var(--gray-12)" : undefined,
                              outlineOffset: 1,
                              opacity: hover && hover.d !== d && hover.h !== h ? 0.55 : 1,
                              transition: "opacity 120ms",
                            }}
                          />
                        );
                      })}
                      <Flex align="center" gap="2" style={{ minWidth: 0 }}>
                        <div
                          style={{
                            height: 8,
                            width: (dayTotals[d] / maxDay) * 64,
                            background: hover?.d === d ? "var(--accent-10)" : "var(--accent-7)",
                            borderRadius: 4,
                          }}
                        />
                        <Text size="1" color="gray" style={{ fontVariantNumeric: "tabular-nums" }}>
                          {fmtInt(dayTotals[d])}
                        </Text>
                      </Flex>
                    </div>
                  ))}
                  <span />
                  {Array.from({ length: 24 }, (_, h) => (
                    <Text
                      key={`l${h}`}
                      size="1"
                      color="gray"
                      align="center"
                      style={{ fontSize: 10, fontVariantNumeric: "tabular-nums" }}
                    >
                      {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                    </Text>
                  ))}
                  <span />
                </div>
                <RampLegend low="Fewer" high="More events" style={{ marginTop: 12, marginLeft: 87 }} />
                {tooltip}
              </div>
            </Section>
          )}
        </Flex>
      </div>
    </Flex>
  );
}

function WeekdayBars({ totals }: { totals: number[] }) {
  const max = Math.max(1, ...totals);
  const all = Math.max(1, sum(totals));
  return (
    <Section title="Events per weekday">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "96px minmax(0, 1fr) 150px",
          gap: 8,
          alignItems: "center",
          maxWidth: 900,
        }}
      >
        {DAYS.map((day, d) => (
          <div key={day} style={{ display: "contents" }}>
            <Text size="2" color="gray">
              {day}
            </Text>
            <Bar
              value={totals[d] / max}
              height={22}
              radius={6}
              color={rampColor(0.35 + 0.65 * (totals[d] / max))}
            />
            <Text size="2" style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmtInt(totals[d])}{" "}
              <Text size="1" color="gray">
                {fmtPct(totals[d] / all)}
              </Text>
            </Text>
          </div>
        ))}
      </div>
    </Section>
  );
}
