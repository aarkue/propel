import type { Meta, StoryObj } from "@storybook/react-vite";
// Minimal example: what an external consumer imports.
import "@r4pm/components/styles.css";
import { ThemedPlot } from "@r4pm/components/charts";

const ACTIVITIES = ["register request", "examine", "decide", "reject", "close"];
const COUNTS = [1842, 1290, 1104, 612, 1731];

const meta = {
  title: "Viewers/Themed Plot",
  component: ThemedPlot,
  parameters: {
    frame: { mode: "canvas", height: 360 },
    docs: { story: { inline: true, iframeHeight: 400 } },
  },
} satisfies Meta<typeof ThemedPlot>;
export default meta;

export const Bar: StoryObj = {
  name: "Bar chart (theme-aware)",
  render: () => (
    <ThemedPlot
      data={[
        {
          type: "bar",
          x: ACTIVITIES,
          y: COUNTS,
          marker: { color: "#6366f1" },
        },
      ]}
      layout={{
        autosize: true,
        margin: { t: 8, b: 60, l: 56, r: 8 },
        xaxis: { automargin: true, fixedrange: true, title: { text: "Activity" } },
        yaxis: { automargin: true, fixedrange: true, title: { text: "Number of Events" } },
      }}
      config={{ displaylogo: false, displayModeBar: false, responsive: true }}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  ),
};

export const Line: StoryObj = {
  name: "Line chart (theme-aware)",
  render: () => (
    <ThemedPlot
      data={[
        {
          type: "scatter",
          mode: "lines+markers",
          x: ["Mon", "Tue", "Wed", "Thu", "Fri"],
          y: [42, 51, 47, 63, 58],
          line: { color: "#0ea5e9" },
        },
      ]}
      layout={{
        autosize: true,
        margin: { t: 8, b: 40, l: 48, r: 8 },
        xaxis: { automargin: true, fixedrange: true, title: { text: "Day" } },
        yaxis: { automargin: true, fixedrange: true, title: { text: "Cases started" } },
      }}
      config={{ displaylogo: false, displayModeBar: false, responsive: true }}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  ),
};
