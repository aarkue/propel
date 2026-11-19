import type { RelabelRule, Transform } from "@r4pm/client";
import { Flex, Text } from "@r4pm/components/ui";

import { RelabelTable } from "./shared";

export function RelabelObjectTypesEditor({
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
