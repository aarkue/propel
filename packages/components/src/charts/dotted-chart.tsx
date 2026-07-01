import {
  Badge,
  Button,
  Card,
  Checkbox,
  IconButton,
  Popover,
  SegmentedControl,
  Select,
  Separator,
  Slider,
  Text,
  TextField,
} from "@r4pm/components/ui";
import { type JSX, useMemo, useRef, useState } from "react";
import { PiChartLineDown, PiChartLineUp, PiX } from "react-icons/pi";
import { ThemedPlot as Plot } from "./themed-plot";
import { ErrorState } from "../feedback/ErrorState";
import { LoadingState } from "../feedback/LoadingState";
import { colorForSeed, useViewerConfig } from "../viewer/viewer-config";

// Local view-models mirroring the generated `@r4pm/client` bindings.
export interface DottedChartPoints {
  x: number[];
  y: number[];
}

export interface DottedChartData {
  dots_per_color: Record<string, DottedChartPoints>;
  y_values: string[];
}

export interface DottedChartOptions {
  x_axis: "Time" | "TimeSinceCaseStart" | "TimeRelativeToCaseDuration" | "StepNumberSinceCaseStart";
  y_axis: "Case" | "Resource" | { EventAttribute: string } | { CaseAttribute: string };
  color_axis: "Activity" | "Resource" | "Case" | { EventAttribute: string } | { CaseAttribute: string };
  timestamp_key: string;
}

// Axis option types are inlined into `DottedChartOptions` in the generated
// bindings; alias them here so the configurable controls stay typed verbatim.
type DottedChartXAxis = DottedChartOptions["x_axis"];
type DottedChartYAxis = DottedChartOptions["y_axis"];
type DottedChartColorAxis = DottedChartOptions["color_axis"];

/** The three axis selections that drive what the backend computes. Lifted to the
 *  host (which owns the fetch) so changing an axis can trigger a refetch. */
export interface DottedChartAxisConfig {
  x: DottedChartXAxis;
  y: DottedChartYAxis;
  color: DottedChartColorAxis;
}

const DEFAULT_AXIS: DottedChartAxisConfig = { x: "Time", y: "Case", color: "Activity" };
const TIMESTAMP_KEY = "time:timestamp";

/** Parse a value as it appears in a Plotly relayout event for a date axis.
 *  Plotly returns either a numeric epoch or a locale-formatted string. */
