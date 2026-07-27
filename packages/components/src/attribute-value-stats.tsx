import type { ReactNode } from "react";
import { Badge, Slider, Text } from "@r4pm/components/ui";
import { ThemedPlot } from "./charts/themed-plot";
import { FrequencyPicker } from "./inputs/FrequencyPicker";
import { RankedBarList } from "./shared/RankedBarList";

/** Mirrors the backend `AttrValueCount`. */
export interface AttrValueCount {
  value: string;
  count: number;
}

interface NumericFields {
  min: number;
  max: number;
  mean: number;
  hist_bin_edges: number[];
  hist_counts: number[];
  count: number;
  null_count: number;
}

/** Mirrors the backend `OcelAttributeStats` (structurally assignable from the generated type). */
export type OcelAttributeStats =
  | ({ kind: "Float" } & NumericFields)
  | ({ kind: "Integer" } & NumericFields)
  | { kind: "Str"; top_values: AttrValueCount[]; distinct: number; count: number; null_count: number }
  | { kind: "Bool"; true_count: number; false_count: number; null_count: number }
  | {
      kind: "Time";
      min: string;
      max: string;
      hist_bin_edges_ms: number[];
      hist_counts: number[];
      count: number;
      null_count: number;
    }
  | { kind: "Empty" };

/** Structurally identical to the host app's `ValueFilter`, so selections feed straight into its filter model. */
export type AttributeValueSelection =
  | { type: "Float" | "Integer"; min: number | null; max: number | null }
  | { type: "String"; is_in: string[] }
  | { type: "Boolean"; is_true: boolean }
  | { type: "Time"; from: string | null; to: string | null };

export interface AttributeValueStatsProps {
  stat: OcelAttributeStats;
  /** Current selection (controlled). Omit for a read-only display. */
  value?: AttributeValueSelection;
  onChange?: (sel: AttributeValueSelection) => void;
}

const BAR_COLOR = "#6366f1";
const BAR_DIM = "rgba(99,102,241,0.25)";
const SEL_FILL = "rgba(99,102,241,0.1)";
const SEL_EDGE = "rgba(99,102,241,0.9)";
// Plot data-area insets; the slider is padded by the same insets so its track lines up with the histogram x-axis.
const PLOT_ML = 40;
const PLOT_MR = 12;

function pct(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  return `${Math.round((100 * part) / whole)}%`;
}

function binCenters(edges: number[]): number[] {
  const c: number[] = [];
  for (let i = 0; i + 1 < edges.length; i++) c.push((edges[i] + edges[i + 1]) / 2);
  return c;
}

