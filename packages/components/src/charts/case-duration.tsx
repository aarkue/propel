import { useMemo, useState } from "react";
import type { PlotParams } from "react-plotly.js";
import { ThemedPlot as Plot } from "./themed-plot";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import { Select } from "@r4pm/components/ui";

// Local view-model mirroring the generated `CaseDurations` binding.
export interface CaseDurations {
  num_cases: number;
  num_empty_cases: number;
  min_ms: number;
  max_ms: number;
  mean_ms: number;
  median_ms: number;
  p90_ms: number;
  p95_ms: number;
  p99_ms: number;
  hist_bin_edges_ms: number[];
  hist_counts: number[];
  ecdf_x_ms: number[];
  ecdf_y: number[];
}

type Mode = "histogram" | "ecdf";
type Scale = "linear" | "log";

/**
 * Format a duration in milliseconds as a short human-readable string
 * with at most two units (e.g. "1d 2h", "3m 15s", "450ms").
 */
function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "-";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  if (d < 7) return rh ? `${d}d ${rh}h` : `${d}d`;
  if (d < 30) {
    const w = Math.floor(d / 7);
    const rd = d % 7;
    return rd ? `${w}w ${rd}d` : `${w}w`;
  }
  if (d < 365) {
    const mo = Math.floor(d / 30);
    const rd = d % 30;
    return rd ? `${mo}mo ${rd}d` : `${mo}mo`;
  }
  const y = Math.floor(d / 365);
  const rmo = Math.floor((d % 365) / 30);
  return rmo ? `${y}y ${rmo}mo` : `${y}y`;
}

const DURATION_TICK_ANCHORS_MS: number[] = [
  1_000,
  5_000,
  15_000,
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  4 * 60 * 60_000,
  24 * 60 * 60_000,
  3 * 24 * 60 * 60_000,
  7 * 24 * 60 * 60_000,
  14 * 24 * 60 * 60_000,
  30 * 24 * 60 * 60_000,
  90 * 24 * 60 * 60_000,
  365 * 24 * 60 * 60_000,
];

function gradientColor(t: number): string {
  // Iris -> violet gradient, tuned to match Radix accent family.
  const clamp = Math.max(0, Math.min(1, t));
  const a = { r: 0x63, g: 0x6a, b: 0xfa };
  const b = { r: 0xc0, g: 0x26, b: 0xd3 };
  const r = Math.round(a.r + (b.r - a.r) * clamp);
  const g = Math.round(a.g + (b.g - a.g) * clamp);
  const bch = Math.round(a.b + (b.b - a.b) * clamp);
  return `rgb(${r},${g},${bch})`;
}

// Radix "blue-9" / "iris-9" / "amber-10" -- median / mean / 90% markers.
const COLOR_MEDIAN = "#0090FF";
const COLOR_MEAN = "#5B5BD6";
const COLOR_P90 = "#FFB224";

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "1px 8px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        color,
        background: "rgba(0,0,0,0.04)",
        border: `1px solid ${color}33`,
      }}
    >
      {children}
    </span>
  );
}

/**
 * Distribution of case durations (histogram or ECDF) with median/mean/p90
 * markers, on a log- or linear-scale time axis. Ported faithfully from
 * propel's `CaseDurationPlot`.
 */
