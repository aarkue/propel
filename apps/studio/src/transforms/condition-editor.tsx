import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Combobox,
  DropdownMenu,
  Flex,
  IconButton,
  SegmentedControl,
  Select,
  Text,
  TextField,
} from "@r4pm/components/ui";
import { FrequencyPicker } from "@r4pm/components";
import { LuChevronDown, LuChevronRight, LuPlus, LuX } from "react-icons/lu";
import type {
  AttributeKind,
  AttributeLevel,
  AttributeScope,
  AttributeValues,
  BackendContext,
  Condition,
  EventLogHandle,
  EventTimeHistogram,
  MatchQuantifier,
  OcelAttributeLevel,
  SlimLinkedOCELHandle,
  TimeframeMode,
} from "@r4pm/client";
import {
  buildActivitySet,
  buildCategoricalCondition,
  buildGroup,
  buildNumericCondition,
  type Combinator,
  defaultAttributeLeaf,
  defaultDuration,
  defaultEntityType,
  defaultEventMatch,
  defaultObjectMatch,
  defaultGroup,
  defaultTimeframeCondition,
  DURATION_UNITS,
  fmtDurMs,
  localInputToRfc,
  MATCH_QUANTIFIERS,
  parseCategoricalValues,
  parseNumericBounds,
  quantifierLabel,
  readActivitySet,
  readAttrDist,
  readGroup,
  rfcToLocalInput,
  scopeToKey,
  TIMEFRAME_MODES,
  timeframeModeLabel,
} from "./condition";

// Lazy so Plotly stays out of the initial load graph (the transform editors are eagerly
// globbed by the transform panel and would otherwise drag Plotly in at startup).
const ThemedPlot = lazy(() => import("@r4pm/components/charts").then((m) => ({ default: m.ThemedPlot })));

const EVENT_SUBSCOPE: AttributeScope = { type: "Event", activity: null };
const OBJECT_SUBSCOPE: AttributeScope = { type: "Object", object_type: null };

// Nesting deeper than this stops offering sub-groups / related-entity matches so a
// narrow panel never becomes an unreadable staircase.
const MAX_DEPTH = 6;

// Threaded via context so the recursive tree does not prop-drill; without a provider, leaves fall back to plain atomic rows.

export interface CondEnv {
  objectType: "EventLog" | "OCEL";
  activities: string[];
  objectTypes: string[];
  activityCounts?: Record<string, number>;
  objectTypeCounts?: Record<string, number>;
  /** Attribute names visible at a given scope, from the dataset's catalog. */
  attrNamesForScope: (scope: AttributeScope) => string[];
  backend: BackendContext;
  datasetName: string;
}

const CondEnvContext = createContext<CondEnv | null>(null);

export function ConditionEnvProvider({ value, children }: { value: CondEnv; children: ReactNode }) {
  return <CondEnvContext.Provider value={value}>{children}</CondEnvContext.Provider>;
}

const useCondEnv = () => useContext(CondEnvContext);

type AttrSummaryData = {
  name?: string;
  kind: AttributeKind;
  total: number;
  missing: number;
  top_values: [string, number][];
  hist_bin_edges: number[];
  hist_counts: number[];
  numeric_stats: { min: number; max: number; mean: number; median: number; stddev: number } | null;
};

const objectLevelUnavailable = (env: CondEnv | null, scope: AttributeScope | undefined) =>
  scope?.type === "Object" && env?.objectType === "OCEL" && !scope.object_type;

function levelForScope(env: CondEnv, scope: AttributeScope): AttributeLevel | OcelAttributeLevel {
  if (env.objectType === "EventLog") return scope.type === "Event" ? "Event" : "Case";
  return scope.type === "Event"
    ? "Event"
    : { Object: { object_type: scope.type === "Object" ? (scope.object_type ?? "") : "" } };
}

