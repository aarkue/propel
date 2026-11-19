import type { KeepOrRemove, Transform } from "@r4pm/client";
import { type Option, OptionMenu } from "@r4pm/components";
import { Flex, SegmentedControl, Text, TextField } from "@r4pm/components/ui";
import { ItemCheckboxList } from "./shared";

/** Keep or remove the checked items of a list (activities, object types). */
function KeepRemoveList({
  mode,
  onMode,
  hint,
  items,
  selected,
  onSelect,
  counts,
  activityColors,
}: {
  mode: KeepOrRemove;
  onMode: (m: KeepOrRemove) => void;
  hint?: string;
  items: string[];
  selected: string[];
  onSelect: (s: string[]) => void;
  counts?: Record<string, number>;
  activityColors: boolean;
}) {
  return (
    <Flex direction="column" gap="3">
      <SegmentedControl.Root
        size="1"
        value={mode}
        onValueChange={(v) => onMode(v as KeepOrRemove)}
        style={{ alignSelf: "flex-start" }}
      >
        <SegmentedControl.Item value="Keep">Keep</SegmentedControl.Item>
        <SegmentedControl.Item value="Remove">Remove</SegmentedControl.Item>
      </SegmentedControl.Root>
      {hint && (
        <Text size="2" color="gray">
          {hint}
        </Text>
      )}
      <ItemCheckboxList
        allItems={items}
        selectedItems={selected}
        onSelectionChange={onSelect}
        useActivityColors={activityColors}
        counts={counts}
      />
    </Flex>
  );
}

export function FilterActivitiesEditor({
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
    <KeepRemoveList
      mode={transform.mode}
      onMode={(mode) => onChange({ ...transform, mode })}
      hint={
        transform.mode === "Keep"
          ? "Only keep events with selected activities:"
          : "Remove events with selected activities:"
      }
      items={activities}
      selected={transform.activities}
      onSelect={(activities) => onChange({ ...transform, activities })}
      counts={counts}
      activityColors
    />
  );
}

export function FilterObjectTypesEditor({
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
    <KeepRemoveList
      mode={transform.mode}
      onMode={(mode) => onChange({ ...transform, mode })}
      items={objectTypes}
      selected={transform.object_types}
      onSelect={(object_types) => onChange({ ...transform, object_types })}
      counts={counts}
      activityColors={false}
    />
  );
}

const ALL = "__all__";
const parseCount = (v: string) => (v === "" ? null : Math.max(0, parseInt(v, 10) || 0));

/** A min/max count of related items, optionally of one type. */
function RelatedCountEditor({
  description,
  min,
  max,
  onRange,
  ofType,
  onOfType,
  typeLabel,
  types,
}: {
  description: string;
  min?: number | null;
  max?: number | null;
  onRange: (min: number | null, max: number | null) => void;
  ofType?: string | null;
  onOfType: (t: string | null) => void;
  typeLabel: string;
  types: string[];
}) {
  const options: Option<string>[] = [
    { value: ALL, label: `All ${typeLabel}s`, description: "Count every related item" },
    ...types.map((t) => ({ value: t, label: t })),
  ];
  const field = (label: string, value: number | null | undefined, set: (v: number | null) => void) => (
    <Flex direction="column" gap="1">
      <Text size="1" color="gray">
        {label}
      </Text>
      <TextField.Root
        size="2"
        type="number"
        min={0}
        style={{ width: 96 }}
        placeholder="any"
        value={value != null ? String(value) : ""}
        onChange={(e) => set(parseCount(e.currentTarget.value))}
      />
    </Flex>
  );
  return (
    <Flex direction="column" gap="3">
      <Text size="2" color="gray">
        {description}
      </Text>
      <Flex gap="3" align="end" wrap="wrap">
        {field("At least", min, (v) => onRange(v, max ?? null))}
        {field("At most", max, (v) => onRange(min ?? null, v))}
        <OptionMenu
          label={`Of ${typeLabel}`}
          value={ofType ?? ALL}
          options={options}
          onChange={(v) => onOfType(v === ALL ? null : v)}
        />
      </Flex>
    </Flex>
  );
}

export function FilterMinRelatedEventsEditor({
  transform,
  onChange,
  activities,
}: {
  transform: Extract<Transform, { type: "FilterMinRelatedEvents" }>;
  onChange: (t: Transform) => void;
  activities: string[];
}) {
  return (
    <RelatedCountEditor
      description="Remove objects whose related event count falls outside the range."
      min={transform.min_events}
      max={transform.max_events}
      onRange={(min_events, max_events) => onChange({ ...transform, min_events, max_events })}
      ofType={transform.of_type}
      onOfType={(of_type) => onChange({ ...transform, of_type })}
      typeLabel="event type"
      types={activities}
    />
  );
}

export function FilterMinRelatedObjectsEditor({
  transform,
  onChange,
  objectTypes,
}: {
  transform: Extract<Transform, { type: "FilterMinRelatedObjects" }>;
  onChange: (t: Transform) => void;
  objectTypes: string[];
}) {
  return (
    <RelatedCountEditor
      description="Remove events whose related object count falls outside the range."
      min={transform.min_objects}
      max={transform.max_objects}
      onRange={(min_objects, max_objects) => onChange({ ...transform, min_objects, max_objects })}
      ofType={transform.of_type}
      onOfType={(of_type) => onChange({ ...transform, of_type })}
      typeLabel="object type"
      types={objectTypes}
    />
  );
}
