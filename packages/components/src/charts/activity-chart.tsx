import { Card, SegmentedControl, Switch, Text } from "@r4pm/components/ui";
import { useState } from "react";
import { RxBarChart, RxListBullet, RxPieChart } from "react-icons/rx";
import { useViewerConfig } from "../viewer/viewer-config";
import { ThemedPlot } from "./themed-plot";
import { RankedBarList } from "../shared/RankedBarList";

type ChartType = "vbar" | "hbar" | "pie" | "list";

export interface ActivityChartProps {
  /** Raw per-activity event counts (activity name -> count). */
  counts: Record<string, number>;
  /** Total number of events in the log; drives the "Group Other" (<1%) fold and the % labels. */
  numEvents: number;
}

/**
 * Activity frequency chart: vertical-bar / horizontal-bar / pie (SegmentedControl), per-activity
 * colors from the viewer color resolver, an optional "Group Other" toggle that folds rare (<1% of
 * events) activities into one "Other" slice, and per-activity % labels. Backend-free: pass
 * `counts` and `numEvents`; the studio's activity-chart vis fetches them.
 */
export function ActivityChart({ counts: raw, numEvents }: ActivityChartProps) {
  const [chartType, setChartType] = useState<ChartType>("list");
  const [groupOther, setGroupOther] = useState(true);
  // Shared activity colors from the host (or the deterministic default), HSL hex.
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

  const colorFor = (act: string) =>
    act === "Other" ? "lightgray" : (colorOf?.("activity", act) ?? "#888888");

  return (
    <div data-testid="activity-chart" style={{ width: "100%", height: "100%", padding: 8 }}>
      <Card style={{ position: "relative", height: "100%", width: "100%" }}>
        <Text
          as="div"
          size="4"
          weight="bold"
          mb="2"
          style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
        >
          Activity Frequency
          <SegmentedControl.Root
            data-export-ignore
            size="1"
            value={chartType}
            onValueChange={(v) => setChartType(v as ChartType)}
          >
            <SegmentedControl.Item value="list" aria-label="List">
              <RxListBullet />
            </SegmentedControl.Item>
            <SegmentedControl.Item value="vbar" aria-label="Vertical bars">
              <RxBarChart />
            </SegmentedControl.Item>
            <SegmentedControl.Item value="hbar" aria-label="Horizontal bars">
              <RxBarChart style={{ transform: "rotate(90deg)" }} />
            </SegmentedControl.Item>
            <SegmentedControl.Item value="pie" aria-label="Pie">
              <RxPieChart />
            </SegmentedControl.Item>
          </SegmentedControl.Root>
          <span
            style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500 }}
          >
            <Switch checked={groupOther} onCheckedChange={setGroupOther} />
            <Text size="1">Group Other</Text>
          </span>
        </Text>

        {chartType === "list" && (
          <RankedBarList items={activities.map((a) => ({ key: a, count: counts[a] }))} />
        )}

        {chartType !== "list" && numEvents != null && (
          <div style={{ position: "absolute", inset: 0, top: 44, padding: 8 }}>
            <ThemedPlot
              data={[
                chartType === "pie"
                  ? {
                      type: "pie",
                      labels: activities,
                      values: activities.map((a) => counts[a]),
                      marker: { colors: activities.map(colorFor) },
                      textinfo: "percent",
                      hole: 0.5,
                    }
                  : {
                      type: "bar",
                      orientation: chartType === "hbar" ? "h" : "v",
                      x: chartType === "vbar" ? activities : activities.map((a) => counts[a]),
                      y: chartType === "vbar" ? activities.map((a) => counts[a]) : activities,
                      marker: { color: activities.map(colorFor) },
                      textposition: "auto",
                      text: activities.map(
                        (a) =>
                          `${((100 * counts[a]) / numEvents).toLocaleString("en", { maximumFractionDigits: 2 })}%`,
                      ),
                    },
              ]}
              layout={{
                autosize: true,
                margin: { t: 8, b: 40, l: 56, r: 8 },
                showlegend: chartType === "pie",
                xaxis: {
                  automargin: true,
                  fixedrange: true,
                  title: { text: chartType === "hbar" ? "Number of Events" : "Activity" },
                },
                yaxis: {
                  automargin: true,
                  fixedrange: true,
                  title: { text: chartType === "hbar" ? "Activity" : "Number of Events" },
                },
              }}
              config={{ displaylogo: false, displayModeBar: false, responsive: true }}
              style={{ width: "100%", height: "100%" }}
              useResizeHandler
            />
          </div>
        )}
      </Card>
    </div>
  );
}
