import { IconButton, Spinner, Text } from "@r4pm/components/ui";
import { useEffect, useMemo, useState } from "react";
import { PiX } from "react-icons/pi";
import { ThemedPlot } from "../../charts/themed-plot";
import type { ActivityStatistics, BinnedEdgeDurationStats, StatsRequest } from "./edit-context";
import { useEditContext } from "./edit-context";

const PLOT_CONFIG: Partial<Plotly.Config> = { responsive: true, displaylogo: false, displayModeBar: false };

/** A non-modal bottom sheet (absolutely positioned inside the viz root) rendering activity / edge
 *  statistics via `ThemedPlot`, fed by the injected `onActivityStatistics` / `onEdgeStatistics`. */
export function StatsSheet({
  request,
  objectTypeColor,
  onClose,
}: {
  request: StatsRequest;
  objectTypeColor: (name: string) => string;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col border-t bg-(--color-panel-solid)"
      style={{ height: "40%", borderColor: "var(--gray-a5)", boxShadow: "0 -4px 16px var(--black-a3)" }}
    >
      <IconButton
        size="1"
        variant="soft"
        radius="full"
        title="Close statistics"
        onClick={onClose}
        style={{ position: "absolute", top: 6, right: 6, zIndex: 1, cursor: "pointer" }}
      >
        <PiX />
      </IconButton>
      <div className="flex-1 min-h-0 p-2">
        {request.kind === "activity" ? (
          <ActivityStatsSheet activity={request.activity} objectTypeColor={objectTypeColor} />
        ) : (
          <EdgeStatsSheet arc={request.arc} />
        )}
      </div>
    </div>
  );
}

function ActivityStatsSheet({
  activity,
  objectTypeColor,
}: {
  activity: string;
  objectTypeColor: (name: string) => string;
}) {
  const edit = useEditContext();
  const fetchStats = edit?.callbacks.onActivityStatistics;
  const [data, setData] = useState<ActivityStatistics | null>(null);
  const [pending, setPending] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!fetchStats) return;
    let cancelled = false;
    setPending(true);
    setFailed(false);
    setData(null);
    fetchStats(activity)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setPending(false));
    return () => {
      cancelled = true;
    };
  }, [activity, fetchStats]);

  const sortedObjectTypes = useMemo(() => Object.keys(data?.num_evs_per_ot_type ?? {}).sort(), [data]);
  const maxObCount = useMemo(
    () => Math.max(0, ...Object.values(data?.num_obs_of_ot_per_ev ?? {}).flat()),
    [data],
  );
  const maxEvCount = useMemo(
    () => Math.max(0, ...Object.values(data?.num_evs_per_ot_type ?? {}).flat()),
    [data],
  );

  const commonLayout: Partial<Plotly.Layout> = {
    yaxis: { ticksuffix: "%", rangemode: "tozero", range: [0, 100] },
    xaxis: { rangemode: "tozero" },
    barmode: "overlay",
    legend: { orientation: "h", yanchor: "bottom", y: 0.9, xanchor: "right", x: 1 },
    margin: { l: 40, r: 0, b: 45, t: 45, pad: 4 },
    hovermode: "x",
  };

  return (
    <div className="w-full h-full flex flex-col">
      <h2 className="font-semibold text-lg shrink-0">
        Statistics for <span className="bg-(--gray-a4) px-2 -mx-0.5 rounded-sm">{activity}</span>
      </h2>
      {pending && <Spinner />}
      {failed && (
        <Text size="1" color="red">
          Failed to load statistics.
        </Text>
      )}
      {data && (
        <div className="flex w-full flex-1 min-h-0 gap-x-4">
          <ThemedPlot
            useResizeHandler
            className="h-full w-full"
            data={sortedObjectTypes.map((ot) => ({
              type: "histogram",
              marker: { color: objectTypeColor(ot), line: { width: 0.5 } },
              opacity: 0.4,
              histnorm: "percent",
              name: ot,
              x: data.num_obs_of_ot_per_ev[ot],
            }))}
            layout={{
              ...commonLayout,
              title: { text: "Number of Objects per Event" },
              xaxis: { ...commonLayout.xaxis, dtick: maxObCount > 100 ? undefined : 1 },
            }}
            config={PLOT_CONFIG}
          />
          <ThemedPlot
            useResizeHandler
            className="h-full w-full"
            data={sortedObjectTypes.map((ot) => ({
              type: "histogram",
              marker: { color: objectTypeColor(ot), line: { width: 0.5 } },
              opacity: 0.4,
              histnorm: "percent",
              name: ot,
              x: data.num_evs_per_ot_type[ot],
            }))}
            layout={{
              ...commonLayout,
              title: { text: "Number of Events per Object" },
              xaxis: { ...commonLayout.xaxis, dtick: maxEvCount > 100 ? undefined : 1 },
            }}
            config={PLOT_CONFIG}
          />
        </div>
      )}
    </div>
  );
}

