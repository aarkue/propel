import { ATTR_OPS, type AttrOp, keyOf, makeAttr, opOf, valOf } from "./text";
import { type AttrSummaryData, useAttrSummary, useAttrValues, useCondEnv } from "./env";
import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Combobox, Flex, IconButton, Select, Text, TextField } from "@r4pm/components/ui";
import { FrequencyPicker } from "@r4pm/components";
import { LuX } from "react-icons/lu";
import type { AttributeScope, AttributeValues, Condition } from "@r4pm/client";
import {
  buildActivitySet,
  buildCategoricalCondition,
  buildNumericCondition,
  DURATION_UNITS,
  parseCategoricalValues,
  parseNumericBounds,
  readActivitySet,
} from "../condition";

// Lazy so Plotly stays out of the initial load graph (the transform editors are eagerly
// globbed by the transform panel and would otherwise drag Plotly in at startup).
const ThemedPlot = lazy(() => import("@r4pm/components/charts").then((m) => ({ default: m.ThemedPlot })));

export const grow = (min: number): React.CSSProperties => ({ flex: `1 1 ${min}px`, minWidth: min });

/** Compact horizontal frame with a right-pinned remove button (atomic rows). */
export function LeafFrame({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return (
    <Flex
      align="start"
      gap="2"
      style={{
        border: "1px solid var(--gray-6)",
        borderRadius: 8,
        padding: 8,
        background: "var(--color-background)",
        minWidth: 0,
      }}
    >
      <Flex align="center" wrap="wrap" gap="2" style={{ flex: "1 1 auto", minWidth: 0 }}>
        {children}
      </Flex>
      {onRemove && (
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          onClick={onRemove}
          title="Remove"
          aria-label="Remove"
        >
          <LuX size={13} />
        </IconButton>
      )}
    </Flex>
  );
}

/** Vertical frame with a header label + remove, for the taller rich pickers. */
export function LeafCard({
  header,
  onRemove,
  children,
}: {
  header: ReactNode;
  onRemove?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--gray-6)",
        borderRadius: 8,
        padding: 8,
        background: "var(--color-background)",
        minWidth: 0,
      }}
    >
      <Flex align="center" justify="between" gap="2">
        <div style={{ minWidth: 0, flex: 1 }}>{header}</div>
        {onRemove && (
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            onClick={onRemove}
            title="Remove"
            aria-label="Remove"
          >
            <LuX size={13} />
          </IconButton>
        )}
      </Flex>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

/** Distinct-value count at or below which the categorical filter uses the clickable bar
 *  chart; above it the chart squishes, so a searchable checklist is used instead. */
export const CATEGORICAL_CHART_MAX = 10;

export function CategoricalValuePicker({
  summary,
  attrName,
  selectedValues,
  onChange,
  fullValues,
  valuesLoading,
}: {
  summary: AttrSummaryData;
  attrName: string;
  selectedValues: Set<string>;
  onChange: (c: Condition) => void;
  fullValues: AttributeValues | null;
  valuesLoading: boolean;
}) {
  const items = fullValues?.values ?? summary.top_values;
  const counts: Record<string, number> = {};
  for (const [v, c] of items) counts[v] = c;
  const allValues = items.map(([v]) => v);
  const hasCounts = allValues.some((v) => (counts[v] ?? 0) > 0);
  const capped = fullValues != null && fullValues.total_distinct > fullValues.values.length;
  const usingFallback = fullValues == null;

  return (
    <div
      className="rounded-lg p-2"
      style={{ background: "var(--gray-2)", border: "1px solid var(--gray-5)" }}
    >
      <Text size="1" color="gray" as="div" mb="1">
        {summary.total - summary.missing} present, {summary.missing} missing - search and check values
      </Text>
      {valuesLoading && usingFallback ? (
        <Text size="1" color="gray">
          Loading values...
        </Text>
      ) : (
        <FrequencyPicker
          items={allValues.map((v) => ({ key: v, count: counts[v] ?? 0 }))}
          value={new Set(allValues.filter((v) => selectedValues.has(v)))}
          onChange={(s) => onChange(buildCategoricalCondition(attrName, [...s]))}
          scope="objectType"
          showBars={hasCounts}
          showCutoff={hasCounts}
          emptyText="No values"
        />
      )}
      {capped && (
        <Text size="1" color="gray" as="div" mt="1">
          Showing top {fullValues.values.length.toLocaleString()} of{" "}
          {fullValues.total_distinct.toLocaleString()} values.
        </Text>
      )}
    </div>
  );
}

