import { Flex, Text } from "@r4pm/components/ui";
import { useMemo } from "react";
import { PiPath } from "react-icons/pi";
import { EmptyState } from "../feedback/EmptyState";
import {
  fmtInt,
  fmtPct,
  formatDuration,
  Metric,
  MetricRow,
  OptionMenu,
  Toolbar,
  useChartTooltip,
} from "../kit";
import { textWidth } from "../kit/fit-label";
import { useViewSetting } from "../viewer/view-state";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";

export interface LifecycleActivity {
  activity: string;
  reach: number;
  median_ms: number;
  p25_ms: number;
  p75_ms: number;
  mean_count: number;
}

export interface TypeLifecycle {
  object_type: string;
  objects: number;
  median_lifetime_ms: number;
  p90_lifetime_ms: number;
  activities: LifecycleActivity[];
}

export interface LifecycleMap {
  object_types: TypeLifecycle[];
}

type Scale = "own" | "sqrt" | "shared";
const W = 1000;
const TRACK_H = 104;
const AXIS_Y = 74;
const LANES = [12, 28, 44];

export type LifecycleMapViewProps = ViewerProps<LifecycleMap>;

/**
 * Per object type, where its activities fall in an object's life: each activity sits at the median
 * time from the object's first event, its bar spans the middle half, and its size is the share of
 * objects that reach it.
 */
