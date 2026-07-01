import { Badge, Popover, Separator, Spinner, Text } from "@r4pm/components/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  PiCaretDown,
  PiCaretLeft,
  PiCaretRight,
  PiFileArrowDown,
  PiFlowArrow,
  PiTrash,
} from "react-icons/pi";
import { useDatasets } from "../stores";
import { exportFormatsFor } from "@r4pm/client";
import { backend } from "../backends";
import { sendToPipeline } from "../panels/pipeline-bridge";
import { colorForKind, labelForKind } from "./object-colors";

/**
 * Horizontal strip of loaded-dataset chips. Clicking a chip opens a popover with a one-click
 * export (split button, format menu), send-to-pipeline, and unload.
 */
export function DatasetChipStrip() {
  const datasets = useDatasets((s) => s.datasets);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Wanted side effect
  useEffect(() => {
    updateScrollState();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    el.addEventListener("scroll", updateScrollState);
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", updateScrollState);
    };
  }, [updateScrollState, datasets.length]);

  const scrollBy = (amount: number) => {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  };

  if (datasets.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-(--gray-10) pl-1">
        <Text size="1">No datasets loaded yet.</Text>
      </div>
    );
  }

  return (
    <div className="relative flex items-center min-w-0 flex-1">
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-200)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-(--color-panel-solid) rounded-full p-0.5 border border-(--gray-a6) shadow-sm hover:bg-(--gray-3)"
          aria-label="Scroll datasets left"
        >
          <PiCaretLeft size={14} />
        </button>
      )}
      <div ref={scrollRef} className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-1 min-w-0">
        {datasets.map((d) => (
          <DatasetChip key={d.id} id={d.id} label={d.label} kind={d.kind} />
        ))}
      </div>
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollBy(200)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-(--color-panel-solid) rounded-full p-0.5 border border-(--gray-a6) shadow-sm hover:bg-(--gray-3)"
          aria-label="Scroll datasets right"
        >
          <PiCaretRight size={14} />
        </button>
      )}
    </div>
  );
}

function DatasetChip({ id, label, kind }: { id: string; label: string; kind: string }) {
  const queryClient = useQueryClient();
  const color = colorForKind(kind);
  const [open, setOpen] = useState(false);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);

  const kinds = useQuery({
    queryKey: ["item-kinds"],
    queryFn: () => backend.listItemKinds(),
    enabled: open,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const formats = exportFormatsFor(kinds.data ?? [], kind);
  const defaultFormat = formats[0];

  const handleUnload = async () => {
    setOpen(false);
    useDatasets.getState().removeDataset(id);
    await backend.unloadObject(id);
    await queryClient.invalidateQueries();
  };

  const runExport = async (ext: string, mime: string) => {
    setFormatMenuOpen(false);
    setOpen(false);
    try {
      const bytes = await backend.exportObject(id, ext);
      await backend.saveBytes(bytes, `${id}.${ext}`, mime);
    } catch (e) {
      toast.error(`Export failed: ${String(e)}`);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <button
          type="button"
          data-testid={`dataset-chip-${id}`}
          className="group flex items-center gap-1.5 h-7 px-2 rounded-full border text-xs whitespace-nowrap cursor-pointer transition-colors shrink-0 border-[var(--gray-a6)] hover:border-[var(--indigo-8)] hover:bg-[var(--indigo-a2)]"
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: `var(--${color}-9)` }}
          />
          <span className="font-medium text-[var(--gray-12)] max-w-[160px] truncate">{label}</span>
          <Badge size="1" variant="soft" color={color} className="!py-0 !px-1 !text-[10px]">
            {labelForKind(kind)}
          </Badge>
        </button>
      </Popover.Trigger>
      <Popover.Content size="1" className="!p-0" maxWidth="280px">
        <div className="p-3">
          <div className="flex items-center gap-2 mb-1">
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
          {kinds.isLoading || !defaultFormat ? (
            <div className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-[var(--gray-10)]">
              <span className="text-[var(--gray-11)]">
                {kinds.isLoading ? <Spinner size="1" /> : <PiFileArrowDown />}
              </span>
              {kinds.isLoading ? "Loading formats..." : "No export formats available"}
            </div>
          ) : (
            <div className="flex items-stretch gap-px rounded hover:bg-[var(--gray-a2)]">
              <button
                type="button"
                onClick={() => runExport(defaultFormat.ext, defaultFormat.mime)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-l text-sm text-left text-[var(--gray-12)] hover:bg-[var(--gray-a3)] cursor-pointer flex-1 min-w-0"
                title={`Export as .${defaultFormat.ext}`}
              >
                <span className="text-[var(--gray-11)]">
                  <PiFileArrowDown />
                </span>
                <span className="truncate">Export as {defaultFormat.ext.toUpperCase()}</span>
                <span className="ml-auto text-[10px] font-mono text-[var(--gray-10)] shrink-0">
                  .{defaultFormat.ext}
                </span>
              </button>
              {formats.length > 1 && (
                <Popover.Root open={formatMenuOpen} onOpenChange={setFormatMenuOpen}>
                  <Popover.Trigger>
                    <button
                      type="button"
                      aria-label="Choose export format"
                      className="flex items-center justify-center w-7 rounded-r text-[var(--gray-11)] hover:bg-[var(--gray-a4)] cursor-pointer border-l border-[var(--gray-a5)]"
                    >
                      <PiCaretDown size={12} />
                    </button>
                  </Popover.Trigger>
                  <Popover.Content size="1" side="right" align="start" className="!p-1" maxWidth="240px">
                    <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-[var(--gray-10)]">
                      Export as
                    </div>
                    {formats.map((f) => (
                      <button
                        key={f.ext}
                        type="button"
                        onClick={() => runExport(f.ext, f.mime)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left cursor-pointer hover:bg-[var(--gray-a3)] text-[var(--gray-12)]"
                      >
                        <span className="truncate">{f.ext.toUpperCase()}</span>
                        <span className="ml-auto text-[10px] font-mono text-[var(--gray-10)] shrink-0">
                          .{f.ext}
                        </span>
                      </button>
                    ))}
                  </Popover.Content>
                </Popover.Root>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              sendToPipeline({ id, kind });
            }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left cursor-pointer text-[var(--gray-12)] hover:bg-[var(--gray-a3)]"
          >
            <span className="text-[var(--gray-11)]">
              <PiFlowArrow />
            </span>
            Send to pipeline
          </button>
          <button
            type="button"
            onClick={handleUnload}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left cursor-pointer text-[var(--red-11)] hover:bg-[var(--red-a3)]"
          >
            <span className="text-[var(--gray-11)]">
              <PiTrash />
            </span>
            Unload
          </button>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
