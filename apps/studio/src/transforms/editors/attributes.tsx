import type {
  AttributeCatalogEntry,
  AttributeInfo,
  AttributeScope,
  BackendContext,
  EventLogHandle,
  KeepOrRemove,
  OcelAttributeInfo,
  SlimLinkedOCELHandle,
  Transform,
} from "@r4pm/client";
import { Badge, Flex, IconButton, SegmentedControl, Select, Text } from "@r4pm/components/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { PiCircle, PiCircleFill, PiCircleHalfFill } from "react-icons/pi";
import { groupEntries, keyToScope, scopeToKey } from "../condition";
import { type CondEnv, ConditionEditor, ConditionEnvProvider, ConditionSummary } from "../condition-editor";

const EMPTY_ATTRS: (AttributeInfo | OcelAttributeInfo)[] = [];

export function FilterAttributesEditor({
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
        ? (backend.callBinding("app_bindings::get_attribute_names", {
            event_log: datasetName as EventLogHandle,
          }) as Promise<(AttributeInfo | OcelAttributeInfo)[]>)
        : (backend.callBinding("app_bindings::get_ocel_attribute_names", {
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

export function RemoveAttributesEditor({
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
        ? backend.callBinding("app_bindings::get_removable_attributes_xes", {
            event_log: datasetName as EventLogHandle,
          })
        : backend.callBinding("app_bindings::get_removable_attributes_ocel", {
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
