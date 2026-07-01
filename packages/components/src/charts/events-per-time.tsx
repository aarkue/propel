import { useMemo, useState } from "react";
import type { PlotParams } from "react-plotly.js";
import { ThemedPlot as Plot } from "./themed-plot";
import type { ViewerProps } from "../viewer/viewer-config";

// Local view-model mirroring the generated @r4pm/client type.
export interface AggregatedEventTimestamps {
  events_per_timestamp: Record<string, Record<string, number>>;
  activities: string[];
}

function sum(values: (number | undefined)[]): number {
  return values.reduce<number>((s, a) => s + (a ?? 0), 0);
}

// Deterministic per-activity color (replaces propel's GlobalState.activityColors,
// which is gated out -- these viewers take only `data`).
function colorForAct(act: string): string {
  let h = 0;
  for (let i = 0; i < act.length; i++) h = (h * 31 + act.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 65%, 55%)`;
}

/**
 * Histogram of events over time, either aggregated or stacked per activity.
 * Ported faithfully from propel's `EventsPerTimePlot`. The interactive
 * time-range selection / send-to-transforms bridge is gated out (these
 * viewers take only `data`).
 */
export function EventsPerTimeChart({ data }: ViewerProps<AggregatedEventTimestamps>) {
  const [mode, setMode] = useState<"per-activity" | "aggregated">("per-activity");

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
          marker: { color: colorForAct(act) },
        }));

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 200 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 8,
          padding: "4px 8px",
        }}
      >
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          style={{ fontSize: 12 }}
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
              bgcolor: "#ffffff00",
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
