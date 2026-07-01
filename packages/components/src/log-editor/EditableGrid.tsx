import { type CSSProperties, type ReactNode, useCallback, useRef } from "react";
import { IconButton } from "@r4pm/components/ui";
import { PiTrash } from "react-icons/pi";

export interface GridColumn {
  key: string;
  header: ReactNode;
  width?: string;
  /** Hint for the text input; ignored for custom/boolean cells. */
  inputMode?: "text" | "numeric" | "decimal";
  kind?: "text" | "boolean" | "custom";
  align?: "left" | "right";
  /** Custom cell renderer (e.g. a relationships editor). */
  render?: (ctx: { rowId: string; value: string; setValue: (v: string) => void }) => ReactNode;
  /** Extra control rendered in the header, right-aligned (e.g. remove-column). */
  headerExtra?: ReactNode;
}

export interface GridRowModel {
  rowId: string;
}

interface EditableGridProps<R extends GridRowModel> {
  columns: GridColumn[];
  rows: R[];
  cell: (row: R, key: string) => string;
  onCell: (rowId: string, key: string, value: string) => void;
  onDeleteRow?: (rowId: string) => void;
  /** True when this row begins a new visual group (draws a heavier top border). */
  isGroupStart?: (row: R, prev: R | undefined) => boolean;
  /** Leading cell content (rendered before the first column), e.g. a group marker. */
  leading?: (row: R, index: number) => ReactNode;
  leadingHeader?: ReactNode;
  emptyHint?: ReactNode;
}

const thStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  textAlign: "left",
  padding: "7px 10px",
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: "0.02em",
  color: "var(--gray-11)",
  background: "var(--gray-2)",
  borderBottom: "1px solid var(--gray-a5)",
  whiteSpace: "nowrap",
  userSelect: "none",
};

// Border, background and focus ring live in the className so :hover / :focus can win over the base
// (an inline border would always beat a hover class). Layout-only props stay inline.
const cellInputStyle: CSSProperties = {
  width: "100%",
  padding: "5px 8px",
  font: "inherit",
  fontSize: 13,
  color: "var(--gray-12)",
  outline: "none",
};

const cellInputClass =
  "rounded-[5px] border border-transparent bg-transparent transition-colors " +
  "hover:border-(--gray-a6) focus:border-(--accent-8) " +
  "focus:bg-(--color-panel-solid) focus:shadow-[0_0_0_2px_var(--accent-a4)]";

const cellKey = (rowId: string, colKey: string) => `${rowId}::${colKey}`;

export function EditableGrid<R extends GridRowModel>({
  columns,
  rows,
  cell,
  onCell,
  onDeleteRow,
  isGroupStart,
  leading,
  leadingHeader,
  emptyHint,
}: EditableGridProps<R>) {
  const inputs = useRef(new Map<string, HTMLInputElement>());

  const move = useCallback(
    (rowId: string, colKey: string, dir: 1 | -1) => {
      const idx = rows.findIndex((r) => r.rowId === rowId);
      const target = rows[idx + dir];
      if (!target) return;
      inputs.current.get(cellKey(target.rowId, colKey))?.focus();
    },
    [rows],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, rowId: string, colKey: string) => {
      if (e.key === "Enter") {
        e.preventDefault();
        move(rowId, colKey, e.shiftKey ? -1 : 1);
      }
    },
    [move],
  );

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
      <colgroup>
        {leading ? <col style={{ width: 28 }} /> : null}
        {columns.map((c) => (
          <col key={c.key} style={{ width: c.width }} />
        ))}
        {onDeleteRow ? <col style={{ width: 34 }} /> : null}
      </colgroup>
      <thead>
        <tr>
          {leading ? <th style={thStyle}>{leadingHeader}</th> : null}
          {columns.map((c) => (
            <th key={c.key} className="group/th" style={thStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "space-between" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.header}</span>
                {c.headerExtra ? (
                  <span className="opacity-0 transition-opacity group-hover/th:opacity-100 group-focus-within/th:opacity-100">
                    {c.headerExtra}
                  </span>
                ) : null}
              </div>
            </th>
          ))}
          {onDeleteRow ? <th style={thStyle} /> : null}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && emptyHint ? (
          <tr>
            <td
              colSpan={columns.length + (leading ? 1 : 0) + (onDeleteRow ? 1 : 0)}
              style={{ padding: 16, color: "var(--gray-10)", fontSize: 13, textAlign: "center" }}
            >
              {emptyHint}
            </td>
          </tr>
        ) : null}
        {rows.map((row, i) => {
          const groupStart = isGroupStart?.(row, rows[i - 1]) ?? false;
          const rowBorder = groupStart && i > 0 ? "2px solid var(--gray-a6)" : "1px solid var(--gray-a3)";
          return (
            <tr
              key={row.rowId}
              className="group/row transition-colors hover:bg-(--gray-2)"
              style={{ borderTop: rowBorder }}
            >
              {leading ? (
                <td style={{ padding: "0 2px", verticalAlign: "middle", textAlign: "center" }}>
                  {leading(row, i)}
                </td>
              ) : null}
              {columns.map((c) => {
                const value = cell(row, c.key);
                const setValue = (v: string) => onCell(row.rowId, c.key, v);
                return (
                  <td key={c.key} style={{ padding: "2px 3px", verticalAlign: "middle" }}>
                    {c.kind === "custom" && c.render ? (
                      c.render({ rowId: row.rowId, value, setValue })
                    ) : c.kind === "boolean" ? (
                      <input
                        type="checkbox"
                        checked={value === "true"}
                        onChange={(e) => setValue(e.target.checked ? "true" : "false")}
                        style={{ accentColor: "var(--accent-9)", width: 15, height: 15, cursor: "pointer" }}
                      />
                    ) : (
                      <input
                        ref={(el) => {
                          if (el) inputs.current.set(cellKey(row.rowId, c.key), el);
                          else inputs.current.delete(cellKey(row.rowId, c.key));
                        }}
                        className={cellInputClass}
                        value={value}
                        inputMode={c.inputMode}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => onKeyDown(e, row.rowId, c.key)}
                        style={{ ...cellInputStyle, textAlign: c.align ?? "left" }}
                      />
                    )}
                  </td>
                );
              })}
              {onDeleteRow ? (
                <td style={{ padding: "0 2px", textAlign: "center", verticalAlign: "middle" }}>
                  <IconButton
                    className="opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100"
                    size="1"
                    variant="ghost"
                    color="gray"
                    aria-label="Delete row"
                    onClick={() => onDeleteRow(row.rowId)}
                  >
                    <PiTrash size={13} />
                  </IconButton>
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
