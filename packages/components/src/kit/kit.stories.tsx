import type { Meta, StoryObj } from "@storybook/react-vite";
import "@r4pm/components/styles.css";
import {
  Bar,
  fmtInt,
  fmtPct,
  formatDuration,
  LegendItem,
  Metric,
  MetricRow,
  type Option,
  OptionMenu,
  RampLegend,
  Section,
  Segmented,
  Toolbar,
  ToolbarDivider,
  TypeChip,
} from "@r4pm/components";
import { Button, Text } from "@r4pm/components/ui";
import { useState } from "react";
import { PiChartBar, PiClock, PiHash, PiListBullets, PiSquaresFour } from "react-icons/pi";

const meta = {
  title: "Inputs & Primitives/View Kit",
  component: Toolbar,
  parameters: { frame: { mode: "pad" }, docs: { story: { inline: true } } },
} satisfies Meta<typeof Toolbar>;
export default meta;

type Measure = "count" | "duration";
type ColorBy = "type" | "activity" | "none";
type Layout = "grid" | "list" | "chart";

const MEASURES: Option<Measure>[] = [
  { value: "count", label: "Count", icon: <PiHash />, description: "How many events each activity has." },
  {
    value: "duration",
    label: "Duration",
    icon: <PiClock />,
    description: "Median time until the next event.",
  },
];

const COLOR_BY: Option<ColorBy>[] = [
  { value: "type", label: "Object type", description: "Each object type's color, as in the other views." },
  { value: "activity", label: "Activity", description: "Each activity's color." },
  { value: "none", label: "None", description: "One neutral color for everything." },
];

const LAYOUTS: Option<Layout>[] = [
  { value: "grid", label: "Grid", icon: <PiSquaresFour /> },
  { value: "list", label: "List", icon: <PiListBullets /> },
  { value: "chart", label: "Chart", icon: <PiChartBar /> },
];

const TYPES = [
  { type: "orders", color: "#3b82f6", objects: 2_000 },
  { type: "items", color: "#f59e0b", objects: 8_159 },
  { type: "packages", color: "#10b981", objects: 1_325 },
  { type: "customers", color: "#8b5cf6", objects: 17 },
  { type: "products", color: "#ec4899", objects: 20 },
  { type: "employees", color: "#64748b", objects: 17 },
];

const ACTIVITIES = [
  { activity: "pick item", events: 7_659, medianMs: 2.1 * 86_400_000 },
  { activity: "place order", events: 2_000, medianMs: 3.4 * 3_600_000 },
  { activity: "confirm order", events: 2_000, medianMs: 1.2 * 86_400_000 },
  { activity: "pay order", events: 1_557, medianMs: 4.6 * 86_400_000 },
  { activity: "create package", events: 1_128, medianMs: 9 * 3_600_000 },
  { activity: "send package", events: 1_128, medianMs: 2.5 * 86_400_000 },
  { activity: "package delivered", events: 1_120, medianMs: 0 },
  { activity: "item out of stock", events: 1_090, medianMs: 3.1 * 86_400_000 },
  { activity: "reorder item", events: 1_090, medianMs: 1.7 * 86_400_000 },
  { activity: "payment reminder", events: 1_066, medianMs: 6 * 86_400_000 },
];

/** A view's toolbar, summary metrics and a titled section of bars, wired so every control works. */
export const Default: StoryObj = {
  name: "View Kit",
  render: function AnalysisView() {
    const [measure, setMeasure] = useState<Measure>("count");
    const [colorBy, setColorBy] = useState<ColorBy>("type");
    const [shown, setShown] = useState<string | null>(null);
    const rows = [...ACTIVITIES].sort((a, b) =>
      measure === "count" ? b.events - a.events : b.medianMs - a.medianMs,
    );
    const max = Math.max(...rows.map((r) => (measure === "count" ? r.events : r.medianMs)));
    return (
      <div style={{ width: 760, border: "1px solid var(--gray-a5)", borderRadius: 8, overflow: "hidden" }}>
        <Toolbar
          end={TYPES.slice(0, 3).map((t) => <LegendItem key={t.type} color={t.color} label={t.type} />)}
        >
          <Segmented aria-label="Measure" value={measure} options={MEASURES} onChange={setMeasure} />
          <ToolbarDivider />
          <OptionMenu label="Color" value={colorBy} options={COLOR_BY} onChange={setColorBy} />
        </Toolbar>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
          <MetricRow>
            <Metric label="Events" value={fmtInt(21_008)} hint="10 activities" />
            <Metric label="Objects" value={fmtInt(11_538)} hint="6 object types" />
            <Metric label="Orders paid" value={fmtPct(0.7785)} tone="good" progress={0.7785} />
            <Metric label="Items out of stock" value={fmtPct(0.1336)} tone="warn" progress={0.1336} />
            <Metric label="Undelivered packages" value={fmtInt(5)} tone="bad" hint="sent, never delivered" />
          </MetricRow>
          <Section
            title="Activities"
            subtitle={measure === "count" ? "Events per activity" : "Median time until the next event"}
            actions={
              <Button size="1" variant="soft" onClick={() => setShown(null)}>
                Clear selection
              </Button>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map((r) => {
                const v = measure === "count" ? r.events : r.medianMs;
                return (
                  <button
                    key={r.activity}
                    type="button"
                    onClick={() => setShown(r.activity)}
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      opacity: shown && shown !== r.activity ? 0.45 : 1,
                    }}
                  >
                    <Bar
                      value={v / max}
                      label={r.activity}
                      hint={measure === "count" ? fmtInt(v) : formatDuration(v)}
                      color={colorBy === "none" ? "var(--gray-9)" : undefined}
                      height={6}
                    />
                  </button>
                );
              })}
            </div>
          </Section>
          <Section title="Object types">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TYPES.map((t) => (
                <TypeChip
                  key={t.type}
                  color={colorBy === "none" ? "var(--gray-9)" : t.color}
                  suffix={fmtInt(t.objects)}
                  onClick={() => setShown(t.type)}
                >
                  {t.type}
                </TypeChip>
              ))}
            </div>
          </Section>
          <Text size="1" color="gray">
            Selected: {shown ?? "nothing"}
          </Text>
        </div>
      </div>
    );
  },
};

