import { useCallback, useEffect, useRef, useState } from "react";

export interface PagedPage<T> {
  /** Rows matching the query, across all pages. */
  total: number;
  rows: T[];
}

export interface PagedListRequest {
  query: string;
  offset: number;
  limit: number;
}

/** A searchable list whose rows are fetched a page at a time, see {@link usePagedList}. */
export interface PagedList<T> {
  /** Search text as typed (requests use it after a short debounce). */
  query: string;
  setQuery: (query: string) => void;
  /** Matching rows, or null until the first page for the current query arrives. */
  total: number | null;
  /** The row at `index`, or undefined while its page is loading. */
  itemAt: (index: number) => T | undefined;
  /** Ask for the rows in `[start, end)`, e.g. the visible window of a virtual list. */
  requestRange: (start: number, end: number) => void;
  loading: boolean;
  error: unknown;
}

/**
 * Page cache for a host-filtered list (search and paging happen in `load`, e.g. an engine call).
 * Pages load on demand via `requestRange`, the query is debounced, responses for an older query or
 * older `deps` are dropped, and changing either clears the cache.
 */
export function usePagedList<T>({
  load,
  deps,
  pageSize = 100,
  debounceMs = 200,
}: {
  load: (req: PagedListRequest) => Promise<PagedPage<T>>;
  /** Anything else `load` depends on (a sort, a dataset). A change refetches from scratch. */
  deps: readonly unknown[];
  pageSize?: number;
  debounceMs?: number;
}): PagedList<T> {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [, setVersion] = useState(0);
  const pages = useRef(new Map<number, T[]>());
  const pending = useRef(new Set<number>());
  // Failed pages wait for a new query or `deps`. Otherwise every render that requests the visible
  // range would fire the failing load again.
  const failed = useRef(new Set<number>());
  const generation = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), query ? debounceMs : 0);
    return () => clearTimeout(id);
  }, [query, debounceMs]);

  const fetchPage = useCallback(
    (page: number) => {
      if (pages.current.has(page) || pending.current.has(page) || failed.current.has(page)) return;
      pending.current.add(page);
      const gen = generation.current;
      loadRef
        .current({ query: debounced, offset: page * pageSize, limit: pageSize })
        .then((res) => {
          if (gen !== generation.current) return;
          pages.current.set(page, res.rows);
          setTotal(res.total);
          setError(null);
        })
        .catch((e) => {
          if (gen !== generation.current) return;
          failed.current.add(page);
          setError(e);
        })
        .finally(() => {
          if (gen !== generation.current) return;
          pending.current.delete(page);
          setVersion((v) => v + 1);
        });
    },
    [debounced, pageSize],
  );

  // `deps` is the caller's invalidation key: any change starts over from page 0.
  useEffect(() => {
    generation.current++;
    pages.current = new Map();
    pending.current = new Set();
    failed.current = new Set();
    setTotal(null);
    setVersion((v) => v + 1);
    fetchPage(0);
  }, [fetchPage, ...deps]);

  const requestRange = useCallback(
    (start: number, end: number) => {
      const last = Math.max(start, end - 1);
      for (let p = Math.floor(start / pageSize); p <= Math.floor(last / pageSize); p++) fetchPage(p);
    },
    [fetchPage, pageSize],
  );

  const itemAt = (index: number) => pages.current.get(Math.floor(index / pageSize))?.[index % pageSize];

  return {
    query,
    setQuery,
    total,
    itemAt,
    requestRange,
    loading: pending.current.size > 0 || query !== debounced,
    error,
  };
}
