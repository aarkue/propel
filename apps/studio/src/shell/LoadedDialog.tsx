import { Badge, Dialog, Separator, Text } from "@r4pm/components/ui";
import { useArtifacts, useDatasets } from "../stores";
import { ArtifactChipStrip } from "./ArtifactChipStrip";
import { DatasetChipStrip } from "./DatasetChipStrip";

/**
 * Roomy, wrapping view of everything loaded (datasets + artifacts). The primary way to reach the
 * chips on mobile (where the top-bar strip is hidden) and an optional overflow view on desktop.
 * Reuses the same chips as the strip, so rename / export / unload all work identically here.
 */
export function LoadedDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const datasetCount = useDatasets((s) => s.datasets.length);
  const artifactCount = useArtifacts((s) => s.artifacts.length);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content maxWidth="720px">
        <Dialog.Title>Loaded data</Dialog.Title>
        <Dialog.Description size="1" color="gray">
          Rename, export, or unload any loaded dataset or artifact.
        </Dialog.Description>

        <div className="flex flex-col gap-4 mt-3">
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Text size="2" weight="medium">
                Datasets
              </Text>
              <Badge size="1" variant="soft" color="gray">
                {datasetCount}
              </Badge>
            </div>
            <DatasetChipStrip variant="wrap" />
          </section>

          <Separator size="4" />

          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Text size="2" weight="medium">
                Artifacts
              </Text>
              <Badge size="1" variant="soft" color="gray">
                {artifactCount}
              </Badge>
            </div>
            <ArtifactChipStrip variant="wrap" />
          </section>
        </div>

        <div className="flex justify-end mt-4">
          <Dialog.Close>
            <button
              type="button"
              className="h-8 px-3 rounded text-sm text-(--gray-12) hover:bg-(--gray-a3) cursor-pointer"
            >
              Close
            </button>
          </Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
