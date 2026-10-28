import {
  Badge,
  Button,
  Card,
  IconButton,
  Popover,
  SegmentedControl,
  Select,
  Slider,
  Switch,
  Text,
  TextField,
} from "@r4pm/components/ui";
import { type JSX, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useViewSetting } from "../viewer/view-state";
import { PiChartLineDown, PiChartLineUp, PiSlidersHorizontal, PiX } from "react-icons/pi";
import { ThemedPlot as Plot } from "./themed-plot";
import { ErrorState } from "../feedback/ErrorState";
import { LoadingState } from "../feedback/LoadingState";
import { colorForSeed, useViewerConfig } from "../viewer/viewer-config";
import { pickTimeUnit } from "./variant-time-profile-data";
import {
  autoDotSize,
  countVisibleDots,
  type DottedChartCaseOrder,
  orderRows,
  parsePlotlyDate,
  rowPositions,
} from "./dotted-chart-rows";

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

// Axis option types are inlined in the generated `DottedChartOptions`; alias them so controls stay typed.
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

function xAxisTitle(x: DottedChartXAxis, unitLabel: string): string {
  switch (x) {
    case "Time":
      return "Time";
    case "TimeSinceCaseStart":
      return `Time since case start (${unitLabel})`;
    case "StepNumberSinceCaseStart":
      return "Step since case start";
    default:
      return "Share of case duration";
  }
}

function xHoverText(x: DottedChartXAxis, unitLabel: string): string {
  switch (x) {
    case "Time":
      return "%{x|%Y-%m-%d %H:%M:%S}";
    case "TimeSinceCaseStart":
      return `%{x:.2f} ${unitLabel} after case start`;
    case "StepNumberSinceCaseStart":
      return "step %{x}";
    default:
      return "%{x:.1%} of the case duration";
  }
}

const DATE_TICK_STOPS: Partial<Plotly.TickFormatStop>[] = [
  { dtickrange: [null, 1000], value: "%H:%M:%S.%L<br>%Y-%m-%d" },
  { dtickrange: [1000, 60_000], value: "%H:%M:%S<br>%Y-%m-%d" },
  { dtickrange: [60_000, 86_400_000], value: "%H:%M<br>%Y-%m-%d" },
  { dtickrange: [86_400_000, "M1"], value: "%Y-%m-%d" },
  { dtickrange: ["M1", "M12"], value: "%b %Y" },
  { dtickrange: ["M12", null], value: "%Y" },
];

/** Label of each row order, and what sits at the bottom in ascending direction. */
function caseOrderText(
  order: DottedChartCaseOrder,
  byCase: boolean,
): { label: string; low: string; high: string } {
  switch (order) {
    case "start":
      return byCase
        ? { label: "Case start", low: "Earliest start", high: "latest" }
        : { label: "First appearance", low: "First to appear", high: "last" };
    case "end":
      return byCase
        ? { label: "Case end", low: "Earliest end", high: "latest" }
        : { label: "Last appearance", low: "Earliest last appearance", high: "latest" };
    case "span":
      return byCase
        ? { label: "Case duration", low: "Shortest case", high: "longest" }
        : { label: "Active span", low: "Shortest span", high: "longest" };
    default:
      return { label: "Number of events", low: "Fewest events", high: "most" };
  }
}

const ORDERS_TIMED: DottedChartCaseOrder[] = ["start", "end", "span", "events"];
// End and duration need a time x axis.
const ORDERS_UNTIMED: DottedChartCaseOrder[] = ["start", "events"];

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
  /** When provided, shows the axis "Configure" popover and reports changes here; omit to hide axis controls (e.g. no backend). */
  onControlsChange?: (next: DottedChartAxisConfig) => void;
  /** Optional bridge for downstream filtering (time-range selection). */
  onSelect?: (s: { scope: string; key: string }) => void;
  title?: string;
}

