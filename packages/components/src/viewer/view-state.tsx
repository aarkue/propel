import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

/** Host-provided bag of persisted viewer display settings + a writer; with no provider,
 *  {@link useViewSetting} degrades to plain `useState`. */
interface ViewStateContextValue {
  viewState: Record<string, unknown> | undefined;
  onViewStateChange: ((next: Record<string, unknown>) => void) | undefined;
}

const ViewStateContext = createContext<ViewStateContextValue>({
  viewState: undefined,
  onViewStateChange: undefined,
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
  const value = useMemo(() => ({ viewState, onViewStateChange }), [viewState, onViewStateChange]);
  return <ViewStateContext.Provider value={value}>{children}</ViewStateContext.Provider>;
}

/** Drop-in for `useState(initial)` that persists in the host view-state when one is provided. */
export function useViewSetting<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const { viewState, onViewStateChange } = useContext(ViewStateContext);
  const [local, setLocal] = useState<T>(() => (viewState?.[key] as T | undefined) ?? initial);
  if (!onViewStateChange) return [local, setLocal];
  const value = (viewState?.[key] as T | undefined) ?? initial;
  const set: Dispatch<SetStateAction<T>> = (next) => {
    const resolved = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
    onViewStateChange({ ...viewState, [key]: resolved });
  };
  return [value, set];
}