function useAttrSummary(env: CondEnv | null, scope: AttributeScope | undefined, key: string) {
  const enabled =
    !!env &&
    !!scope &&
    !!key &&
    !!env.datasetName &&
    scope.type !== "LogGlobal" &&
    !objectLevelUnavailable(env, scope);
  return useQuery<AttrSummaryData>({
    queryKey: [env?.objectType, env?.datasetName, "cond-attr-summary", scope ? scopeToKey(scope) : "?", key],
    enabled,
    queryFn: () => {
      const e = env as CondEnv;
      const s = scope as AttributeScope;
      const level = levelForScope(e, s);
      if (e.objectType === "EventLog") {
        return e.backend.callBinding("app_bindings::event_log::get_attribute_summary", {
          event_log: e.datasetName as EventLogHandle,
          attr_name: key,
          level: level as AttributeLevel,
        }) as Promise<AttrSummaryData>;
      }
      return e.backend.callBinding("app_bindings::ocel::get_ocel_attribute_summary", {
        ocel: e.datasetName as SlimLinkedOCELHandle,
        attr_name: key,
        level: level as OcelAttributeLevel,
      }) as Promise<AttrSummaryData>;
    },
  });
}

function useAttrValues(env: CondEnv | null, scope: AttributeScope | undefined, key: string, want: boolean) {
  const enabled =
    want &&
    !!env &&
    !!scope &&
    !!key &&
    !!env.datasetName &&
    scope.type !== "LogGlobal" &&
    !objectLevelUnavailable(env, scope);
  return useQuery<AttributeValues>({
    queryKey: [env?.objectType, env?.datasetName, "cond-attr-values", scope ? scopeToKey(scope) : "?", key],
    enabled,
    queryFn: () => {
      const e = env as CondEnv;
      const s = scope as AttributeScope;
      const level = levelForScope(e, s);
      if (e.objectType === "EventLog") {
        return e.backend.callBinding("app_bindings::event_log::get_attribute_values", {
          event_log: e.datasetName as EventLogHandle,
          attr_name: key,
          level: level as AttributeLevel,
        }) as Promise<AttributeValues>;
      }
      return e.backend.callBinding("app_bindings::ocel::get_ocel_attribute_values", {
        ocel: e.datasetName as SlimLinkedOCELHandle,
        attr_name: key,
        level: level as OcelAttributeLevel,
      }) as Promise<AttributeValues>;
    },
  });
}

const COMBI: Record<Combinator, { rail: string }> = {
  all: { rail: "var(--indigo-8)" },
  any: { rail: "var(--amber-8)" },
  none: { rail: "var(--red-8)" },
};

type AttrOp = "is" | "contains" | "gt" | "lt" | "exists";
const ATTR_OPS: { value: AttrOp; label: string }[] = [
  { value: "is", label: "is" },
  { value: "contains", label: "contains" },
  { value: "gt", label: "greater than" },
  { value: "lt", label: "less than" },
  { value: "exists", label: "exists" },
];

function opOf(c: Condition): AttrOp {
  switch (c.type) {
    case "AttributeGreaterThan":
      return "gt";
    case "AttributeLessThan":
      return "lt";
    case "AttributeContains":
      return "contains";
    case "AttributeExists":
      return "exists";
    default:
      return "is";
  }
}
function keyOf(c: Condition): string {
  return "key" in c ? c.key : "";
}
function valOf(c: Condition): string {
  switch (c.type) {
    case "AttributeEquals":
      return c.value;
    case "AttributeGreaterThan":
    case "AttributeLessThan":
      return String(c.value);
    case "AttributeContains":
      return c.substring;
    default:
      return "";
  }
}
function makeAttr(key: string, op: AttrOp, value: string): Condition {
  switch (op) {
    case "gt":
      return { type: "AttributeGreaterThan", key, value: Number.parseFloat(value) || 0 };
    case "lt":
      return { type: "AttributeLessThan", key, value: Number.parseFloat(value) || 0 };
    case "contains":
      return { type: "AttributeContains", key, substring: value };
    case "exists":
      return { type: "AttributeExists", key };
    default:
      return { type: "AttributeEquals", key, value };
  }
}

