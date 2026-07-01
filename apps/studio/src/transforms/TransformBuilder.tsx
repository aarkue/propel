import { Button, Checkbox, Flex, IconButton, Popover, Text, TextField } from "@r4pm/components/ui";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { FaArrowDown, FaArrowUp, FaPlus } from "react-icons/fa";
import { TiDelete } from "react-icons/ti";
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
  LuDownload,
  LuUpload,
  LuTrash2,
  LuSlidersHorizontal,
} from "react-icons/lu";
import toast from "react-hot-toast";
import type { BackendContext, EventLogHandle, SlimLinkedOCELHandle, Transform } from "@r4pm/client";
import { TransformEditor } from "./TransformEditors";

type TransformWithID = {
  id: string;
  value: Transform;
  enabled: boolean;
};

const TRANSFORM_META: {
  type: Transform["type"];
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
    description: "Rename activities / event types",
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
    description: "Require or forbid activities in traces / objects",
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
    label: "Attribute Filter",
    description: "Filter by attribute values with distribution view",
    icon: LuSlidersHorizontal,
    ocelOnly: false,
  },
  {
    type: "RemoveAttributes",
    label: "Remove Attributes",
    description: "Remove attributes from events, cases/objects, or log metadata",
    icon: LuTrash2,
    ocelOnly: false,
  },
];

/** Produce RFC 3339 strings for the start and end of the current year. Used
 *  as generic defaults for time-range / rescale transforms when there is no
 *  dataset-specific range to anchor to. */
function defaultYearRangeRfc(): { start: string; end: string } {
  const year = new Date().getFullYear();
  return {
    start: `${year}-01-01T00:00:00+00:00`,
    end: `${year}-12-31T23:59:59+00:00`,
  };
}

