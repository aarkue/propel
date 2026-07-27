import { useMemo } from "react";
import { useViewSetting } from "../viewer/view-state";
import type { PlotParams } from "react-plotly.js";
import { ThemedPlot as Plot } from "./themed-plot";
import { useViewerConfig, type ViewerProps } from "../viewer/viewer-config";

// Local view-model mirroring the generated @r4pm/client type.
export interface AggregatedEventTimestamps {
  events_per_timestamp: Record<string, Record<string, number>>;
  activities: string[];
}

function sum(values: (number | undefined)[]): number {
  return values.reduce<number>((s, a) => s + (a ?? 0), 0);
}

/** Histogram of events over time, aggregated or stacked per activity. */
export function EventsPerTimeChart(props: ViewerProps<AggregatedEventTimestamps>) {
  const { data } = props;
  const { colorOf } = useViewerConfig(props);
  const [mode, setMode] = useViewSetting<"per-activity" | "aggregated">("mode", "per-activity");

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

  const plotData: PlotParams["data"] =
    mode === "aggregated"
      ? [
          {
            x: sortedTimestamps,
            y: sortedTimestamps.map((t) => sum(Object.values(data.events_per_timestamp[t] ?? {})) ?? 0),
            type: "bar",
            marker: { color: "#636AFA" },
          },
        ]
      : sortedActs.map((act) => ({
          x: sortedTimestamps,
          y: sortedTimestamps.map((t) => data.events_per_timestamp[t]?.[act] ?? 0),
          type: "bar",
          name: act,
          marker: { color: colorOf?.("activity", act) ?? "#888888" },
        }));

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 200 }}>
      <div
        data-export-ignore
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
          // clear export frame's download button in top-right corner
          padding: "4px 44px 4px 8px",
        }}
      >
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          style={{
            fontSize: 12,
            background: "var(--color-surface)",
            color: "var(--gray-12)",
            border: "1px solid var(--gray-7)",
            borderRadius: "var(--radius-2)",
            padding: "2px 4px",
          }}
        >
          <option value="aggregated">Aggregated</option>
          <option value="per-activity">Per Activity</option>
        </select>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Plot
          data={plotData}
          layout={{
            autosize: true,
            legend: {
              font: { size: 12 },
              bgcolor: "rgba(0,0,0,0)",
              title: { text: "Activity" },
              itemsizing: "constant",
              orientation: "h",
              y: 1.0,
              yref: "paper",
              yanchor: "bottom",
            },
            hovermode: "x unified",
            hoverdistance: -1,
            barmode: "stack",
            margin: { t: 0, b: 48 },
            xaxis: { fixedrange: false, type: "date", title: { text: "Time" } },
            bargap: 0.1,
            yaxis: { range: [0, null], fixedrange: true, title: { text: "Number of Events" } },
          }}
          config={{ displaylogo: false, displayModeBar: false }}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </div>
    </div>
  );
}