function parsePlotlyDate(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function xAxisTitle(x: DottedChartXAxis): string {
  switch (x) {
    case "Time":
      return "Time";
    case "TimeSinceCaseStart":
      return "Time since case start";
    case "StepNumberSinceCaseStart":
      return "Step index since case start";
    default:
      return "Time relative to case duration";
  }
}

function yAxisTitle(y: DottedChartYAxis): string {
  if (y === "Case") return "Case";
  if (y === "Resource") return "Resource";
  if ("CaseAttribute" in y) return `${y.CaseAttribute} (case)`;
  return `${y.EventAttribute} (event)`;
}

function colorAxisTitle(c: DottedChartColorAxis): string {
  if (c === "Activity") return "Activity";
  if (c === "Resource") return "Resource";
  if (c === "Case") return "Case";
  if ("CaseAttribute" in c) return `${c.CaseAttribute} (case)`;
  return `${c.EventAttribute} (event)`;
}

export interface DottedChartProps {
  /** Computed dots (`dots_per_color` + `y_values`). Undefined while loading. */
  data?: DottedChartData;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Controlled axis selection (the viz `controls`). Defaults to Time/Case/Activity when omitted. */
  controls?: DottedChartAxisConfig;
  /** When provided, the axis "Configure" popover is shown and changes are reported here (the host
   *  refetches). When omitted (e.g. a pipeline viewer with no backend), the axis controls are
   *  hidden and only presentation controls remain. */
  onControlsChange?: (next: DottedChartAxisConfig) => void;
  /** Optional bridge for downstream filtering (time-range selection). */
  onSelect?: (s: { scope: string; key: string }) => void;
  title?: string;
}

/**
 * Configurable dotted chart over `DottedChartData`. Backend-free: the host owns
 * the fetch and passes `data` plus a controlled `axis`. Owns its presentation
 * controls (dot size/opacity, hover, sort direction) and, when `onAxisChange`
 * is wired, the X/Y/color axis selectors that drive a refetch.
 */
export function DottedChart({
  data,
  loading,
  error,
  onRetry,
  controls: axis = DEFAULT_AXIS,
  onControlsChange: onAxisChange,
  onSelect,
  title = "Dotted Chart",
}: DottedChartProps): JSX.Element {
  const { colorOf } = useViewerConfig({});
  const [selectedRange, setSelectedRange] = useState<{ startMs: number; endMs: number } | null>(null);
  const plotID = useRef(Math.random().toString());
  const [markerSize, setMarkerSize] = useState(3);
  const [markerOpacity, setMarkerOpacity] = useState(65);
  const [hoverEnabled, setHoverEnabled] = useState(false);
  const [direction, setDirection] = useState<"up" | "down">("up");

  const { x: xAxisConfig, y: yAxisConfig, color: colorAxisConfig } = axis;
  const setAxis = (patch: Partial<DottedChartAxisConfig>) => onAxisChange?.({ ...axis, ...patch });

  const [plotData, usingGl]: [Plotly.Data[], boolean] | [undefined, undefined] = useMemo(() => {
    if (data) {
      const useScatterGL = true;
      return [
        Object.keys(data.dots_per_color).map(
          (act) =>
            ({
              mode: "markers",
              type: useScatterGL ? "scattergl" : "scatter",
              name: act.length > 50 ? `${act.substring(0, 50 - 3)}...` : act,
              x: data.dots_per_color[act]?.x,
              y: data.dots_per_color[act]?.y.map((i) => data.y_values[i]),
              marker: {
                size: markerSize,
                opacity: markerOpacity / 100,
                // Shared activity colors only apply when coloring BY activity; other axes keep the local palette.
                color:
                  (colorAxisConfig === "Activity" ? colorOf?.("activity", act) : undefined) ??
                  colorForSeed(act),
              },
            }) satisfies Plotly.Data,
        ),
        useScatterGL,
      ];
    }
    return [undefined, undefined];
  }, [data, markerOpacity, markerSize, colorAxisConfig, colorOf]);

  const layout: Partial<Plotly.Layout> = useMemo(() => {
    return {
      font: { size: 22, weight: 500, color: "var(--r4pm-node-text)" },
      autosize: true,
      legend: {
        font: { size: 11 },
        bgcolor: "#ffffff00",
        title: { text: colorAxisTitle(colorAxisConfig) },
        itemsizing: "constant",
        orientation: "h",
        y: 1.0,
        yref: "paper",
        yanchor: "bottom",
      },
      hovermode: hoverEnabled ? "closest" : false,
      xaxis: {
        fixedrange: false,
        range: xAxisConfig === "TimeRelativeToCaseDuration" ? [0, 1] : undefined,
        type: xAxisConfig === "Time" ? "date" : "linear",
        title: { text: xAxisTitle(xAxisConfig) },
        automargin: true,
      },
      yaxis: {
        fixedrange: false,
        type: "category",
        tickfont: { size: 8 },
        categoryorder: "array",
        categoryarray: data?.y_values ?? [],
        title: { text: yAxisTitle(yAxisConfig) },
        automargin: true,
        autorange: direction === "up" ? "min" : "min reversed",
        minallowed: 0,
        zeroline: false,
      },
    };
  }, [direction, xAxisConfig, yAxisConfig, colorAxisConfig, data?.y_values, hoverEnabled]);

  const config: Partial<Plotly.Config> = useMemo(
    () => ({ displaylogo: false, displayModeBar: false, responsive: false, autosizable: true }),
    [],
  );

  const handleRelayout = (ev: Readonly<Plotly.PlotRelayoutEvent>) => {
    if (xAxisConfig !== "Time") {
      setSelectedRange(null);
      return;
    }
    const rec = ev as unknown as Record<string, unknown>;
    if ("xaxis.autorange" in rec) {
      setSelectedRange(null);
      return;
    }
    const s = parsePlotlyDate(rec["xaxis.range[0]"]);
    const e = parsePlotlyDate(rec["xaxis.range[1]"]);
    if (s != null && e != null && e > s) {
      setSelectedRange({ startMs: s, endMs: e });
      onSelect?.({ scope: "time-range", key: `${s}/${e}` });
    }
  };

  return (
    <Card
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        paddingBottom: "2.5rem",
      }}
    >
      <Text
        data-export-ignore
        as="div"
        size="4"
        weight="bold"
        mb="2"
        style={{ display: "flex", alignItems: "center", columnGap: "0.5rem", flexWrap: "wrap" }}
      >
        {title}
        <SegmentedControl.Root
          size="1"
          value={direction}
          onValueChange={(v) => setDirection(v as "up" | "down")}
        >
          <SegmentedControl.Item title="Cases sorted ascending" value="up">
            <PiChartLineUp />
          </SegmentedControl.Item>
          <SegmentedControl.Item title="Cases sorted descending" value="down">
            <PiChartLineDown />
          </SegmentedControl.Item>
        </SegmentedControl.Root>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            rowGap: "0.25rem",
            width: "6rem",
            paddingBottom: "0.5rem",
          }}
        >
          <Text weight="medium" size="1">
            Dot Size: {markerSize}
          </Text>
          <Slider
            radius="full"
            size="1"
            min={1}
            max={15}
            value={[markerSize]}
            step={1}
            onValueChange={(v) => setMarkerSize(v[0]!)}
          />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            rowGap: "0.25rem",
            width: "6rem",
            paddingBottom: "0.5rem",
          }}
        >
          <Text weight="medium" size="1">
            Opacity: {Math.round(markerOpacity)}%
          </Text>
          <Slider
            color="teal"
            radius="full"
            size="1"
            min={1}
            max={100}
            value={[markerOpacity]}
            step={1}
            onValueChange={(v) => setMarkerOpacity(v[0]!)}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <Checkbox checked={hoverEnabled} onCheckedChange={(v) => setHoverEnabled(Boolean(v))} />
          <Text weight="medium" size="2">
            Enable Hover
          </Text>
        </div>
        {onAxisChange && (
          <Popover.Root>
            <Popover.Trigger>
              <Button size="1" variant="solid">
                Configure...
              </Button>
            </Popover.Trigger>
            <Popover.Content style={{ position: "relative" }}>
              <Popover.Close>
                <IconButton
                  title="Close"
                  size="1"
                  variant="ghost"
                  color="ruby"
                  style={{ position: "absolute", right: "0.375rem", top: "0.375rem" }}
                >
                  <PiX />
                </IconButton>
              </Popover.Close>
              <div>
                <div>
                  <Text weight="medium" size="2">
                    X Axis
                  </Text>
                  <br />
                  <Select.Root
                    size="1"
                    value={xAxisConfig}
                    onValueChange={(v) => setAxis({ x: v as DottedChartXAxis })}
                  >
                    <Select.Trigger variant="surface" />
                    <Select.Content>
                      <Select.Item value="Time">Time</Select.Item>
                      <Select.Item value="TimeSinceCaseStart">Time since case start</Select.Item>
                      <Select.Item value="TimeRelativeToCaseDuration">
                        Time relative to case duration
                      </Select.Item>
                      <Select.Item value="StepNumberSinceCaseStart">Step number since case start</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>
                <Separator orientation="horizontal" size="4" my="2" />
                <div>
                  <Text weight="medium" size="2">
                    Y Axis
                  </Text>
                  <br />
                  <div style={{ display: "flex", alignItems: "center", columnGap: "0.25rem" }}>
                    <Select.Root
                      size="1"
                      value={
                        typeof yAxisConfig === "string"
                          ? yAxisConfig
                          : "CaseAttribute" in yAxisConfig
                            ? "CaseAttribute"
                            : "EventAttribute"
                      }
                      onValueChange={(newValue) => {
                        if (newValue === "CaseAttribute") {
                          setAxis({ y: { CaseAttribute: "concept:name" } });
                        } else if (newValue === "EventAttribute") {
                          setAxis({ y: { EventAttribute: "concept:name" } });
                        } else {
                          setAxis({ y: newValue as DottedChartYAxis });
                        }
                      }}
                    >
                      <Select.Trigger variant="surface" />
                      <Select.Content>
                        <Select.Item value="Case">Case</Select.Item>
                        <Select.Item value="Resource">Resource</Select.Item>
                        <Select.Item value="CaseAttribute">Custom case attribute</Select.Item>
                        <Select.Item value="EventAttribute">Custom event attribute</Select.Item>
                      </Select.Content>
                    </Select.Root>
                    {typeof yAxisConfig !== "string" && (
                      <TextField.Root
                        defaultValue={
                          "EventAttribute" in yAxisConfig
                            ? yAxisConfig.EventAttribute
                            : yAxisConfig.CaseAttribute
                        }
                        size="1"
                        placeholder="Attribute name"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        onBlur={(e) => {
                          if ("EventAttribute" in yAxisConfig) {
                            setAxis({ y: { EventAttribute: e.target.value } });
                          } else if ("CaseAttribute" in yAxisConfig) {
                            setAxis({ y: { CaseAttribute: e.target.value } });
                          }
                        }}
                      />
                    )}
                  </div>
                  <Separator orientation="horizontal" size="4" my="2" />
                  <div>
                    <Text weight="medium" size="2">
                      Color Axis
                    </Text>
                    <br />
                    <div style={{ display: "flex", alignItems: "center", columnGap: "0.25rem" }}>
                      <Select.Root
                        size="1"
                        value={
                          typeof colorAxisConfig === "string"
                            ? colorAxisConfig
                            : "CaseAttribute" in colorAxisConfig
                              ? "CaseAttribute"
                              : "EventAttribute"
                        }
                        onValueChange={(newValue) => {
                          if (newValue === "CaseAttribute") {
                            setAxis({ color: { CaseAttribute: "" } });
                          } else if (newValue === "EventAttribute") {
                            setAxis({ color: { EventAttribute: "concept:name" } });
                          } else {
                            setAxis({ color: newValue as DottedChartColorAxis });
                          }
                        }}
                      >
                        <Select.Trigger variant="surface" />
                        <Select.Content>
                          <Select.Item value="Activity">Activity</Select.Item>
                          <Select.Item value="Resource">Resource</Select.Item>
                          <Select.Item value="CaseAttribute">Custom case attribute</Select.Item>
                          <Select.Item value="EventAttribute">Custom event attribute</Select.Item>
                        </Select.Content>
                      </Select.Root>
                      {typeof colorAxisConfig !== "string" && (
                        <TextField.Root
                          defaultValue={
                            "EventAttribute" in colorAxisConfig
                              ? colorAxisConfig.EventAttribute
                              : colorAxisConfig.CaseAttribute
                          }
                          size="1"
                          placeholder="Attribute name"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                          }}
                          onBlur={(e) => {
                            if ("EventAttribute" in colorAxisConfig) {
                              setAxis({ color: { EventAttribute: e.target.value } });
                            } else if ("CaseAttribute" in colorAxisConfig) {
                              setAxis({ color: { CaseAttribute: e.target.value } });
                            }
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Popover.Content>
          </Popover.Root>
        )}
        {usingGl && (
          <Badge title="This plot is rendered using the WebGL backend, as there are many elements plotted. Note that as a result the SVG Export will be partly rasterized.">
            WebGL Renderer
          </Badge>
        )}
      </Text>
      {error ? (
        <div style={{ flex: 1, margin: "0 0.5rem", position: "relative", minHeight: "20rem" }}>
          <ErrorState error={error} onRetry={onRetry} />
        </div>
      ) : loading || plotData === undefined ? (
        <div style={{ flex: 1, margin: "0 0.5rem", position: "relative", minHeight: "20rem" }}>
          <LoadingState label="computing dotted chart" slowAfterMs={8000} />
        </div>
      ) : (
        <div style={{ flex: 1, margin: "0 0.5rem", position: "relative", minHeight: "20rem" }}>
          <Plot
            divId={plotID.current}
            onRelayout={handleRelayout}
            data={plotData}
            layout={layout}
            config={config}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
          />
        </div>
      )}
      {selectedRange && (
        <div
          style={{
            position: "absolute",
            bottom: "0.5rem",
            left: "0.5rem",
            right: "0.5rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <Text size="1" weight="medium">
            Selected: {new Date(selectedRange.startMs).toISOString()} -{" "}
            {new Date(selectedRange.endMs).toISOString()}
          </Text>
          <Button size="1" variant="soft" color="ruby" onClick={() => setSelectedRange(null)}>
            Clear
          </Button>
        </div>
      )}
    </Card>
  );
}

export { TIMESTAMP_KEY as DOTTED_CHART_TIMESTAMP_KEY };
