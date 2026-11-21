import { formatDuration } from "@r4pm/components";
import {
  LuFilter,
  LuTag,
  LuArrowRightLeft,
  LuSearch,
  LuBoxes,
  LuTags,
  LuHash,
  LuDice5,
  LuClock,
  LuTrash2,
  LuSlidersHorizontal,
} from "react-icons/lu";
import type { Transform } from "@r4pm/client";
import { defaultTimeframeCondition } from "./condition";

export type TransformWithID = {
  id: string;
  value: Transform;
  enabled: boolean;
};

export interface TransformBuilderValue {
  transforms: TransformWithID[];
  outName: string;
}

// Synthetic palette key: a "Timeframe Filter" step is stored as a `FilterAttributes`
// whose condition is a lone `Timeframe`, so it composes with attribute predicates.
export type PaletteType = Transform["type"] | "FilterTimeframe";

export const TRANSFORM_META: {
  type: PaletteType;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
  ocelOnly: boolean;
  xesOnly?: boolean;
}[] = [
  {
    type: "FilterActivities",
    label: "Filter Activities",
    description: "Keep or remove events by activity",
    icon: LuFilter,
    ocelOnly: false,
  },
  {
    type: "RelabelActivities",
    label: "Relabel Activities",
    description: "Rename activities or event types",
    icon: LuTag,
    ocelOnly: false,
  },
  {
    type: "FilterStartEnd",
    label: "Start / End Filter",
    description: "Filter by first or last activity",
    icon: LuArrowRightLeft,
    ocelOnly: false,
  },
  {
    type: "FilterTraceContains",
    label: "Contains Filter",
    description: "Require or forbid activities in traces or objects",
    icon: LuSearch,
    ocelOnly: false,
  },
  {
    type: "FilterVariants",
    label: "Filter Variants",
    description: "Keep or remove traces by exact activity sequence",
    icon: LuFilter,
    ocelOnly: false,
    xesOnly: true,
  },
  {
    type: "Sample",
    label: "Sample",
    description: "Random sample of traces or objects",
    icon: LuDice5,
    ocelOnly: false,
  },
  {
    type: "FilterObjectTypes",
    label: "Filter Object Types",
    description: "Keep or remove object types",
    icon: LuBoxes,
    ocelOnly: true,
  },
  {
    type: "RelabelObjectTypes",
    label: "Relabel Object Types",
    description: "Rename object types",
    icon: LuTags,
    ocelOnly: true,
  },
  {
    type: "FilterTimeRange",
    label: "Time Range Filter",
    description: "Keep or remove events by timestamp",
    icon: LuClock,
    ocelOnly: false,
  },
  {
    type: "FilterTimeframe",
    label: "Timeframe Filter",
    description:
      "Keep or remove events, cases, or objects by when they happened (within / starts / ends / ...)",
    icon: LuClock,
    ocelOnly: false,
  },
  {
    type: "RescaleTimeframe",
    label: "Rescale Time",
    description: "Rescale all timestamps to a new timeframe",
    icon: LuClock,
    ocelOnly: false,
  },
  {
    type: "FilterMinRelatedEvents",
    label: "Related Events",
    description: "Filter objects by number of related events",
    icon: LuHash,
    ocelOnly: true,
  },
  {
    type: "FilterMinRelatedObjects",
    label: "Related Objects",
    description: "Filter events by number of related objects",
    icon: LuHash,
    ocelOnly: true,
  },
  {
    type: "FilterAttributes",
    label: "Condition Filter",
    description: "Combine conditions on event type, time, attributes or duration with AND, OR and NOT",
    icon: LuSlidersHorizontal,
    ocelOnly: false,
  },
  {
    type: "RemoveAttributes",
    label: "Remove Attributes",
    description: "Remove attributes from events, cases, objects or the log metadata",
    icon: LuTrash2,
    ocelOnly: false,
  },
];

