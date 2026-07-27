import type {
  AttributeCatalogEntry,
  AttributeInfo,
  AttributeScope,
  BackendContext,
  EventLogHandle,
  KeepOrRemove,
  OcelAttributeInfo,
  RelabelRule,
  RequiredOrForbidden,
  SlimLinkedOCELHandle,
  TraceVariants,
  Transform,
} from "@r4pm/client";
import { colorForSeed, FrequencyPicker, LogVariants, softBadgeStyle } from "@r4pm/components";
import {
  Badge,
  Button,
  Callout,
  Flex,
  IconButton,
  SegmentedControl,
  Select,
  Text,
  TextField,
} from "@r4pm/components/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FaChevronDown, FaChevronRight, FaPlus, FaTrash } from "react-icons/fa";
import { PiCircle, PiCircleFill, PiCircleHalfFill, PiFunnel } from "react-icons/pi";
import {
  DURATION_UNITS,
  groupEntries,
  keyToScope,
  localInputToRfc,
  rfcToLocalInput,
  scopeToKey,
} from "./condition";
import {
  type CondEnv,
  ConditionEditor,
  ConditionEnvProvider,
  ConditionSummary,
  EventTimeRangePicker,
} from "./condition-editor";

export function TransformEditor({
  transform,
  onChange,
  activities,
  objectTypes,
  objectType,
  totalTraces,
  totalEvents,
  activityCounts,
  objectTypeCounts,
  backend,
  datasetName,
  enabledPrefix,
}: {
  transform: Transform;
  onChange: (t: Transform) => void;
  activities: string[];
  objectTypes?: string[];
  objectType: "EventLog" | "OCEL";
  totalTraces?: number;
  totalEvents?: number;
  activityCounts?: Record<string, number>;
  objectTypeCounts?: Record<string, number>;
  backend: BackendContext;
  datasetName: string;
  /** Enabled upstream transforms (before this step), for on-demand variant reconstruction. */
  enabledPrefix: Transform[];
}) {
  switch (transform.type) {
    case "FilterActivities":
      return (
        <FilterActivitiesEditor
          transform={transform}
          onChange={onChange}
          activities={activities}
          counts={activityCounts}
        />
      );
    case "RelabelActivities":
      return <RelabelActivitiesEditor transform={transform} onChange={onChange} activities={activities} />;
    case "FilterStartEnd":
      return (
        <FilterStartEndEditor
          transform={transform}
          onChange={onChange}
          activities={activities}
          counts={activityCounts}
          objectType={objectType}
        />
      );
    case "FilterTraceContains":
      return (
        <FilterTraceContainsEditor
          transform={transform}
          onChange={onChange}
          activities={activities}
          counts={activityCounts}
          objectType={objectType}
        />
      );
    case "FilterVariants":
      return (
        <FilterVariantsEditor
          transform={transform}
          onChange={onChange}
          objectType={objectType}
          backend={backend}
          datasetName={datasetName}
          enabledPrefix={enabledPrefix}
          totalTraces={totalTraces}
          totalEvents={totalEvents}
        />
      );
    case "FilterTimeRange":
      return (
        <FilterTimeRangeEditor
          transform={transform}
          onChange={onChange}
          objectType={objectType}
          backend={backend}
          datasetName={datasetName}
        />
      );
    case "FilterObjectTypes":
      return (
        <FilterObjectTypesEditor
          transform={transform}
          onChange={onChange}
          objectTypes={objectTypes ?? []}
          counts={objectTypeCounts}
        />
      );
    case "RelabelObjectTypes":
      return (
        <RelabelObjectTypesEditor transform={transform} onChange={onChange} objectTypes={objectTypes ?? []} />
      );
    case "FilterMinRelatedEvents":
      return (
        <FilterMinRelatedEventsEditor transform={transform} onChange={onChange} activities={activities} />
      );
    case "FilterMinRelatedObjects":
      return (
        <FilterMinRelatedObjectsEditor
          transform={transform}
          onChange={onChange}
          objectTypes={objectTypes ?? []}
        />
      );
    case "Sample":
      return (
        <SampleEditor
          transform={transform}
          onChange={onChange}
          objectType={objectType}
          totalTraces={totalTraces}
          totalEvents={totalEvents}
        />
      );
    case "RescaleTimeframe":
      return (
        <RescaleTimeframeEditor
          transform={transform}
          onChange={onChange}
          objectType={objectType}
          objectTypes={objectTypes}
        />
      );
    case "RemoveAttributes":
      return (
        <RemoveAttributesEditor
          transform={transform}
          onChange={onChange}
          objectType={objectType}
          backend={backend}
          datasetName={datasetName}
        />
      );
    case "FilterAttributes":
      return (
        <FilterAttributesEditor
          transform={transform}
          onChange={onChange}
          objectType={objectType}
          activities={activities}
          objectTypes={objectTypes ?? []}
          activityCounts={activityCounts}
          objectTypeCounts={objectTypeCounts}
          backend={backend}
          datasetName={datasetName}
        />
      );
    default:
      return <Text color="red">Unknown transform type</Text>;
  }
}

function ItemCheckboxList({
  allItems,
  selectedItems,
  onSelectionChange,
  useActivityColors = true,
  counts,
}: {
  allItems: string[];
  selectedItems: string[];
  onSelectionChange: (items: string[]) => void;
  useActivityColors?: boolean;
  /** Per-item frequency; when present the picker shows bars + the top-N cutoff rail. */
  counts?: Record<string, number>;
}) {
  const hasCounts = !!counts && allItems.some((k) => (counts[k] ?? 0) > 0);
  return (
    <FrequencyPicker
      items={allItems.map((k) => ({ key: k, count: counts?.[k] ?? 0 }))}
      value={new Set(selectedItems)}
      onChange={(s) => onSelectionChange([...s])}
      scope={useActivityColors ? "activity" : "objectType"}
      showBars={hasCounts}
      showCutoff={hasCounts}
      emptyText="No items available"
    />
  );
}

