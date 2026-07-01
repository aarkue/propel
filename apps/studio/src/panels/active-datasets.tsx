import { useDatasets } from "../stores";
import { DatasetSelector } from "@r4pm/components";
import { Flex, Text } from "@r4pm/components/ui";
import { type ReactNode, useState } from "react";

/**
 * Per-panel dataset selection.
 * Returns the chosen id plus a selector bar the panel renders above its content.
 */
export function useDatasetSelection(kind: string): { id: string | undefined; selector: ReactNode } {
  const datasets = useDatasets((s) => s.datasets);
  const ofKind = datasets.filter((d) => d.kind === kind);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const id = selectedId && ofKind.some((d) => d.id === selectedId) ? selectedId : ofKind[0]?.id;
  const selector: ReactNode = (
    <Flex
      align="center"
      gap="2"
      px="2"
      py="1"
      style={{ borderBottom: "1px solid var(--gray-5)", flex: "0 0 auto" }}
    >
      <Text size="1" color="gray">
        Dataset
      </Text>
      <div style={{ width: 220 }}>
        <DatasetSelector datasets={ofKind} value={id ?? null} onChange={setSelectedId} searchable />
      </div>
    </Flex>
  );
  return { id, selector };
}
