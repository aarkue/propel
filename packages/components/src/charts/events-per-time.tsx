import { useMemo } from "react";
import { useViewSetting } from "../viewer/view-state";
import type { PlotParams } from "react-plotly.js";
import { ThemedPlot as Plot, usePlotColors } from "./themed-plot";
import { fmtInt, Metric, MetricRow, type Option, OptionMenu, Toolbar } from "../kit";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";

// Local view-model mirroring the generated @r4pm/client type.
export interface AggregatedEventTimestamps {
  events_per_timestamp: Record<string, Record<string, number>>;
  activities: string[];
}

function sum(values: (number | undefined)[]): number {
  return values.reduce<number>((s, a) => s + (a ?? 0), 0);
}

type Mode = "per-activity" | "aggregated";
const MODES: Option<Mode>[] = [
  { value: "per-activity", label: "Per activity", description: "Stacked bars, one color per activity" },
  { value: "aggregated", label: "All events", description: "One bar per period" },
];
const COLORS = { bar: "--accent-9" } as const;

/** Histogram of events over time, aggregated or stacked per activity. */
export function EventsPerTimeChart(props: ViewerProps<AggregatedEventTimestamps>) {
  const { data } = props;
  const { colorOf } = useViewerConfig(props);
  const [mode, setMode] = useViewSetting<Mode>("mode", "per-activity");
  const colors = usePlotColors(COLORS);

  const sortedTimestamps = useMemo(() => {
    const ts = Object.keys(data.events_per_timestamp).map((t) => parseInt(t, 10));
    ts.sort((a, b) => a - b);
    return ts;
  }, [data]);

  const sortedActs = useMemo(() => {
    const acts = [...data.activities];
    acts.sort((a, b) => b.localeCompare(a));
    return acts;
  }, [data]);

  const totals = useMemo(
    () => sortedTimestamps.map((t) => sum(Object.values(data.events_per_timestamp[t] ?? {}))),
    [data, sortedTimestamps],
  );
  const peak = totals.length ? totals.indexOf(totals.reduce((m, v) => Math.max(m, v))) : -1;

  const plotData: PlotParams["data"] =
    mode === "aggregated"
      ? [
          {
            x: sortedTimestamps,
            y: totals,
            type: "bar",
            marker: { color: colors.bar },
            hovertemplate: "%{y:,} events<extra></extra>",
          },
        ]
      : sortedActs.map((act) => ({
          x: sortedTimestamps,
          y: sortedTimestamps.map((t) => data.events_per_timestamp[t]?.[act] ?? 0),
          type: "bar",
          name: act,
          hovertemplate: `${act}: %{y:,}<extra></extra>`,
          marker: { color: colorOf?.("activity", act) ?? "#888888" },
        }));

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 200 }}>
      <div data-export-ignore>
        <Toolbar>
          <OptionMenu label="Show" value={mode} options={MODES} onChange={setMode} />
        </Toolbar>
      </div>
      <div style={{ padding: "14px 16px 0" }}>
        <MetricRow>
          <Metric label="Events" value={fmtInt(totals.reduce((a, b) => a + b, 0))} />
          {peak >= 0 && (
            <Metric
              label="Period with most events"
              value={new Date(sortedTimestamps[peak]).toLocaleDateString()}
              hint={`${fmtInt(totals[peak])} events`}
            />
          )}
          {sortedTimestamps.length > 0 && (
            <Metric
              label="From"
              value={new Date(sortedTimestamps[0]).toLocaleDateString()}
              hint={`to ${new Date(sortedTimestamps[sortedTimestamps.length - 1]).toLocaleDateString()}`}
            />
          )}
        </MetricRow>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Plot
          data={plotData}
          layout={{
            autosize: true,
            showlegend: mode === "per-activity",
            legend: {
              font: { size: 11 },
              bgcolor: "rgba(0,0,0,0)",
              itemsizing: "constant",
              orientation: "h",
              y: 1.0,
              yref: "paper",
              yanchor: "bottom",
            },
            hovermode: "x unified",
            hoverdistance: -1,
            barmode: "stack",
            margin: { t: 8, b: 40, l: 60, r: 20 },
            xaxis: { fixedrange: false, type: "date" },
            bargap: 0.08,
            yaxis: { range: [0, null], fixedrange: true, title: "Events" },
          }}
          config={{ displaylogo: false, displayModeBar: false }}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </div>
    </div>
  );
}
