import { LeafFrame, grow } from "./leaves";
import { useCondEnv } from "./env";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Flex, Select, Text } from "@r4pm/components/ui";
import { LuChevronDown, LuChevronRight } from "react-icons/lu";
import type {
  AttributeScope,
  BackendContext,
  Condition,
  EventLogHandle,
  EventTimeHistogram,
  SlimLinkedOCELHandle,
  TimeframeMode,
} from "@r4pm/client";
import { localInputToRfc, rfcToLocalInput, TIMEFRAME_MODES } from "../condition";

// Lazy so Plotly stays out of the initial load graph (the transform editors are eagerly
// globbed by the transform panel and would otherwise drag Plotly in at startup).
const ThemedPlot = lazy(() => import("@r4pm/components/charts").then((m) => ({ default: m.ThemedPlot })));

export const TF_INPUT: React.CSSProperties = {
  border: "1px solid var(--gray-7)",
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: 13,
  fontFamily: "inherit",
  background: "var(--color-background)",
  color: "var(--gray-12)",
  outline: "none",
  width: "100%",
};

/** Events-over-time histogram; dragging a range on the chart writes the window's start/end (UTC). */
export function TimeframeHistogram({
  data,
  start,
  end,
  onRangeChange,
}: {
  data: EventTimeHistogram;
  start: string | null;
  end: string | null;
  onRangeChange: (start: string, end: string) => void;
}) {
  const entries = Object.entries(data.events_per_timestamp)
    .map(
      ([ms, perType]) => [Number(ms), Object.values(perType).reduce((a, b) => a + b, 0)] as [number, number],
    )
    .filter(([ms]) => Number.isFinite(ms))
    .sort((a, b) => a[0] - b[0]);

  if (entries.length === 0) {
    return (
      <Text size="1" color="gray">
        No event timestamps to show.
      </Text>
    );
  }

  const xs = entries.map((e) => e[0]);
  const ys = entries.map((e) => e[1]);
  const maxY = Math.max(...ys, 1);
  // The backend bins are equal-width but omit empty ones, so the authoritative bar width is
  // `bin_width_ms`, not the spacing between present keys.
  const gap = data.bin_width_ms > 0 ? data.bin_width_ms : 3_600_000;
  // Center each bar on its bin interval [binStart, binStart+gap).
  const centers = xs.map((v) => v + gap / 2);
  const startMs = start ? new Date(start).getTime() : null;
  const endMs = end ? new Date(end).getTime() : null;
  // A bin the boundary cuts through is partly in range, so split each bar by overlap fraction into stacked in-range/outside segments.
  const lo = startMs ?? Number.NEGATIVE_INFINITY;
  const hi = endMs ?? Number.POSITIVE_INFINITY;
  const inY: number[] = [];
  const outY: number[] = [];
  const inLbl: number[] = [];
  const outLbl: number[] = [];
  xs.forEach((a, i) => {
    const b = a + gap;
    const overlap = Math.max(0, Math.min(b, hi) - Math.max(a, lo));
    const frac = gap > 0 ? Math.min(1, overlap / gap) : 0;
    inY.push(ys[i] * frac);
    outY.push(ys[i] * (1 - frac));
    inLbl.push(Math.round(ys[i] * frac));
    outLbl.push(ys[i] - Math.round(ys[i] * frac));
  });
  const shapes: Partial<Plotly.Shape>[] = [];
  // Translucent band across the exact selected window makes the boundary unambiguous even when
  // a bin spans several months.
  if (startMs != null && endMs != null && Number.isFinite(startMs) && Number.isFinite(endMs)) {
    shapes.push({
      type: "rect",
      x0: startMs,
      x1: endMs,
      y0: 0,
      y1: 1,
      yref: "paper",
      fillcolor: "rgba(110, 86, 207, 0.12)",
      line: { width: 0 },
      layer: "below",
    });
  }
  for (const m of [startMs, endMs]) {
    if (m != null && Number.isFinite(m))
      shapes.push({
        type: "line",
        x0: m,
        x1: m,
        y0: 0,
        y1: 1,
        yref: "paper",
        line: { color: "#e5484d", width: 2, dash: "dot" },
      });
  }
  const parsePlotlyDate = (v: unknown): number | null => {
    if (typeof v === "number") return v;
    if (typeof v !== "string") return null;
    const isoT = v.includes("T") ? v : v.replace(" ", "T");
    const withZ = /Z$|[+-]\d\d:?\d\d$/.test(isoT) ? isoT : `${isoT}Z`;
    const ms = Date.parse(withZ);
    return Number.isNaN(ms) ? null : ms;
  };

  return (
    <div style={{ height: 200, width: "100%" }}>
      <Suspense fallback={<div style={{ height: "100%" }} />}>
        <ThemedPlot
          data={[
            {
              type: "bar",
              name: "in range",
              x: centers,
              y: inY,
              customdata: inLbl,
              width: xs.map(() => gap * 0.9),
              marker: { color: "#6e56cf" },
              hovertemplate: "%{x}<br>%{customdata} in range<extra></extra>",
            },
            {
              type: "bar",
              name: "outside",
              x: centers,
              y: outY,
              customdata: outLbl,
              width: xs.map(() => gap * 0.9),
              marker: { color: "#c4c8de" },
              hovertemplate: "%{x}<br>%{customdata} outside<extra></extra>",
            },
          ]}
          layout={{
            autosize: true,
            barmode: "stack",
            showlegend: false,
            margin: { t: 6, b: 42, l: 40, r: 8 },
            bargap: 0.05,
            xaxis: { type: "date", fixedrange: false, rangeslider: undefined },
            yaxis: { fixedrange: true, range: [0, maxY * 1.15], title: { text: "events" } },
            shapes,
            dragmode: "zoom",
          }}
          config={{ displaylogo: false, displayModeBar: false, responsive: true }}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
          onRelayout={(e: Record<string, unknown>) => {
            const x0 = parsePlotlyDate(e["xaxis.range[0]"]);
            const x1 = parsePlotlyDate(e["xaxis.range[1]"]);
            if (x0 != null && x1 != null) {
              onRangeChange(new Date(x0).toISOString(), new Date(x1).toISOString());
            }
            if (e["xaxis.autorange"]) {
              onRangeChange(new Date(xs[0]).toISOString(), new Date(xs[xs.length - 1] + gap).toISOString());
            }
          }}
        />
      </Suspense>
    </div>
  );
}

