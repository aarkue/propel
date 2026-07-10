import { Popover, Spinner } from "@r4pm/components/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import toast from "react-hot-toast";
import { PiCaretDown, PiFileArrowDown, PiFlowArrow, PiTrash } from "react-icons/pi";
import { useDatasets } from "../stores";
import { exportFormatsFor } from "@r4pm/client";
import { backend } from "../backends";
import { sendToPipeline } from "../panels/pipeline-bridge";
import { ChipAction, ChipStrip, EntityChip } from "./chips";

/**
 * Horizontal strip of loaded-dataset chips. Each chip's popover renames the dataset, exports it
 * (split button + format menu), sends it to the pipeline, or unloads it.
 */
export function DatasetChipStrip({ variant }: { variant?: "scroll" | "wrap" }) {
  const datasets = useDatasets((s) => s.datasets);
  return (
    <ChipStrip
      items={datasets}
      emptyText="No datasets loaded yet."
      variant={variant}
      renderChip={(d) => <DatasetChip key={d.id} id={d.id} label={d.label} kind={d.kind} />}
    />
  );
}

function DatasetChip({ id, label, kind }: { id: string; label: string; kind: string }) {
  const queryClient = useQueryClient();
  const renameDataset = useDatasets((s) => s.renameDataset);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);

  const kinds = useQuery({
    queryKey: ["item-kinds"],
    queryFn: () => backend.listItemKinds(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const formats = exportFormatsFor(kinds.data ?? [], kind);
  const defaultFormat = formats[0];

  const handleUnload = async (close: () => void) => {
    close();
    useDatasets.getState().removeDataset(id);
    await backend.unloadObject(id);
    await queryClient.invalidateQueries();
  };

  const runExport = async (ext: string, mime: string, close: () => void) => {
    setFormatMenuOpen(false);
    close();
    try {
      const bytes = await backend.exportObject(id, ext);
      await backend.saveBytes(bytes, `${id}.${ext}`, mime);
    } catch (e) {
      toast.error(`Export failed: ${String(e)}`);
    }
  };

  return (
    <EntityChip
      id={id}
      label={label}
      kind={kind}
      testId={`dataset-chip-${id}`}
      onRename={(l) => renameDataset(id, l)}
    >
      {(close) => (
        <>
          {kinds.isLoading || !defaultFormat ? (
            <div className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-(--gray-10)">
              <span className="text-(--gray-11)">
                {kinds.isLoading ? <Spinner size="1" /> : <PiFileArrowDown />}
              </span>
              {kinds.isLoading ? "Loading formats..." : "No export formats available"}
            </div>
          ) : (
            <div className="flex items-stretch gap-px rounded hover:bg-(--gray-a2)">
              <button
                type="button"
                onClick={() => runExport(defaultFormat.ext, defaultFormat.mime, close)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-l text-sm text-left text-(--gray-12) hover:bg-(--gray-a3) cursor-pointer flex-1 min-w-0"
                title={`Export as .${defaultFormat.ext}`}
              >
                <span className="text-(--gray-11)">
                  <PiFileArrowDown />
                </span>
                <span className="truncate">Export as {defaultFormat.ext.toUpperCase()}</span>
                <span className="ml-auto text-[10px] font-mono text-(--gray-10) shrink-0">
                  .{defaultFormat.ext}
                </span>
              </button>
              {formats.length > 1 && (
                <Popover.Root open={formatMenuOpen} onOpenChange={setFormatMenuOpen}>
                  <Popover.Trigger>
                    <button
                      type="button"
                      aria-label="Choose export format"
                      className="flex items-center justify-center w-7 rounded-r text-(--gray-11) hover:bg-(--gray-a4) cursor-pointer border-l border-(--gray-a5)"
                    >
                      <PiCaretDown size={12} />
                    </button>
                  </Popover.Trigger>
                  <Popover.Content size="1" side="right" align="start" className="p-1!" maxWidth="240px">
                    <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-(--gray-10)">
                      Export as
                    </div>
                    {formats.map((f) => (
                      <button
                        key={f.ext}
                        type="button"
                        onClick={() => runExport(f.ext, f.mime, close)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left cursor-pointer hover:bg-(--gray-a3) text-(--gray-12)"
                      >
                        <span className="truncate">{f.ext.toUpperCase()}</span>
                        <span className="ml-auto text-[10px] font-mono text-(--gray-10) shrink-0">
                          .{f.ext}
                        </span>
                      </button>
                    ))}
                  </Popover.Content>
                </Popover.Root>
              )}
            </div>
          )}
          <ChipAction
            icon={<PiFlowArrow />}
            onClick={() => {
              close();
              sendToPipeline({ id, kind });
            }}
          >
            Send to pipeline
          </ChipAction>
          <ChipAction icon={<PiTrash />} danger onClick={() => void handleUnload(close)}>
            Unload
          </ChipAction>
        </>
      )}
    </EntityChip>
  );
}