const MINUTE_MS = 1000 * 60;
const HOUR_MS = MINUTE_MS * 60;
const DAY_MS = HOUR_MS * 24;
const MONTH_MS = DAY_MS * 30;
const YEAR_MS = MONTH_MS * 12;

/** Pick a human time unit + divisor from the largest absolute duration in the bins. */
function pickTimeUnit(maxDurationMs: number): { unit: string; divisor: number } {
  if (maxDurationMs < MINUTE_MS * 5) return { unit: "Seconds", divisor: 1000 };
  if (maxDurationMs < HOUR_MS * 3) return { unit: "Minutes", divisor: MINUTE_MS };
  if (maxDurationMs < DAY_MS * 5) return { unit: "Hours", divisor: HOUR_MS };
  if (maxDurationMs < MONTH_MS * 5) return { unit: "Days", divisor: DAY_MS };
  if (maxDurationMs < YEAR_MS * 5) return { unit: "Months", divisor: MONTH_MS };
  return { unit: "Years", divisor: YEAR_MS };
}

function EdgeStatsSheet({ arc }: { arc: { from: string; to: string } }) {
  const edit = useEditContext();
  const fetchStats = edit?.callbacks.onEdgeStatistics;
  const [data, setData] = useState<BinnedEdgeDurationStats | null>(null);
  const [pending, setPending] = useState(true);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!fetchStats) return;
    let cancelled = false;
    setPending(true);
    setFailed(false);
    setData(null);
    fetchStats(arc as never)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setPending(false));
    return () => {
      cancelled = true;
    };
  }, [arc, fetchStats]);

  const { plotX, plotY, plotLabels, unit, hovertemplate } = useMemo(() => {
    if (!data || data.bin_centers_ms.length === 0) {
      return {
        plotX: [] as number[],
        plotY: [] as number[],
        plotLabels: [] as string[],
        unit: "Hours",
        hovertemplate: "",
      };
    }
    const maxDurationMs = Math.max(Math.abs(data.min_ms), Math.abs(data.max_ms));
    const { unit, divisor } = pickTimeUnit(maxDurationMs);
    const plotX = data.bin_centers_ms.map((v) => v / divisor);
    const plotY = data.percentages;
    const plotLabels = data.bin_labels.map((label) => {
      const nums = label.match(/-?[\d.]+/g);
      if (nums && nums.length === 2) {
        return `[${(Number.parseFloat(nums[0]) / divisor).toFixed(2)}, ${(Number.parseFloat(nums[1]) / divisor).toFixed(2)})`;
      }
      return label;
    });
    return {
      plotX,
      plotY,
      plotLabels,
      unit,
      hovertemplate: `<b>Range:</b> %{customdata} ${unit}<br><b>Frequency:</b> %{y:.2f}%<extra></extra>`,
    };
  }, [data]);

  const isReversed = plotX.length > 0 && plotX[plotX.length - 1] >= 0;

  return (
    <div className="w-full h-full flex flex-col">
      <h2 className="font-semibold text-lg shrink-0">
        Time between <span className="bg-(--grass-a4) px-2 -mx-0.5 rounded-sm">{arc.from}</span> and{" "}
        <span className="bg-(--orange-a4) px-2 -mx-0.5 rounded-sm">{arc.to}</span>
      </h2>
      {pending && <Spinner />}
      {failed && (
        <Text size="1" color="red">
          Failed to load statistics.
        </Text>
      )}
      {data && (
        <div className="flex w-full flex-1 min-h-0">
          <ThemedPlot
            useResizeHandler
            className="h-full w-full"
            data={[
              {
                type: "bar",
                x: plotX,
                y: plotY,
                customdata: plotLabels,
                hovertemplate,
                name: "Duration",
                marker: {
                  color: plotX,
                  colorscale: "YlOrRd",
                  reversescale: isReversed,
                  colorbar: { orientation: "v", outlinewidth: 0, title: { text: unit, side: "right" } },
                },
              },
            ]}
            layout={{
              title: { text: "Distribution of Durations", x: 0 },
              yaxis: { ticksuffix: "%", rangemode: "tozero", range: [0, null] },
              xaxis: { ticksuffix: ` ${unit}` },
              bargap: 0,
              margin: { l: 40, r: 40, b: 45, t: 45, pad: 4 },
              hovermode: "x unified",
            }}
            config={PLOT_CONFIG}
          />
        </div>
      )}
    </div>
  );
}
