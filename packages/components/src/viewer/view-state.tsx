import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

/** Host-provided bag of persisted viewer display settings + a writer; with no provider,
 *  {@link useViewSetting} degrades to plain `useState`. */
interface ViewStateContextValue {
  viewState: Record<string, unknown> | undefined;
  /** Merges into the latest state, including writes the host has not echoed back yet. */
  setKey: ((key: string, value: unknown) => void) | undefined;
  /** Latest value of `key`, including not yet echoed writes. */
  latest: (key: string) => unknown;
}

const ViewStateContext = createContext<ViewStateContextValue>({
  viewState: undefined,
  setKey: undefined,
  latest: () => undefined,
});

export function ViewStateProvider({
  viewState,
  onViewStateChange,
  children,
}: {
  viewState?: Record<string, unknown>;
  onViewStateChange?: (next: Record<string, unknown>) => void;
  children: ReactNode;
}) {
  // Two setters in one handler (e.g. pick a variant, clear its case) both run before the host
  // re-renders. Spreading the rendered `viewState` would let the second drop the first.
  const pending = useRef(viewState);
  const seen = useRef(viewState);
  if (seen.current !== viewState) {
    seen.current = viewState;
    pending.current = viewState;
  }
  const value = useMemo<ViewStateContextValue>(
    () => ({
      viewState,
      setKey: onViewStateChange
        ? (key, v) => {
            pending.current = { ...pending.current, [key]: v };
            onViewStateChange(pending.current);
          }
        : undefined,
      latest: (key) => pending.current?.[key],
    }),
    [viewState, onViewStateChange],
  );
  return <ViewStateContext.Provider value={value}>{children}</ViewStateContext.Provider>;
}

/** Drop-in for `useState(initial)` that persists in the host view-state when one is provided. */
export function useViewSetting<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const { viewState, setKey, latest } = useContext(ViewStateContext);
  const [local, setLocal] = useState<T>(() => (viewState?.[key] as T | undefined) ?? initial);
  if (!setKey) return [local, setLocal];
  const value = (viewState?.[key] as T | undefined) ?? initial;
  const set: Dispatch<SetStateAction<T>> = (next) => {
    const prev = (latest(key) as T | undefined) ?? initial;
    setKey(key, typeof next === "function" ? (next as (prev: T) => T)(prev) : next);
  };
  return [value, set];
}
