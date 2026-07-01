import { Badge, Popover, Separator, Text } from "@r4pm/components/ui";
import { useState } from "react";
import toast from "react-hot-toast";
import { PiFileArrowDown, PiFlowArrow, PiTrash } from "react-icons/pi";
import { useArtifacts } from "../stores";
import { backend } from "../backends";
import { ioKindByName } from "../io-kinds";
import { openOutputAsPanel, sendArtifactToPipeline } from "../panels/pipeline-bridge";
import { colorForKind, labelForKind } from "./object-colors";

/**
 * Horizontal strip of loaded-artifact chips (engine-stored, non-registry values, e.g. Petri nets).
 * Each chip's popover opens a viewer, exports the value back to a file, or removes it.
 * Mirrors `DatasetChipStrip`, swapping the registry actions for the artifact ones.
 */
export function ArtifactChipStrip() {
  const artifacts = useArtifacts((s) => s.artifacts);
  if (artifacts.length === 0) {
    return (
      <Text size="1" color="gray">
        No artifacts loaded yet.
      </Text>
    );
  }
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-1 min-w-0">
      {artifacts.map((a) => (
        <ArtifactChip key={a.id} id={a.id} label={a.label} kind={a.kind} />
      ))}
    </div>
  );
}

function ArtifactChip({ id, label, kind }: { id: string; label: string; kind: string }) {
  const color = colorForKind(kind);
  const [open, setOpen] = useState(false);
  const formats = ioKindByName(kind)?.export_formats ?? [];

  const openViewer = async () => {
    setOpen(false);
    try {
      const v = await backend.getArtifact(id);
      openOutputAsPanel(ioKindByName(kind)?.returnType ?? kind, v);
    } catch (e) {
      toast.error(`Open failed: ${String(e)}`);
    }
  };
  const runExport = async (ext: string, mime: string) => {
    setOpen(false);
    try {
      const bytes = await backend.exportArtifact(id, ext);
      await backend.saveBytes(bytes, `${id}.${ext}`, mime);
    } catch (e) {
      toast.error(`Export failed: ${String(e)}`);
    }
  };
  const remove = async () => {
    setOpen(false);
    useArtifacts.getState().removeArtifact(id);
    await backend.unloadArtifact(id);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <button
          type="button"
          data-testid={`artifact-chip-${id}`}
          className="group flex items-center gap-1.5 h-7 px-2 rounded-full border text-xs whitespace-nowrap cursor-pointer transition-colors shrink-0 border-(--gray-a6) hover:border-(--indigo-8) hover:bg-(--indigo-a2)"
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: `var(--${color}-9)` }}
          />
          <span className="font-medium text-(--gray-12) max-w-40 truncate">{label}</span>
          <Badge size="1" variant="soft" color={color} className="py-0! px-1! text-[10px]!">
            {labelForKind(kind)}
          </Badge>
        </button>
      </Popover.Trigger>
      <Popover.Content size="1" className="p-0!" maxWidth="280px">
        <div className="p-3">
          <div className="flex items-center gap-2">
            <Badge size="1" variant="soft" color={color}>
              {labelForKind(kind)}
            </Badge>
            <Text size="2" weight="medium" className="truncate">
              {label}
            </Text>
          </div>
        </div>
        <Separator size="4" />
        <div className="p-1">
          <button
            key="open"
            type="button"
            onClick={openViewer}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left cursor-pointer text-(--gray-12) hover:bg-(--gray-3)"
          >
            Open viewer
          </button>
          <button
            key="pipeline"
            type="button"
            onClick={() => {
              setOpen(false);
              void sendArtifactToPipeline({ id, kind, label });
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left cursor-pointer text-(--gray-12) hover:bg-(--gray-3)"
          >
            <PiFlowArrow /> Send to pipeline
          </button>
          {formats.map((f) => (
            <button
              key={`export-${f.extension}`}
              type="button"
              onClick={() => runExport(f.extension, f.mime)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left cursor-pointer text-(--gray-12) hover:bg-(--gray-3)"
            >
              <PiFileArrowDown /> Export {f.extension.toUpperCase()}
            </button>
          ))}
          <button
            key="remove"
            type="button"
            onClick={remove}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left cursor-pointer text-(--red-11) hover:bg-(--red-a3)"
          >
            <PiTrash /> Remove
          </button>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