export const TRANSFORM_GROUPS = ["Filter", "Relabel", "Attributes", "Time", "Sample"] as const;
export function transformGroup(type: PaletteType): (typeof TRANSFORM_GROUPS)[number] {
  if (type === "RelabelActivities" || type === "RelabelObjectTypes") return "Relabel";
  if (type === "RemoveAttributes") return "Attributes";
  if (type === "FilterTimeRange" || type === "RescaleTimeframe" || type === "FilterTimeframe") return "Time";
  if (type === "Sample") return "Sample";
  return "Filter";
}

export function defaultYearRangeRfc(): { start: string; end: string } {
  const year = new Date().getFullYear();
  return {
    start: `${year}-01-01T00:00:00+00:00`,
    end: `${year}-12-31T23:59:59+00:00`,
  };
}

export function defaultTransformForType(type: PaletteType): Transform {
  switch (type) {
    case "FilterTimeframe":
      return {
        type: "FilterAttributes",
        scope: { type: "Event", activity: null },
        condition: defaultTimeframeCondition(),
        mode: "Keep",
      };
    case "FilterActivities":
      return { type: "FilterActivities", activities: [], mode: "Keep" };
    case "RelabelActivities":
      return { type: "RelabelActivities", rules: {} };
    case "FilterStartEnd":
      return { type: "FilterStartEnd", start_activities: null, end_activities: null };
    case "FilterTraceContains":
      return { type: "FilterTraceContains", activities: [], mode: "Required" };
    case "FilterVariants":
      return { type: "FilterVariants", variants: [], mode: "Keep" };
    case "FilterTimeRange": {
      const { start, end } = defaultYearRangeRfc();
      return { type: "FilterTimeRange", start, end, mode: "Keep" };
    }
    case "FilterObjectTypes":
      return { type: "FilterObjectTypes", object_types: [], mode: "Keep" };
    case "RelabelObjectTypes":
      return { type: "RelabelObjectTypes", rules: {} };
    case "FilterMinRelatedEvents":
      return { type: "FilterMinRelatedEvents", min_events: 1, max_events: null, of_type: null };
    case "FilterMinRelatedObjects":
      return { type: "FilterMinRelatedObjects", min_objects: 1, max_objects: null, of_type: null };
    case "RescaleTimeframe": {
      const { start, end } = defaultYearRangeRfc();
      return {
        type: "RescaleTimeframe",
        target_start: start,
        target_end: end,
        min_gap_ms: null,
        max_gap_ms: null,
        gap_object_type: null,
      };
    }
    case "Sample":
      return {
        type: "Sample",
        amount: { type: "Percent", value: 10 },
        seed: null,
        target: "TracesOrObjects",
      };
    case "FilterAttributes":
      return {
        type: "FilterAttributes",
        scope: { type: "Event", activity: null },
        condition: { type: "And", conditions: [] },
        mode: "Keep",
      };
    case "RemoveAttributes":
      return { type: "RemoveAttributes", scope: { type: "Event", activity: null }, keys: [] };
  }
}

let _idCounter = 0;
export function generateId(): string {
  return `t-${++_idCounter}-${Date.now()}`;
}

export function getTransformMeta(type: PaletteType) {
  return TRANSFORM_META.find((m) => m.type === type);
}

export function getTransformLabel(type: PaletteType): string {
  return getTransformMeta(type)?.label ?? type;
}

/** Map a stored transform to its palette identity, recognizing the synthetic
 * "Timeframe Filter" (a `FilterAttributes` carrying a lone `Timeframe` condition). */
export function stepPaletteType(t: Transform): PaletteType {
  if (t.type === "FilterAttributes" && t.condition.type === "Timeframe") return "FilterTimeframe";
  return t.type;
}

/** `<source> / <first step>: <its summary> (+N more)` for the output of `steps`. */
export function suggestOutName(steps: Transform[], sourceLabel?: string): string {
  const first = steps[0];
  const op = first
    ? `${getTransformLabel(stepPaletteType(first))}: ${summarizeTransform(first)}${steps.length > 1 ? ` (+${steps.length - 1} more)` : ""}`
    : "transformed";
  return sourceLabel ? `${sourceLabel} / ${op}` : op;
}