function defaultTransformForType(type: Transform["type"]): Transform {
  switch (type) {
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
function generateId(): string {
  return `t-${++_idCounter}-${Date.now()}`;
}

function getTransformMeta(type: Transform["type"]) {
  return TRANSFORM_META.find((m) => m.type === type);
}

function getTransformLabel(type: Transform["type"]): string {
  return getTransformMeta(type)?.label ?? type;
}

/** Format a millisecond duration into a human-readable string (e.g. "2h 30m") */
function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s}s`;
  const m = s / 60;
  if (m < 60) return `${Math.round(m * 10) / 10}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h * 10) / 10}h`;
  const d = h / 24;
  return `${Math.round(d * 10) / 10}d`;
}

/** Compact summary text for a transform */
function summarizeTransform(t: Transform): string {
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
        if (t.min_gap_ms != null) gap.push(`≥ ${formatDurationMs(t.min_gap_ms)}`);
        if (t.max_gap_ms != null) gap.push(`≤ ${formatDurationMs(t.max_gap_ms)}`);
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

export function TransformBuilder({
  backend,
  datasetName,
  objectType,
  onResult,
}: {
  backend: BackendContext;
  datasetName: string;
  objectType: "EventLog" | "OCEL";
  /** Called with the freshly produced dataset handle after a successful apply. */
  onResult?: (handle: string, outName: string) => void;
}) {
  const name = datasetName;
  const logHandle = name as EventLogHandle;
  const ocelHandle = name as SlimLinkedOCELHandle;

  const [transforms, setTransforms] = useState<TransformWithID[]>([]);
  const [outName, setOutName] = useState("transformed");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addPopoverOpen, setAddPopoverOpen] = useState(false);

  const activitiesQuery = useQuery({
    queryKey: [name, "transform-activities", objectType],
    queryFn: () =>
      objectType === "EventLog"
        ? backend
            .callBinding("app_bindings::event_log::get_activity_counts", { event_log: logHandle })
            .then((c) => Object.keys(c).sort())
        : backend
            .callBinding("app_bindings::ocel::get_ocel_info", { ocel: ocelHandle })
            .then((i) => i.event_types.sort()),
    enabled: !!name,
  });

  const objectTypesQuery = useQuery({
    queryKey: [name, "transform-object-types"],
    queryFn: () =>
      backend
        .callBinding("app_bindings::ocel::get_ocel_info", { ocel: ocelHandle })
        .then((i) => i.object_types.sort()),
    enabled: !!name && objectType === "OCEL",
  });

  const allActivities = activitiesQuery.data ?? [];
  const allObjTypes = objectTypesQuery.data;

  // Per-item frequencies for the activity/object-type pickers.
  const activityCountsQuery = useQuery({
    queryKey: [name, "transform-activity-counts", objectType],
    queryFn: () =>
      objectType === "EventLog"
        ? backend.callBinding("app_bindings::event_log::get_activity_counts", { event_log: logHandle })
        : backend
            .callBinding("process_mining::bindings::ocel_type_stats", { ocel: ocelHandle })
            .then((s) => s.event_type_counts),
    enabled: !!name,
  });
  const objectTypeCountsQuery = useQuery({
    queryKey: [name, "transform-objtype-counts"],
    queryFn: () =>
      backend
        .callBinding("process_mining::bindings::ocel_type_stats", { ocel: ocelHandle })
        .then((s) => s.object_type_counts),
    enabled: !!name && objectType === "OCEL",
  });
  const activityCounts = activityCountsQuery.data ?? {};
  const objectTypeCounts = objectTypeCountsQuery.data ?? {};

  // Total counts for percentage-based sampling
  const countsQuery = useQuery({
    queryKey: [name, "transform-counts", objectType],
    queryFn: () =>
      objectType === "EventLog"
        ? backend
            .callBinding("app_bindings::event_log::get_log_info", { event_log: logHandle })
            .then((i) => ({ traces: i.num_traces, events: i.num_events }))
        : backend
            .callBinding("app_bindings::ocel::get_ocel_info", { ocel: ocelHandle })
            .then((i) => ({ traces: i.num_objects, events: i.num_events })),
    enabled: !!name,
  });
  const totalTraces = countsQuery.data?.traces;
  const totalEvents = countsQuery.data?.events;

  /** Compute the effective activities/objectTypes visible at a given pipeline index,
   *  accounting for simple FilterActivities/FilterObjectTypes Keep/Remove transforms above. */
  function effectiveItemsAt(index: number): { activities: string[]; objectTypes?: string[] } {
    let acts = [...allActivities];
    let ots = allObjTypes ? [...allObjTypes] : undefined;
    for (let i = 0; i < index; i++) {
      const t = transforms[i];
      if (!t.enabled) continue;
      const v = t.value;
      if (v.type === "FilterActivities") {
        const set = new Set(v.activities);
        if (v.mode === "Keep") {
          acts = acts.filter((a) => set.has(a));
        } else {
          acts = acts.filter((a) => !set.has(a));
        }
      }
      if (v.type === "RelabelActivities") {
        acts = acts.map((a) => {
          const rules = v.rules[a];
          if (
            rules &&
            rules.length === 1 &&
            rules[0].condition === null &&
            rules[0].target.type === "Literal"
          ) {
            return rules[0].target.value;
          }
          return a;
        });
      }
      if (ots && v.type === "FilterObjectTypes") {
        const set = new Set(v.object_types);
        if (v.mode === "Keep") {
          ots = ots.filter((o) => set.has(o));
        } else {
          ots = ots.filter((o) => !set.has(o));
        }
      }
      if (ots && v.type === "RelabelObjectTypes") {
        ots = ots.map((o) => {
          const rules = v.rules[o];
          if (
            rules &&
            rules.length === 1 &&
            rules[0].condition === null &&
            rules[0].target.type === "Literal"
          ) {
            return rules[0].target.value;
          }
          return o;
        });
      }
    }
    return { activities: acts, objectTypes: ots };
  }

  const availableTypes = TRANSFORM_META.filter((m) => {
    if (objectType === "OCEL") return !m.xesOnly;
    return !m.ocelOnly;
  });

  const addTransform = useCallback((type: Transform["type"]) => {
    const item: TransformWithID = { id: generateId(), enabled: true, value: defaultTransformForType(type) };
    setTransforms((prev) => [...prev, item]);
    setExpandedId(item.id);
  }, []);

  const moveTransform = (index: number, dir: -1 | 1) => {
    setTransforms((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const updateTransform = (id: string, value: Transform) => {
    setTransforms((prev) => prev.map((t) => (t.id === id ? { ...t, value } : t)));
  };

  const enabledCount = transforms.filter((t) => t.enabled).length;

  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Serialize the pipeline to a portable JSON file: version, target object kind,
   * and the ordered list of transforms with their enabled flag, enough to
   * round-trip through `handleImport` below.
   */
  const handleExport = () => {
    const payload = {
      version: 1 as const,
      kind: objectType,
      transforms: transforms.map((t) => ({
        enabled: t.enabled,
        value: t.value,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = objectType === "EventLog" ? "log-transforms" : "ocel-transforms";
    a.download = `${baseName}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("transforms" in parsed) ||
        !Array.isArray((parsed as { transforms: unknown }).transforms)
      ) {
        throw new Error("Not a valid transform pipeline file.");
      }
      const payload = parsed as {
        version?: number;
        kind?: "EventLog" | "OCEL";
        transforms: { enabled?: boolean; value: Transform }[];
      };
      if (payload.kind && payload.kind !== objectType) {
        toast.error(`This file was exported for ${payload.kind}, but this panel targets ${objectType}.`);
        return;
      }
      const loaded: TransformWithID[] = payload.transforms.map((t) => ({
        id: generateId(),
        enabled: t.enabled !== false,
        value: t.value,
      }));
      setTransforms(loaded);
      setExpandedId(null);
      toast.success(`Loaded ${loaded.length} transform${loaded.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(`Failed to load pipeline: ${String(e).replace(/^Error:\s*/, "")}`);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-2 h-full overflow-auto">
      <Flex align="center" gap="2">
        <Text size="3" weight="bold">
          {objectType === "EventLog" ? "Log" : "OCEL"} Transforms
        </Text>
        <Text size="2" color="gray" className="truncate">
          {name}
        </Text>
      </Flex>

      {/* Pipeline */}
      <div className="flex flex-col gap-2 w-full">
        {transforms.length === 0 && (
          <Text size="2" color="gray" className="py-6 text-center">
            No transforms yet. Add one below.
          </Text>
        )}

        {transforms.map((t, i) => {
          const isExpanded = expandedId === t.id;
          return (
            <div
              key={t.id}
              className="rounded-xl overflow-hidden transition-all"
              style={{
                border: isExpanded ? "2px solid var(--violet-6)" : "1px solid var(--gray-6)",
                boxShadow: isExpanded ? "0 0 0 3px var(--violet-a3)" : "none",
                opacity: t.enabled ? 1 : 0.5,
              }}
            >
              {/* Header */}
              <button
                type="button"
                className="flex items-center gap-2.5 w-full text-left cursor-pointer hover:bg-[var(--gray-a3)] transition-colors"
                style={{
                  padding: "10px 14px",
                  borderBottom: isExpanded ? "1px solid var(--violet-4)" : "none",
                }}
                onClick={() => setExpandedId(isExpanded ? null : t.id)}
              >
                <span
                  className="flex items-center justify-center shrink-0 text-white font-semibold rounded-full"
                  style={{
                    width: 24,
                    height: 24,
                    fontSize: 11,
                    background: t.enabled ? "var(--accent-9)" : "var(--gray-8)",
                  }}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                    {(() => {
                      const Icon = getTransformMeta(t.value.type)?.icon;
                      return Icon ? <Icon size={13} /> : null;
                    })()}
                    {getTransformLabel(t.value.type)}
                  </div>
                  <div className="text-xs truncate" style={{ color: "var(--gray-9)" }}>
                    {summarizeTransform(t.value)}
                  </div>
                </div>
                <Checkbox
                  size="2"
                  checked={t.enabled}
                  onCheckedChange={(c) => {
                    setTransforms((prev) =>
                      prev.map((x) => (x.id === t.id ? { ...x, enabled: c === true } : x)),
                    );
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex flex-col shrink-0" onClickCapture={(e) => e.stopPropagation()}>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    disabled={i === 0}
                    onClick={() => moveTransform(i, -1)}
                  >
                    <FaArrowUp size={9} />
                  </IconButton>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    disabled={i === transforms.length - 1}
                    onClick={() => moveTransform(i, 1)}
                  >
                    <FaArrowDown size={9} />
                  </IconButton>
                </div>
                <IconButton
                  size="1"
                  variant="ghost"
                  color="red"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTransforms((prev) => prev.filter((x) => x.id !== t.id));
                    if (expandedId === t.id) setExpandedId(null);
                  }}
                >
                  <TiDelete size={16} />
                </IconButton>
              </button>

              {/* Expanded editor */}
              {isExpanded &&
                (() => {
                  const eff = effectiveItemsAt(i);
                  return (
                    <div style={{ padding: "14px 14px 14px 50px" }}>
                      <TransformEditor
                        transform={t.value}
                        activities={eff.activities}
                        objectTypes={eff.objectTypes}
                        objectType={objectType}
                        totalTraces={totalTraces}
                        totalEvents={totalEvents}
                        activityCounts={activityCounts}
                        objectTypeCounts={objectTypeCounts}
                        backend={backend}
                        datasetName={name}
                        onChange={(updated) => updateTransform(t.id, updated)}
                      />
                    </div>
                  );
                })()}
            </div>
          );
        })}

        {/* Add button */}
        <Popover.Root open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
          <Popover.Trigger>
            <button
              type="button"
              className="w-full py-2 rounded-lg text-sm cursor-pointer transition-colors"
              style={{
                background: "var(--gray-3)",
                border: "1px dashed var(--gray-7)",
                color: "var(--gray-10)",
              }}
              disabled={!name}
            >
              <FaPlus size={10} className="inline mr-1.5" style={{ verticalAlign: -1 }} />
              Add Transform
            </button>
          </Popover.Trigger>
          <Popover.Content
            side="top"
            align="start"
            className="!p-2"
            style={{ width: 420, maxHeight: "unset" }}
          >
            <div className="grid grid-cols-2 gap-1.5">
              {availableTypes.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.type}
                    type="button"
                    onClick={() => {
                      addTransform(m.type);
                      setAddPopoverOpen(false);
                    }}
                    className="flex items-start gap-2 p-2.5 rounded-md border border-[var(--gray-a5)] hover:border-[var(--indigo-8)] hover:bg-[var(--indigo-a2)] transition-colors cursor-pointer text-left"
                  >
                    <div className="rounded bg-[var(--indigo-a3)] text-[var(--indigo-11)] p-1 shrink-0">
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-[var(--gray-12)] truncate">{m.label}</div>
                      <div className="text-[11px] text-[var(--gray-11)] leading-tight line-clamp-2">
                        {m.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Popover.Content>
        </Popover.Root>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center gap-2 pt-3 border-t flex-wrap w-full">
        <Text size="2" color="gray" className="shrink-0">
          Output:
        </Text>
        <TextField.Root
          size="2"
          value={outName}
          onChange={(e) => setOutName(e.currentTarget.value)}
          className="!w-44"
        />
        <Button
          size="2"
          variant="soft"
          color="gray"
          title="Export pipeline to JSON"
          disabled={transforms.length === 0}
          onClick={handleExport}
        >
          <LuDownload size={14} />
          Export
        </Button>
        <Button
          size="2"
          variant="soft"
          color="gray"
          title="Import pipeline from JSON"
          onClick={() => fileInputRef.current?.click()}
        >
          <LuUpload size={14} />
          Import
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
            e.target.value = "";
          }}
        />
        <div className="flex-1" />
        <Button
          size="3"
          disabled={!name || enabledCount === 0 || !outName.trim()}
          onClick={async () => {
            const enabled = transforms.filter((t) => t.enabled).map((t) => t.value);
            const call: Promise<string> =
              objectType === "EventLog"
                ? backend
                    .callBinding("app_bindings::transforms::apply_event_log_transforms", {
                      event_log: logHandle,
                      transforms: enabled,
                    })
                    .then((h) => h as string)
                : backend
                    .callBinding("app_bindings::transforms::apply_ocel_transforms", {
                      ocel: ocelHandle,
                      transforms: enabled,
                    })
                    .then((h) => h as string);
            // The apply binding returns a NEW handle (registry results are stored in the engine and
            // their id returned), loading the transformed log.
            const handle = await toast.promise(call, {
              loading: "Applying transforms...",
              success: "Transforms applied!",
              error: (e) => `Failed: ${e}`,
            });
            onResult?.(handle as string, outName.trim());
          }}
        >
          Apply {enabledCount} Transform{enabledCount !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}
