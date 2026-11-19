import { type RefObject, useCallback, useEffect, useMemo, useState } from "react";
import { useIsDarkMode } from "../viewer/dark-mode";

/**
 * The client size of the element the returned `ref` is attached to. A callback ref, so the observer
 * also attaches when the element mounts after the first render or is replaced.
 */
export function useElementSize<T extends HTMLElement>() {
  const [element, ref] = useState<T | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!element) return;
    const ro = new ResizeObserver(() =>
      setSize({ width: element.clientWidth, height: element.clientHeight }),
    );
    ro.observe(element);
    return () => ro.disconnect();
  }, [element]);
  return { ref, element, size };
}

/**
 * What the promise of `run` settles to; a new `run` (memoize it on its inputs) starts over. `value`
 * and `error` belong to the current `run` only, so a result is never paired with newer inputs;
 * `latest` keeps the last value of any run for views that can show it while the next one runs.
 */
export function useAsyncResult<T>(run: (() => Promise<T>) | null) {
  const [settled, setSettled] = useState<{
    run: unknown;
    value: T | null;
    error: unknown;
    latest: T | null;
  } | null>(null);
  useEffect(() => {
    if (!run) return;
    let alive = true;
    run().then(
      (value) => alive && setSettled({ run, value, error: null, latest: value }),
      (error) => alive && setSettled((s) => ({ run, value: null, error, latest: s?.latest ?? null })),
    );
    return () => {
      alive = false;
    };
  }, [run]);
  const current = settled?.run === run ? settled : null;
  return { value: current?.value ?? null, error: current?.error ?? null, latest: settled?.latest ?? null };
}

/** State that goes back to `initial` whenever `key` changes (compared with `Object.is`). */
export function useKeyedState<T>(key: unknown, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState({ key, value: initial });
  const value = Object.is(state.key, key) ? state.value : initial;
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setState((s) => {
        const prev = Object.is(s.key, key) ? s.value : initial;
        return { key, value: typeof next === "function" ? (next as (prev: T) => T)(prev) : next };
      }),
    [key, initial],
  );
  return [value, set];
}

/**
 * Any CSS color as the canvas takes it: a canvas style cannot read `var()`, so colors resolve through
 * the computed style of `ref`'s element, again after a theme change.
 */
export function useCanvasColors(ref: RefObject<HTMLElement | null>) {
  const dark = useIsDarkMode();
  // biome-ignore lint/correctness/useExhaustiveDependencies: the cache holds one theme's colors
  return useMemo(() => {
    const cache = new Map<string, string>();
    return (color: string) => {
      let c = cache.get(color);
      const el = ref.current;
      if (c === undefined && el) {
        el.style.color = color;
        c = getComputedStyle(el).color || color;
        el.style.color = "";
        cache.set(color, c);
      }
      return c ?? color;
    };
  }, [ref, dark]);
}