/** Metrics in each tone, with and without a progress bar and a hint. */
export const Metrics: StoryObj = {
  name: "Metrics",
  render: () => (
    <div style={{ width: 720 }}>
      <MetricRow>
        <Metric label="Cases" value={fmtInt(150_370)} hint="road traffic fines" />
        <Metric label="Log fitness" value={fmtPct(0.982)} tone="good" progress={0.982} />
        <Metric label="Precision" value={fmtPct(0.764)} tone="warn" progress={0.764} />
        <Metric label="Sent for credit collection" value={fmtPct(0.376)} tone="bad" progress={0.376} />
        <Metric
          label="Median throughput time"
          value={formatDuration(124 * 86_400_000)}
          hint="first to last event"
        />
      </MetricRow>
    </div>
  ),
};

/** Segmented controls: default, compact, icon-only (the label becomes the tooltip) and stretched. */
export const SegmentedVariants: StoryObj = {
  name: "Segmented",
  render: function Variants() {
    const [measure, setMeasure] = useState<Measure>("count");
    const [layout, setLayout] = useState<Layout>("grid");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, width: 360 }}>
        <Segmented aria-label="Measure" value={measure} options={MEASURES} onChange={setMeasure} />
        <Segmented aria-label="Measure" value={measure} options={MEASURES} onChange={setMeasure} compact />
        <Segmented aria-label="Layout" value={layout} options={LAYOUTS} onChange={setLayout} iconOnly />
        <Segmented aria-label="Layout" value={layout} options={LAYOUTS} onChange={setLayout} fill />
        <Segmented aria-label="Layout" value={layout} options={LAYOUTS} onChange={setLayout} disabled />
      </div>
    );
  },
};

/** Legend entries in each swatch shape, and a ramp legend for a sequential color scale. */
export const Legends: StoryObj = {
  name: "Legends",
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <LegendItem color="#3b82f6" label="orders" />
        <LegendItem color="#f59e0b" label="items" shape="square" />
        <LegendItem color="var(--orange-9)" label="More often in B" shape="line" />
        <LegendItem
          color="var(--gray-9)"
          label="Silent transition"
          shape="line"
          dashed
          title="Steps the model takes without an event in the log"
        />
      </div>
      <RampLegend low="Fast" high="Slow" />
      <RampLegend low="0 cases" high="56,482 cases" steps={[0.1, 0.3, 0.5, 0.7, 0.9]} />
    </div>
  ),
};

/** Type chips: plain, with a count, with an object id in the code font, and clickable. */
export const TypeChips: StoryObj = {
  name: "Type chips",
  render: function Chips() {
    const [clicked, setClicked] = useState<string | null>(null);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <TypeChip color="#3b82f6">orders</TypeChip>
          <TypeChip color="#f59e0b" suffix="8,159">
            items
          </TypeChip>
          <TypeChip color="#10b981" mono>
            p-660123
          </TypeChip>
          <TypeChip color="#8b5cf6" onClick={() => setClicked("customers")} title="Show the customers">
            customers
          </TypeChip>
          <TypeChip
            color="#64748b"
            suffix="assigned to 3 orders"
            mono
            onClick={() => setClicked("Lena Brandt")}
          >
            Lena Brandt
          </TypeChip>
        </div>
        <Text size="1" color="gray">
          Clicked: {clicked ?? "nothing"}
        </Text>
      </div>
    );
  },
};
