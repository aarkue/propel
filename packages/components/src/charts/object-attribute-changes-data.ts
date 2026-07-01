import type { PlotParams } from "react-plotly.js";

// Local view-model mirroring the generated @r4pm/client types.
/** A single attribute value change at a point in time. */
export interface AttributeChange {
  time: string;
  value: number | boolean | string | null;
}

export interface ObjectAttributeChanges {
  traces: {
    [k: string]: AttributeChange[];
  };
}

// Local color palette (decoupled from propel GlobalState colors).
export const COLORS = [
  "#636EFA",
  "#EF553B",
  "#00CC96",
  "#AB63FA",
  "#FFA15A",
  "#19D3F3",
  "#FF6692",
  "#B6E880",
  "#FF97FF",
  "#FECB52",
];

export const PLOT_CONFIG: PlotParams["config"] = { displaylogo: false, displayModeBar: false };

export interface PlotData {
  traces: Plotly.Data[];
  shapes: Partial<Plotly.Shape>[];
  annotations: Partial<Plotly.Annotations>[];
  categoricalCount: number;
  numericCount: number;
  objectID: string;
}

/** A non-null attribute value formatted as a string for plotting. */
export function valueToString(value: number | boolean | string | null): string {
  return value === null ? "" : String(value);
}

/** True when the attribute trace holds non-numeric (categorical) values. */
export function isDiscreteTrace(changes: ObjectAttributeChanges["traces"][string]): boolean {
  return changes.find(({ value }) => !/^-?\d+(\.\d+)?$/.test(valueToString(value))) !== undefined;
}

export function buildPlotData(val: ObjectAttributeChanges, objectID: string): PlotData {
  const traces: Plotly.Data[] = [];
  const annotations: Partial<Plotly.Annotations>[] = [];
  const shapes: Partial<Plotly.Shape>[] = [];
  let categoricalCount = 0;
  let numericCount = 0;

  for (const t in val.traces) {
    const changes = val.traces[t]!;
    if (isDiscreteTrace(changes)) {
      annotations.push({
        xref: "paper",
        yref: "paper",
        x: 0,
        y: 1.04 + categoricalCount * 0.04,
        yanchor: "middle",
        text: t,
        showarrow: false,
        xanchor: "right",
        align: "right",
        font: { size: 11 },
      });
      traces.push({
        x: changes.map(({ time }) => time),
        y: changes.map(() => 1),
        name: t,
        mode: "lines",
        hovertext: changes.map(({ value }) => valueToString(value)),
        hovertemplate: `%{hovertext}<extra></extra>`,
        line: { width: 0 },
        marker: { color: "transparent" },
        showlegend: false,
      });
      for (let i = 0; i < changes.length; i++) {
        const entry = changes[i]!;
        const nextEntry = i + 1 < changes.length ? changes[i + 1]! : undefined;
        shapes.push({
          type: "rect",
          xref: "x",
          yref: "paper",
          x0: entry.time,
          y0: 1.02 + categoricalCount * 0.04,
          y1: 1.06 + categoricalCount * 0.04,
          x1: nextEntry ? nextEntry.time : new Date().toISOString(),
          fillcolor: COLORS[shapes.length % COLORS.length],
          layer: "below",
          opacity: 0.6,
          line: { width: 0 },
        });
        annotations.push({
          xref: "x",
          yref: "paper",
          x: entry.time,
          y: 1.04 + categoricalCount * 0.04,
          yanchor: "middle",
          text: valueToString(entry.value),
          showarrow: false,
          xanchor: "left",
          font: { color: "white", weight: 600, size: 10 },
        });
      }
      categoricalCount += 1;
    } else {
      const color = COLORS[(COLORS.length - numericCount) % COLORS.length];
      const x = changes.map(({ time }) => time);
      const y = changes.map(({ value }) => Number(valueToString(value)));
      const opacities = changes.map(() => 1.0);
      if (changes.length > 0) {
        x.push(new Date().toISOString());
        y.push(Number(valueToString(changes[changes.length - 1]!.value)));
        opacities.push(0.0);
      }
      traces.push({
        type: "scatter",
        name: t,
        mode: "lines+markers",
        fill: "tozeroy",
        fillcolor: `${color}60`,
        line: { color: color, width: 2 },
        marker: { size: 6, symbol: "circle", opacity: opacities },
        x,
        y,
      });
      numericCount += 1;
    }
  }

  return { traces, shapes, annotations, categoricalCount, numericCount, objectID };
}
