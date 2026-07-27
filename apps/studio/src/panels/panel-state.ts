import type { IDockviewPanelProps } from "dockview";
import { useCallback, useEffect, useRef, useState } from "react";

// Panel config lives in dockview `params`, captured into the session/.propel by toJSON()/fromJSON().

export function readPanelParam<T>(params: Record<string, unknown> | undefined, key: string, initial: T): T {
  return (params?.[key] as T | null | undefined) ?? initial;
}

// Editor drafts register their flush here so a switch/save drains pending edits before capturing the layout.
const pendingDraftFlushes = new Set<() => void>();
export function flushPendingDrafts(): void {
  for (const flush of [...pendingDraftFlushes]) flush();
}

export function datasetScopedValue<T>(
  stored: { forDataset: string; value: T } | null | undefined,
  datasetId: string,
  initial: T,
): T {
  return stored && stored.forDataset === datasetId ? stored.value : initial;
}

export interface DebouncedWriter<T> {
  schedule(value: T): void;
  flush(): void;
}

export function makeDebouncedWriter<T>(write: (value: T) => void, delayMs: number): DebouncedWriter<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { value: T } | null = null;
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending) {
      const { value } = pending;
      pending = null;
      write(value);
    }
  };
  const schedule = (value: T) => {
    pending = { value };
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  };
  return { schedule, flush };
}

// Read/write panel config through params. Each write serializes the layout + saves the session, so
// use for low-frequency config (dataset id, controls), not per-keystroke edits (see usePanelDraft).
export function usePanelState<T>(
  props: IDockviewPanelProps,
  key: string,
  initial: T,
): [T, (next: T) => void] {
  const value = readPanelParam(props.params, key, initial);
  // Pass only the changed key: dockview merges it, so siblings writing in the same tick don't clobber
  // each other via a stale full-params spread.
  const set = useCallback((next: T) => props.api.updateParameters({ [key]: next }), [props.api, key]);
  return [value, set];
}

// Panel config scoped to the active dataset (reads as `initial` for any other dataset). The scope id
// lives in a param VALUE (`forDataset`) so restore's id-remap rewrites it for churned derived ids.
export function useDatasetScopedState<T>(
  props: IDockviewPanelProps,
  key: string,
  datasetId: string,
  initial: T,
): [T, (next: T) => void] {
  const [stored, setStored] = usePanelState<{ forDataset: string; value: T } | null>(props, key, null);
  const value = datasetScopedValue(stored, datasetId, initial);
  const set = useCallback(
    (next: T) => setStored({ forDataset: datasetId, value: next }),
    [setStored, datasetId],
  );
  return [value, set];
}

// Local copy for snappy editing + debounced flush to params, for high-frequency editors where a serialize + save per keystroke is wasteful.
export function usePanelDraft<T>(
  props: IDockviewPanelProps,
  key: string,
  initial: T,
  delayMs = 400,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => readPanelParam(props.params, key, initial));
  // Latest api without re-creating the writer (which would drop a pending timer).
  const apiRef = useRef(props.api);
  apiRef.current = props.api;
  const writerRef = useRef<DebouncedWriter<T> | null>(null);
  if (writerRef.current === null) {
    writerRef.current = makeDebouncedWriter<T>((v) => apiRef.current.updateParameters({ [key]: v }), delayMs);
  }
  const writer = writerRef.current;
  const set = useCallback(
    (next: T) => {
      setValue(next);
      writer.schedule(next);
    },
    [writer],
  );
  useEffect(() => {
    const flush = () => writer.flush();
    pendingDraftFlushes.add(flush);
    return () => {
      pendingDraftFlushes.delete(flush);
      writer.flush();
    };
  }, [writer]);
  return [value, set];
}
