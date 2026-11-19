import { useMemo } from "react";
import { useViewSetting } from "../viewer/view-state";
import type { PlotParams } from "react-plotly.js";
import { ThemedPlot as Plot, usePlotColors } from "./themed-plot";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";
import { Text } from "@r4pm/components/ui";
import { EmptyState } from "../feedback/EmptyState";
import { Metric, MetricRow, type Option, OptionMenu, Toolbar } from "../kit";

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

/** Short human-readable duration, at most two units (e.g. "1d 2h", "3m 15s", "450ms"). */
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

const COLORS = {
  bar: "--accent-9",
  barLight: "--accent-6",
  median: "--gray-12",
  mean: "--blue-10",
  p90: "--amber-10",
  surface: "--color-panel-solid",
} as const;

const MODES: Option<Mode>[] = [
  { value: "histogram", label: "Histogram", description: "How many cases fall into each duration range" },
  { value: "ecdf", label: "Cumulative", description: "Share of cases finished within a duration" },
];
const SCALES: Option<Scale>[] = [
  { value: "log", label: "Log time", description: "Spreads short and long cases alike" },
  { value: "linear", label: "Linear time", description: "Durations to scale" },
];

/** Distribution of case durations (histogram or ECDF) with median/mean/p90 markers, on a log/linear axis. */
export function CaseDurationChart(props: ViewerProps<CaseDurations>) {
  const { data } = props;
  // Honor the shared duration format (preferences) for the prominent stat labels.
  const fmt = useViewerConfig(props).format?.duration ?? formatDurationMs;
  const colors = usePlotColors(COLORS);
  const [mode, setMode] = useViewSetting<Mode>("mode", "histogram");
  const [scale, setScale] = useViewSetting<Scale>("scale", "log");

  // Pre-transform values onto a linear Plotly axis (log10 for "log") to avoid its log-axis bar-width
  // quirk, where widths would be interpreted in log10 units.
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
        color: colors.median,
      },
      {
        x: toX(data.mean_ms),
        label: `mean ${fmt(data.mean_ms)}`,
        color: colors.mean,
      },
      {
        x: toX(data.p90_ms),
        label: `90% <= ${fmt(data.p90_ms)}`,
        color: colors.p90,
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
        line: { color: m.color, width: 1.5, dash: "dot" as const },
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
        font: { size: 12, color: m.color },
        bgcolor: colors.surface,
        borderpad: 3,
      })),
    };
  }, [data, toX, fmt, colors]);

  const ecdfX = useMemo(() => data.ecdf_x_ms.map((v) => toX(v)), [data, toX]);

  const plotData: PlotParams["data"] =
    mode === "histogram"
      ? [
          {
            type: "bar",
            x: binCenters,
            y: data.hist_counts,
            width: binWidths,
            marker: { color: colors.bar, line: { width: 1, color: colors.surface } },
            hovertemplate: "%{text}<extra></extra>",
            text: hoverText,
            textposition: "none",
          },
        ]
      : [
          {
            type: "scattergl",
            mode: "lines",
            x: ecdfX,
            y: data.ecdf_y,
            line: { color: colors.bar, width: 2, shape: "hv" },
            fill: "tozeroy",
            fillcolor: colors.barLight,
            customdata: data.ecdf_x_ms,
            hovertemplate: "%{y:.1%} of cases <= %{customdata}ms<extra></extra>",
          },
        ];

  const empty = data.num_cases === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 200 }}>
      <div data-export-ignore>
        <Toolbar
          end={
            data.num_empty_cases > 0 && (
              <Text size="1" color="gray">
                {data.num_empty_cases.toLocaleString("en")} cases with fewer than two timed events left out
              </Text>
            )
          }
        >
          <OptionMenu label="Show" value={mode} options={MODES} onChange={setMode} />
          <OptionMenu label="Axis" value={scale} options={SCALES} onChange={setScale} />
        </Toolbar>
      </div>
      {!empty && (
        <div style={{ padding: "14px 16px 0" }}>
          <MetricRow>
            <Metric label="Cases" value={data.num_cases.toLocaleString("en")} />
            <Metric label="Median" value={fmt(data.median_ms)} hint="half the cases are faster" />
            <Metric label="Mean" value={fmt(data.mean_ms)} />
            <Metric label="90% within" value={fmt(data.p90_ms)} />
            <Metric label="Longest" value={fmt(data.max_ms)} hint={`shortest ${fmt(data.min_ms)}`} />
          </MetricRow>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        {empty ? (
          <EmptyState
            title="No case durations"
            description="No case has two or more events with a timestamp, so no duration can be measured."
          />
        ) : (
          <Plot
            data={plotData}
            layout={{
              autosize: true,
              margin: { t: 28, b: 48, l: 60, r: 20 },
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
