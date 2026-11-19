/** How far a long call got: `done` of `total` units in `stage` (no `total` when unknown). */
export interface JobProgress {
  stage: string;
  done: number;
  total?: number | null;
}

/**
 * Options of a binding call. With `signal`, `onProgress` or `onPartial` the call runs as a job: the
 * engine reports its progress and partial results, and aborting `signal` cancels it, which rejects
 * the call with a {@link CancelledError}.
 */
export interface CallOptions {
  /** Deterministically names a minted result handle (pipeline intermediates). */
  outputName?: string;
  signal?: AbortSignal;
  onProgress?: (progress: JobProgress) => void;
  /** Partial results in the order the engine found them, in batches. */
  onPartial?: (values: unknown[]) => void;
}

/** A `job-update` event of the engine. */
export interface JobUpdate {
  job: string;
  progress?: JobProgress;
  partials?: unknown[];
}

/** The error text of a cancelled call, as every transport receives it. */
export const CANCELLED = "cancelled";

/** A call stopped because its signal was aborted. */
export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

export const isCancelled = (e: unknown): e is CancelledError => e instanceof CancelledError;

let counter = 0;
const newJobId = () => `job-${Date.now().toString(36)}-${(++counter).toString(36)}`;

/**
 * Runs calls as jobs for a transport: picks job ids, routes `job-update` events to their call, and
 * forwards an abort as `cancel(job)`.
 */
export function createJobRunner(transport: {
  listen: (handler: (update: JobUpdate) => void) => Promise<unknown>;
  cancel: (job: string) => Promise<void> | void;
}) {
  const handlers = new Map<string, (update: JobUpdate) => void>();
  let listening: Promise<unknown> | undefined;
  return async function run<T>(
    opts: CallOptions | undefined,
    call: (job: string | undefined) => Promise<T>,
  ): Promise<T> {
    const { signal, onProgress, onPartial } = opts ?? {};
    if (!signal && !onProgress && !onPartial) return call(undefined);
    if (signal?.aborted) throw new CancelledError();
    listening ??= transport
      .listen((u) => handlers.get(u.job)?.(u))
      .catch((e) => {
        listening = undefined;
        throw e;
      });
    await listening;
    if (signal?.aborted) throw new CancelledError();
    const job = newJobId();
    handlers.set(job, (u) => {
      if (u.partials?.length) onPartial?.(u.partials);
      if (u.progress) onProgress?.(u.progress);
    });
    const abort = async () => {
      try {
        await transport.cancel(job);
      } catch {
        // Then the call runs to its end, as if it had not been cancelled.
      }
    };
    signal?.addEventListener("abort", abort);
    try {
      return await call(job);
    } catch (e) {
      if (signal?.aborted || isCancelledMessage(e)) throw new CancelledError();
      throw e;
    } finally {
      handlers.delete(job);
      signal?.removeEventListener("abort", abort);
    }
  };
}

function isCancelledMessage(e: unknown): boolean {
  return e === CANCELLED || (e instanceof Error && e.message === CANCELLED);
}