function RelabelTable({
  items,
  rules,
  onRulesChange,
  useActivityColors = true,
}: {
  items: string[];
  rules: Record<string, RelabelRule[] | undefined>;
  onRulesChange: (rules: Record<string, RelabelRule[] | undefined>) => void;
  useActivityColors?: boolean;
}) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const getSimpleName = (item: string): string => {
    const r = rules[item];
    if (!r || r.length === 0) return "";
    if (r.length === 1 && r[0].condition === null && r[0].target.type === "Literal") return r[0].target.value;
    return "";
  };

  const setSimpleName = (item: string, newName: string) => {
    const next = { ...rules };
    if (newName.trim() === "" || newName.trim() === item) {
      delete next[item];
    } else {
      next[item] = [{ target: { type: "Literal", value: newName.trim() }, condition: null }];
    }
    onRulesChange(next);
  };

  const hasAdvanced = (item: string): boolean => {
    const r = rules[item];
    if (!r || r.length === 0) return false;
    return r.length > 1 || r[0].condition !== null || r[0].target.type === "Template";
  };

  return (
    <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto pr-1">
      {items.map((item) => {
        const expanded = expandedItem === item;
        const advanced = hasAdvanced(item);
        const itemRules = rules[item] ?? [];
        const isRenamed = getSimpleName(item) !== "";

        return (
          <div
            key={item}
            className={`rounded-lg ${expanded ? "p-3" : "px-2 py-1.5"}`}
            style={{
              background: expanded ? "var(--violet-2)" : isRenamed ? "var(--green-2)" : undefined,
              border: expanded
                ? "1px solid var(--violet-4)"
                : isRenamed
                  ? "1px solid var(--green-6)"
                  : "1px solid transparent",
            }}
          >
            <Flex align="center" gap="2" className={expanded ? "mb-3" : ""}>
              <Badge
                size="2"
                variant="surface"
                className="!shrink-0 !max-w-32"
                title={item}
                color={useActivityColors ? undefined : "gray"}
                style={useActivityColors ? softBadgeStyle(colorForSeed(`activity:${item}`)) : undefined}
              >
                <span className="truncate">{item}</span>
              </Badge>
              <Text size="2" color="gray" className="shrink-0">
                →
              </Text>
              {!advanced ? (
                <TextField.Root
                  size="2"
                  placeholder={item}
                  value={getSimpleName(item)}
                  onChange={(e) => setSimpleName(item, e.currentTarget.value)}
                  className="!flex-1"
                />
              ) : (
                <Text size="2" color="blue" className="flex-1">
                  {itemRules.length} rule{itemRules.length !== 1 ? "s" : ""}
                </Text>
              )}
              <Button
                size="1"
                variant="ghost"
                color={expanded ? "violet" : "gray"}
                onClick={() => setExpandedItem(expanded ? null : item)}
              >
                {expanded ? (
                  <>
                    <FaChevronDown size={9} /> Advanced
                  </>
                ) : (
                  <>
                    <FaChevronRight size={9} /> Advanced
                  </>
                )}
              </Button>
            </Flex>

            {expanded && (
              <div className="flex flex-col gap-2 ml-2">
                {itemRules.map((rule, idx) => (
                  <RelabelRuleCard
                    key={`rule-${item}-${rule.target.type}-${idx}`}
                    rule={rule}
                    onChange={(updated) => {
                      const next = { ...rules };
                      const list = [...(next[item] ?? [])];
                      list[idx] = updated;
                      next[item] = list;
                      onRulesChange(next);
                    }}
                    onRemove={() => {
                      const next = { ...rules };
                      const list = (next[item] ?? []).filter((_, i) => i !== idx);
                      if (list.length === 0) delete next[item];
                      else next[item] = list;
                      onRulesChange(next);
                    }}
                  />
                ))}
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  className="!w-fit"
                  onClick={() => {
                    const next = { ...rules };
                    next[item] = [
                      ...(next[item] ?? []),
                      { target: { type: "Literal" as const, value: "" }, condition: null },
                    ];
                    onRulesChange(next);
                  }}
                >
                  <FaPlus size={8} /> Add rule
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RelabelRuleCard({
  rule,
  onChange,
  onRemove,
}: {
  rule: RelabelRule;
  onChange: (r: RelabelRule) => void;
  onRemove: () => void;
}) {
  const [showCondition, setShowCondition] = useState(rule.condition !== null);

  return (
    <div
      style={{
        border: "1px solid var(--gray-6)",
        borderRadius: 8,
        padding: 12,
        background: "var(--color-background)",
      }}
    >
      {/* Target */}
      <Flex align="center" gap="2" mb="2">
        <Text size="1" color="gray" className="shrink-0">
          Rename to:
        </Text>
        <SegmentedControl.Root
          size="1"
          value={rule.target.type}
          onValueChange={(v) => {
            if (v === "Literal")
              onChange({
                ...rule,
                target: { type: "Literal", value: rule.target.type === "Literal" ? rule.target.value : "" },
              });
            else
              onChange({
                ...rule,
                target: {
                  type: "Template",
                  template: rule.target.type === "Template" ? rule.target.template : "",
                },
              });
          }}
        >
          <SegmentedControl.Item value="Literal">Literal</SegmentedControl.Item>
          <SegmentedControl.Item value="Template">Template</SegmentedControl.Item>
        </SegmentedControl.Root>
        <div className="flex-1">
          {rule.target.type === "Literal" ? (
            <TextField.Root
              size="1"
              placeholder="New name"
              value={rule.target.value}
              onChange={(e) =>
                onChange({ ...rule, target: { type: "Literal", value: e.currentTarget.value } })
              }
            />
          ) : (
            <TextField.Root
              size="1"
              placeholder="e.g. Order_{country}"
              value={rule.target.template}
              onChange={(e) =>
                onChange({ ...rule, target: { type: "Template", template: e.currentTarget.value } })
              }
            />
          )}
        </div>
        <IconButton size="1" variant="ghost" color="red" onClick={onRemove} title="Remove rule">
          <FaTrash size={10} />
        </IconButton>
      </Flex>

      {/* Condition toggle */}
      <button
        type="button"
        className="flex items-center gap-1.5 mb-1"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--gray-9)",
          fontSize: 12,
        }}
        onClick={() => {
          if (showCondition) {
            setShowCondition(false);
            onChange({ ...rule, condition: null });
          } else {
            setShowCondition(true);
            if (!rule.condition)
              onChange({
                ...rule,
                condition: { type: "And", conditions: [{ type: "AttributeEquals", key: "", value: "" }] },
              });
          }
        }}
      >
        {showCondition ? <FaChevronDown size={8} /> : <FaChevronRight size={8} />}
        {showCondition ? "Hide condition" : "Add condition"}
      </button>

      {showCondition && rule.condition && (
        <>
          <ConditionEditor condition={rule.condition} onChange={(c) => onChange({ ...rule, condition: c })} />
          <ConditionSummary condition={rule.condition} />
        </>
      )}
    </div>
  );
}

function FilterActivitiesEditor({
  transform,
  onChange,
  activities,
  counts,
}: {
  transform: Extract<Transform, { type: "FilterActivities" }>;
  onChange: (t: Transform) => void;
  activities: string[];
  counts?: Record<string, number>;
}) {
  return (
    <Flex direction="column" gap="3">
      <Flex align="center" gap="3">
        <Text size="2" weight="medium">
          Mode
        </Text>
        <SegmentedControl.Root
          size="1"
          value={transform.mode}
          onValueChange={(v) => onChange({ ...transform, mode: v as KeepOrRemove })}
        >
          <SegmentedControl.Item value="Keep">Keep</SegmentedControl.Item>
          <SegmentedControl.Item value="Remove">Remove</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
      <Text size="2" color="gray">
        {transform.mode === "Keep"
          ? "Only keep events with selected activities:"
          : "Remove events with selected activities:"}
      </Text>
      <ItemCheckboxList
        allItems={activities}
        selectedItems={transform.activities}
        onSelectionChange={(a) => onChange({ ...transform, activities: a })}
        counts={counts}
      />
    </Flex>
  );
}

function RelabelActivitiesEditor({
  transform,
  onChange,
  activities,
}: {
  transform: Extract<Transform, { type: "RelabelActivities" }>;
  onChange: (t: Transform) => void;
  activities: string[];
}) {
  return (
    <Flex direction="column" gap="2">
      <Text size="2" color="gray">
        Type a new name to rename. Leave blank to keep. Click "Advanced" for conditional rules.
      </Text>
      <RelabelTable
        items={activities}
        rules={transform.rules}
        onRulesChange={(r) => onChange({ ...transform, rules: r as Record<string, RelabelRule[]> })}
      />
    </Flex>
  );
}

function FilterStartEndEditor({
  transform,
  onChange,
  activities,
  counts,
  objectType,
}: {
  transform: Extract<Transform, { type: "FilterStartEnd" }>;
  onChange: (t: Transform) => void;
  activities: string[];
  counts?: Record<string, number>;
  objectType: "EventLog" | "OCEL";
}) {
  const unit = objectType === "OCEL" ? "objects" : "traces";
  return (
    <Flex direction="column" gap="4">
      <div>
        <Text size="2" weight="medium" as="div" mb="1">
          Starts with
        </Text>
        <Text size="1" color="gray" as="div" mb="1">
          Keep {unit} starting with these. All selected = any start.
        </Text>
        <ItemCheckboxList
          allItems={activities}
          selectedItems={transform.start_activities ?? [...activities]}
          onSelectionChange={(a) => {
            const all = a.length === activities.length && activities.every((x) => a.includes(x));
            onChange({ ...transform, start_activities: all ? null : a });
          }}
          counts={counts}
        />
      </div>
      <div>
        <Text size="2" weight="medium" as="div" mb="1">
          Ends with
        </Text>
        <Text size="1" color="gray" as="div" mb="1">
          Keep {unit} ending with these. All selected = any end.
        </Text>
        <ItemCheckboxList
          allItems={activities}
          selectedItems={transform.end_activities ?? [...activities]}
          onSelectionChange={(a) => {
            const all = a.length === activities.length && activities.every((x) => a.includes(x));
            onChange({ ...transform, end_activities: all ? null : a });
          }}
          counts={counts}
        />
      </div>
    </Flex>
  );
}

function FilterTraceContainsEditor({
  transform,
  onChange,
  activities,
  counts,
  objectType,
}: {
  transform: Extract<Transform, { type: "FilterTraceContains" }>;
  onChange: (t: Transform) => void;
  activities: string[];
  counts?: Record<string, number>;
  objectType: "EventLog" | "OCEL";
}) {
  const unit = objectType === "OCEL" ? "objects" : "traces";
  return (
    <Flex direction="column" gap="3">
      <Flex align="center" gap="3">
        <Text size="2" weight="medium">
          Mode
        </Text>
        <SegmentedControl.Root
          size="1"
          value={transform.mode}
          onValueChange={(v) => onChange({ ...transform, mode: v as RequiredOrForbidden })}
        >
          <SegmentedControl.Item value="Required">Required</SegmentedControl.Item>
          <SegmentedControl.Item value="Forbidden">Forbidden</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
      <Text size="2" color="gray">
        {transform.mode === "Required"
          ? `Keep ${unit} containing at least one of:`
          : `Remove ${unit} containing any of:`}
      </Text>
      <ItemCheckboxList
        allItems={activities}
        selectedItems={transform.activities}
        onSelectionChange={(a) => onChange({ ...transform, activities: a })}
        counts={counts}
      />
    </Flex>
  );
}

function FilterTimeRangeEditor({
  transform,
  onChange,
  objectType,
  backend,
  datasetName,
}: {
  transform: Extract<Transform, { type: "FilterTimeRange" }>;
  onChange: (t: Transform) => void;
  objectType: "EventLog" | "OCEL";
  backend: BackendContext;
  datasetName: string;
}) {
  return (
    <Flex direction="column" gap="3">
      <Flex align="center" gap="3">
        <Text size="2" weight="medium">
          Mode
        </Text>
        <SegmentedControl.Root
          size="1"
          value={transform.mode}
          onValueChange={(v) => onChange({ ...transform, mode: v as KeepOrRemove })}
        >
          <SegmentedControl.Item value="Keep">Keep</SegmentedControl.Item>
          <SegmentedControl.Item value="Remove">Remove</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
      <Text size="2" color="gray">
        {transform.mode === "Keep"
          ? "Keep only events whose timestamp falls inside the range."
          : "Remove events whose timestamp falls inside the range."}
      </Text>
      <Flex gap="3" wrap="wrap">
        <div>
          <Text size="2" weight="medium" as="div" mb="1">
            Start
          </Text>
          <input
            type="datetime-local"
            className="rt-TextFieldInput border rounded px-2 py-1 text-[12px]"
            style={{
              borderColor: "var(--gray-6)",
              background: "var(--color-background)",
              color: "var(--gray-12)",
            }}
            value={rfcToLocalInput(transform.start)}
            onChange={(e) => onChange({ ...transform, start: localInputToRfc(e.currentTarget.value) })}
          />
        </div>
        <div>
          <Text size="2" weight="medium" as="div" mb="1">
            End
          </Text>
          <input
            type="datetime-local"
            className="rt-TextFieldInput border rounded px-2 py-1 text-[12px]"
            style={{
              borderColor: "var(--gray-6)",
              background: "var(--color-background)",
              color: "var(--gray-12)",
            }}
            value={rfcToLocalInput(transform.end)}
            onChange={(e) => onChange({ ...transform, end: localInputToRfc(e.currentTarget.value) })}
          />
        </div>
        <Badge
          color="gray"
          variant="soft"
          style={{ alignSelf: "end" }}
          title="Times are interpreted as UTC, matching the event data."
        >
          UTC
        </Badge>
      </Flex>
      <EventTimeRangePicker
        backend={backend}
        datasetName={datasetName}
        objectType={objectType}
        start={transform.start}
        end={transform.end}
        onRangeChange={(start, end) => onChange({ ...transform, start, end })}
      />
    </Flex>
  );
}

/** Separator joining a variant's activity labels into a stable identity key. */
const VARIANT_KEY_SEP = "";
const variantKey = (labels: string[]) => labels.join(VARIANT_KEY_SEP);

function FilterVariantsEditor({
  transform,
  onChange,
  objectType,
  backend,
  datasetName,
  enabledPrefix,
  totalTraces,
  totalEvents,
}: {
  transform: Extract<Transform, { type: "FilterVariants" }>;
  onChange: (t: Transform) => void;
  objectType: "EventLog" | "OCEL";
  backend: BackendContext;
  datasetName: string;
  enabledPrefix: Transform[];
  totalTraces?: number;
  totalEvents?: number;
}) {
  const variantsQuery = useQuery<TraceVariants>({
    queryKey: [datasetName, "filter-variants-list"],
    queryFn: () =>
      backend.callBinding("app_bindings::event_log::get_log_trace_variants", {
        event_log: datasetName as EventLogHandle,
      }) as Promise<TraceVariants>,
    enabled: !!datasetName && objectType === "EventLog",
  });

  // Upstream event/trace filters re-form variants, which set-math can't derive; on demand, apply the
  // enabled prefix to a hidden temp handle, read its variants, and unload the handle.
  const hasUpstream = enabledPrefix.length > 0 && objectType === "EventLog";
  const [useFiltered, setUseFiltered] = useState(false);
  const showFiltered = useFiltered && hasUpstream;
  const prefixSig = JSON.stringify(enabledPrefix);
  const filteredQuery = useQuery<TraceVariants>({
    queryKey: [datasetName, "filter-variants-filtered", prefixSig],
    enabled: showFiltered && !!datasetName,
    queryFn: async () => {
      const handle = (await backend.callBinding(
        "app_bindings::transforms::apply_event_log_transforms",
        { event_log: datasetName as EventLogHandle, transforms: enabledPrefix },
        { outputName: `variant-preview-${datasetName}` },
      )) as string;
      try {
        return (await backend.callBinding("app_bindings::event_log::get_log_trace_variants", {
          event_log: handle as EventLogHandle,
        })) as TraceVariants;
      } finally {
        await backend.unloadObject(handle).catch(() => {});
      }
    },
  });

  const activeQuery = showFiltered ? filteredQuery : variantsQuery;
  const data = activeQuery.data;

  // The transform stores activity-label sequences; LogVariants speaks variant
  // indices. These two maps bridge the gap in both directions.
  const { labelsOf, indexByKey } = useMemo(() => {
    const indexByKey = new Map<string, number>();
    const labelsOf = (i: number): string[] =>
      (data?.traces[i]?.[0] ?? []).map((j) => data?.activities[j] ?? "UNKNOWN");
    data?.traces.forEach(([indices], i) => {
      indexByKey.set(indices.map((j) => data.activities[j] ?? "UNKNOWN").join(VARIANT_KEY_SEP), i);
    });
    return { labelsOf, indexByKey };
  }, [data]);

  // Seed LogVariants' selection from the persisted transform (mount-time only;
  // LogVariants owns selection after that, and we remount it via `key`).
  const initialSelected = useMemo(
    () => transform.variants.map((v) => indexByKey.get(variantKey(v))).filter((i): i is number => i != null),
    [indexByKey, transform.variants],
  );

  return (
    <Flex direction="column" gap="3">
      <Flex align="center" gap="3">
        <Text size="2" weight="medium">
          Mode
        </Text>
        <SegmentedControl.Root
          size="1"
          value={transform.mode}
          onValueChange={(v) => onChange({ ...transform, mode: v as KeepOrRemove })}
        >
          <SegmentedControl.Item value="Keep">Keep</SegmentedControl.Item>
          <SegmentedControl.Item value="Remove">Remove</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
      <Text size="2" color="gray">
        {transform.variants.length === 0
          ? "No variants selected."
          : `${transform.mode === "Keep" ? "Keeping" : "Removing"} traces matching ${transform.variants.length} variant${transform.variants.length === 1 ? "" : "s"}.`}
      </Text>

      {hasUpstream && (
        <Callout.Root size="1" color={showFiltered ? "violet" : "amber"}>
          <Callout.Icon>
            <PiFunnel />
          </Callout.Icon>
          <Callout.Text>
            <Flex align="center" justify="between" gap="3" wrap="wrap">
              <span>
                {showFiltered
                  ? `Variants of the log after ${enabledPrefix.length} upstream step${enabledPrefix.length === 1 ? "" : "s"}.`
                  : `Variants of the full log — the ${enabledPrefix.length} upstream step${enabledPrefix.length === 1 ? "" : "s"} above ${enabledPrefix.length === 1 ? "isn't" : "aren't"} applied here.`}
              </span>
              <Button
                size="1"
                variant={showFiltered ? "soft" : "solid"}
                color="violet"
                disabled={filteredQuery.isFetching}
                onClick={() => setUseFiltered((v) => !v)}
              >
                {filteredQuery.isFetching
                  ? "Computing…"
                  : showFiltered
                    ? "Show full log"
                    : "Recompute for filtered log"}
              </Button>
            </Flex>
          </Callout.Text>
        </Callout.Root>
      )}

      {objectType !== "EventLog" ? (
        <Text size="1" color="gray">
          Variant filtering applies to event logs only.
        </Text>
      ) : activeQuery.isLoading ? (
        <Text size="1" color="gray">
          Loading variants…
        </Text>
      ) : activeQuery.error ? (
        <Text size="1" color="red">
          {String(activeQuery.error)}
        </Text>
      ) : data ? (
        <div className="w-full" style={{ height: 520 }}>
          <LogVariants
            key={showFiltered ? `filtered-${prefixSig}` : datasetName}
            variants={data}
            numTraces={totalTraces ?? 0}
            numEvents={totalEvents ?? 0}
            initialSelectedVariantIndices={initialSelected}
            onSelectionChange={({ variantIndices }) => {
              const next = variantIndices.map(labelsOf);
              // Skip no-op writes (e.g. the mount-time emission re-deriving the
              // seeded selection) so merely opening the step doesn't dirty it.
              const a = new Set(next.map(variantKey));
              const b = new Set(transform.variants.map(variantKey));
              if (a.size === b.size && [...a].every((k) => b.has(k))) return;
              onChange({ ...transform, variants: next });
            }}
          />
        </div>
      ) : null}
    </Flex>
  );
}

function FilterObjectTypesEditor({
  transform,
  onChange,
  objectTypes,
  counts,
}: {
  transform: Extract<Transform, { type: "FilterObjectTypes" }>;
  onChange: (t: Transform) => void;
  objectTypes: string[];
  counts?: Record<string, number>;
}) {
  return (
    <Flex direction="column" gap="3">
      <Flex align="center" gap="3">
        <Text size="2" weight="medium">
          Mode
        </Text>
        <SegmentedControl.Root
          size="1"
          value={transform.mode}
          onValueChange={(v) => onChange({ ...transform, mode: v as KeepOrRemove })}
        >
          <SegmentedControl.Item value="Keep">Keep</SegmentedControl.Item>
          <SegmentedControl.Item value="Remove">Remove</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>
      <ItemCheckboxList
        allItems={objectTypes}
        selectedItems={transform.object_types}
        onSelectionChange={(t) => onChange({ ...transform, object_types: t })}
        useActivityColors={false}
        counts={counts}
      />
    </Flex>
  );
}

function RelabelObjectTypesEditor({
  transform,
  onChange,
  objectTypes,
}: {
  transform: Extract<Transform, { type: "RelabelObjectTypes" }>;
  onChange: (t: Transform) => void;
  objectTypes: string[];
}) {
  return (
    <Flex direction="column" gap="2">
      <Text size="2" color="gray">
        Rename object types. Leave blank to keep.
      </Text>
      <RelabelTable
        items={objectTypes}
        rules={transform.rules}
        onRulesChange={(r) => onChange({ ...transform, rules: r as Record<string, RelabelRule[]> })}
        useActivityColors={false}
      />
    </Flex>
  );
}

function FilterMinRelatedEventsEditor({
  transform,
  onChange,
  activities,
}: {
  transform: Extract<Transform, { type: "FilterMinRelatedEvents" }>;
  onChange: (t: Transform) => void;
  activities: string[];
}) {
  return (
    <Flex direction="column" gap="3">
      <Text size="2" color="gray">
        Remove objects whose related event count falls outside the range.
      </Text>
      <Flex gap="3" align="end">
        <div>
          <Text size="2" weight="medium" as="div" mb="1">
            Min
          </Text>
          <TextField.Root
            size="2"
            type="number"
            min={0}
            className="!w-24"
            placeholder="—"
            value={transform.min_events != null ? String(transform.min_events) : ""}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onChange({ ...transform, min_events: v === "" ? null : Math.max(0, parseInt(v, 10) || 0) });
            }}
          />
        </div>
        <div>
          <Text size="2" weight="medium" as="div" mb="1">
            Max
          </Text>
          <TextField.Root
            size="2"
            type="number"
            min={0}
            className="!w-24"
            placeholder="—"
            value={transform.max_events != null ? String(transform.max_events) : ""}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onChange({ ...transform, max_events: v === "" ? null : Math.max(0, parseInt(v, 10) || 0) });
            }}
          />
        </div>
      </Flex>
      <div>
        <Text size="2" weight="medium" as="div" mb="1">
          Event type
        </Text>
        <Select.Root
          value={transform.of_type ?? "__all__"}
          onValueChange={(v) => onChange({ ...transform, of_type: v === "__all__" ? null : v })}
        >
          <Select.Trigger />
          <Select.Content>
            <Select.Item value="__all__">All event types</Select.Item>
            {activities.map((a) => (
              <Select.Item key={a} value={a}>
                {a}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </div>
    </Flex>
  );
}

function FilterMinRelatedObjectsEditor({
  transform,
  onChange,
  objectTypes,
}: {
  transform: Extract<Transform, { type: "FilterMinRelatedObjects" }>;
  onChange: (t: Transform) => void;
  objectTypes: string[];
}) {
  return (
    <Flex direction="column" gap="3">
      <Text size="2" color="gray">
        Remove events whose related object count falls outside the range.
      </Text>
      <Flex gap="3" align="end">
        <div>
          <Text size="2" weight="medium" as="div" mb="1">
            Min
          </Text>
          <TextField.Root
            size="2"
            type="number"
            min={0}
            className="!w-24"
            placeholder="—"
            value={transform.min_objects != null ? String(transform.min_objects) : ""}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onChange({ ...transform, min_objects: v === "" ? null : Math.max(0, parseInt(v, 10) || 0) });
            }}
          />
        </div>
        <div>
          <Text size="2" weight="medium" as="div" mb="1">
            Max
          </Text>
          <TextField.Root
            size="2"
            type="number"
            min={0}
            className="!w-24"
            placeholder="—"
            value={transform.max_objects != null ? String(transform.max_objects) : ""}
            onChange={(e) => {
              const v = e.currentTarget.value;
              onChange({ ...transform, max_objects: v === "" ? null : Math.max(0, parseInt(v, 10) || 0) });
            }}
          />
        </div>
      </Flex>
      <div>
        <Text size="2" weight="medium" as="div" mb="1">
          Object type
        </Text>
        <Select.Root
          value={transform.of_type ?? "__all__"}
          onValueChange={(v) => onChange({ ...transform, of_type: v === "__all__" ? null : v })}
        >
          <Select.Trigger />
          <Select.Content>
            <Select.Item value="__all__">All object types</Select.Item>
            {objectTypes.map((t) => (
              <Select.Item key={t} value={t}>
                {t}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </div>
    </Flex>
  );
}

function SampleEditor({
  transform,
  onChange,
  objectType,
  totalTraces,
  totalEvents,
}: {
  transform: Extract<Transform, { type: "Sample" }>;
  onChange: (t: Transform) => void;
  objectType: "EventLog" | "OCEL";
  totalTraces?: number;
  totalEvents?: number;
}) {
  const tracesLabel = objectType === "EventLog" ? "Traces" : "Objects";
  const total = transform.target === "Events" ? totalEvents : totalTraces;
  const mode = transform.amount.type; // "Count" | "Percent"

  // Preview: compute actual count based on amount + total
  const previewCount =
    total != null
      ? mode === "Count"
        ? Math.min(transform.amount.value, total)
        : Math.max(0, Math.round(total * (transform.amount.value / 100)))
      : null;

  return (
    <Flex direction="column" gap="3">
      <Text size="2" color="gray">
        Randomly sample {tracesLabel.toLowerCase()} or events.
      </Text>
      <div>
        <Text size="2" weight="medium" as="div" mb="1">
          Sample what
        </Text>
        <SegmentedControl.Root
          size="2"
          value={transform.target}
          onValueChange={(v) => onChange({ ...transform, target: v as "TracesOrObjects" | "Events" })}
        >
          <SegmentedControl.Item value="TracesOrObjects">{tracesLabel}</SegmentedControl.Item>
          <SegmentedControl.Item value="Events">Events</SegmentedControl.Item>
        </SegmentedControl.Root>
      </div>
      <div>
        <Flex align="center" gap="2" mb="1">
          <Text size="2" weight="medium">
            Amount
          </Text>
          <SegmentedControl.Root
            size="1"
            value={mode}
            onValueChange={(v) => {
              // When switching modes, preserve the intent by converting if possible
              if (v === "Count") {
                const newCount =
                  previewCount ?? (transform.amount.type === "Count" ? transform.amount.value : 100);
                onChange({ ...transform, amount: { type: "Count", value: newCount } });
              } else {
                // Switching to percent: compute % from current count if possible, else default 50
                let newPct = 50;
                if (transform.amount.type === "Count" && total != null && total > 0) {
                  newPct = Math.round((transform.amount.value / total) * 100);
                } else if (transform.amount.type === "Percent") {
                  newPct = transform.amount.value;
                }
                onChange({ ...transform, amount: { type: "Percent", value: newPct } });
              }
            }}
          >
            <SegmentedControl.Item value="Count">Count</SegmentedControl.Item>
            <SegmentedControl.Item value="Percent">%</SegmentedControl.Item>
          </SegmentedControl.Root>
        </Flex>
        {mode === "Count" ? (
          <Flex align="center" gap="2">
            <TextField.Root
              size="2"
              type="number"
              min={1}
              className="!w-32"
              value={String(transform.amount.value)}
              onChange={(e) =>
                onChange({
                  ...transform,
                  amount: { type: "Count", value: Math.max(1, parseInt(e.currentTarget.value, 10) || 1) },
                })
              }
            />
            {total != null && (
              <Text size="1" color="gray">
                of {total.toLocaleString()}
              </Text>
            )}
          </Flex>
        ) : (
          <Flex align="center" gap="2">
            <TextField.Root
              size="2"
              type="number"
              min={0}
              max={100}
              className="!w-20"
              value={String(transform.amount.value)}
              onChange={(e) => {
                const p = Math.min(100, Math.max(0, parseFloat(e.currentTarget.value) || 0));
                onChange({ ...transform, amount: { type: "Percent", value: p } });
              }}
            />
            <Text size="2" color="gray">
              %
            </Text>
            {previewCount != null && (
              <Text size="2" color="gray">
                ≈ {previewCount.toLocaleString()} items
              </Text>
            )}
            {previewCount == null && (
              <Text size="1" color="orange">
                Load data to preview
              </Text>
            )}
          </Flex>
        )}
      </div>
      <div>
        <Text size="2" weight="medium" as="div" mb="1">
          Seed (optional)
        </Text>
        <TextField.Root
          size="2"
          type="number"
          min={0}
          className="!w-32"
          placeholder="42"
          value={transform.seed != null ? String(transform.seed) : ""}
          onChange={(e) => {
            const v = e.currentTarget.value;
            onChange({ ...transform, seed: v === "" ? null : Math.max(0, parseInt(v, 10) || 0) });
          }}
        />
      </div>
    </Flex>
  );
}

type DurationUnitLabel = (typeof DURATION_UNITS)[number]["long"];

function DurationInput({
  label,
  valueMs,
  onChange,
}: {
  label: string;
  valueMs: number | null;
  onChange: (ms: number | null) => void;
}) {
  // Pick the best unit for display
  const bestUnit =
    valueMs != null
      ? ([...DURATION_UNITS].reverse().find((u) => valueMs >= u.ms && valueMs % u.ms === 0) ??
        DURATION_UNITS[0])
      : DURATION_UNITS[1]; // default to minutes
  const [unit, setUnit] = useState<DurationUnitLabel>(bestUnit.long);
  const unitMs = DURATION_UNITS.find((u) => u.long === unit)?.ms ?? 1_000;
  const displayVal = valueMs != null ? valueMs / unitMs : "";

  return (
    <div>
      <Text size="2" weight="medium" as="div" mb="1">
        {label}
      </Text>
      <Flex gap="1" align="center">
        <TextField.Root
          size="2"
          type="number"
          min="0"
          placeholder="—"
          value={displayVal}
          style={{ width: 80 }}
          onChange={(e) => {
            const v = e.currentTarget.value;
            if (v === "") {
              onChange(null);
              return;
            }
            const n = parseFloat(v);
            if (!Number.isNaN(n) && n >= 0) onChange(Math.round(n * unitMs));
          }}
        />
        <Select.Root
          size="2"
          value={unit}
          onValueChange={(u) => {
            setUnit(u as DurationUnitLabel);
          }}
        >
          <Select.Trigger variant="soft" />
          <Select.Content>
            {DURATION_UNITS.map((u) => (
              <Select.Item key={u.long} value={u.long}>
                {u.long}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>
    </div>
  );
}

function RescaleTimeframeEditor({
  transform,
  onChange,
  objectType,
  objectTypes,
}: {
  transform: Extract<Transform, { type: "RescaleTimeframe" }>;
  onChange: (t: Transform) => void;
  objectType: "EventLog" | "OCEL";
  objectTypes?: string[];
}) {
  const startDate = transform.target_start.split("T")[0] || "2025-01-01";
  const endDate = transform.target_end.split("T")[0] || "2025-12-31";

  return (
    <Flex direction="column" gap="3">
      <Text size="2" color="gray">
        Linearly rescale all timestamps to fit within the target timeframe. Relative ordering and proportional
        gaps are preserved.
      </Text>
      <Flex gap="3" align="end">
        <div>
          <Text size="2" weight="medium" as="div" mb="1">
            Start date
          </Text>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onChange({ ...transform, target_start: `${e.target.value}T00:00:00+00:00` })}
            style={{
              border: "1px solid var(--gray-6)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              fontFamily: "inherit",
              background: "var(--color-background)",
              color: "var(--gray-12)",
            }}
          />
        </div>
        <Text size="2" color="gray" style={{ paddingBottom: 8 }}>
          →
        </Text>
        <div>
          <Text size="2" weight="medium" as="div" mb="1">
            End date
          </Text>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onChange({ ...transform, target_end: `${e.target.value}T23:59:59+00:00` })}
            style={{
              border: "1px solid var(--gray-6)",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              fontFamily: "inherit",
              background: "var(--color-background)",
              color: "var(--gray-12)",
            }}
          />
        </div>
        <Badge
          color="gray"
          variant="soft"
          style={{ alignSelf: "end", marginBottom: 6 }}
          title="Target dates are interpreted as UTC (00:00:00 to 23:59:59), matching the event data."
        >
          UTC
        </Badge>
      </Flex>

      {/* Gap constraints */}
      <Text size="2" weight="medium" as="div" style={{ marginTop: 4 }}>
        Gap constraints (between consecutive events{objectType === "OCEL" ? " per object" : " per trace"})
      </Text>
      <Flex gap="3" align="end" wrap="wrap">
        <DurationInput
          label="Min gap"
          valueMs={transform.min_gap_ms ?? null}
          onChange={(ms) => onChange({ ...transform, min_gap_ms: ms })}
        />
        <DurationInput
          label="Max gap"
          valueMs={transform.max_gap_ms ?? null}
          onChange={(ms) => onChange({ ...transform, max_gap_ms: ms })}
        />
      </Flex>

      {/* OCEL object type scope */}
      {objectType === "OCEL" &&
        objectTypes &&
        (transform.min_gap_ms != null || transform.max_gap_ms != null) && (
          <div>
            <Text size="2" weight="medium" as="div" mb="1">
              Apply gap constraints to
            </Text>
            <Select.Root
              size="2"
              value={transform.gap_object_type ?? "__all__"}
              onValueChange={(v) => onChange({ ...transform, gap_object_type: v === "__all__" ? null : v })}
            >
              <Select.Trigger variant="soft" />
              <Select.Content>
                <Select.Item value="__all__">All object types</Select.Item>
                {objectTypes.map((ot) => (
                  <Select.Item key={ot} value={ot}>
                    {ot}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
        )}
    </Flex>
  );
}

const EMPTY_ATTRS: (AttributeInfo | OcelAttributeInfo)[] = [];

function FilterAttributesEditor({
  transform,
  onChange,
  objectType,
  activities,
  objectTypes,
  activityCounts,
  objectTypeCounts,
  backend,
  datasetName,
}: {
  transform: Extract<Transform, { type: "FilterAttributes" }>;
  onChange: (t: Transform) => void;
  objectType: "EventLog" | "OCEL";
  activities: string[];
  objectTypes: string[];
  activityCounts?: Record<string, number>;
  objectTypeCounts?: Record<string, number>;
  backend: BackendContext;
  datasetName: string;
}) {
  const scope = transform.scope;

  // One catalog query serves every scope: names carry their level, so we filter client-side.
  const attrListQuery = useQuery<(AttributeInfo | OcelAttributeInfo)[]>({
    queryKey: [objectType, datasetName, "cond-attr-names"],
    queryFn: () =>
      objectType === "EventLog"
        ? (backend.callBinding("app_bindings::event_log::get_attribute_names", {
            event_log: datasetName as EventLogHandle,
          }) as Promise<(AttributeInfo | OcelAttributeInfo)[]>)
        : (backend.callBinding("app_bindings::ocel::get_ocel_attribute_names", {
            ocel: datasetName as SlimLinkedOCELHandle,
          }) as Promise<(AttributeInfo | OcelAttributeInfo)[]>),
    enabled: !!datasetName,
  });
  const catalog = attrListQuery.data ?? EMPTY_ATTRS;

  const attrNamesForScope = useMemo(() => {
    return (s: AttributeScope): string[] => {
      const names: string[] = [];
      for (const a of catalog) {
        if (objectType === "EventLog") {
          const lvl = (a as AttributeInfo).level;
          if (s.type === "Event" && lvl === "Event") names.push(a.name);
          else if (s.type === "Object" && lvl === "Case") names.push(a.name);
        } else {
          const lvl = (a as OcelAttributeInfo).level;
          if (s.type === "Event" && lvl === "Event") names.push(a.name);
          else if (s.type === "Object" && typeof lvl === "object" && "Object" in lvl) {
            if (!s.object_type || lvl.Object.object_type === s.object_type) names.push(a.name);
          }
        }
      }
      return Array.from(new Set(names)).sort();
    };
  }, [catalog, objectType]);

  const env: CondEnv = useMemo(
    () => ({
      objectType,
      activities,
      objectTypes,
      activityCounts,
      objectTypeCounts,
      attrNamesForScope,
      backend,
      datasetName,
    }),
    [
      objectType,
      activities,
      objectTypes,
      activityCounts,
      objectTypeCounts,
      attrNamesForScope,
      backend,
      datasetName,
    ],
  );

  const scopeOptions: { key: string; label: string; scope: AttributeScope }[] = [
    { key: "Event", label: "Each event", scope: { type: "Event", activity: null } },
  ];
  if (objectType === "EventLog") {
    scopeOptions.push({
      key: "Object:__all__",
      label: "Each case",
      scope: { type: "Object", object_type: null },
    });
  } else {
    for (const ot of objectTypes) {
      scopeOptions.push({
        key: `Object:${ot}`,
        label: `Each ${ot} object`,
        scope: { type: "Object", object_type: ot },
      });
    }
    if (objectTypes.length === 0) {
      scopeOptions.push({
        key: "Object:__all__",
        label: "Each object",
        scope: { type: "Object", object_type: null },
      });
    }
  }
  const currentScopeKey = scope.type === "Object" ? `Object:${scope.object_type ?? "__all__"}` : "Event";

  const noun =
    scope.type === "Event"
      ? "each event"
      : scope.type === "Object" && scope.object_type
        ? `each ${scope.object_type} object`
        : objectType === "EventLog"
          ? "each case"
          : "each object";

  return (
    <Flex direction="column" gap="3">
      <Flex align="center" gap="3">
        <Text size="2" weight="medium">
          Mode
        </Text>
        <SegmentedControl.Root
          size="1"
          value={transform.mode}
          onValueChange={(v) => onChange({ ...transform, mode: v as KeepOrRemove })}
        >
          <SegmentedControl.Item value="Keep">Keep</SegmentedControl.Item>
          <SegmentedControl.Item value="Remove">Remove</SegmentedControl.Item>
        </SegmentedControl.Root>
      </Flex>

      <div>
        <Text size="1" color="gray" as="div" mb="1">
          Filter target
        </Text>
        <Select.Root
          value={currentScopeKey}
          onValueChange={(v) => {
            const opt = scopeOptions.find((o) => o.key === v);
            // Predicates can be scope-specific (e.g. duration), so start the condition fresh
            // when the target changes rather than leaving now-invalid predicates behind.
            if (opt) onChange({ ...transform, scope: opt.scope, condition: { type: "And", conditions: [] } });
          }}
        >
          <Select.Trigger variant="soft" />
          <Select.Content>
            {scopeOptions.map((o) => (
              <Select.Item key={o.key} value={o.key}>
                {o.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Text size="1" color="gray" as="div" mt="1">
          {transform.mode === "Keep" ? "Keeps" : "Removes"} {noun} that matches the condition below.
          {scope.type === "Event" &&
            " Switch to a case or object target to filter by duration or related events."}
        </Text>
      </div>

      <ConditionEnvProvider value={env}>
        <ConditionEditor
          condition={transform.condition}
          scope={scope}
          onChange={(c) => onChange({ ...transform, condition: c })}
        />
      </ConditionEnvProvider>

      <ConditionSummary condition={transform.condition} />
    </Flex>
  );
}

function RemoveAttributesEditor({
  transform,
  onChange,
  objectType,
  backend,
  datasetName,
}: {
  transform: Extract<Transform, { type: "RemoveAttributes" }>;
  onChange: (t: Transform) => void;
  objectType: "EventLog" | "OCEL";
  backend: BackendContext;
  datasetName: string;
}) {
  const catalogQuery = useQuery({
    queryKey: [objectType, datasetName, "attr-catalog"],
    queryFn: () =>
      objectType === "EventLog"
        ? backend.callBinding("app_bindings::event_log::get_removable_attributes_xes", {
            event_log: datasetName as EventLogHandle,
          })
        : backend.callBinding("app_bindings::ocel::get_removable_attributes_ocel", {
            ocel: datasetName as SlimLinkedOCELHandle,
          }),
    enabled: !!datasetName,
  });

  const entries: AttributeCatalogEntry[] = catalogQuery.data ?? [];
  const currentScope: AttributeScope = transform.scope;
  const selectedKeys = new Set(transform.keys);
  const groups = groupEntries(entries);
  const scopeKey = scopeToKey(currentScope);

  return (
    <Flex direction="column" gap="2">
      <Text size="1" color="gray">
        Pick the scope, then tick the attributes to remove. Stack multiple transforms to remove across scopes.
      </Text>
      <Select.Root
        value={scopeKey}
        onValueChange={(v) => {
          const scope = keyToScope(v);
          onChange({ ...transform, scope, keys: [] });
        }}
      >
        <Select.Trigger variant="soft" />
        <Select.Content>
          {Object.keys(groups).map((k) => (
            <Select.Item key={k} value={k}>
              {groups[k].label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>

      {(groups[scopeKey]?.entries ?? []).length > 0 && (
        <Flex justify="end" gap="1">
          <IconButton
            title="Select none"
            size="1"
            variant="ghost"
            color="gray"
            onClick={() => onChange({ ...transform, keys: [] })}
          >
            <PiCircle />
          </IconButton>
          <IconButton
            title="Invert"
            size="1"
            variant="ghost"
            color="gray"
            onClick={() => {
              const all = (groups[scopeKey]?.entries ?? []).map((e) => e.key);
              onChange({ ...transform, keys: all.filter((k) => !selectedKeys.has(k)) });
            }}
          >
            <PiCircleHalfFill />
          </IconButton>
          <IconButton
            title="Select all"
            size="1"
            variant="ghost"
            color="gray"
            onClick={() => {
              const all = (groups[scopeKey]?.entries ?? []).map((e) => e.key);
              onChange({ ...transform, keys: all });
            }}
          >
            <PiCircleFill />
          </IconButton>
        </Flex>
      )}

      <div className="flex flex-col gap-1 max-h-[20rem] overflow-auto">
        {(groups[scopeKey]?.entries ?? []).map((e) => {
          const checked = selectedKeys.has(e.key);
          return (
            <label key={e.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={(ev) => {
                  const next = new Set(selectedKeys);
                  if (ev.currentTarget.checked) next.add(e.key);
                  else next.delete(e.key);
                  onChange({ ...transform, keys: Array.from(next) });
                }}
              />
              <span className="font-mono">{e.key}</span>
              {e.occurrence_count != null && (
                <Badge size="1" color="gray" variant="soft">
                  {Number(e.occurrence_count).toLocaleString("en")}
                </Badge>
              )}
              {e.sample_values.length > 0 && (
                <span
                  className="text-xs text-gray-500 truncate max-w-[20rem]"
                  title={e.sample_values.join(", ")}
                >
                  e.g. {e.sample_values.slice(0, 3).join(", ")}
                </span>
              )}
            </label>
          );
        })}
        {(groups[scopeKey]?.entries ?? []).length === 0 && (
          <Text size="1" color="gray">
            No removable attributes in this scope.
          </Text>
        )}
      </div>
    </Flex>
  );
}
