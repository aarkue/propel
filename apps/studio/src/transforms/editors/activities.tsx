import type { RelabelRule, RequiredOrForbidden, Transform } from "@r4pm/client";
import { Flex, SegmentedControl, Text } from "@r4pm/components/ui";

import { ItemCheckboxList, RelabelTable } from "./shared";

export function RelabelActivitiesEditor({
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

export function FilterStartEndEditor({
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

export function FilterTraceContainsEditor({
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