/** [min, max) span of the event data in epoch ms, from the histogram's bins, or null if empty. */
export function timestampExtent(data: EventTimeHistogram): [number, number] | null {
  const xs = Object.keys(data.events_per_timestamp)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const width = data.bin_width_ms > 0 ? data.bin_width_ms : 3_600_000;
  return [xs[0], xs[xs.length - 1] + width];
}

/** Collapsible event-time histogram with drag-to-select; fetches the distribution once per dataset when opened. */
export function EventTimeRangePicker({
  backend,
  datasetName,
  objectType,
  start,
  end,
  onRangeChange,
  defaultOpen = true,
}: {
  backend: BackendContext;
  datasetName: string;
  objectType: "EventLog" | "OCEL";
  start: string | null;
  end: string | null;
  onRangeChange: (start: string, end: string) => void;
  defaultOpen?: boolean;
}) {
  const [showChart, setShowChart] = useState(defaultOpen);
  const histQ = useQuery<EventTimeHistogram>({
    queryKey: [objectType, datasetName, "event-timestamps-hist"],
    enabled: showChart && !!datasetName,
    queryFn: () => {
      if (objectType === "EventLog") {
        return backend.callBinding("app_bindings::get_event_log_timestamps", {
          event_log: datasetName as EventLogHandle,
          num_bins: 50,
        }) as Promise<EventTimeHistogram>;
      }
      return backend.callBinding("app_bindings::get_ocel_event_timestamps", {
        ocel: datasetName as SlimLinkedOCELHandle,
        num_bins: 50,
      }) as Promise<EventTimeHistogram>;
    },
  });

  const extent = useMemo(() => (histQ.data ? timestampExtent(histQ.data) : null), [histQ.data]);
  const fitToData = () => {
    if (extent) onRangeChange(new Date(extent[0]).toISOString(), new Date(extent[1]).toISOString());
  };

  // If the default window doesn't overlap the data at all, snap it to the full data extent once per dataset so the chart opens showing events.
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!extent || fittedFor.current === datasetName) return;
    fittedFor.current = datasetName;
    const s = start ? new Date(start).getTime() : null;
    const e = end ? new Date(end).getTime() : null;
    const overlaps = s != null && e != null && e >= extent[0] && s <= extent[1];
    if (!overlaps) onRangeChange(new Date(extent[0]).toISOString(), new Date(extent[1]).toISOString());
  }, [extent, datasetName, start, end, onRangeChange]);

  return (
    <>
      <Flex align="center" gap="3" wrap="wrap">
        <Button
          size="1"
          variant="ghost"
          color="gray"
          style={{ width: "fit-content" }}
          onClick={() => setShowChart((v) => !v)}
        >
          {showChart ? <LuChevronDown size={12} /> : <LuChevronRight size={12} />}
          Pick from event distribution
        </Button>
        {showChart && extent && (
          <Button size="1" variant="ghost" color="gray" style={{ width: "fit-content" }} onClick={fitToData}>
            Fit to data range
          </Button>
        )}
      </Flex>
      {showChart &&
        (histQ.isLoading ? (
          <Text size="1" color="gray">
            Loading event times...
          </Text>
        ) : histQ.isError ? (
          <Text size="1" color="gray">
            Could not load event times.
          </Text>
        ) : histQ.data ? (
          <div
            className="rounded-lg p-2"
            style={{ background: "var(--gray-2)", border: "1px solid var(--gray-5)" }}
          >
            <Text size="1" color="gray" as="div" mb="1">
              Drag on the chart to set the window; the dotted lines mark the current range.
            </Text>
            <TimeframeHistogram data={histQ.data} start={start} end={end} onRangeChange={onRangeChange} />
          </div>
        ) : null)}
    </>
  );
}

