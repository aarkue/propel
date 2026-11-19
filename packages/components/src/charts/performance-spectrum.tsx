import { Button, Flex, Text } from "@r4pm/components/ui";
import { useEffect, useRef, useState } from "react";
import { PiArrowDown, PiMagnifyingGlassMinus } from "react-icons/pi";
import { EmptyState } from "../feedback/EmptyState";
import { fmtInt, formatDuration, LegendItem, Toolbar, useChartTooltip } from "../kit";
import { VariantSelect } from "../shared/VariantSelect";
import { useElementSize, useKeyedState } from "../kit/hooks";
import { timeTickLabel, timeTicks } from "../kit/time-axis";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";

export interface SpectrumSegment {
  from: string;
  to: string;
  count: number;
  lines: [number, number][];
  quartiles: [number, number, number];
}

export interface PerformanceSpectrum {
  path: string[];
  segments: SpectrumSegment[];
  min_ms: number;
  max_ms: number;
  top_variants: { activities: string[]; cases: number }[];
  num_cases: number;
}

export interface PerformanceSpectrumControls {
  /** The activities of the path; null for the host's choice. */
  path?: string[] | null;
}

export interface PerformanceSpectrumViewProps extends ViewerProps<PerformanceSpectrum> {
  controls?: PerformanceSpectrumControls;
  /** When given, a menu picks the path among the top variants. */
  onControlsChange?: (next: PerformanceSpectrumControls) => void;
}

const LABEL_W = 230;
const BAND_H = 104;
const BAND_GAP = 18;
const AXIS_H = 30;
/** Fastest to slowest quarter of each segment's passages. */
const CLASSES = ["#3b82f6", "#14b8a6", "#f59e0b", "#ef4444"];
const CLASS_LABELS = ["Fastest quarter", "Second", "Third", "Slowest quarter"];

function durationClass(d: number, q: [number, number, number]): number {
  return d <= q[0] ? 0 : d <= q[1] ? 1 : d <= q[2] ? 2 : 3;
}

/**
 * Performance spectrum: for each segment `a -> b` of a path, every passage of a case is a line from
 * the time of `a` (top) to the time of `b` (bottom), colored by how fast it was within the segment.
 * Parallel lines are steady work, fans are queues building up, lines meeting in a point are batches.
 * Drag across the chart to zoom into a time window.
 */
