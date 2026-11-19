import { useEffect } from "react";
import { DatasetSelector } from "@r4pm/components";
import { Flex, Text } from "@r4pm/components/ui";
import { useDatasets } from "../../stores";
import { DiscoverModelButton, type ModelSource } from "./DiscoverModelButton";

/** Picks a saved model of `kind`, with a button that opens a panel making one. Without a
 *  loaded pick, it follows the newest saved model, also one saved after the panel opened. */
export function SavedModelPicker({
  kind,
  value,
  onChange,
  datasetId,
  label,
  empty,
  discover,
}: {
  kind: string;
  value: string | null;
  onChange: (id: string) => void;
  datasetId: string;
  label: string;
  empty: string;
  /** The panels that make a model of `kind`, and the button label. */
  discover: { label: string; sources: ModelSource[] };
}) {
  const models = useDatasets((s) => s.datasets).filter((d) => d.kind === kind);
  const newest = models[models.length - 1]?.id;
  const selectedLoaded = !!value && models.some((n) => n.id === value);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-seed when the newest model changes
  useEffect(() => {
    if (!selectedLoaded && newest) onChange(newest);
  }, [newest]);

  return (
    <Flex align="center" gap="2" wrap="wrap">
      <Text size="1" color="gray">
        {label}
      </Text>
      {models.length > 0 ? (
        <div style={{ width: 220 }}>
          <DatasetSelector
            datasets={models.map((n) => ({ id: n.id, label: n.label, kind: n.kind }))}
            value={value}
            onChange={onChange}
            searchable
          />
        </div>
      ) : (
        <Text size="1">{empty}</Text>
      )}
      <DiscoverModelButton datasetId={datasetId} label={discover.label} sources={discover.sources} />
    </Flex>
  );
}
