import { Card, Text } from "@r4pm/components/ui";
import { useMemo } from "react";
import { buildPlotData, PLOT_CONFIG, type ObjectAttributeChanges } from "./object-attribute-changes-data";
import { ThemedPlot as Plot } from "./themed-plot";

export interface ObjectAttributeChangesChartProps {
  /** One object's attribute changes over time (from `get_object_attribute_changes`). */
  data: ObjectAttributeChanges;
  /** The object id being plotted (shown in the title). */
  objectID: string;
}

/**
 * Plots one object's attribute values over time: numeric attributes as filled time-series,
 * categorical attributes as colored bands above the axis. Backend-free: pass the `ObjectAttributeChanges`
 * for a chosen object; the studio's ObjectAttributeChangesPanel does the object-id picking + fetch.
 */
export function ObjectAttributeChangesChart({ data, objectID }: ObjectAttributeChangesChartProps) {
  const plotData = useMemo(() => buildPlotData(data, objectID), [data, objectID]);

  const layout: Partial<Plotly.Layout> = {
    template: "plotly_white" as unknown as Plotly.Template,
    title: {
      text: `Attribute Values Over Time for <i>${plotData.objectID}</i>`,
      x: 0.05,
      y: 0.98,
      xanchor: "left",
    },
    xaxis: { title: { text: "Time" }, autorange: true, gridcolor: "#e5e7eb" },
    yaxis: { title: { text: "Value" }, gridcolor: "#e5e7eb" },
    hovermode: "x unified",
    hoverdistance: -1,
    margin: { l: 60, r: 30, t: 75 + plotData.categoricalCount * 20, b: 60 },
    paper_bgcolor: "rgba(255,255,255,1)",
    plot_bgcolor: "rgba(255,255,255,1)",
    annotations: plotData.annotations,
    shapes: plotData.shapes,
    autosize: true,
  };

  return (
    <div style={{ width: "100%", height: "100%", minHeight: 200, padding: 8 }}>
      <Card className="relative w-full" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <Text as="div" size="4" weight="bold" mb="2">
          Object Attribute Changes over Time
        </Text>
        <div className="grow" style={{ minHeight: 0 }}>
          <Plot
            data={plotData.traces}
            layout={layout}
            config={PLOT_CONFIG}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
          />
        </div>
      </Card>
    </div>
  );
}