export function PerformanceSpectrumView({
  data,
  controls,
  onControlsChange,
  format,
}: PerformanceSpectrumViewProps) {
  const cfg = useViewerConfig({ format });
  const duration = cfg.format?.duration ?? formatDuration;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { ref: plotRef, element: plotEl, size } = useElementSize<HTMLDivElement>();
  const plotW = Math.max(300, size?.width ?? 800);
  const [window_, setWindow] = useKeyedState<[number, number] | null>(
    `${data.path.join("\u0000")}|${data.min_ms}|${data.max_ms}`,
    null,
  );
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const { show, hide, tooltip } = useChartTooltip();
  const [lo, hi] = window_ ?? [data.min_ms, data.max_ms];
  const plotH = data.segments.length * (BAND_H + BAND_GAP);
  const span = Math.max(1, hi - lo);
  const date = (ms: number) => timeTickLabel(ms, span);

  const x = (t: number) => ((t - lo) / span) * plotW;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = plotW * dpr;
    canvas.height = plotH * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, plotW, plotH);
    const xAt = (t: number) => ((t - lo) / span) * plotW;
    ctx.lineWidth = 1;
    data.segments.forEach((s, i) => {
      const top = i * (BAND_H + BAND_GAP);
      const bottom = top + BAND_H;
      ctx.globalAlpha = Math.max(0.07, Math.min(0.6, 300 / Math.max(1, s.lines.length)));
      for (const [ta, tb] of s.lines) {
        if (tb < lo || ta > hi) continue;
        ctx.strokeStyle = CLASSES[durationClass(tb - ta, s.quartiles)];
        ctx.beginPath();
        ctx.moveTo(xAt(ta), top);
        ctx.lineTo(xAt(tb), bottom);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  }, [data.segments, plotW, plotH, lo, hi, span]);

  const currentKey = data.top_variants.findIndex(
    (v) => v.activities.join("\u0000") === data.path.join("\u0000"),
  );

  if (data.segments.length === 0) {
    return (
      <EmptyState
        title="No segments"
        description="The chosen path has no consecutive activities with times."
      />
    );
  }

  const timeAt = (clientX: number) => {
    const r = plotEl?.getBoundingClientRect();
    if (!r) return lo;
    const px = Math.min(Math.max(clientX - r.left, 0), plotW);
    return lo + (px / plotW) * span;
  };
  const ticks = timeTicks(lo, hi);

  return (
    <Flex direction="column" style={{ height: "100%", minHeight: 0 }}>
      <Toolbar
        end={
          <Flex gap="3" wrap="wrap">
            {CLASSES.map((c, i) => (
              <LegendItem key={c} color={c} label={CLASS_LABELS[i]} shape="line" />
            ))}
          </Flex>
        }
      >
        <VariantSelect
          variants={data.top_variants}
          totalCases={data.num_cases}
          value={currentKey >= 0 ? currentKey : null}
          onChange={(i) =>
            onControlsChange?.({ ...controls, path: data.top_variants[i]?.activities ?? null })
          }
          placeholder={`Custom path, ${data.path.length} steps`}
          disabled={!onControlsChange}
        />
        {window_ && (
          <Button size="1" variant="soft" onClick={() => setWindow(null)}>
            <PiMagnifyingGlassMinus /> Reset zoom
          </Button>
        )}
        <Text size="1" color="gray" ml="2">
          Drag across the chart to zoom into a time window
        </Text>
      </Toolbar>

      <div
        data-tooltip-host
        style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative", padding: "16px 16px 8px" }}
      >
        <div style={{ display: "grid", gridTemplateColumns: `${LABEL_W}px minmax(0, 1fr)`, columnGap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {data.segments.map((s, i) => (
              <div
                // A looping variant repeats a segment, so its position is the key.
                key={i}
                style={{
                  height: BAND_H,
                  marginBottom: BAND_GAP,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "2px 0",
                }}
              >
                {/* Consecutive segments share an activity; it is named once, under the band before. */}
                <Text
                  size="2"
                  weight="medium"
                  truncate
                  title={s.from}
                  style={{ visibility: i > 0 && data.segments[i - 1].to === s.from ? "hidden" : undefined }}
                >
                  {s.from}
                </Text>
                <Flex align="center" gap="2" style={{ color: "var(--gray-10)" }}>
                  <PiArrowDown />
                  <Text size="1" color="gray" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {fmtInt(s.count)} passages · median {duration(s.quartiles[1])}
                  </Text>
                </Flex>
                <Text size="2" weight="medium" truncate title={s.to}>
                  {s.to}
                </Text>
              </div>
            ))}
          </div>
          <div ref={plotRef} style={{ position: "relative", minWidth: 0 }}>
            <div style={{ position: "absolute", inset: 0, height: plotH, pointerEvents: "none" }}>
              {data.segments.map((_, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: i * (BAND_H + BAND_GAP),
                    height: BAND_H,
                    background: "var(--gray-a2)",
                    borderTop: "1px solid var(--gray-a6)",
                    borderBottom: "1px solid var(--gray-a6)",
                  }}
                />
              ))}
              {ticks.map((t) => (
                <div
                  key={t}
                  style={{
                    position: "absolute",
                    top: 0,
                    height: plotH,
                    left: x(t),
                    borderLeft: "1px dashed var(--gray-a4)",
                  }}
                />
              ))}
            </div>
            <canvas
              ref={canvasRef}
              style={{
                width: plotW,
                height: plotH,
                display: "block",
                position: "relative",
                cursor: "crosshair",
              }}
              onMouseDown={(e) => setDrag([timeAt(e.clientX), timeAt(e.clientX)])}
              onMouseMove={(e) => {
                const t = timeAt(e.clientX);
                setHoverX(x(t));
                if (drag) {
                  setDrag([drag[0], t]);
                  hide();
                  return;
                }
                const r = plotEl?.getBoundingClientRect();
                const y = r ? e.clientY - r.top : 0;
                const i = Math.floor(y / (BAND_H + BAND_GAP));
                const s = data.segments[i];
                if (!s || y - i * (BAND_H + BAND_GAP) > BAND_H) return hide();
                show(e, {
                  title: `${s.from} → ${s.to}`,
                  rows: [
                    { label: "Passages", value: fmtInt(s.count) },
                    { label: "Fastest quarter up to", value: duration(s.quartiles[0]), color: CLASSES[0] },
                    { label: "Median", value: duration(s.quartiles[1]), color: CLASSES[1] },
                    { label: "Slowest quarter from", value: duration(s.quartiles[2]), color: CLASSES[3] },
                  ],
                  footer: new Date(t).toLocaleString(),
                });
              }}
              onMouseUp={() => {
                if (drag && Math.abs(drag[1] - drag[0]) > span / 200) {
                  setWindow([Math.min(...drag), Math.max(...drag)]);
                }
                setDrag(null);
              }}
              onMouseLeave={() => {
                setDrag(null);
                setHoverX(null);
                hide();
              }}
            />
            {hoverX != null && !drag && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  height: plotH,
                  left: hoverX,
                  borderLeft: "1px solid var(--gray-a8)",
                  pointerEvents: "none",
                }}
              />
            )}
            {drag && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  height: plotH,
                  left: x(Math.min(...drag)),
                  width: Math.abs(x(drag[1]) - x(drag[0])),
                  background: "var(--accent-a3)",
                  borderLeft: "1px solid var(--accent-8)",
                  borderRight: "1px solid var(--accent-8)",
                  pointerEvents: "none",
                }}
              />
            )}
            <div style={{ position: "relative", height: AXIS_H }}>
              {ticks.map((t) => (
                <Text
                  key={t}
                  size="1"
                  color="gray"
                  style={{
                    position: "absolute",
                    top: 6,
                    left: x(t),
                    transform: "translateX(-50%)",
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {date(t)}
                </Text>
              ))}
            </div>
          </div>
        </div>
        {tooltip}
      </div>
    </Flex>
  );
}