export function LifecycleMapView({ data, colorOf, format }: LifecycleMapViewProps) {
  const cfg = useViewerConfig({ colorOf, format });
  const [scale, setScale] = useViewSetting<Scale>("lifecycle.scale", "own");
  const { show, hide, tooltip } = useChartTooltip();
  const duration = cfg.format?.duration ?? formatDuration;
  const labelWidths = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of data.object_types) {
      for (const a of t.activities) {
        if (!m.has(a.activity)) m.set(a.activity, textWidth(a.activity, 11, 500) + 8);
      }
    }
    return m;
  }, [data.object_types]);
  const labelWidth = (s: string) => labelWidths.get(s) ?? 0;
  if (data.object_types.length === 0) {
    return (
      <EmptyState
        icon={<PiPath />}
        title="No objects with events"
        description="No object of this OCEL has an event."
      />
    );
  }
  const extent = (t: TypeLifecycle) => Math.max(1, t.p90_lifetime_ms, ...t.activities.map((a) => a.p75_ms));
  const shared = Math.max(...data.object_types.map(extent));
  const longest = data.object_types.reduce((a, b) => (b.median_lifetime_ms > a.median_lifetime_ms ? b : a));
  const color = (a: string) => cfg.colorOf?.("activity", a) ?? "var(--accent-9)";
  const typeColor = (t: string) => cfg.colorOf?.("objectType", t) ?? "var(--gray-9)";

  return (
    <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
      <Toolbar
        end={
          <Text size="1" color="gray">
            Time since each object's first event
          </Text>
        }
      >
        <OptionMenu
          label="Time axis"
          value={scale}
          onChange={setScale}
          options={[
            {
              value: "own",
              label: "Per type",
              description: "Each type on its own time scale",
            },
            {
              value: "sqrt",
              label: "Stretch the start",
              description: "Square-root scale per type, so activities early in the life spread out",
            },
            {
              value: "shared",
              label: "Shared",
              description: "One time scale, to compare lifetimes across types",
            },
          ]}
        />
      </Toolbar>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
        <Flex direction="column" gap="5" style={{ maxWidth: 1240 }}>
          <MetricRow>
            <Metric label="Object types" value={fmtInt(data.object_types.length)} />
            <Metric label="Objects" value={fmtInt(data.object_types.reduce((s, t) => s + t.objects, 0))} />
            <Metric
              label="Longest-lived type"
              value={longest.object_type}
              hint={`median ${duration(longest.median_lifetime_ms)}`}
            />
          </MetricRow>
          <div
            data-tooltip-host
            style={{ position: "relative", display: "flex", flexDirection: "column", gap: 6 }}
          >
            {data.object_types.map((t) => {
              const span = scale === "shared" ? shared : extent(t);
              const f = (ms: number) => Math.min(ms, span) / span;
              const x = (ms: number) => 8 + (scale === "sqrt" ? Math.sqrt(f(ms)) : f(ms)) * (W - 16);
              // Greedy lanes: a label takes the first lane where it does not overlap, or is left to the tooltip.
              const laneEnd = LANES.map(() => Number.NEGATIVE_INFINITY);
              const labelLane = new Map<string, number>();
              for (const a of [...t.activities].sort((p, q) => x(p.median_ms) - x(q.median_ms))) {
                const w = labelWidth(a.activity);
                const left = Math.max(0, Math.min(W - w, x(a.median_ms) - w / 2));
                const lane = laneEnd.findIndex((end) => end < left);
                if (lane >= 0) {
                  laneEnd[lane] = left + w;
                  labelLane.set(a.activity, lane);
                }
              }
              const ticks = [0, 0.25, 0.5, 0.75, 1].map((q) => (scale === "sqrt" ? q * q : q) * span);
              return (
                <div
                  key={t.object_type}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "190px minmax(0, 1fr)",
                    gap: 16,
                    alignItems: "center",
                    padding: "6px 0",
                    borderTop: "1px solid var(--gray-a3)",
                  }}
                >
                  <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
                    <Flex align="center" gap="2">
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: typeColor(t.object_type),
                        }}
                      />
                      <Text size="2" weight="medium" truncate>
                        {t.object_type}
                      </Text>
                    </Flex>
                    <Text size="1" color="gray">
                      {fmtInt(t.objects)} objects · median lifetime {duration(t.median_lifetime_ms)}
                    </Text>
                  </Flex>
                  <svg
                    viewBox={`0 0 ${W} ${TRACK_H}`}
                    style={{ width: "100%", height: TRACK_H }}
                    role="img"
                    aria-label={`${t.object_type} lifecycle`}
                  >
                    <line
                      x1={x(0)}
                      x2={x(span)}
                      y1={AXIS_Y}
                      y2={AXIS_Y}
                      stroke="var(--gray-6)"
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                    <rect
                      x={x(0)}
                      y={AXIS_Y - 2}
                      width={Math.max(0, x(t.median_lifetime_ms) - x(0))}
                      height={4}
                      rx={2}
                      fill={typeColor(t.object_type)}
                      opacity={0.5}
                    />
                    {ticks.map((ms) => (
                      <text
                        key={ms}
                        x={x(ms)}
                        y={TRACK_H - 6}
                        textAnchor={ms === 0 ? "start" : ms === span ? "end" : "middle"}
                        fontSize="10"
                        fill="var(--gray-10)"
                      >
                        {ms === 0 ? "start" : duration(ms)}
                      </text>
                    ))}
                    {t.activities.map((a) => {
                      const r = 4 + 8 * Math.sqrt(a.reach);
                      const lane = labelLane.get(a.activity);
                      const w = labelWidth(a.activity);
                      const lx = Math.max(w / 2, Math.min(W - w / 2, x(a.median_ms)));
                      return (
                        <g
                          key={a.activity}
                          onMouseMove={(e) =>
                            show(e, {
                              title: a.activity,
                              rows: [
                                { label: "Reached by", value: fmtPct(a.reach, 0), color: color(a.activity) },
                                { label: "Median time", value: duration(a.median_ms) },
                                {
                                  label: "Middle half",
                                  value: `${duration(a.p25_ms)} to ${duration(a.p75_ms)}`,
                                },
                                { label: "Per object", value: `${a.mean_count.toFixed(1)}x` },
                              ],
                              footer: `of ${t.object_type} objects`,
                            })
                          }
                          onMouseLeave={hide}
                          style={{ cursor: "default" }}
                        >
                          <rect
                            x={x(a.p25_ms)}
                            y={AXIS_Y - 5}
                            width={Math.max(2, x(a.p75_ms) - x(a.p25_ms))}
                            height={10}
                            rx={5}
                            fill={color(a.activity)}
                            opacity={0.22}
                          />
                          <circle
                            cx={x(a.median_ms)}
                            cy={AXIS_Y}
                            r={r}
                            fill={color(a.activity)}
                            stroke="var(--color-panel-solid)"
                            strokeWidth={2}
                          />
                          {lane != null && (
                            <>
                              <polyline
                                points={`${x(a.median_ms)},${AXIS_Y - r} ${x(a.median_ms)},${LANES[lane] + 6} ${lx},${LANES[lane] + 4}`}
                                fill="none"
                                stroke={color(a.activity)}
                                strokeWidth={1}
                                opacity={0.55}
                              />
                              <text
                                x={lx}
                                y={LANES[lane]}
                                textAnchor="middle"
                                fontSize="11"
                                fontWeight={500}
                                fill="var(--gray-12)"
                              >
                                {a.activity}
                              </text>
                            </>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              );
            })}
            {tooltip}
          </div>
          <Text size="1" color="gray">
            Dot: median time to the activity's first event. Size: share of objects that reach it. Band: middle
            half of those times. Colored line: median lifetime, from an object's first to its last event.
          </Text>
        </Flex>
      </div>
    </Flex>
  );
}
