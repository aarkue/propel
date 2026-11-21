import { Flex, Text } from "@r4pm/components/ui";
import { useId, useState } from "react";
import { fmtPct, LegendItem, useChartTooltip } from "../kit";
import type { ViewerProps } from "../viewer/viewer-config";

/** One measured model of a sweep (the fields of the engine's `ModelQuality` the chart reads). */
export interface SweepQuality {
  fitness?: number | null;
  precision?: number | null;
  f_score?: number | null;
  places: number;
  transitions: number;
  silent_transitions: number;
  arcs: number;
}

export interface SweepPoint {
  threshold: number;
  quality?: SweepQuality;
  /** Set while the point runs or after it failed. */
  status?: "running" | "error";
}

const W = 720;
const H = 250;
const SIZE_H = 84;
const PAD = { l: 40, r: 16, t: 30, b: 26 };

const SERIES = [
  { key: "fitness", label: "Fitness", color: "var(--blue-9)" },
  { key: "precision", label: "Precision", color: "var(--orange-9)" },
  { key: "f_score", label: "F-score", color: "var(--violet-10)" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

/** A smooth path through `pts`, as Catmull-Rom segments turned into cubic Béziers. */
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** The labelled transitions of a measured model, i.e., its activities. */
export const visibleTransitions = (q: SweepQuality) => q.transitions - q.silent_transitions;

/** The threshold with the highest F-score, if any point has one. */
export function bestThreshold(points: SweepPoint[]): number | undefined {
  let best: SweepPoint | undefined;
  for (const p of points) {
    const f = p.quality?.f_score;
    if (f != null && (best?.quality?.f_score == null || f > best.quality.f_score)) best = p;
  }
  return best?.threshold;
}

export interface ModelSweepChartProps extends ViewerProps<SweepPoint[]> {
  /** The selected point's threshold. */
  threshold?: number;
  /** When given, clicking a measured point selects its threshold. */
  onThresholdChange?: (threshold: number) => void;
}

/**
 * Fitness, precision and F-score of models discovered at each noise threshold, with model size in a
 * strip below on the same x axis. Click a threshold to select its model.
 */
export function ModelSweepChart({
  data: points,
  threshold: selected,
  onThresholdChange,
}: ModelSweepChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const areaId = `sweep-f-area-${useId().replace(/[^\w-]/g, "")}`;
  const { show, hide, tooltip } = useChartTooltip();
  const xs = points.map((p) => p.threshold);
  const xMin = Math.min(0, ...xs);
  const xMax = Math.max(1, ...xs);
  const plotW = W - PAD.l - PAD.r;
  const x = (t: number) => PAD.l + ((t - xMin) / (xMax - xMin || 1)) * plotW;
  const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b);
  const done = points.filter((p): p is SweepPoint & { quality: SweepQuality } => p.quality != null);
  const maxSize = Math.max(1, ...done.map((p) => p.quality.transitions));
  const base = SIZE_H - 18;
  const sizeY = (n: number) => base - (n / maxSize) * (SIZE_H - 30);
  const step = points.length > 1 ? Math.abs(points[1].threshold - points[0].threshold) : 1;
  const colW = Math.max(8, (step / (xMax - xMin || 1)) * plotW);
  const best = bestThreshold(points);
  const value = (q: SweepQuality, k: SeriesKey) => q[k] ?? null;

  const tip = (e: React.MouseEvent<Element>, p: SweepPoint) => {
    setHover(p.threshold);
    if (!p.quality) {
      show(e, {
        title: `Noise ${p.threshold.toFixed(2)}`,
        footer:
          p.status === "error"
            ? "Discovery or alignment failed."
            : p.status === "running"
              ? "Measuring..."
              : "Waiting",
      });
      return;
    }
    const q = p.quality;
    show(e, {
      title: `Noise ${p.threshold.toFixed(2)}${p.threshold === best ? " · highest F-score" : ""}`,
      rows: [
        ...SERIES.map((s) => {
          const v = value(q, s.key);
          return { label: s.label, value: v != null ? fmtPct(v) : "n/a", color: s.color };
        }),
        { label: "Activities", value: visibleTransitions(q) },
        { label: "Silent transitions", value: q.silent_transitions },
        { label: "Places", value: q.places },
      ],
      footer: onThresholdChange ? "Click to show this net" : undefined,
    });
  };
  const leave = () => {
    setHover(null);
    hide();
  };
  const hitColumns = (h: number, prefix: string) =>
    points.map((p) => (
      <rect
        key={`${prefix}${p.threshold}`}
        x={x(p.threshold) - colW / 2}
        y={0}
        width={colW}
        height={h}
        fill="transparent"
        style={{ cursor: p.quality && onThresholdChange ? "pointer" : "default" }}
        onMouseMove={(e) => tip(e, p)}
        onMouseLeave={leave}
        onClick={() => p.quality && onThresholdChange?.(p.threshold)}
      />
    ));

  const fPts = done.filter((p) => p.quality.f_score != null);
  const fLine = smoothPath(fPts.map((p) => [x(p.threshold), y(p.quality.f_score as number)]));
  const area =
    fPts.length > 1
      ? `${fLine} L${x(fPts[fPts.length - 1].threshold)},${y(0)} L${x(fPts[0].threshold)},${y(0)} Z`
      : "";

  return (
    <Flex direction="column" gap="3" style={{ minWidth: 0 }}>
      <Flex gap="4" wrap="wrap" align="center">
        {SERIES.map((s) => (
          <LegendItem key={s.key} color={s.color} label={s.label} shape="line" />
        ))}
        <LegendItem color="var(--violet-9)" label="Activities" shape="square" />
        <LegendItem color="var(--violet-5)" label="Silent transitions" shape="square" />
      </Flex>
      <div data-tooltip-host style={{ position: "relative" }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
          role="img"
          aria-label="Fitness, precision and F-score per noise threshold"
        >
          <defs>
            <linearGradient id={areaId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--violet-9)" stopOpacity={0.12} />
              <stop offset="100%" stopColor="var(--violet-9)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <g key={v}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--gray-a4)"
                strokeDasharray={v === 0 ? undefined : "2 4"}
              />
              <text x={PAD.l - 8} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--gray-10)">
                {v * 100}%
              </text>
            </g>
          ))}
          {selected != null && (
            <rect
              x={x(selected) - colW / 2}
              y={PAD.t - 10}
              width={colW}
              height={H - PAD.t - PAD.b + 10}
              rx={6}
              fill="var(--accent-a3)"
            />
          )}
          {hover != null && hover !== selected && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.t - 6}
              y2={H - PAD.b}
              stroke="var(--gray-a8)"
              strokeDasharray="3 3"
            />
          )}
          {area && <path d={area} fill={`url(#${areaId})`} />}
          {SERIES.map((s) => {
            const pts = done.filter((p) => value(p.quality, s.key) != null);
            if (pts.length === 0) return null;
            return (
              <g key={s.key}>
                <path
                  d={smoothPath(pts.map((p) => [x(p.threshold), y(value(p.quality, s.key) as number)]))}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.key === "f_score" ? 2.5 : 2}
                  strokeLinecap="round"
                />
                {pts.map((p) => {
                  const on = p.threshold === selected || p.threshold === hover;
                  return (
                    <circle
                      key={p.threshold}
                      cx={x(p.threshold)}
                      cy={y(value(p.quality, s.key) as number)}
                      r={on ? 5 : 3.5}
                      fill={on ? s.color : "var(--color-panel-solid)"}
                      stroke={s.color}
                      strokeWidth={2}
                    />
                  );
                })}
              </g>
            );
          })}
          {best != null && (
            <g transform={`translate(${x(best)} 10)`}>
              <rect x={-30} y={-9} width={60} height={16} rx={8} fill="var(--violet-10)" />
              <text y={3} textAnchor="middle" fontSize="9.5" fontWeight={600} fill="white">
                highest F
              </text>
            </g>
          )}
          {points
            .filter((p) => p.status)
            .map((p) => (
              <circle
                key={`s${p.threshold}`}
                cx={x(p.threshold)}
                cy={y(0)}
                r={4}
                fill={p.status === "error" ? "var(--red-9)" : "var(--accent-9)"}
              >
                {p.status === "running" && (
                  <animate attributeName="opacity" values="1;0.25;1" dur="1.2s" repeatCount="indefinite" />
                )}
              </circle>
            ))}
          {xs.map((t, i) =>
            i % Math.ceil(xs.length / 11) === 0 ? (
              <text
                key={t}
                x={x(t)}
                y={H - 6}
                textAnchor="middle"
                fontSize="10"
                fill={t === selected ? "var(--gray-12)" : "var(--gray-10)"}
                fontWeight={t === selected ? 600 : 400}
              >
                {t.toFixed(2)}
              </text>
            ) : null,
          )}
          {hitColumns(H, "hit")}
        </svg>
        <span className="r4pm-eyebrow" style={{ display: "block", margin: "10px 0 2px" }}>
          Model size
        </span>
        <svg
          viewBox={`0 0 ${W} ${SIZE_H}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label="Model size per noise threshold"
        >
          <line x1={PAD.l} x2={W - PAD.r} y1={base} y2={base} stroke="var(--gray-a5)" />
          <text x={PAD.l - 8} y={sizeY(maxSize) + 3} textAnchor="end" fontSize="10" fill="var(--gray-10)">
            {maxSize}
          </text>
          {done.map((p) => {
            const q = p.quality;
            const w = Math.min(22, colW * 0.55);
            const on = p.threshold === selected || p.threshold === hover;
            return (
              <g key={p.threshold} opacity={selected == null || on ? 1 : 0.55}>
                <rect
                  x={x(p.threshold) - w / 2}
                  y={sizeY(q.transitions)}
                  width={w}
                  height={base - sizeY(q.transitions)}
                  rx={3}
                  fill="var(--violet-5)"
                />
                <rect
                  x={x(p.threshold) - w / 2}
                  y={sizeY(visibleTransitions(q))}
                  width={w}
                  height={base - sizeY(visibleTransitions(q))}
                  rx={3}
                  fill={on ? "var(--violet-10)" : "var(--violet-9)"}
                />
                <text
                  x={x(p.threshold)}
                  y={SIZE_H - 4}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill={on ? "var(--gray-12)" : "var(--gray-10)"}
                >
                  {q.transitions}
                </text>
              </g>
            );
          })}
          {hitColumns(SIZE_H, "size")}
        </svg>
        {tooltip}
      </div>
      <Text size="1" color="gray">
        Hover a threshold for its numbers, click it to show its net.
      </Text>
    </Flex>
  );
}
