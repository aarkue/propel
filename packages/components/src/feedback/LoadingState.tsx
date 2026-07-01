import { Spinner, Text } from "@r4pm/components/ui";
import { useEffect, useState } from "react";
import { IndeterminateBar } from "./IndeterminateBar";

export interface LoadingStateProps {
  /** Short status line under the spinner, e.g. "discovering DFG". */
  label?: string;
  /** Thin indeterminate bar pinned to the top edge. On by default. */
  topBar?: boolean;
  /** After this many ms still loading, reveal `slowHint`. Omit to never show it. */
  slowAfterMs?: number;
  /** Calm reassurance shown once `slowAfterMs` elapses. */
  slowHint?: string;
  className?: string;
}

const DEFAULT_SLOW_HINT = "Still working, large datasets can take a while.";

/** Universal loading indicator: centered spinner + optional label, an optional top
 *  indeterminate bar, and a calm slow-hint that fades in only if the wait runs long. */
export function LoadingState({
  label,
  topBar = true,
  slowAfterMs,
  slowHint = DEFAULT_SLOW_HINT,
  className,
}: LoadingStateProps) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (slowAfterMs == null) return;
    setSlow(false);
    const t = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(t);
  }, [slowAfterMs]);

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-3 w-full h-full min-h-[8rem] p-6 ${className ?? ""}`}
      role="status"
      aria-live="polite"
    >
      {topBar && <IndeterminateBar />}
      <Spinner size="3" />
      {label && (
        <Text size="2" color="gray">
          {label}
        </Text>
      )}
      {slow && (
        <Text size="1" color="gray" className="opacity-70 max-w-[22rem] text-center">
          {slowHint}
        </Text>
      )}
    </div>
  );
}