export function conditionToText(c: Condition): string {
  switch (c.type) {
    case "AttributeEquals":
      return `${c.key || "?"} is "${c.value}"`;
    case "AttributeGreaterThan":
      return `${c.key || "?"} > ${c.value}`;
    case "AttributeLessThan":
      return `${c.key || "?"} < ${c.value}`;
    case "AttributeContains":
      return `${c.key || "?"} contains "${c.substring}"`;
    case "AttributeExists":
      return c.key ? `has ${c.key}` : "attribute (not set)";
    case "EntityType":
      return c.value ? `type is "${c.value}"` : "type (not set)";
    case "Duration": {
      const parts: string[] = [];
      if (c.min_ms != null) parts.push(`at least ${fmtDurMs(c.min_ms)}`);
      if (c.max_ms != null) parts.push(`at most ${fmtDurMs(c.max_ms)}`);
      return `lasts ${parts.join(" and ") || "any duration"}`;
    }
    case "Timeframe":
      return `${timeframeModeLabel(c.mode)} [${rfcToLocalInput(c.start)} .. ${rfcToLocalInput(c.end)}]`;
    case "EventMatch":
      return `${quantifierLabel(c.quantifier)} related event (${conditionToText(c.condition)})`;
    case "ObjectMatch":
      return `${quantifierLabel(c.quantifier)} related object (${conditionToText(c.condition)})`;
    case "And":
      return c.conditions.length ? c.conditions.map(conditionToText).join(" and ") : "anything";
    case "Or": {
      const acts = readActivitySet(c);
      if (acts)
        return `type is any of ${
          acts
            .filter(Boolean)
            .map((a) => `"${a}"`)
            .join(", ") || "(none)"
        }`;
      const dist = readAttrDist(c);
      if (dist && dist.kind === "categorical") {
        const vals = c.conditions.map((x) => (x as Extract<Condition, { type: "AttributeEquals" }>).value);
        return `${dist.key} is any of ${vals.map((v) => `"${v}"`).join(", ")}`;
      }
      return `(${c.conditions.map(conditionToText).join(" or ")})`;
    }
    case "Not": {
      const inner = c.condition;
      if (inner.type === "Or") return `none of (${inner.conditions.map(conditionToText).join(", ")})`;
      return `not (${conditionToText(inner)})`;
    }
  }
}

/** "Reads as" plain-language line. */
export function ConditionSummary({ condition }: { condition: Condition }) {
  return (
    <Flex
      direction="column"
      gap="1"
      style={{
        marginTop: 8,
        padding: "8px 10px",
        background: "var(--gray-2)",
        borderRadius: 8,
        border: "1px solid var(--gray-5)",
      }}
    >
      <Text size="1" color="gray">
        Reads as
      </Text>
      <Text size="2">{conditionToText(condition)}</Text>
    </Flex>
  );
}

const grow = (min: number): React.CSSProperties => ({ flex: `1 1 ${min}px`, minWidth: min });

