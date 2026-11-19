import { IconButton, Table, Text, TextField } from "@r4pm/components/ui";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import {
  PiCaretDown,
  PiCaretLeft,
  PiCaretRight,
  PiMagnifyingGlass,
  PiSortAscending,
  PiSortDescending,
  PiX,
} from "react-icons/pi";
import { OptionMenu } from "./index";

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Wait this many ms after the last keystroke before calling `onChange`; clearing is immediate. */
  debounceMs?: number;
  width?: CSSProperties["width"];
  "aria-label"?: string;
}

/** A search box with a clear button. */
export function SearchField({
  value,
  onChange,
  placeholder,
  debounceMs = 0,
  width = 260,
  "aria-label": ariaLabel,
}: SearchFieldProps) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // A delayed commit must reach the caller's current handler, whose state may have moved on.
  const latest = useRef(onChange);
  latest.current = onChange;
  const committed = useRef(value);
  useEffect(() => {
    if (value !== committed.current) {
      clearTimeout(timer.current);
      setDraft(value);
    }
    committed.current = value;
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (next: string) => {
    clearTimeout(timer.current);
    committed.current = next;
    latest.current(next);
  };
  const type = (next: string) => {
    setDraft(next);
    if (debounceMs <= 0) return commit(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), debounceMs);
  };

  return (
    <TextField.Root
      size="1"
      placeholder={placeholder}
      aria-label={ariaLabel ?? placeholder}
      value={draft}
      onChange={(e) => type(e.currentTarget.value)}
      style={{ width }}
    >
      <TextField.Slot>
        <PiMagnifyingGlass />
      </TextField.Slot>
      {draft && (
        <TextField.Slot>
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            aria-label="Clear"
            onClick={() => {
              setDraft("");
              commit("");
            }}
          >
            <PiX />
          </IconButton>
        </TextField.Slot>
      )}
    </TextField.Root>
  );
}

export interface SortIconProps {
  ascending: boolean;
}

/** The direction a column is sorted in. */
export function SortIcon({ ascending }: SortIconProps) {
  const Icon = ascending ? PiSortAscending : PiSortDescending;
  return <Icon aria-hidden style={{ verticalAlign: "-2px", fontSize: 12, flexShrink: 0 }} />;
}

export interface SortableHeaderProps {
  children: ReactNode;
  /** How the table is sorted by this column, if it is. */
  sorted?: "asc" | "desc" | null;
  /** Without it, the header does not sort. */
  onSort?: () => void;
  align?: "left" | "right";
  style?: CSSProperties;
}

/** A column header of a {@link Table}; a click sorts by its column. */
export function SortableHeader({ children, sorted, onSort, align, style }: SortableHeaderProps) {
  return (
    <Table.ColumnHeaderCell
      onClick={onSort}
      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
      style={{ cursor: onSort ? "pointer" : undefined, userSelect: "none", textAlign: align, ...style }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          whiteSpace: "nowrap",
          flexDirection: align === "right" ? "row-reverse" : "row",
        }}
      >
        {children}
        {sorted && <SortIcon ascending={sorted === "asc"} />}
      </span>
    </Table.ColumnHeaderCell>
  );
}

export interface ExpandableRowProps {
  expanded: boolean;
  onToggle: () => void;
  /** The row's cells after the toggle. */
  children: ReactNode;
  /** Shown under the row while it is expanded. */
  detail?: ReactNode;
  /** Columns of the table, the toggle's included, for the detail to span. */
  columns: number;
}

/** A table row that a click expands into a detail row under it. */
export function ExpandableRow({ expanded, onToggle, children, detail, columns }: ExpandableRowProps) {
  return (
    <>
      <Table.Row className="r4pm-expandable-row" onClick={onToggle}>
        <Table.Cell style={{ verticalAlign: "middle", width: 16 }}>
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            aria-label={expanded ? "Hide details" : "Show details"}
            aria-expanded={expanded}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {expanded ? <PiCaretDown /> : <PiCaretRight />}
          </IconButton>
        </Table.Cell>
        {children}
      </Table.Row>
      {expanded && (
        <Table.Row>
          <Table.Cell colSpan={columns} style={{ padding: 0 }}>
            <div
              style={{
                padding: 12,
                background: "var(--gray-a2)",
                borderBlock: "1px solid var(--gray-a6)",
              }}
            >
              {detail}
            </div>
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
}

export interface TablePagerProps {
  /** The current page, from 0. */
  page: number;
  pageSize: number;
  /** Rows over all pages. */
  total: number;
  onPageChange: (page: number) => void;
  /** With `onPageSizeChange`, a menu offers these page sizes. */
  pageSizes?: readonly number[];
  onPageSizeChange?: (pageSize: number) => void;
}

/** "Showing 21-40 of 312", the rows per page, and buttons to the previous and next page. */
export function TablePager({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizes,
  onPageSizeChange,
}: TablePagerProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total > 0 ? page * pageSize + 1 : 0;
  const last = Math.min((page + 1) * pageSize, total);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        padding: "8px 0",
      }}
    >
      <Text size="1" color="gray" style={{ fontVariantNumeric: "tabular-nums" }}>
        Showing {first.toLocaleString("en")}-{last.toLocaleString("en")} of {total.toLocaleString("en")}
      </Text>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {pageSizes && onPageSizeChange && (
          <OptionMenu
            label="Rows"
            value={String(pageSize)}
            options={pageSizes.map((s) => ({ value: String(s), label: `${s} per page` }))}
            onChange={(v) => onPageSizeChange(Number(v))}
          />
        )}
        <IconButton
          size="1"
          variant="soft"
          color="gray"
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
        >
          <PiCaretLeft />
        </IconButton>
        <Text size="1" color="gray" style={{ fontVariantNumeric: "tabular-nums" }}>
          Page {(page + 1).toLocaleString("en")} of {pages.toLocaleString("en")}
        </Text>
        <IconButton
          size="1"
          variant="soft"
          color="gray"
          aria-label="Next page"
          disabled={page >= pages - 1}
          onClick={() => onPageChange(page + 1)}
        >
          <PiCaretRight />
        </IconButton>
      </div>
    </div>
  );
}
