import { type ReactNode, useEffect, useState } from "react";
import { EmptyState, type EmptyStateProps } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { IndeterminateBar } from "./IndeterminateBar";
import { LoadingState } from "./LoadingState";

/** Minimal status shape. A TanStack Query result satisfies it structurally, so callers
 *  pass their query directly without this package importing react-query. */
export interface AsyncStatusLike<T> {
  isPending: boolean;
  isError: boolean;
  error?: unknown;
  data?: T | undefined;
  /** True during a background refetch while existing `data` is still shown. */
  isFetching?: boolean;
}

export type AsyncStateKind = "loading" | "error" | "empty" | "data";

/** Maps a status to the visual state to render. Timeout folds into "error" at the component level. */
export function resolveAsyncState<T>(
  status: AsyncStatusLike<T>,
  isEmpty?: (data: T) => boolean,
): AsyncStateKind {
  if (status.isError) return "error";
  if (status.data === undefined) return "loading";
  if (isEmpty?.(status.data)) return "empty";
  return "data";
}

export interface AsyncBoundaryProps<T> {
  status: AsyncStatusLike<T>;
  /** Render the resolved, non-empty data. */
  children: (data: T) => ReactNode;
  /** Treat present-but-empty data (e.g. `[]`) as the empty state. */
  isEmpty?: (data: T) => boolean;

  loadingLabel?: string;
  /** Replace the default spinner with a shape-aware skeleton, etc. */
  loading?: ReactNode;
  /** Show a calm hint after N ms of loading. Default 8000. Pass `null` to disable. */
  slowAfterMs?: number | null;

  /** Empty-state config, or a fully custom node. */
  emptyState?: EmptyStateProps | ReactNode;

  errorTitle?: string;
  /** Show a Retry button on error/timeout; also resets the timeout clock. */
  onRetry?: () => void;
  /** Hard-fail to an error state if still loading after this many ms. */
  timeoutMs?: number;

  /** Overlay a thin top bar during background refetches over existing data. Default true. */
  showFetchingBar?: boolean;
}

const isEmptyStateProps = (v: unknown): v is EmptyStateProps =>
  typeof v === "object" && v !== null && "title" in v;

/** Declarative async wrapper: maps a query-like status to the shared loading / error /
 *  empty / data states, with optional slow-hint, hard timeout, and refetch bar. */
export function AsyncBoundary<T>({
  status,
  children,
  isEmpty,
  loadingLabel,
  loading,
  slowAfterMs = 8000,
  emptyState,
  errorTitle,
  onRetry,
  timeoutMs,
  showFetchingBar = true,
}: AsyncBoundaryProps<T>) {
  const kind = resolveAsyncState(status, isEmpty);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (timeoutMs == null || kind !== "loading") {
      setTimedOut(false);
      return;
    }
    const t = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(t);
  }, [timeoutMs, kind]);

  const retry = onRetry
    ? () => {
        setTimedOut(false);
        onRetry();
      }
    : undefined;

  if (kind === "loading" && timedOut) {
    return (
      <ErrorState title={errorTitle ?? "Timed out"} message="This took too long to load." onRetry={retry} />
    );
  }
  if (kind === "loading") {
    return loading ? loading : <LoadingState label={loadingLabel} slowAfterMs={slowAfterMs ?? undefined} />;
  }
  if (kind === "error") {
    return <ErrorState error={status.error} title={errorTitle} onRetry={retry} />;
  }
  if (kind === "empty") {
    if (emptyState && !isEmptyStateProps(emptyState)) return <>{emptyState}</>;
    return (
      <EmptyState {...{ title: "Nothing to show", ...(isEmptyStateProps(emptyState) ? emptyState : {}) }} />
    );
  }

  const content = children(status.data as T);
  if (showFetchingBar && status.isFetching) {
    return (
      <div className="relative w-full h-full">
        <IndeterminateBar />
        {content}
      </div>
    );
  }
  return <>{content}</>;
}
