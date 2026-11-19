import type { CallOptions, JobProgress } from "@r4pm/client";
import { useCallback, useEffect, useRef, useState } from "react";

/** What a running job reported so far. */
export interface JobState {
  progress: JobProgress | null;
  /** A partial result the caller built from streamed values, shown while the job runs. */
  partial: unknown;
}

/** Hooks one run hands to its calls: `job` for `callBinding`, `showPartial` for partial results. */
export interface JobHooks {
  job: CallOptions;
  showPartial: (data: unknown) => void;
}

const EMPTY: JobState = { progress: null, partial: undefined };

/**
 * The progress and partial result of the latest run, updated at most once per frame. `start` hands
 * out the hooks of a new run; reports of earlier runs are dropped.
 */
export function useJobProgress() {
  const [state, setState] = useState<JobState>(EMPTY);
  const run = useRef(0);
  const pending = useRef<Partial<JobState> | null>(null);
  const frame = useRef<number | null>(null);

  const flush = useCallback(() => {
    frame.current = null;
    const patch = pending.current;
    pending.current = null;
    if (patch) setState((s) => ({ ...s, ...patch }));
  }, []);

  const push = useCallback(
    (id: number, patch: Partial<JobState>) => {
      if (id !== run.current) return;
      pending.current = { ...pending.current, ...patch };
      frame.current ??= requestAnimationFrame(flush);
    },
    [flush],
  );

  const reset = useCallback(() => {
    run.current++;
    if (frame.current != null) cancelAnimationFrame(frame.current);
    frame.current = null;
    pending.current = null;
    setState(EMPTY);
  }, []);

  const start = useCallback(
    (signal?: AbortSignal): JobHooks => {
      reset();
      const id = run.current;
      return {
        job: { signal, onProgress: (progress) => push(id, { progress }) },
        showPartial: (partial) => push(id, { partial }),
      };
    },
    [reset, push],
  );

  useEffect(() => () => void (frame.current != null && cancelAnimationFrame(frame.current)), []);

  return { ...state, start, reset };
}
