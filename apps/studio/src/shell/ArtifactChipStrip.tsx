import toast from "react-hot-toast";
import { PiFileArrowDown, PiFlowArrow, PiTrash } from "react-icons/pi";
import { useArtifacts } from "../stores";
import { backend } from "../backends";
import { ioKindByName } from "../io-kinds";
import { openOutputAsPanel, sendArtifactToPipeline } from "../panels/pipeline-bridge";
import { ChipAction, ChipStrip, EntityChip } from "./chips";

/**
 * Horizontal strip of loaded-artifact chips (engine-stored, non-registry values, e.g. Petri nets).
 * Each chip's popover renames the artifact, opens a viewer, sends it to the pipeline, exports it, or
 * removes it. Mirrors `DatasetChipStrip`, swapping the registry actions for the artifact ones.
 */
export function ArtifactChipStrip({ variant }: { variant?: "scroll" | "wrap" }) {
  const artifacts = useArtifacts((s) => s.artifacts);
  return (
    <ChipStrip
      items={artifacts}
      emptyText="No artifacts loaded yet."
      variant={variant}
      renderChip={(a) => <ArtifactChip key={a.id} id={a.id} label={a.label} kind={a.kind} />}
    />
  );
}

function ArtifactChip({ id, label, kind }: { id: string; label: string; kind: string }) {
  const renameArtifact = useArtifacts((s) => s.renameArtifact);
  const formats = ioKindByName(kind)?.export_formats ?? [];

  const openViewer = async (close: () => void) => {
    close();
    try {
      const v = await backend.getArtifact(id);
      openOutputAsPanel(ioKindByName(kind)?.returnType ?? kind, v);
    } catch (e) {
      toast.error(`Open failed: ${String(e)}`);
    }
  };
  const runExport = async (ext: string, mime: string, close: () => void) => {
    close();
    try {
      const bytes = await backend.exportArtifact(id, ext);
      await backend.saveBytes(bytes, `${id}.${ext}`, mime);
    } catch (e) {
      toast.error(`Export failed: ${String(e)}`);
    }
  };
  const remove = async (close: () => void) => {
    close();
    useArtifacts.getState().removeArtifact(id);
    await backend.unloadArtifact(id);
  };

  return (
    <EntityChip
      id={id}
      label={label}
      kind={kind}
      testId={`artifact-chip-${id}`}
      onRename={(l) => renameArtifact(id, l)}
    >
      {(close) => (
        <>
          <ChipAction onClick={() => void openViewer(close)}>Open viewer</ChipAction>
          <ChipAction
            icon={<PiFlowArrow />}
            onClick={() => {
              close();
              void sendArtifactToPipeline({ id, kind, label });
            }}
          >
            Send to pipeline
          </ChipAction>
          {formats.map((f) => (
            <ChipAction
              key={`export-${f.extension}`}
              icon={<PiFileArrowDown />}
              onClick={() => void runExport(f.extension, f.mime, close)}
            >
              Export {f.extension.toUpperCase()}
            </ChipAction>
          ))}
          <ChipAction icon={<PiTrash />} danger onClick={() => void remove(close)}>
            Remove
          </ChipAction>
        </>
      )}
    </EntityChip>
  );
}
