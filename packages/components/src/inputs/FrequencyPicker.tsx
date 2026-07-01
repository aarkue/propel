import { Text, TextField } from "@r4pm/components/ui";
import { type ColorResolver, useViewerConfig } from "../viewer/viewer-config";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { PiCheck, PiMagnifyingGlass } from "react-icons/pi";
import {
  type FreqItem,
  filterByQuery,
  normalizeItems,
  selectTopN,
  sortByCountDesc,
  toggle,
} from "./selection";
import { SelectionActions } from "./SelectionActions";

const ROW_H = 34;
const PAD = 12;
const EDGE = 28;
const GUTTER_W = 12;
const GUTTER_X = 4;
const GUTTER_AREA = GUTTER_X + GUTTER_W + 8;
const MAX_SPEED = 12;
const FALLBACK_COLOR = "#8b8d98";

function withAlpha(color: string, alphaHex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alphaHex}` : color;
}

/** Number of leading (most-frequent) rows that are all selected. */
function selectedPrefix(sorted: FreqItem[], value: Set<string>): number {
  let k = 0;
  while (k < sorted.length && value.has(sorted[k].key)) k++;
  return k;
}

export interface FrequencyPickerProps {
  items: FreqItem[] | Record<string, number>;
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  mode?: "multi" | "single";
  searchable?: boolean;
  showBars?: boolean;
  /** Show the draggable top-N cutoff rail. Turn off when items have no meaningful frequency. */
  showCutoff?: boolean;
  /** Scope passed to the shared colorOf resolver (e.g. "activity", "objectType"). */
  scope?: string;
  /** Override the color resolver; defaults to the shared ViewerConfig colorOf. */
  colorOf?: ColorResolver;
  emptyText?: string;
  /** Focus the search box on mount (only when searchable). Off by default so embedded pickers
   *  (e.g. inside a settings card) do not steal focus. */
  autoFocus?: boolean;
}

export function FrequencyPicker({
  items,
  value,
  onChange,
  mode = "multi",
  searchable = true,
  showBars = true,
  showCutoff = true,
  scope = "activity",
  colorOf,
  emptyText = "No items available",
  autoFocus = false,
}: FrequencyPickerProps) {
  const cfg = useViewerConfig({ colorOf });
  const colorFor = (key: string): string => cfg.colorOf?.(scope, key) ?? FALLBACK_COLOR;

  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const rowId = (i: number): string => `${listId}-row-${i}`;
  const dragRef = useRef<{ active: boolean; clientY: number; raf: number | null }>({
    active: false,
    clientY: 0,
    raf: null,
  });

  const sorted = useMemo(() => sortByCountDesc(normalizeItems(items)), [items]);
  const shown = useMemo(() => filterByQuery(sorted, query), [sorted, query]);
  const maxCount = useMemo(() => Math.max(1, ...sorted.map((i) => i.count)), [sorted]);
  const total = useMemo(() => sorted.reduce((s, i) => s + i.count, 0), [sorted]);

  const cutoff = selectedPrefix(sorted, value);
  const cutoffPct =
    total > 0 ? Math.round((100 * sorted.slice(0, cutoff).reduce((s, i) => s + i.count, 0)) / total) : 0;
  const showHandle = showCutoff && mode === "multi" && query.trim() === "" && sorted.length > 0;

  const pick = (key: string) => {
    if (mode === "single") onChange(new Set(value.has(key) ? [] : [key]));
    else onChange(toggle(value, key));
  };

  // Combobox keyboard model: focus stays in the search box; arrows move a highlighted row,
  // Enter toggles it. So you can always keep typing + never get "stuck" in the list.
  const hi = Math.min(highlight, Math.max(0, shown.length - 1));
  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlight(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlight(shown.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[hi]) pick(shown[hi].key);
    }
  };
  // Keep the highlighted row scrolled into view as it moves.
  useEffect(() => {
    document.getElementById(`${listId}-row-${hi}`)?.scrollIntoView({ block: "nearest" });
  }, [hi, listId]);
  // Optional autofocus of the search box (opt-in; off by default for embedded pickers).
  useEffect(() => {
    if (autoFocus && searchable) rootRef.current?.querySelector("input")?.focus();
  }, [autoFocus, searchable]);

  const applyCutoff = (clientY: number) => {
    const el = contentRef.current;
    if (!el) return;
    const y = clientY - el.getBoundingClientRect().top - PAD;
    const n = Math.max(0, Math.min(sorted.length, Math.round(y / ROW_H)));
    onChange(selectTopN(sorted, n));
  };

  const tick = () => {
    const d = dragRef.current;
    const vp = viewportRef.current;
    if (!d.active || !vp) {
      d.raf = null;
      return;
    }
    const r = vp.getBoundingClientRect();
    if (d.clientY < r.top + EDGE) {
      vp.scrollTop -= MAX_SPEED * Math.min(1, (r.top + EDGE - d.clientY) / EDGE);
    } else if (d.clientY > r.bottom - EDGE) {
      vp.scrollTop += MAX_SPEED * Math.min(1, (d.clientY - (r.bottom - EDGE)) / EDGE);
    }
    applyCutoff(d.clientY);
    d.raf = requestAnimationFrame(tick);
  };

  const onHandleDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current.active = true;
    dragRef.current.clientY = e.clientY;
    setDragging(true);
    if (dragRef.current.raf == null) dragRef.current.raf = requestAnimationFrame(tick);
  };
  const onHandleMove = (e: ReactPointerEvent) => {
    if (!dragRef.current.active) return;
    dragRef.current.clientY = e.clientY;
    applyCutoff(e.clientY);
  };
  const onHandleUp = (e: ReactPointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current.active = false;
    if (dragRef.current.raf != null) {
      cancelAnimationFrame(dragRef.current.raf);
      dragRef.current.raf = null;
    }
    setDragging(false);
  };

  return (
    <div ref={rootRef} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
      {searchable && (
        <TextField.Root
          size="2"
          placeholder="Search"
          className="*:text-(--r4pm-node-text)! *:placeholder-(--gray-9)!"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={onSearchKeyDown}
          aria-controls={listId}
          aria-activedescendant={shown.length ? rowId(hi) : undefined}
        >
          <TextField.Slot>
            <PiMagnifyingGlass />
          </TextField.Slot>
        </TextField.Root>
      )}

      <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
        <Text size="1" className="text-(--gray-9)">
          {value.size} of {sorted.length} selected
          {showHandle && cutoff > 0 ? ` (${cutoffPct}%)` : ""}
        </Text>
        {mode === "multi" && (
          <SelectionActions allKeys={sorted.map((i) => i.key)} value={value} onChange={onChange} />
        )}
      </div>

      <div
        ref={viewportRef}
        className="pr-2"
        role="listbox"
        id={listId}
        aria-multiselectable={mode === "multi"}
        style={{ position: "relative", maxHeight: ROW_H * 8 + PAD * 2, overflowY: "auto" }}
      >
        <div
          ref={contentRef}
          style={{
            position: "relative",
            paddingTop: PAD,
            paddingBottom: PAD,
            paddingLeft: showHandle ? GUTTER_AREA : 0,
          }}
        >
          {shown.map((item, i) => {
            const sel = value.has(item.key);
            const c = colorFor(item.key);
            const barW = `${(100 * item.count) / maxCount}%`;
            return (
              <button
                key={item.key}
                type="button"
                id={rowId(i)}
                role="option"
                aria-selected={sel}
                tabIndex={-1}
                onClick={() => pick(item.key)}
                onMouseDown={(e) => {
                  // Keep focus in the search box so the keyboard combobox flow never breaks.
                  e.preventDefault();
                }}
                title={`${item.key} (${item.count.toLocaleString("en")})`}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  height: ROW_H,
                  padding: "0 10px",
                  border: "none",
                  borderRadius: 6,
                  background: i === hi ? "var(--accent-a4)" : sel ? "var(--gray-a3)" : "transparent",
                  boxShadow: i === hi ? "inset 0 0 0 2px var(--accent-8)" : undefined,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {showBars && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 4,
                      bottom: 4,
                      width: barW,
                      borderRadius: 6,
                      background: withAlpha(c, "2b"),
                      pointerEvents: "none",
                    }}
                  />
                )}
                <span
                  style={{
                    position: "relative",
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    flex: "0 0 auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: sel ? c : "transparent",
                    boxShadow: sel ? "none" : `inset 0 0 0 2px ${withAlpha(c, "99")}`,
                    color: "#fff",
                  }}
                >
                  {sel && <PiCheck size={12} strokeWidth={3} />}
                </span>
                <span
                  className="truncate"
                  style={{
                    position: "relative",
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    fontWeight: sel ? 600 : 400,
                  }}
                >
                  {item.key}
                </span>
                <span
                  className="tabular-nums"
                  style={{ position: "relative", fontSize: 12, color: "var(--gray-11)", flex: "0 0 auto" }}
                >
                  {item.count.toLocaleString("en")}
                </span>
              </button>
            );
          })}

          {showHandle && (
            <div
              onPointerDown={onHandleDown}
              onPointerMove={onHandleMove}
              onPointerUp={onHandleUp}
              title="Drag to keep the most frequent"
              style={{
                position: "absolute",
                left: GUTTER_X,
                top: PAD,
                width: GUTTER_W,
                height: sorted.length * ROW_H,
                borderRadius: GUTTER_W / 2,
                background: "var(--gray-a3)",
                cursor: "ns-resize",
                touchAction: "none",
                zIndex: 2,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  height: cutoff * ROW_H,
                  borderRadius: GUTTER_W / 2,
                  background: dragging ? "var(--accent-9)" : "var(--accent-8)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: -3,
                  width: GUTTER_W + 6,
                  height: 12,
                  top: cutoff * ROW_H - 6,
                  borderRadius: 6,
                  background: dragging ? "var(--accent-10)" : "var(--accent-9)",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                }}
              >
                <span
                  style={{ width: 8, height: 1.5, borderRadius: 1, background: "var(--accent-contrast)" }}
                />
                <span
                  style={{ width: 8, height: 1.5, borderRadius: 1, background: "var(--accent-contrast)" }}
                />
              </div>
            </div>
          )}

          {shown.length === 0 && (
            <Text size="1" style={{ display: "block", padding: 8 }}>
              {emptyText}
            </Text>
          )}
        </div>
      </div>
    </div>
  );
}