export function FilterDistributionPanel({
  summary,
  attrName,
  condition,
  onChange,
  fullValues,
  valuesLoading,
}: {
  summary: AttrSummaryData;
  attrName: string;
  condition: Condition;
  onChange: (c: Condition) => void;
  fullValues: AttributeValues | null;
  valuesLoading: boolean;
}) {
  const bounds = parseNumericBounds(condition, attrName);
  const selectedValues = useMemo(
    () => new Set(parseCategoricalValues(condition, attrName)),
    [condition, attrName],
  );

  // Numeric: interactive histogram with a brushable range.
  if (summary.kind === "Numeric" && summary.hist_bin_edges.length > 1) {
    const edges = summary.hist_bin_edges;
    const binCenters = edges.slice(0, -1).map((e, i) => (e + edges[i + 1]) / 2);
    const binWidths = edges.slice(0, -1).map((e, i) => edges[i + 1] - e);
    const barColors = binCenters.map((_, i) => {
      const inRange =
        (bounds.min == null || edges[i + 1] > bounds.min) && (bounds.max == null || edges[i] < bounds.max);
      return inRange ? "#6e56cf" : "#888";
    });
    const shapes: Partial<Plotly.Shape>[] = [];
    for (const b of [bounds.min, bounds.max]) {
      if (b != null)
        shapes.push({
          type: "line",
          x0: b,
          x1: b,
          y0: 0,
          y1: 1,
          yref: "paper",
          line: { color: "#e5484d", width: 2, dash: "dot" },
        });
    }
    return (
      <div
        className="rounded-lg p-2"
        style={{ background: "var(--gray-2)", border: "1px solid var(--gray-5)" }}
      >
        {summary.numeric_stats && (
          <div className="flex flex-wrap gap-1 mb-1">
            <Badge size="1" color="blue">
              min {summary.numeric_stats.min.toLocaleString()}
            </Badge>
            <Badge size="1" color="blue">
              max {summary.numeric_stats.max.toLocaleString()}
            </Badge>
            <Badge size="1" color="iris">
              mean {summary.numeric_stats.mean.toFixed(2)}
            </Badge>
            <Badge size="1" color="violet">
              sd {summary.numeric_stats.stddev.toFixed(2)}
            </Badge>
          </div>
        )}
        <Text size="1" color="gray" as="div" mb="1">
          Drag on the chart to set a range, or type min / max below.
        </Text>
        <div style={{ height: 150, position: "relative", overflow: "hidden" }}>
          <Suspense fallback={<div style={{ height: "100%" }} />}>
            <ThemedPlot
              data={[
                {
                  type: "bar",
                  x: binCenters,
                  y: summary.hist_counts,
                  width: binWidths,
                  marker: { color: barColors },
                  hovertemplate: "%{x:.4g}: %{y}<extra></extra>",
                },
              ]}
              layout={{
                margin: { t: 8, b: 30, l: 40, r: 8 },
                bargap: 0.02,
                xaxis: { fixedrange: false, rangeslider: undefined },
                yaxis: { fixedrange: true },
                shapes,
                dragmode: "zoom",
              }}
              config={{ displaylogo: false, displayModeBar: false, responsive: true }}
              onRelayout={(e: Record<string, unknown>) => {
                const x0 = e["xaxis.range[0]"] as number | undefined;
                const x1 = e["xaxis.range[1]"] as number | undefined;
                if (x0 !== undefined && x1 !== undefined) {
                  const round4 = (v: number) => Number(v.toPrecision(4));
                  onChange(buildNumericCondition(attrName, round4(x0), round4(x1)));
                }
                if (e["xaxis.autorange"]) onChange({ type: "And", conditions: [] });
              }}
            />
          </Suspense>
        </div>
        <Flex gap="2" align="end" mt="2" wrap="wrap">
          <div style={grow(80)}>
            <Text size="1" color="gray" as="div">
              Min
            </Text>
            <TextField.Root
              size="1"
              type="number"
              placeholder="any"
              value={bounds.min != null ? String(bounds.min) : ""}
              onChange={(e) => {
                const v = e.currentTarget.value;
                onChange(buildNumericCondition(attrName, v === "" ? null : parseFloat(v), bounds.max));
              }}
            />
          </div>
          <div style={grow(80)}>
            <Text size="1" color="gray" as="div">
              Max
            </Text>
            <TextField.Root
              size="1"
              type="number"
              placeholder="any"
              value={bounds.max != null ? String(bounds.max) : ""}
              onChange={(e) => {
                const v = e.currentTarget.value;
                onChange(buildNumericCondition(attrName, bounds.min, v === "" ? null : parseFloat(v)));
              }}
            />
          </div>
          {(bounds.min != null || bounds.max != null) && (
            <Button
              size="1"
              variant="soft"
              color="gray"
              onClick={() => onChange({ type: "And", conditions: [] })}
            >
              Reset
            </Button>
          )}
        </Flex>
      </div>
    );
  }

  // Categorical: clickable bar chart (or a searchable checklist for many values).
  if (
    (summary.kind === "Categorical" || summary.kind === "Other" || summary.kind === "Date") &&
    summary.top_values.length > 0
  ) {
    if (summary.top_values.length > CATEGORICAL_CHART_MAX) {
      return (
        <CategoricalValuePicker
          summary={summary}
          attrName={attrName}
          selectedValues={selectedValues}
          onChange={onChange}
          fullValues={fullValues}
          valuesLoading={valuesLoading}
        />
      );
    }
    const labels = summary.top_values.map(([v]) => v);
    const counts = summary.top_values.map(([, c]) => c);
    const barColors = labels.map((v) => (selectedValues.has(v) ? "#6e56cf" : "#888"));
    return (
      <div
        className="rounded-lg p-2"
        style={{ background: "var(--gray-2)", border: "1px solid var(--gray-5)" }}
      >
        <Text size="1" color="gray" as="div" mb="1">
          {selectedValues.size > 0 ? `${selectedValues.size} selected - ` : ""}click bars to pick values
        </Text>
        <div
          style={{
            height: Math.max(110, Math.min(280, labels.length * 22 + 50)),
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Suspense fallback={<div style={{ height: "100%" }} />}>
            <ThemedPlot
              data={[
                {
                  type: "bar",
                  y: labels,
                  x: counts,
                  orientation: "h",
                  marker: { color: barColors },
                  hovertemplate: "%{y}: %{x}<extra></extra>",
                },
              ]}
              layout={{
                margin: {
                  t: 8,
                  b: 30,
                  l: Math.min(160, Math.max(56, Math.max(...labels.map((l) => l.length)) * 6.5)),
                  r: 8,
                },
                xaxis: { fixedrange: true },
                yaxis: { autorange: "reversed", fixedrange: true, automargin: true },
                bargap: 0.08,
              }}
              config={{ displaylogo: false, displayModeBar: false, responsive: true }}
              onClick={(e: { points?: { pointIndex?: number }[] }) => {
                const idx = e.points?.[0]?.pointIndex;
                if (idx == null || idx < 0 || idx >= labels.length) return;
                const clicked = labels[idx];
                const next = new Set(selectedValues);
                if (next.has(clicked)) next.delete(clicked);
                else next.add(clicked);
                onChange(buildCategoricalCondition(attrName, [...next]));
              }}
            />
          </Suspense>
        </div>
        <Flex gap="2" mt="1" wrap="wrap">
          <Button
            size="1"
            variant="soft"
            color="gray"
            onClick={() => onChange(buildCategoricalCondition(attrName, labels))}
          >
            Select all
          </Button>
          <Button
            size="1"
            variant="soft"
            color="gray"
            onClick={() => onChange({ type: "And", conditions: [] })}
          >
            Clear
          </Button>
        </Flex>
      </div>
    );
  }

  return (
    <Text size="1" color="gray">
      No distribution available for this attribute.
    </Text>
  );
}

export function AttributeDistLeaf({
  condition,
  onChange,
  onRemove,
  scope,
  attrKey,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
  scope?: AttributeScope;
  attrKey: string;
}) {
  const env = useCondEnv();
  const names = env && scope ? env.attrNamesForScope(scope) : [];
  const summaryQ = useAttrSummary(env, scope, attrKey);
  const summary = summaryQ.data ?? null;
  const needFull =
    !!summary &&
    (summary.kind === "Categorical" || summary.kind === "Other" || summary.kind === "Date") &&
    summary.top_values.length > CATEGORICAL_CHART_MAX;
  const valuesQ = useAttrValues(env, scope, attrKey, needFull);

  // Clearing a selection collapses to a neutral And[]; rewrite it as "has key" so the
  // leaf keeps its identity (and its key) instead of orphaning into an empty group.
  const writeSub = (c: Condition) => {
    if (c.type === "And" && c.conditions.length === 0) onChange({ type: "AttributeExists", key: attrKey });
    else onChange(c);
  };

  return (
    <LeafCard
      onRemove={onRemove}
      header={
        <Flex align="center" gap="2" wrap="wrap">
          <Text size="1" color="gray" style={{ flexShrink: 0 }}>
            attribute
          </Text>
          <div style={grow(150)}>
            <Combobox
              size="2"
              value={attrKey}
              options={names}
              allowCreate
              placeholder="pick attribute"
              searchPlaceholder="Find attribute"
              aria-label="Attribute"
              style={{ width: "100%" }}
              onValueChange={(v) => {
                if (v !== attrKey) onChange({ type: "AttributeExists", key: v });
              }}
            />
          </div>
        </Flex>
      }
    >
      {!attrKey ? (
        <Text size="1" color="gray">
          Pick an attribute to filter by its distribution.
        </Text>
      ) : summaryQ.isLoading ? (
        <Text size="1" color="gray">
          Loading distribution...
        </Text>
      ) : summary ? (
        <FilterDistributionPanel
          summary={summary}
          attrName={attrKey}
          condition={condition}
          onChange={writeSub}
          fullValues={valuesQ.data ?? null}
          valuesLoading={valuesQ.isLoading}
        />
      ) : (
        <Text size="1" color="gray">
          No distribution available for this attribute.
        </Text>
      )}
    </LeafCard>
  );
}

export function ActivitySetLeaf({
  condition,
  onChange,
  onRemove,
  scope,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
  scope?: AttributeScope;
}) {
  const env = useCondEnv();
  const eventScope = scope?.type === "Event";
  const items = eventScope ? (env?.activities ?? []) : (env?.objectTypes ?? []);
  const counts = eventScope ? env?.activityCounts : env?.objectTypeCounts;
  const selected = new Set((readActivitySet(condition) ?? []).filter((v) => v !== ""));
  const hasCounts = !!counts && items.some((k) => (counts[k] ?? 0) > 0);
  const label = eventScope ? "event type (activity) is any of" : "object type is any of";

  return (
    <LeafCard
      onRemove={onRemove}
      header={
        <Text size="1" color="gray">
          {label}
        </Text>
      }
    >
      {items.length > 0 ? (
        <FrequencyPicker
          items={items.map((k) => ({ key: k, count: counts?.[k] ?? 0 }))}
          value={selected}
          onChange={(s) => onChange(buildActivitySet([...s]))}
          scope={eventScope ? "activity" : "objectType"}
          showBars={hasCounts}
          showCutoff={hasCounts}
          emptyText={eventScope ? "No activities" : "No object types"}
        />
      ) : (
        <TextField.Root
          size="2"
          value={[...selected][0] ?? ""}
          placeholder={eventScope ? "activity" : "object type"}
          aria-label="Type"
          onChange={(e) => onChange(buildActivitySet(e.currentTarget.value ? [e.currentTarget.value] : []))}
        />
      )}
    </LeafCard>
  );
}

export function AttributeLeafRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
}) {
  const key = keyOf(condition);
  const op = opOf(condition);
  const value = valOf(condition);
  return (
    <LeafFrame onRemove={onRemove}>
      <div style={grow(120)}>
        <TextField.Root
          size="2"
          value={key}
          placeholder="attribute"
          aria-label="Attribute"
          onChange={(e) => onChange(makeAttr(e.currentTarget.value, op, value))}
        />
      </div>
      <Select.Root value={op} onValueChange={(v) => onChange(makeAttr(key, v as AttrOp, value))}>
        <Select.Trigger variant="soft" aria-label="Operator" />
        <Select.Content>
          {ATTR_OPS.map((o) => (
            <Select.Item key={o.value} value={o.value}>
              {o.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      {op !== "exists" && (
        <div style={grow(100)}>
          <TextField.Root
            size="2"
            type={op === "gt" || op === "lt" ? "number" : "text"}
            value={value}
            placeholder="value"
            aria-label="Value"
            onChange={(e) => onChange(makeAttr(key, op, e.currentTarget.value))}
          />
        </div>
      )}
    </LeafFrame>
  );
}

export function EntityTypeLeafRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: Extract<Condition, { type: "EntityType" }>;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
}) {
  return (
    <LeafFrame onRemove={onRemove}>
      <Text size="2" color="gray" style={{ flexShrink: 0 }}>
        type is
      </Text>
      <div style={grow(140)}>
        <TextField.Root
          size="2"
          value={condition.value}
          placeholder="activity / object type"
          aria-label="Type"
          onChange={(e) => onChange({ ...condition, value: e.currentTarget.value })}
        />
      </div>
    </LeafFrame>
  );
}

export function DurationLeafRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: Extract<Condition, { type: "Duration" }>;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
}) {
  const [unitMs, setUnitMs] = useState<number>(86_400_000);
  const toNum = (ms: number | null | undefined) => (ms == null ? "" : String(ms / unitMs));
  const fromNum = (s: string): number | null => {
    const n = Number.parseFloat(s);
    return s.trim() === "" || Number.isNaN(n) ? null : Math.round(n * unitMs);
  };
  return (
    <LeafFrame onRemove={onRemove}>
      <Text size="2" color="gray" style={{ flexShrink: 0 }}>
        lasts
      </Text>
      <Flex align="center" gap="1" style={grow(90)}>
        <Text size="1" color="gray">
          min
        </Text>
        <TextField.Root
          size="2"
          type="number"
          value={toNum(condition.min_ms)}
          placeholder="any"
          aria-label="Minimum duration"
          style={{ flex: 1, minWidth: 52 }}
          onChange={(e) => onChange({ ...condition, min_ms: fromNum(e.currentTarget.value) })}
        />
      </Flex>
      <Flex align="center" gap="1" style={grow(90)}>
        <Text size="1" color="gray">
          max
        </Text>
        <TextField.Root
          size="2"
          type="number"
          value={toNum(condition.max_ms)}
          placeholder="any"
          aria-label="Maximum duration"
          style={{ flex: 1, minWidth: 52 }}
          onChange={(e) => onChange({ ...condition, max_ms: fromNum(e.currentTarget.value) })}
        />
      </Flex>
      <Select.Root value={String(unitMs)} onValueChange={(v) => setUnitMs(Number(v))}>
        <Select.Trigger variant="soft" aria-label="Duration unit" />
        <Select.Content>
          {DURATION_UNITS.map((u) => (
            <Select.Item key={u.short} value={String(u.ms)}>
              {u.short}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </LeafFrame>
  );
}