/** Compact horizontal frame with a right-pinned remove button (atomic rows). */
function LeafFrame({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
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
function LeafCard({
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
const CATEGORICAL_CHART_MAX = 10;

function CategoricalValuePicker({
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

function FilterDistributionPanel({
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

function AttributeDistLeaf({
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

function ActivitySetLeaf({
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

function AttributeLeafRow({
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

function EntityTypeLeafRow({
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

function DurationLeafRow({
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

const TF_INPUT: React.CSSProperties = {
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
function TimeframeHistogram({
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
function timestampExtent(data: EventTimeHistogram): [number, number] | null {
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
        return backend.callBinding("app_bindings::event_log::get_event_log_timestamps", {
          event_log: datasetName as EventLogHandle,
          num_bins: 50,
        }) as Promise<EventTimeHistogram>;
      }
      return backend.callBinding("app_bindings::ocel::get_ocel_event_timestamps", {
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

function TimeframeLeafRow({
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

function MatchBlock({
  condition,
  onChange,
  onRemove,
  depth,
}: {
  condition: Extract<Condition, { type: "EventMatch" | "ObjectMatch" }>;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
  depth: number;
}) {
  const isEvent = condition.type === "EventMatch";
  const subScope = isEvent ? EVENT_SUBSCOPE : OBJECT_SUBSCOPE;
  const noun = isEvent ? "related event" : "related object";
  const quantOptions = isEvent
    ? MATCH_QUANTIFIERS
    : MATCH_QUANTIFIERS.filter((q) => q.value === "Any" || q.value === "All");
  return (
    <div
      style={{
        borderLeft: "3px solid var(--cyan-8)",
        background: "var(--cyan-2)",
        borderRadius: "0 8px 8px 0",
        padding: "8px 8px 8px 10px",
      }}
    >
      <Flex align="center" justify="between" gap="2" wrap="wrap">
        <Flex align="center" gap="2" wrap="wrap">
          <Text size="1" weight="medium" style={{ color: "var(--cyan-11)" }}>
            For
          </Text>
          <Select.Root
            value={condition.quantifier}
            onValueChange={(v) => onChange({ ...condition, quantifier: v as MatchQuantifier })}
          >
            <Select.Trigger variant="soft" color="cyan" aria-label="Quantifier" />
            <Select.Content>
              {quantOptions.map((q) => (
                <Select.Item key={q.value} value={q.value}>
                  {q.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Text size="1" weight="medium" style={{ color: "var(--cyan-11)" }}>
            {noun}:
          </Text>
        </Flex>
        {onRemove && (
          <IconButton size="1" variant="ghost" color="gray" onClick={onRemove} aria-label="Remove match">
            <LuX size={13} />
          </IconButton>
        )}
      </Flex>
      <div style={{ marginTop: 6 }}>
        <ConditionEditor
          condition={condition.condition}
          scope={subScope}
          depth={depth + 1}
          asGroupRoot
          onChange={(c) => onChange({ ...condition, condition: c })}
        />
      </div>
    </div>
  );
}

function LeafRow({
  condition,
  onChange,
  onRemove,
  scope,
  depth,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
  scope?: AttributeScope;
  depth: number;
}) {
  if (condition.type === "EventMatch" || condition.type === "ObjectMatch") {
    return <MatchBlock condition={condition} onChange={onChange} onRemove={onRemove} depth={depth} />;
  }
  if (condition.type === "Timeframe") {
    return <TimeframeLeafRow condition={condition} onChange={onChange} onRemove={onRemove} scope={scope} />;
  }
  if (condition.type === "EntityType") {
    return <EntityTypeLeafRow condition={condition} onChange={onChange} onRemove={onRemove} />;
  }
  if (condition.type === "Duration") {
    return <DurationLeafRow condition={condition} onChange={onChange} onRemove={onRemove} />;
  }
  return <AttributeLeafRow condition={condition} onChange={onChange} onRemove={onRemove} />;
}

function AddPredicateMenu({
  scope,
  depth,
  onAdd,
}: {
  scope?: AttributeScope;
  depth: number;
  onAdd: (c: Condition) => void;
}) {
  const env = useCondEnv();
  const objectType = env?.objectType;
  const eventScope = scope?.type === "Event";
  const objectScope = scope?.type === "Object";
  const unknownScope = scope == null;

  const canDuration = objectScope || unknownScope;
  const canEventMatch = objectScope && depth < MAX_DEPTH;
  const showObjectMatch = objectType === "OCEL";
  const canObjectMatch = showObjectMatch && depth < MAX_DEPTH;
  const canGroup = depth < MAX_DEPTH;
  const typeLabel = eventScope ? "Event type / activity" : objectScope ? "Object type" : "Type";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button size="2" variant="soft" style={{ width: "fit-content" }}>
          <LuPlus size={13} /> Add predicate
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Label>Attributes</DropdownMenu.Label>
        <DropdownMenu.Item onSelect={() => onAdd(defaultAttributeLeaf())}>Attribute value</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => onAdd(defaultEntityType())}>{typeLabel}</DropdownMenu.Item>

        <DropdownMenu.Separator />
        <DropdownMenu.Label>Time</DropdownMenu.Label>
        <DropdownMenu.Item onSelect={() => onAdd(defaultTimeframeCondition())}>Time window</DropdownMenu.Item>
        <DropdownMenu.Item disabled={!canDuration} onSelect={() => onAdd(defaultDuration())}>
          <Flex direction="column" style={{ lineHeight: 1.3 }}>
            <Text size="2">Duration</Text>
            {!canDuration && (
              <Text size="1" color="gray">
                Set target to a case or object
              </Text>
            )}
          </Flex>
        </DropdownMenu.Item>

        {(objectScope || showObjectMatch) && <DropdownMenu.Separator />}
        {(objectScope || showObjectMatch) && <DropdownMenu.Label>Related entities</DropdownMenu.Label>}
        {(objectScope || !eventScope) && (
          <DropdownMenu.Item disabled={!canEventMatch} onSelect={() => onAdd(defaultEventMatch())}>
            <Flex direction="column" style={{ lineHeight: 1.3 }}>
              <Text size="2">Matching event...</Text>
              {!canEventMatch && (
                <Text size="1" color="gray">
                  {depth >= MAX_DEPTH ? "Nesting too deep" : "Set target to a case or object"}
                </Text>
              )}
            </Flex>
          </DropdownMenu.Item>
        )}
        {showObjectMatch && (
          <DropdownMenu.Item disabled={!canObjectMatch} onSelect={() => onAdd(defaultObjectMatch())}>
            <Flex direction="column" style={{ lineHeight: 1.3 }}>
              <Text size="2">Related object...</Text>
              {!canObjectMatch && (
                <Text size="1" color="gray">
                  Nesting too deep
                </Text>
              )}
            </Flex>
          </DropdownMenu.Item>
        )}

        <DropdownMenu.Separator />
        <DropdownMenu.Label>Group</DropdownMenu.Label>
        <DropdownMenu.Item disabled={!canGroup} onSelect={() => onAdd(defaultGroup("all"))}>
          All-of group
        </DropdownMenu.Item>
        <DropdownMenu.Item disabled={!canGroup} onSelect={() => onAdd(defaultGroup("any"))}>
          Any-of group
        </DropdownMenu.Item>
        <DropdownMenu.Item disabled={!canGroup} onSelect={() => onAdd(defaultGroup("none"))}>
          None-of group
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

function GroupCard({
  combinator,
  childList,
  onChangeGroup,
  scope,
  depth,
  isRoot,
  onRemove,
}: {
  combinator: Combinator;
  childList: Condition[];
  onChangeGroup: (combinator: Combinator, children: Condition[]) => void;
  scope?: AttributeScope;
  depth: number;
  isRoot: boolean;
  onRemove?: () => void;
}) {
  const theme = COMBI[combinator];
  const setCombinator = (c: Combinator) => onChangeGroup(c, childList);
  const addChild = (c: Condition) => onChangeGroup(combinator, [...childList, c]);
  const updateChild = (i: number, c: Condition) =>
    onChangeGroup(
      combinator,
      childList.map((x, j) => (j === i ? c : x)),
    );
  const removeChild = (i: number) =>
    onChangeGroup(
      combinator,
      childList.filter((_, j) => j !== i),
    );

  return (
    <div
      style={
        isRoot ? { minWidth: 0 } : { borderLeft: `3px solid ${theme.rail}`, paddingLeft: 10, minWidth: 0 }
      }
    >
      <Flex align="center" justify="between" gap="2" wrap="wrap">
        <Flex align="center" gap="2">
          <SegmentedControl.Root
            size="1"
            value={combinator}
            onValueChange={(v) => v && setCombinator(v as Combinator)}
          >
            <SegmentedControl.Item value="all">All</SegmentedControl.Item>
            <SegmentedControl.Item value="any">Any</SegmentedControl.Item>
            <SegmentedControl.Item value="none">None</SegmentedControl.Item>
          </SegmentedControl.Root>
          <Text size="1" color="gray">
            {combinator === "none" ? "match none of" : "of the following"}
          </Text>
        </Flex>
        {onRemove && !isRoot && (
          <IconButton size="1" variant="ghost" color="gray" onClick={onRemove} aria-label="Remove group">
            <LuX size={13} />
          </IconButton>
        )}
      </Flex>

      <Flex direction="column" gap="2" style={{ marginTop: 8 }}>
        {childList.map((child, i) => (
          <ConditionEditor
            key={`${depth}-${i}-${child.type}`}
            condition={child}
            scope={scope}
            depth={depth + 1}
            onChange={(c) => updateChild(i, c)}
            onRemove={() => removeChild(i)}
          />
        ))}

        {childList.length === 0 && (
          <Flex align="center" gap="2" wrap="wrap">
            <Text size="1" color="gray">
              No predicates yet.
            </Text>
            <Button size="1" variant="soft" color="gray" onClick={() => addChild(defaultAttributeLeaf())}>
              Attribute
            </Button>
            <Button size="1" variant="soft" color="gray" onClick={() => addChild(defaultEntityType())}>
              Type
            </Button>
            <Button
              size="1"
              variant="soft"
              color="gray"
              onClick={() => addChild(defaultTimeframeCondition())}
            >
              Time
            </Button>
          </Flex>
        )}

        <AddPredicateMenu scope={scope} depth={depth} onAdd={addChild} />
      </Flex>
    </div>
  );
}

export function ConditionEditor({
  condition,
  onChange,
  onRemove,
  scope,
  depth = 0,
  asGroupRoot,
}: {
  condition: Condition;
  onChange: (c: Condition) => void;
  onRemove?: () => void;
  scope?: AttributeScope;
  depth?: number;
  /** Force a group shell even for a bare leaf (so predicates can be added). Defaults to depth 0. */
  asGroupRoot?: boolean;
}) {
  const env = useCondEnv();
  const rootish = asGroupRoot ?? depth === 0;

  // Composite-leaf detection needs dataset access for the rich pickers; without an env
  // (e.g. the relabel-rule editor) fall back to atomic rows and plain group handling.
  const actSet = env ? readActivitySet(condition) : null;
  const attrDist = env && actSet === null ? readAttrDist(condition) : null;
  const isRichLeaf = actSet !== null || attrDist !== null;
  const grp = isRichLeaf ? null : readGroup(condition);
  const isLeaf = grp === null;

  if (isLeaf) {
    if (rootish) {
      // Lazy group: a stored bare leaf gets group affordances, but stays a bare leaf on
      // write until a second predicate or a non-"all" combinator materializes the group.
      return (
        <GroupCard
          combinator="all"
          childList={[condition]}
          scope={scope}
          depth={depth}
          isRoot={depth === 0}
          onChangeGroup={(comb, kids) =>
            onChange(comb === "all" && kids.length === 1 ? kids[0] : buildGroup(comb, kids))
          }
        />
      );
    }
    if (actSet !== null) {
      return <ActivitySetLeaf condition={condition} onChange={onChange} onRemove={onRemove} scope={scope} />;
    }
    if (attrDist !== null) {
      return (
        <AttributeDistLeaf
          condition={condition}
          onChange={onChange}
          onRemove={onRemove}
          scope={scope}
          attrKey={attrDist.key}
        />
      );
    }
    return (
      <LeafRow condition={condition} onChange={onChange} onRemove={onRemove} scope={scope} depth={depth} />
    );
  }

  return (
    <GroupCard
      combinator={grp.combinator}
      childList={grp.children}
      scope={scope}
      depth={depth}
      isRoot={depth === 0}
      onRemove={onRemove}
      onChangeGroup={(comb, kids) => onChange(buildGroup(comb, kids))}
    />
  );
}