/** ~100 divisions snapped to a 1/2/5 x 10^n increment so thumbs land on readable values. */
function niceStep(span: number): number {
  if (!(span > 0)) return 1;
  const raw = span / 100;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

function StatStrip({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 14px", fontSize: 12 }}>
      {items.map((it) => (
        <span key={it.label}>
          <span style={{ color: "var(--gray-10)" }}>{it.label} </span>
          <span style={{ color: "var(--gray-12)", fontWeight: 600 }}>{it.value}</span>
        </span>
      ))}
    </div>
  );
}

function numInput(v: number | null, onSet: (n: number | null) => void, placeholder: string) {
  return (
    <input
      type="number"
      value={v ?? ""}
      placeholder={placeholder}
      onChange={(e) => onSet(e.currentTarget.value === "" ? null : Number(e.currentTarget.value))}
      style={{
        width: 96,
        padding: "2px 6px",
        borderRadius: 6,
        border: "1px solid var(--gray-a6)",
        background: "var(--color-surface)",
        color: "var(--gray-12)",
        fontSize: 12,
      }}
    />
  );
}

function Histogram({
  centers,
  counts,
  domMin,
  domMax,
  selLo,
  selHi,
  interactive,
  onRange,
  onReset,
}: {
  centers: number[];
  counts: number[];
  domMin: number;
  domMax: number;
  selLo: number | null;
  selHi: number | null;
  interactive: boolean;
  onRange?: (lo: number, hi: number) => void;
  onReset?: () => void;
}) {
  const selected = selLo != null && selHi != null;
  const line = (x: number) => ({
    type: "line" as const,
    xref: "x" as const,
    yref: "paper" as const,
    x0: x,
    x1: x,
    y0: 0,
    y1: 1,
    line: { color: SEL_EDGE, width: 1.5 },
  });
  const shapes = selected
    ? [
        {
          type: "rect" as const,
          xref: "x" as const,
          yref: "paper" as const,
          x0: selLo as number,
          x1: selHi as number,
          y0: 0,
          y1: 1,
          fillcolor: SEL_FILL,
          line: { width: 0 },
          layer: "below" as const,
        },
        line(selLo as number),
        line(selHi as number),
      ]
    : [];
  const barColor = selected
    ? centers.map((c) => (c >= (selLo as number) && c <= (selHi as number) ? BAR_COLOR : BAR_DIM))
    : BAR_COLOR;
  return (
    <ThemedPlot
      data={[
        {
          type: "bar",
          x: centers,
          y: counts,
          // cornerradius is supported at runtime (plotly 2.35) but absent from @types/plotly.js.
          marker: { color: barColor, line: { width: 0 }, ...({ cornerradius: 3 } as object) },
          hovertemplate: "%{x}: %{y}<extra></extra>",
        },
      ]}
      layout={{
        height: 148,
        margin: { l: PLOT_ML, r: PLOT_MR, t: 6, b: 20 },
        bargap: 0.08,
        dragmode: interactive ? "select" : false,
        selectdirection: "h",
        shapes,
        // Pinned to the data domain so the data area maps [domMin, domMax] exactly (slider alignment).
        xaxis: { fixedrange: !interactive, range: [domMin, domMax], showgrid: false, ticklen: 3 },
        yaxis: { fixedrange: true, showgrid: true, nticks: 3, title: { text: "" } },
      }}
      config={{ displayModeBar: false }}
      style={{ width: "100%" }}
      useResizeHandler
      onSelected={(e: { range?: { x?: number[] } } | undefined) => {
        const r = e?.range?.x;
        if (interactive && onRange && r && r.length === 2) onRange(r[0], r[1]);
      }}
      // In select mode a double-click fires `plotly_deselect` (not doubleclick); handle both.
      onDeselect={() => {
        if (interactive) onReset?.();
      }}
      onDoubleClick={() => {
        if (interactive) onReset?.();
      }}
    />
  );
}

function nullBadge(nullCount: number, total: number) {
  return (
    <Badge color="gray" variant="soft">
      missing {nullCount.toLocaleString("en")} · {pct(nullCount, total)}
    </Badge>
  );
}

export function AttributeValueStats({ stat, value, onChange }: AttributeValueStatsProps) {
  const interactive = onChange != null;

  if (stat.kind === "Empty") {
    return (
      <Text size="1" color="gray">
        No values
      </Text>
    );
  }

  if (stat.kind === "Float" || stat.kind === "Integer") {
    const total = stat.count + stat.null_count;
    const sel = value && (value.type === "Float" || value.type === "Integer") ? value : undefined;
    const isInt = stat.kind === "Integer";
    const items = [
      { label: "min", value: stat.min.toLocaleString("en") },
      { label: "max", value: stat.max.toLocaleString("en") },
      { label: "mean", value: stat.mean.toFixed(2) },
      { label: "count", value: stat.count.toLocaleString("en") },
      { label: "missing", value: pct(stat.null_count, total) },
    ];
    // Emitted handles snap to the slider granularity so the shown value matches the thumb position.
    const span = stat.max - stat.min;
    const step = isInt ? 1 : niceStep(span);
    const decimals = isInt ? 0 : Math.min(6, Math.max(0, Math.ceil(-Math.log10(step))));
    const snap = (n: number | null): number | null => {
      if (n == null || !Number.isFinite(n)) return null;
      return isInt ? Math.round(n) : Number(n.toFixed(decimals));
    };
    const emit = (min: number | null, max: number | null) =>
      onChange?.({ type: stat.kind as "Float" | "Integer", min: snap(min), max: snap(max) });

    // Data range widened to include an out-of-range typed value so its thumb stays visible.
    const selLo = sel?.min ?? stat.min;
    const selHi = sel?.max ?? stat.max;
    const domMin = Math.min(stat.min, selLo);
    const domMax = Math.max(stat.max, selHi);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
        <StatStrip items={items} />
        <Histogram
          centers={binCenters(stat.hist_bin_edges)}
          counts={stat.hist_counts}
          domMin={domMin}
          domMax={domMax}
          selLo={sel?.min ?? null}
          selHi={sel?.max ?? null}
          interactive={interactive}
          onRange={(lo, hi) => emit(lo, hi)}
          onReset={() => emit(null, null)}
        />
        {interactive && (
          <>
            {domMax > domMin && (
              // Padded by the plot insets so the slider track aligns with the histogram x-axis.
              <div style={{ paddingLeft: PLOT_ML, paddingRight: PLOT_MR }}>
                <Slider
                  size="1"
                  min={domMin}
                  max={domMax}
                  step={step}
                  value={[
                    Math.max(domMin, Math.min(domMax, selLo)),
                    Math.max(domMin, Math.min(domMax, selHi)),
                  ]}
                  onValueChange={([lo, hi]: number[]) => emit(lo, hi)}
                />
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <Text size="1" color="gray">
                range
              </Text>
              {numInput(sel?.min ?? null, (n) => emit(n, sel?.max ?? null), "min")}
              <Text size="1" color="gray">
                –
              </Text>
              {numInput(sel?.max ?? null, (n) => emit(sel?.min ?? null, n), "max")}
            </div>
          </>
        )}
      </div>
    );
  }

  if (stat.kind === "Time") {
    const total = stat.count + stat.null_count;
    const sel = value && value.type === "Time" ? value : undefined;
    const items = [
      { label: "from", value: stat.min },
      { label: "to", value: stat.max },
      { label: "count", value: stat.count.toLocaleString("en") },
      { label: "missing", value: pct(stat.null_count, total) },
    ];
    const edges = stat.hist_bin_edges_ms;
    const msMin = edges.length ? edges[0] : Date.parse(stat.min);
    const msMax = edges.length ? edges[edges.length - 1] : Date.parse(stat.max);
    const selFrom = sel?.from ? Date.parse(sel.from) : null;
    const selTo = sel?.to ? Date.parse(sel.to) : null;
    const emit = (from: string | null, to: string | null) => onChange?.({ type: "Time", from, to });
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
        <StatStrip items={items} />
        <Histogram
          centers={binCenters(stat.hist_bin_edges_ms)}
          counts={stat.hist_counts}
          domMin={Math.min(msMin, selFrom ?? msMin)}
          domMax={Math.max(msMax, selTo ?? msMax)}
          selLo={selFrom}
          selHi={selTo}
          interactive={interactive}
          onRange={(lo, hi) => emit(new Date(lo).toISOString(), new Date(hi).toISOString())}
          onReset={() => emit(null, null)}
        />
        {interactive && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, flexWrap: "wrap" }}>
            <Text size="1" color="gray">
              range
            </Text>
            <input
              type="datetime-local"
              value={sel?.from ? sel.from.slice(0, 16) : ""}
              onChange={(e) =>
                emit(
                  e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : null,
                  sel?.to ?? null,
                )
              }
              style={{ fontSize: 12 }}
            />
            <Text size="1" color="gray">
              –
            </Text>
            <input
              type="datetime-local"
              value={sel?.to ? sel.to.slice(0, 16) : ""}
              onChange={(e) =>
                emit(
                  sel?.from ?? null,
                  e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : null,
                )
              }
              style={{ fontSize: 12 }}
            />
          </div>
        )}
      </div>
    );
  }

  if (stat.kind === "Bool") {
    const total = stat.true_count + stat.false_count + stat.null_count;
    const nonNull = stat.true_count + stat.false_count;
    const sel = value && value.type === "Boolean" ? value : undefined;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", width: "100%" }}>
          <div
            style={{
              width: pct(stat.true_count, nonNull),
              background: "#16a34a",
              color: "white",
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            true {stat.true_count.toLocaleString("en")}
          </div>
          <div
            style={{
              width: pct(stat.false_count, nonNull),
              background: "#9333ea",
              color: "white",
              fontSize: 11,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            false {stat.false_count.toLocaleString("en")}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {nullBadge(stat.null_count, total)}
          {interactive && (
            <>
              <Badge
                color={sel?.is_true === true ? "green" : "gray"}
                variant={sel?.is_true === true ? "solid" : "soft"}
                style={{ cursor: "pointer" }}
                onClick={() => onChange?.({ type: "Boolean", is_true: true })}
              >
                filter true
              </Badge>
              <Badge
                color={sel?.is_true === false ? "purple" : "gray"}
                variant={sel?.is_true === false ? "solid" : "soft"}
                style={{ cursor: "pointer" }}
                onClick={() => onChange?.({ type: "Boolean", is_true: false })}
              >
                filter false
              </Badge>
            </>
          )}
        </div>
      </div>
    );
  }

  const total = stat.count + stat.null_count;
  const sel = value && value.type === "String" ? value : undefined;
  const items = Object.fromEntries(stat.top_values.map((t) => [t.value, t.count]));
  const truncated = stat.distinct > stat.top_values.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Badge color="blue" variant="soft">
          {stat.distinct.toLocaleString("en")} distinct
        </Badge>
        {nullBadge(stat.null_count, total)}
        {truncated && (
          <Badge color="gray" variant="soft">
            showing top {stat.top_values.length}
          </Badge>
        )}
      </div>
      {interactive ? (
        <FrequencyPicker
          items={items}
          value={new Set(sel?.is_in ?? [])}
          onChange={(next) => onChange?.({ type: "String", is_in: [...next] })}
          mode="multi"
          scope="objectType"
          searchable
          emptyText="No values"
        />
      ) : (
        <RankedBarList items={items} scope="objectType" emptyText="No values" />
      )}
    </div>
  );
}