export function TimeframeLeafRow({
  condition,
  onChange,
  onRemove,
  scope,
}: {
  condition: Extract<Condition, { type: "Timeframe" }>;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
  scope?: AttributeScope;
}) {
  const env = useCondEnv();
  const eventScope = scope?.type === "Event";

  return (
    <LeafFrame onRemove={onRemove}>
      <Flex direction="column" gap="2" style={{ flex: "1 1 auto", minWidth: 0 }}>
        <Flex align="center" gap="2">
          <Text size="2" color="gray" style={{ flexShrink: 0 }}>
            time
          </Text>
          {eventScope ? (
            <Text size="2" color="gray">
              falls in range
            </Text>
          ) : (
            <div style={{ flex: 1, minWidth: 0 }}>
              <Select.Root
                value={condition.mode}
                onValueChange={(v) => onChange({ ...condition, mode: v as TimeframeMode })}
              >
                <Select.Trigger variant="soft" aria-label="Timeframe mode" style={{ width: "100%" }} />
                <Select.Content>
                  {TIMEFRAME_MODES.map((m) => (
                    <Select.Item key={m.value} value={m.value}>
                      {m.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
          )}
        </Flex>
        <Flex align="center" gap="2" wrap="wrap">
          <div style={grow(140)}>
            <input
              type="datetime-local"
              style={TF_INPUT}
              aria-label="From"
              value={rfcToLocalInput(condition.start)}
              onChange={(e) => onChange({ ...condition, start: localInputToRfc(e.currentTarget.value) })}
            />
          </div>
          <Text size="1" color="gray">
            to
          </Text>
          <div style={grow(140)}>
            <input
              type="datetime-local"
              style={TF_INPUT}
              aria-label="To"
              value={rfcToLocalInput(condition.end)}
              onChange={(e) => onChange({ ...condition, end: localInputToRfc(e.currentTarget.value) })}
            />
          </div>
          <Badge
            color="gray"
            variant="soft"
            title="Times are interpreted as UTC, matching the event data and the chart below."
          >
            UTC
          </Badge>
        </Flex>

        {env && (
          <EventTimeRangePicker
            backend={env.backend}
            datasetName={env.datasetName}
            objectType={env.objectType}
            start={condition.start}
            end={condition.end}
            onRangeChange={(s, e) => onChange({ ...condition, start: s, end: e })}
          />
        )}
      </Flex>
    </LeafFrame>
  );
}
