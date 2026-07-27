import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect } from "react";
import type { RefObject } from "react";

export interface VirtualRow {
  index: number;
  start: number;
  size: number;
}

export interface UseVirtualRowsResult {
  virtualItems: VirtualRow[];
  totalSize: number;
  scrollToIndex: (index: number) => void;
}

/** Fixed-height windowing over a scroll container; markup-agnostic, the caller renders rows from
 *  `virtualItems` and sizes its scroll content to `totalSize`. */
export function useVirtualRows({
  count,
  rowHeight,
  scrollRef,
  overscan = 8,
  scrollMargin = 0,
}: {
  count: number;
  rowHeight: number;
  scrollRef: RefObject<HTMLElement | null>;
  overscan?: number;
  scrollMargin?: number;
}): UseVirtualRowsResult {
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    scrollMargin,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: Wanted side effect; We want to re-measure on rowHeight change as the virtualizer caches measurements and does not re-measure when it changes.
  useEffect(() => {
    virtualizer.measure();
  }, [virtualizer, rowHeight]);

  return {
    virtualItems: virtualizer.getVirtualItems().map((v) => ({
      index: v.index,
      start: v.start,
      size: v.size,
    })),
    totalSize: virtualizer.getTotalSize(),
    scrollToIndex: (index: number) => virtualizer.scrollToIndex(index),
  };
}