/** Configurable dotted chart; backend-free, host owns the fetch and passes `data` + a controlled `axis`. */
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
  const plotID = useRef(Math.random().toString());
  const [markerSize, setMarkerSize] = useViewSetting("markerSize", 3);
  const [markerOpacity, setMarkerOpacity] = useViewSetting("markerOpacity", 65);
  const [hoverEnabled, setHoverEnabled] = useViewSetting("hoverEnabled", false);
  const [direction, setDirection] = useViewSetting<"up" | "down">("direction", "up");
  const [storedOrder, setCaseOrder] = useViewSetting<unknown>("caseOrder", "start");
  const [showRowLabels, setShowRowLabels] = useViewSetting("rowLabels", true);
  const [autoSize, setAutoSize] = useViewSetting("autoDotSize", true);
  const [autoScale, setAutoScale] = useViewSetting("autoDotScale", 1);
  // Drive the auto dot size.
  const [zoom, setZoom] = useState<{ x: [number, number] | null; y: [number, number] | null }>({
    x: null,
    y: null,
  });
  const [plotSize, setPlotSize] = useState({ width: 900, height: 400 });
  const [plotBox, setPlotBox] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!plotBox) return;
    const ro = new ResizeObserver(
      ([e]) => e && setPlotSize({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    ro.observe(plotBox);
    return () => ro.disconnect();
  }, [plotBox]);
  // Bumped by "Reset zoom". Otherwise `uirevision` keeps Plotly's zoom across re-renders.
  const [zoomReset, setZoomReset] = useState(0);

  const { x: xAxisConfig, y: yAxisConfig, color: colorAxisConfig } = axis;
  const timedX = xAxisConfig === "Time" || xAxisConfig === "TimeSinceCaseStart";
  const orderOptions = timedX ? ORDERS_TIMED : ORDERS_UNTIMED;
  const caseOrder: DottedChartCaseOrder = orderOptions.includes(storedOrder as DottedChartCaseOrder)
    ? (storedOrder as DottedChartCaseOrder)
    : "start";
  const orderText = caseOrderText(caseOrder, yAxisConfig === "Case");
  // biome-ignore lint/correctness/useExhaustiveDependencies: new data or axes start unzoomed
  useEffect(() => setZoom({ x: null, y: null }), [data, xAxisConfig, yAxisConfig, colorAxisConfig]);
  // Reordered rows put other cases under a kept y range, so a new order starts with the full y axis.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the row order changes
  useEffect(() => setZoom((z) => ({ ...z, y: null })), [caseOrder, direction]);
  // New data resets Plotly's zoom too, via `uirevision`.
  const dataRev = useRef({ data, rev: 0 });
  if (dataRev.current.data !== data) dataRev.current = { data, rev: dataRev.current.rev + 1 };
  const setAxis = (patch: Partial<DottedChartAxisConfig>) => onAxisChange?.({ ...axis, ...patch });

  const durationUnit = useMemo(() => {
    let max = 0;
    for (const { x } of Object.values(data?.dots_per_color ?? {})) for (const v of x) if (v > max) max = v;
    return pickTimeUnit(max);
  }, [data]);
  const isDuration = xAxisConfig === "TimeSinceCaseStart";

  // Direction is set through the category order. A "min reversed" autorange flips back to ascending
  // once Plotly writes a `range` into the layout object and reads it again.
  const yCategories = useMemo(() => {
    const ys = data ? orderRows(data, caseOrder) : [];
    return direction === "up" ? ys : [...ys].reverse();
  }, [data, caseOrder, direction]);

  const rowPos = useMemo(
    () => (data ? rowPositions(data, yCategories) : new Int32Array()),
    [data, yCategories],
  );
  const visibleDots = useMemo(
    () => (data ? countVisibleDots(data, rowPos, isDuration ? 1 / durationUnit.ms : 1, zoom.x, zoom.y) : 0),
    [data, rowPos, isDuration, durationUnit, zoom],
  );
  // Box minus room for legend, labels and titles.
  const plotArea = Math.max(1, plotSize.width - 140) * Math.max(1, plotSize.height - 170);
  const dotSize = autoSize ? autoDotSize(plotArea, visibleDots, autoScale) : markerSize;

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
              x: isDuration
                ? data.dots_per_color[act]?.x.map((v) => v / durationUnit.ms)
                : data.dots_per_color[act]?.x,
              y: data.dots_per_color[act]?.y.map((i) => data.y_values[i]),
              hovertemplate: `%{y}<br>${xHoverText(xAxisConfig, durationUnit.label)}<extra>%{fullData.name}</extra>`,
              marker: {
                size: dotSize,
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
  }, [data, markerOpacity, dotSize, colorAxisConfig, colorOf, isDuration, durationUnit, xAxisConfig]);

  const zoomKey = `${JSON.stringify([xAxisConfig, yAxisConfig, colorAxisConfig])}|${zoomReset}|${dataRev.current.rev}`;
  const layout: Partial<Plotly.Layout> = useMemo(() => {
    return {
      font: { size: 12 },
      autosize: true,
      uirevision: zoomKey,
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
        title: { text: xAxisTitle(xAxisConfig, durationUnit.label), font: { size: 13 } },
        tickfont: { size: 11 },
        automargin: true,
        zeroline: false,
        ...(xAxisConfig === "Time" ? { tickformatstops: DATE_TICK_STOPS, nticks: 10 } : {}),
        ...(xAxisConfig === "TimeRelativeToCaseDuration" ? { tickformat: ".0%" } : {}),
        ...(xAxisConfig === "StepNumberSinceCaseStart" ? { tickformat: "d" } : {}),
        ...(isDuration ? { tickformat: ",~r" } : {}),
      },
      yaxis: {
        // Per-axis keys replace the layout's, so the y key must carry it too.
        uirevision: `${zoomKey}|${caseOrder}|${direction}`,
        fixedrange: false,
        type: "category",
        tickfont: { size: 9 },
        showticklabels: showRowLabels,
        categoryorder: "array",
        categoryarray: yCategories,
        title: {
          text: `${yAxisTitle(yAxisConfig)} (${(data?.y_values.length ?? 0).toLocaleString("en")})`,
          font: { size: 13 },
        },
        automargin: true,
        autorange: "min",
        minallowed: 0,
        zeroline: false,
      },
    };
  }, [
    xAxisConfig,
    yAxisConfig,
    colorAxisConfig,
    yCategories,
    hoverEnabled,
    showRowLabels,
    durationUnit,
    isDuration,
    zoomKey,
    caseOrder,
    direction,
    data?.y_values.length,
  ]);

  const config: Partial<Plotly.Config> = useMemo(
    () => ({ displaylogo: false, displayModeBar: false, responsive: false, autosizable: true }),
    [],
  );

  const handleRelayout = (ev: Readonly<Plotly.PlotRelayoutEvent>) => {
    const r = ev as unknown as Record<string, unknown>;
    const range = (axis: "xaxis" | "yaxis"): [number, number] | null | undefined => {
      if (`${axis}.autorange` in r) return null;
      const parse =
        axis === "xaxis" && xAxisConfig === "Time"
          ? parsePlotlyDate
          : (v: unknown) => (typeof v === "number" ? v : null);
      const a = parse(r[`${axis}.range[0]`]);
      const b = parse(r[`${axis}.range[1]`]);
      return a != null && b != null ? [Math.min(a, b), Math.max(a, b)] : undefined;
    };
    const xr = range("xaxis");
    const yr = range("yaxis");
    if (xr !== undefined || yr !== undefined) {
      setZoom((z) => ({ x: xr === undefined ? z.x : xr, y: yr === undefined ? z.y : yr }));
    }
    if (xAxisConfig === "Time" && xr) onSelect?.({ scope: "time-range", key: `${xr[0]}/${xr[1]}` });
  };

  return (
    <Card
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        paddingBottom: "0.5rem",
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
        <Popover.Root>
          <Popover.Trigger>
            <Button size="1" variant="soft">
              <PiSlidersHorizontal /> Options
            </Button>
          </Popover.Trigger>
          <Popover.Content width="340px" style={{ padding: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderBottom: "1px solid var(--gray-a4)",
              }}
            >
              <Text size="2" weight="bold">
                Chart options
              </Text>
              <Popover.Close>
                <IconButton title="Close" size="1" variant="ghost" color="gray">
                  <PiX />
                </IconButton>
              </Popover.Close>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 12 }}>
              {onAxisChange && (
                <OptionSection title="Axes">
                  <OptionRow label="X axis">
                    <Select.Root
                      size="1"
                      value={xAxisConfig}
                      onValueChange={(v) => setAxis({ x: v as DottedChartXAxis })}
                    >
                      <Select.Trigger variant="surface" style={{ width: "100%" }} />
                      <Select.Content>
                        <Select.Item value="Time">Time</Select.Item>
                        <Select.Item value="TimeSinceCaseStart">Time since case start</Select.Item>
                        <Select.Item value="TimeRelativeToCaseDuration">Share of case duration</Select.Item>
                        <Select.Item value="StepNumberSinceCaseStart">Step since case start</Select.Item>
                      </Select.Content>
                    </Select.Root>
                  </OptionRow>
                  <OptionRow label="Y axis">
                    <AxisChoice
                      value={yAxisConfig}
                      fixed={["Case", "Resource"]}
                      defaultAttribute="concept:name"
                      onChange={(y) => setAxis({ y: y as DottedChartYAxis })}
                    />
                  </OptionRow>
                  <OptionRow label="Color">
                    <AxisChoice
                      value={colorAxisConfig}
                      fixed={["Activity", "Resource"]}
                      defaultAttribute="concept:name"
                      onChange={(c) => setAxis({ color: c as DottedChartColorAxis })}
                    />
                  </OptionRow>
                </OptionSection>
              )}
              <OptionSection title={yAxisConfig === "Case" ? "Cases" : "Rows"}>
                <OptionRow label="Order by">
                  <Select.Root
                    size="1"
                    value={caseOrder}
                    onValueChange={(v) => setCaseOrder(v as DottedChartCaseOrder)}
                  >
                    <Select.Trigger variant="surface" style={{ width: "100%" }} />
                    <Select.Content>
                      {orderOptions.map((o) => (
                        <Select.Item key={o} value={o}>
                          {caseOrderText(o, yAxisConfig === "Case").label}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </OptionRow>
                <OptionRow label="Direction">
                  <SegmentedControl.Root
                    size="1"
                    value={direction}
                    onValueChange={(v) => setDirection(v as "up" | "down")}
                    style={{ width: "100%" }}
                  >
                    <SegmentedControl.Item value="up">
                      <span style={INLINE}>
                        <PiChartLineUp /> Ascending
                      </span>
                    </SegmentedControl.Item>
                    <SegmentedControl.Item value="down">
                      <span style={INLINE}>
                        <PiChartLineDown /> Descending
                      </span>
                    </SegmentedControl.Item>
                  </SegmentedControl.Root>
                </OptionRow>
                <Text size="1" color="gray" style={{ marginTop: -4 }}>
                  {direction === "up"
                    ? `${orderText.low} at the bottom, ${orderText.high} at the top.`
                    : `${orderText.low} at the top, ${orderText.high} at the bottom.`}
                </Text>
                <OptionRow label="Row labels">
                  <Switch size="1" checked={showRowLabels} onCheckedChange={setShowRowLabels} />
                </OptionRow>
              </OptionSection>
              <OptionSection title="Dots">
                <OptionRow label="Size">
                  <SegmentedControl.Root
                    size="1"
                    value={autoSize ? "auto" : "fixed"}
                    onValueChange={(v) => setAutoSize(v === "auto")}
                    style={{ width: "100%" }}
                  >
                    <SegmentedControl.Item value="auto">By zoom</SegmentedControl.Item>
                    <SegmentedControl.Item value="fixed">Fixed</SegmentedControl.Item>
                  </SegmentedControl.Root>
                </OptionRow>
                {autoSize ? (
                  <OptionSlider
                    label="Scale"
                    value={autoScale}
                    min={0.3}
                    max={3}
                    step={0.1}
                    format={(v) => `${v.toFixed(1)}x`}
                    onChange={setAutoScale}
                  />
                ) : (
                  <OptionSlider
                    label="Diameter"
                    value={markerSize}
                    min={1}
                    max={15}
                    step={1}
                    format={(v) => `${v}px`}
                    onChange={setMarkerSize}
                  />
                )}
                <OptionSlider
                  label="Opacity"
                  value={markerOpacity}
                  min={1}
                  max={100}
                  step={1}
                  format={(v) => `${Math.round(v)}%`}
                  onChange={setMarkerOpacity}
                />
                <OptionRow label="Hover details">
                  <Switch size="1" checked={hoverEnabled} onCheckedChange={setHoverEnabled} />
                </OptionRow>
              </OptionSection>
            </div>
          </Popover.Content>
        </Popover.Root>
        {(zoom.x || zoom.y) && (
          <Button
            size="1"
            variant="soft"
            color="gray"
            onClick={() => {
              setZoom({ x: null, y: null });
              setZoomReset((k) => k + 1);
            }}
          >
            Reset zoom
          </Button>
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
        <div
          ref={setPlotBox}
          style={{ flex: 1, margin: "0 0.5rem", position: "relative", minHeight: "20rem" }}
        >
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
    </Card>
  );
}

export { TIMESTAMP_KEY as DOTTED_CHART_TIMESTAMP_KEY };

const INLINE = { display: "inline-flex", alignItems: "center", gap: 4 } as const;

function OptionSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Text
        size="1"
        weight="medium"
        color="gray"
        style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}
      >
        {title}
      </Text>
      {children}
    </section>
  );
}

function OptionRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", alignItems: "center", gap: 8 }}>
      <Text size="2">{label}</Text>
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function OptionSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <OptionRow label={label}>
      <Slider
        size="1"
        radius="full"
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0]!)}
      />
      <Text
        size="1"
        color="gray"
        style={{ width: 40, flexShrink: 0, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
      >
        {format(value)}
      </Text>
    </OptionRow>
  );
}

type AxisValue = string | { EventAttribute: string } | { CaseAttribute: string };

/** A fixed choice (e.g. "Case") or a case/event attribute typed by name. */
function AxisChoice({
  value,
  fixed,
  defaultAttribute,
  onChange,
}: {
  value: AxisValue;
  fixed: string[];
  defaultAttribute: string;
  onChange: (v: AxisValue) => void;
}) {
  const kind =
    typeof value === "string" ? value : "CaseAttribute" in value ? "CaseAttribute" : "EventAttribute";
  const attribute =
    typeof value === "string" ? null : "CaseAttribute" in value ? value.CaseAttribute : value.EventAttribute;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
      <Select.Root
        size="1"
        value={kind}
        onValueChange={(k) =>
          onChange(
            k === "CaseAttribute"
              ? { CaseAttribute: defaultAttribute }
              : k === "EventAttribute"
                ? { EventAttribute: defaultAttribute }
                : k,
          )
        }
      >
        <Select.Trigger variant="surface" style={{ width: "100%" }} />
        <Select.Content>
          {fixed.map((f) => (
            <Select.Item key={f} value={f}>
              {f}
            </Select.Item>
          ))}
          <Select.Item value="CaseAttribute">Case attribute...</Select.Item>
          <Select.Item value="EventAttribute">Event attribute...</Select.Item>
        </Select.Content>
      </Select.Root>
      {attribute !== null && (
        <TextField.Root
          key={kind}
          size="1"
          defaultValue={attribute}
          placeholder="Attribute name"
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          onBlur={(e) =>
            onChange(
              kind === "CaseAttribute"
                ? { CaseAttribute: e.target.value }
                : { EventAttribute: e.target.value },
            )
          }
        />
      )}
    </div>
  );
}
