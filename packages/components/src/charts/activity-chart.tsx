import { useViewSetting } from "../viewer/view-state";
import { fmtInt, fmtPct, Metric, MetricRow, type Option, OptionMenu, Toolbar, ToolbarDivider } from "../kit";
import { useViewerConfig } from "../viewer/viewer-config";
import { ThemedPlot } from "./themed-plot";
import { RankedBarList } from "../shared/RankedBarList";

type ChartType = "vbar" | "hbar" | "pie" | "list";

const CHARTS: Option<ChartType>[] = [
  { value: "list", label: "Ranked list", description: "Activities with bars, most frequent first" },
  { value: "hbar", label: "Bars", description: "Horizontal bars, long names stay readable" },
  { value: "vbar", label: "Columns", description: "Vertical bars" },
  { value: "pie", label: "Donut", description: "Shares of all events" },
];
const GROUPING: Option<"group" | "all">[] = [
  { value: "group", label: "Grouped under 1%", description: "Rare activities fold into Other" },
  { value: "all", label: "All activities", description: "Every activity on its own" },
];

export interface ActivityChartProps {
  /** Raw per-activity event counts (activity name -> count). */
  counts: Record<string, number>;
  /** Total number of events in the log; drives the "Group Other" (<1%) fold and the % labels. */
  numEvents: number;
}

/** Activity frequency chart (list / bar / pie); backend-free, pass `counts` and `numEvents`. */
export function ActivityChart({ counts: raw, numEvents }: ActivityChartProps) {
  const [chartType, setChartType] = useViewSetting<ChartType>("chartType", "list");
  const [groupOther, setGroupOther] = useViewSetting("groupOther", true);
  const { colorOf } = useViewerConfig({});

  const counts: Record<string, number> = { ...raw };
  const activities = Object.keys(raw).sort((a, b) => raw[b] - raw[a]);
  if (groupOther && numEvents) {
    const idx = activities.findIndex((act) => raw[act] / numEvents < 0.01);
    if (idx >= 0 && idx < activities.length - 1) {
      const other = activities.splice(idx);
      counts.Other = other.reduce((sum, act) => sum + raw[act], 0);
      activities.push("Other");
    }
  }

  const colorFor = (act: string) => (act === "Other" ? "#a1a1aa" : (colorOf?.("activity", act) ?? "#888888"));

  const top = activities.find((a) => a !== "Other");
  const share = (n: number) => fmtPct(n / Math.max(1, numEvents));
  const plotStyle = { width: "100%", height: "100%" };

  return (
    <div
      data-testid="activity-chart"
      style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}
    >
      <div data-export-ignore>
        <Toolbar>
          <OptionMenu label="Chart" value={chartType} options={CHARTS} onChange={setChartType} />
          <ToolbarDivider />
          <OptionMenu
            label="Rare activities"
            value={groupOther ? "group" : "all"}
            options={GROUPING}
            onChange={(v) => setGroupOther(v === "group")}
          />
        </Toolbar>
      </div>
      <div style={{ padding: "14px 16px 0" }}>
        <MetricRow>
          <Metric label="Activities" value={fmtInt(Object.keys(raw).length)} />
          <Metric label="Events" value={fmtInt(numEvents)} />
          {top && <Metric label="Most frequent" value={top} hint={`${share(raw[top])} of events`} />}
        </MetricRow>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 16, position: "relative" }}>
        {chartType === "list" && (
          <div style={{ maxWidth: 900, height: "100%" }}>
            <RankedBarList items={activities.map((a) => ({ key: a, count: counts[a] }))} />
          </div>
        )}
        {chartType !== "list" && numEvents != null && (
          <ThemedPlot
            data={[
              chartType === "pie"
                ? {
                    type: "pie",
                    labels: activities,
                    values: activities.map((a) => counts[a]),
                    marker: { colors: activities.map(colorFor) },
                    textinfo: "percent",
                    hole: 0.6,
                    sort: false,
                    hovertemplate: "<b>%{label}</b><br>%{value:,} events (%{percent})<extra></extra>",
                  }
                : {
                    type: "bar",
                    orientation: chartType === "hbar" ? "h" : "v",
                    x: chartType === "vbar" ? activities : activities.map((a) => counts[a]),
                    y: chartType === "vbar" ? activities.map((a) => counts[a]) : activities,
                    marker: { color: activities.map(colorFor) },
                    hovertemplate:
                      chartType === "hbar"
                        ? "<b>%{y}</b><br>%{x:,} events<extra></extra>"
                        : "<b>%{x}</b><br>%{y:,} events<extra></extra>",
                  },
            ]}
            layout={{
              autosize: true,
              margin: { t: 8, b: 40, l: 56, r: 8 },
              showlegend: chartType === "pie",
              bargap: 0.25,
              xaxis: {
                automargin: true,
                fixedrange: true,
                title: chartType === "hbar" ? "Events" : undefined,
              },
              yaxis: {
                automargin: true,
                fixedrange: true,
                autorange: chartType === "hbar" ? "reversed" : undefined,
                title: chartType === "vbar" ? "Events" : undefined,
              },
            }}
            config={{ displaylogo: false, displayModeBar: false, responsive: true }}
            style={plotStyle}
            useResizeHandler
          />
        )}
      </div>
    </div>
  );
}
