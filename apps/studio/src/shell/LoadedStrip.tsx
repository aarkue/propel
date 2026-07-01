import { Text } from "@r4pm/components/ui";
import { ArtifactChipStrip } from "./ArtifactChipStrip";
import { DatasetChipStrip } from "./DatasetChipStrip";

/** Top-bar strip of everything loaded: registry datasets and engine-owned artifacts, grouped. */
export function LoadedStrip() {
  return (
    <div className="flex items-center gap-3 min-w-0 flex-1">
      <div className="flex items-center gap-1.5 min-w-0">
        <Text size="1" color="gray" className="shrink-0">
          Datasets
        </Text>
        <DatasetChipStrip />
      </div>
      <div className="w-px h-5 bg-(--gray-a5) shrink-0" />
      <div className="flex items-center gap-1.5 min-w-0">
        <Text size="1" color="gray" className="shrink-0">
          Artifacts
        </Text>
        <ArtifactChipStrip />
      </div>
    </div>
  );
}