export function CaseDurationChart(props: ViewerProps<CaseDurations>) {
  const { data } = props;
  // Honor the shared duration format (preferences) for the prominent stat labels.
  const fmt = useViewerConfig(props).format?.duration ?? formatDurationMs;
  const [mode, setMode] = useState<Mode>("histogram");
  const [scale, setScale] = useState<Scale>("log");

  // Transform a duration (ms) into plot space. We use a linear Plotly axis and
  // pre-transform the values to avoid Plotly's log-axis bar-width quirks (widths
  // would otherwise be interpreted in log10 units).
  const toX = useMemo(() => {
    return scale === "log" ? (v: number) => Math.log10(Math.max(1, v)) : (v: number) => v;
  }, [scale]);

  const binCenters = useMemo(() => {
    const edges = data.hist_bin_edges_ms;
    const centers: number[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      centers.push((toX(edges[i]) + toX(edges[i + 1])) / 2);
    }
    return centers;
  }, [data, toX]);

  const binWidths = useMemo(() => {
    const edges = data.hist_bin_edges_ms;
    const widths: number[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      widths.push(toX(edges[i + 1]) - toX(edges[i]));
    }
    return widths;
  }, [data, toX]);

  const barColors = useMemo(() => {
    const maxCount = Math.max(1, ...data.hist_counts);
    return data.hist_counts.map((c) => gradientColor(c / maxCount));
  }, [data]);

  const hoverText = useMemo(() => {
    const edges = data.hist_bin_edges_ms;
    const total = Math.max(1, data.num_cases);
    return data.hist_counts.map((c, i) => {
      const lo = formatDurationMs(edges[i]);
      const hi = formatDurationMs(edges[i + 1]);
      const pct = ((c / total) * 100).toFixed(1);
      return `<b>${lo} - ${hi}</b><br>${c.toLocaleString("en")} cases (${pct}%)`;
    });
  }, [data]);

  const { tickvals, ticktext } = useMemo(() => {
    const min = data.min_ms > 0 ? data.min_ms : 1;
    const max = Math.max(min + 1, data.max_ms);
    const vals = DURATION_TICK_ANCHORS_MS.filter((v) => v >= min / 2 && v <= max * 2);
    return {
      tickvals: vals.map((v) => toX(v)),
      ticktext: vals.map((v) => formatDurationMs(v)),
    };
  }, [data, toX]);

  const quantileShapes = useMemo(() => {
    const marks: { x: number; label: string; color: string }[] = [
      {
        x: toX(data.median_ms),
        label: `median ${fmt(data.median_ms)}`,
        color: COLOR_MEDIAN,
      },
      {
        x: toX(data.mean_ms),
        label: `mean ${fmt(data.mean_ms)}`,
        color: COLOR_MEAN,
      },
      {
        x: toX(data.p90_ms),
        label: `90% <= ${fmt(data.p90_ms)}`,
        color: COLOR_P90,
      },
    ];
    return {
      shapes: marks.map((m) => ({
        type: "line" as const,
        xref: "x" as const,
        yref: "paper" as const,
        x0: m.x,
        x1: m.x,
        y0: 0,
        y1: 1,
        line: { color: m.color, width: 2.5, dash: "dash" as const },
      })),
      annotations: marks.map((m, i) => ({
        x: m.x,
        // Stagger labels vertically so they don't collide.
        y: 1 - i * 0.08,
        xref: "x" as const,
        yref: "paper" as const,
        text: `<b>${m.label}</b>`,
        showarrow: false,
        xanchor: "left" as const,
        yanchor: "top" as const,
        xshift: 6,
        font: { size: 13, color: m.color },
        bgcolor: "rgba(255,255,255,0.82)",
        bordercolor: m.color,
        borderwidth: 1,
        borderpad: 3,
      })),
    };
  }, [data, toX, fmt]);

  const ecdfX = useMemo(() => data.ecdf_x_ms.map((v) => toX(v)), [data, toX]);

  const plotData: PlotParams["data"] =
    mode === "histogram"
      ? [
          {
            type: "bar",
            x: binCenters,
            y: data.hist_counts,
            width: binWidths,
            marker: { color: barColors, line: { width: 0 } },
            hovertemplate: "%{text}<extra></extra>",
            text: hoverText,
          },
        ]
      : [
          {
            type: "scattergl",
            mode: "lines",
            x: ecdfX,
            y: data.ecdf_y,
            line: { color: "#636AFA", width: 2, shape: "hv" },
            customdata: data.ecdf_x_ms,
            hovertemplate: "%{y:.1%} of cases <= %{customdata}ms<extra></extra>",
          },
        ];

  const empty = data.num_cases === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 200 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          padding: "4px 8px",
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Badge color="#6b7280">{data.num_cases.toLocaleString("en")} cases</Badge>
          {data.num_empty_cases > 0 && (
            <Badge color="#6b7280">{data.num_empty_cases.toLocaleString("en")} skipped</Badge>
          )}
          <Badge color={COLOR_MEDIAN}>median {formatDurationMs(data.median_ms)}</Badge>
          <Badge color={COLOR_MEAN}>mean {formatDurationMs(data.mean_ms)}</Badge>
          <Badge color={COLOR_P90}>90% &lt;= {formatDurationMs(data.p90_ms)}</Badge>
          <Badge color="#E5484D">max {formatDurationMs(data.max_ms)}</Badge>
        </div>
        <div style={{ display: "flex", gap: 8 }} data-export-ignore>
          <Select.Root value={mode} onValueChange={(v) => setMode(v as Mode)} size="1">
            <Select.Trigger placeholder="Select mode" variant="soft" className="w-fit" />
            <Select.Content>
              <Select.Item value="histogram">Histogram</Select.Item>
              <Select.Item value="ecdf">Cumulative (ECDF)</Select.Item>
            </Select.Content>
          </Select.Root>
          <Select.Root value={scale} onValueChange={(v) => setScale(v as Scale)} size="1">
            <Select.Trigger placeholder="Select scale" variant="soft" className="w-fit" />
            <Select.Content>
              <Select.Item value="linear">Linear</Select.Item>
              <Select.Item value="log">Log</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {empty ? (
          <div style={{ padding: 16, color: "#9a6700" }}>
            No cases with at least two timestamped events found.
            {data.num_empty_cases > 0 && <> ({data.num_empty_cases} skipped)</>}
          </div>
        ) : (
          <Plot
            data={plotData}
            layout={{
              autosize: true,
              margin: { t: 24, b: 48, l: 56, r: 16 },
              hovermode: "x unified",
              hoverdistance: -1,
              bargap: 0.02,
              shapes: quantileShapes.shapes,
              annotations: quantileShapes.annotations,
              xaxis: {
                type: "linear",
                title: { text: "Case duration" },
                tickvals,
                ticktext,
                fixedrange: false,
              },
              yaxis: {
                title: {
                  text: mode === "histogram" ? "Number of cases" : "Cumulative share",
                },
                tickformat: mode === "ecdf" ? ",.0%" : undefined,
                range: mode === "ecdf" ? [0, 1.02] : undefined,
                fixedrange: false,
              },
            }}
            config={{
              displaylogo: false,
              displayModeBar: false,
              responsive: true,
            }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
          />
        )}
      </div>
    </div>
  );
}
