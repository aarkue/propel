import { IconButton, Popover, Text, TextField } from "@radix-ui/themes";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { PiCaretDown, PiCaretLeft, PiCaretRight, PiCheck, PiMagnifyingGlass } from "react-icons/pi";
import type { PagedList } from "./use-paged-list";

/** Whether every whitespace-separated token of `query` occurs in `text`, ignoring case. */
export function matchesQuery(text: string, query: string): boolean {
  const hay = text.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

export interface SearchSelectRowState {
  selected: boolean;
  highlighted: boolean;
  /** Current search text, e.g. to highlight what matched. */
  query: string;
}

export interface SearchSelectProps<T> {
  /** All items, filtered here. Omit when `list` is given. */
  items?: readonly T[];
  /** Host-filtered, paged rows (see `usePagedList`) in place of `items`. Rows load as they scroll
   *  into view. */
  list?: PagedList<T>;
  getKey: (item: T) => string;
  /** Selected key, or null for none. */
  value: string | null;
  /** `index` is the item's position among the current (filtered) rows, -1 for the none row. */
  onChange: (key: string | null, item: T | null, index: number) => void;
  /** The selected item when it may not be among the loaded rows (with `list`). */
  selectedItem?: T | null;
  /** Prev/next for `list` mode, where the order lives with the host. */
  onStep?: (delta: -1 | 1) => void;
  canStep?: { prev: boolean; next: boolean };
  /** Rows have a fixed height (`rowHeight`). */
  renderItem: (item: T, state: SearchSelectRowState) => ReactNode;
  /** Trigger content for the selected item (null when nothing is selected). Defaults to `renderItem`. */
  renderValue?: (item: T | null) => ReactNode;
  /** Text matched against the search tokens (all must occur, any order). */
  searchText?: (item: T) => string;
  /** Custom matcher instead of `searchText`: a score (higher ranks first, ties keep item order) or
   *  null to hide the item. Provide this or `searchText` to show the search field. */
  match?: (item: T, query: string) => number | null;
  searchPlaceholder?: string;
  /** Adds a first row that selects null, labelled with this content. */
  noneOption?: ReactNode;
  placeholder?: ReactNode;
  /** Prev/next buttons next to the trigger that step through `items` in order. */
  stepper?: boolean;
  /** Content above the list, e.g. a sort control. */
  header?: ReactNode;
  /** Content below the list, e.g. "showing the first 200". */
  footer?: ReactNode;
  emptyText?: ReactNode;
  rowHeight?: number;
  maxListHeight?: number;
  /** Defaults to the trigger width, at least 320px. */
  popoverWidth?: string;
  disabled?: boolean;
  "aria-label"?: string;
  /** Style applied to the trigger (to the trigger and its prev/next buttons with `stepper`). */
  style?: CSSProperties;
}

const NONE = Symbol("none");
type Row<T> = { item: T; key: string } | typeof NONE;

/**
 * Searchable single-select for rich rows (chips, bars, sparklines), virtualized for long lists.
 * Type to filter by tokens, Up/Down/PageUp/PageDown/Home/End to move, Enter to choose, Escape to
 * close. Opening highlights the selected row. Same ARIA pattern as {@link Combobox}.
 */
export function SearchSelect<T>({
  items = [],
  list,
  getKey,
  value,
  onChange,
  selectedItem,
  onStep,
  canStep,
  renderItem,
  renderValue,
  searchText,
  match,
  searchPlaceholder = "Search...",
  noneOption,
  placeholder = "Select...",
  stepper = false,
  header,
  footer,
  emptyText = "No matches",
  rowHeight = 36,
  maxListHeight = 320,
  popoverWidth = "max(var(--radix-popover-trigger-width), 320px)",
  disabled,
  "aria-label": ariaLabel,
  style,
}: SearchSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState("");
  const query = list ? list.query : localQuery;
  const setQuery = list ? list.setQuery : setLocalQuery;
  const [active, setActive] = useState(0);
  const listId = useId();
  // State, not a ref: the list mounts with the popover, and the virtualizer must re-render once it exists.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  const keyed = useMemo(() => items.map((item) => ({ item, key: getKey(item) })), [items, getKey]);
  const q = query.trim();
  const localHits = useMemo(() => {
    if (list || !q) return keyed;
    if (match) {
      return keyed
        .map((r, i) => ({ r, i, score: match(r.item, q) }))
        .filter((h): h is typeof h & { score: number } => h.score !== null)
        .sort((a, b) => b.score - a.score || a.i - b.i)
        .map((h) => h.r);
    }
    return searchText ? keyed.filter((r) => matchesQuery(searchText(r.item), q)) : keyed;
  }, [list, keyed, q, searchText, match]);
  const lead = noneOption != null && !q ? 1 : 0;
  const rowCount = lead + (list ? (list.total ?? 0) : localHits.length);
  /** undefined: a `list` row whose page is still loading. */
  const rowAt = (i: number): Row<T> | undefined => {
    if (i < lead) return NONE;
    if (!list) return localHits[i - lead];
    const item = list.itemAt(i - lead);
    return item === undefined ? undefined : { item, key: getKey(item) };
  };
  const searchable = !!(list || searchText || match);
  const activeClamped = Math.min(active, Math.max(0, rowCount - 1));
  const selectedIndex = list ? -1 : keyed.findIndex((r) => r.key === value);
  const selected = list ? (selectedItem ?? null) : selectedIndex >= 0 ? keyed[selectedIndex].item : null;

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollEl,
    estimateSize: () => rowHeight,
    initialRect: { width: 0, height: maxListHeight },
    overscan: 6,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run once the list element mounts, so opening scrolls to the selected row
  useEffect(() => {
    if (open && rowCount > 0) virtualizer.scrollToIndex(activeClamped, { align: "auto" });
  }, [open, scrollEl, activeClamped, rowCount, virtualizer]);

  const visible = virtualizer.getVirtualItems();
  const firstVisible = visible[0]?.index ?? 0;
  const lastVisible = visible[visible.length - 1]?.index ?? 0;
  // `list` is a new object every render. Its `requestRange` stays the same while the query does.
  const requestRange = list?.requestRange;
  useEffect(() => {
    if (open && requestRange)
      requestRange(Math.max(0, firstVisible - lead), Math.max(0, lastVisible + 1 - lead));
  }, [open, requestRange, firstVisible, lastVisible, lead]);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setQuery("");
      const lead = noneOption != null ? 1 : 0;
      setActive(selectedIndex >= 0 ? selectedIndex + lead : 0);
    }
    setOpen(next);
  };

  const commit = (i: number) => {
    const row = rowAt(i);
    if (row === undefined) return;
    if (row === NONE) onChange(null, null, -1);
    else onChange(row.key, row.item, i - lead);
    setOpen(false);
  };

  const page = Math.max(1, Math.floor(maxListHeight / rowHeight) - 1);
  const onKeyDown = (e: KeyboardEvent) => {
    const last = rowCount - 1;
    const move: Record<string, (a: number) => number> = {
      ArrowDown: (a) => Math.min(last, a + 1),
      ArrowUp: (a) => Math.max(0, a - 1),
      PageDown: (a) => Math.min(last, a + page),
      PageUp: (a) => Math.max(0, a - page),
      Home: () => 0,
      End: () => last,
    };
    // Home/End stay with the search field while there is text to move the caret through.
    if ((e.key === "Home" || e.key === "End") && query) return;
    if (move[e.key]) {
      e.preventDefault();
      setActive(move[e.key]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(activeClamped);
    }
  };

  const step = (delta: -1 | 1) => {
    if (list) return onStep?.(delta);
    const next = keyed[selectedIndex + delta] ?? (selectedIndex < 0 && delta > 0 ? keyed[0] : undefined);
    if (next) onChange(next.key, next.item, selectedIndex + delta);
  };
  const canPrev = list ? !!canStep?.prev : selectedIndex > 0;
  const canNext = list ? !!canStep?.next : selectedIndex < keyed.length - 1;

  const valueContent = renderValue
    ? renderValue(selected)
    : selected != null
      ? renderItem(selected, { selected: true, highlighted: false, query: "" })
      : null;

  const trigger = (
    <Popover.Trigger>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="rt-reset"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minWidth: 0,
          minHeight: 32,
          padding: "2px 8px",
          border: "1px solid var(--gray-a7)",
          borderRadius: "var(--radius-2)",
          background: "var(--color-surface)",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.6 : 1,
          textAlign: "left",
          ...(stepper ? { flex: 1 } : style),
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          {valueContent ?? (
            <Text size="2" color="gray">
              {value == null && noneOption != null ? noneOption : placeholder}
            </Text>
          )}
        </span>
        <PiCaretDown style={{ opacity: 0.6, flexShrink: 0 }} />
      </button>
    </Popover.Trigger>
  );

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      {stepper ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, ...style }}>
          <IconButton
            size="1"
            variant="soft"
            color="gray"
            disabled={disabled || !canPrev}
            onClick={() => step(-1)}
            aria-label="Previous"
            title="Previous"
          >
            <PiCaretLeft />
          </IconButton>
          {trigger}
          <IconButton
            size="1"
            variant="soft"
            color="gray"
            disabled={disabled || !canNext}
            onClick={() => step(1)}
            aria-label="Next"
            title="Next"
          >
            <PiCaretRight />
          </IconButton>
        </div>
      ) : (
        trigger
      )}
      <Popover.Content
        size="1"
        width={popoverWidth}
        maxWidth="calc(100vw - 16px)"
        style={{ padding: 6 }}
        onKeyDown={onKeyDown}
      >
        {searchable && (
          <TextField.Root
            size="2"
            variant="soft"
            autoFocus
            value={query}
            placeholder={searchPlaceholder}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={rowCount ? `${listId}-row-${activeClamped}` : undefined}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            style={{ marginBottom: 6 }}
          >
            <TextField.Slot>
              <PiMagnifyingGlass />
            </TextField.Slot>
          </TextField.Root>
        )}
        {header && <div style={{ marginBottom: 6 }}>{header}</div>}
        <div
          ref={setScrollEl}
          role="listbox"
          id={listId}
          aria-label={ariaLabel}
          tabIndex={searchable ? -1 : 0}
          style={{ maxHeight: maxListHeight, overflowY: "auto", outline: "none" }}
        >
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {visible.map((v) => {
              const row = rowAt(v.index);
              const highlighted = v.index === activeClamped;
              const isSelected = row === NONE ? value == null : row !== undefined && row.key === value;
              return (
                <div
                  key={row === NONE ? "__none" : (row?.key ?? `__loading-${v.index}`)}
                  id={`${listId}-row-${v.index}`}
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onMouseMove={() => v.index !== activeClamped && setActive(v.index)}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => commit(v.index)}
                  style={{
                    position: "absolute",
                    top: v.start,
                    left: 0,
                    right: 0,
                    height: rowHeight,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 8px",
                    borderRadius: "var(--radius-2)",
                    background: highlighted ? "var(--accent-a4)" : undefined,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                    {row === NONE ? (
                      <Text size="2" color="gray">
                        {noneOption}
                      </Text>
                    ) : row === undefined ? (
                      <div
                        aria-hidden
                        style={{ height: 10, width: "60%", borderRadius: 4, background: "var(--gray-a3)" }}
                      />
                    ) : (
                      renderItem(row.item, { selected: isSelected, highlighted, query: query.trim() })
                    )}
                  </div>
                  <PiCheck
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      color: "var(--accent-11)",
                      visibility: isSelected ? "visible" : "hidden",
                    }}
                  />
                </div>
              );
            })}
          </div>
          {rowCount === 0 && (
            <Text size="2" color="gray" style={{ display: "block", padding: "6px 8px" }}>
              {list && list.total === null ? "Loading..." : emptyText}
            </Text>
          )}
        </div>
        {footer && (
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--gray-a4)" }}>{footer}</div>
        )}
      </Popover.Content>
    </Popover.Root>
  );
}