export function summarizeTransform(t: Transform): string {
  switch (t.type) {
    case "FilterActivities":
      return `${t.mode} ${t.activities.length} activit${t.activities.length === 1 ? "y" : "ies"}`;
    case "RelabelActivities":
      return `${Object.keys(t.rules).length} activit${Object.keys(t.rules).length === 1 ? "y" : "ies"} renamed`;
    case "FilterStartEnd": {
      const parts: string[] = [];
      if (t.start_activities) parts.push(`start: ${t.start_activities.length}`);
      if (t.end_activities) parts.push(`end: ${t.end_activities.length}`);
      return parts.length > 0 ? parts.join(", ") : "No constraints";
    }
    case "FilterTraceContains":
      return `${t.mode} ${t.activities.length} activit${t.activities.length === 1 ? "y" : "ies"}`;
    case "FilterVariants":
      return `${t.mode} ${t.variants.length} variant${t.variants.length === 1 ? "" : "s"}`;
    case "FilterTimeRange": {
      const s = t.start.split("T")[0];
      const e = t.end.split("T")[0];
      return `${t.mode} ${s} → ${e}`;
    }
    case "FilterObjectTypes":
      return `${t.mode} ${t.object_types.length} type${t.object_types.length === 1 ? "" : "s"}`;
    case "RelabelObjectTypes":
      return `${Object.keys(t.rules).length} type${Object.keys(t.rules).length === 1 ? "" : "s"} renamed`;
    case "FilterMinRelatedEvents": {
      const parts: string[] = [];
      if (t.min_events != null) parts.push(`≥ ${t.min_events}`);
      if (t.max_events != null) parts.push(`≤ ${t.max_events}`);
      return `${parts.join(", ") || "no constraint"} event${(t.min_events ?? 0) === 1 && t.max_events == null ? "" : "s"}${t.of_type ? ` (${t.of_type})` : ""}`;
    }
    case "FilterMinRelatedObjects": {
      const parts: string[] = [];
      if (t.min_objects != null) parts.push(`≥ ${t.min_objects}`);
      if (t.max_objects != null) parts.push(`≤ ${t.max_objects}`);
      return `${parts.join(", ") || "no constraint"} object${(t.min_objects ?? 0) === 1 && t.max_objects == null ? "" : "s"}${t.of_type ? ` (${t.of_type})` : ""}`;
    }
    case "RescaleTimeframe": {
      const start = t.target_start.split("T")[0];
      const end = t.target_end.split("T")[0];
      const parts = [`${start} → ${end}`];
      if (t.min_gap_ms != null || t.max_gap_ms != null) {
        const gap: string[] = [];
        if (t.min_gap_ms != null) gap.push(`≥ ${formatDuration(t.min_gap_ms)}`);
        if (t.max_gap_ms != null) gap.push(`≤ ${formatDuration(t.max_gap_ms)}`);
        parts.push(`gap: ${gap.join(", ")}`);
      }
      return parts.join("; ");
    }
    case "Sample": {
      const amt = t.amount.type === "Count" ? `${t.amount.value}` : `${t.amount.value}%`;
      const what = t.target === "Events" ? "events" : "traces/objects";
      return `${amt} ${what}${t.seed != null ? ` (seed: ${t.seed})` : ""}`;
    }
    case "FilterAttributes": {
      const scope =
        t.scope.type === "LogGlobal"
          ? "log"
          : t.scope.type === "Event"
            ? t.scope.activity
              ? `events: ${t.scope.activity}`
              : "events"
            : t.scope.object_type
              ? `objects: ${t.scope.object_type}`
              : "cases/objects";
      return `${t.mode} ${scope}`;
    }
    case "RemoveAttributes": {
      const n = t.keys.length;
      const scope =
        t.scope.type === "LogGlobal"
          ? "log"
          : t.scope.type === "Event"
            ? t.scope.activity
              ? `events: ${t.scope.activity}`
              : "events"
            : t.scope.object_type
              ? `objects: ${t.scope.object_type}`
              : "cases/objects";
      return `${n} attr${n === 1 ? "" : "s"} from ${scope}`;
    }
  }
}
