import { Badge, Button, Popover, TextField } from "@r4pm/components/ui";
import {
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useState,
} from "react";
import { PiCaretDown, PiMagnifyingGlass, PiPlus } from "react-icons/pi";
import { FrequencyPicker, type FrequencyPickerProps } from "./FrequencyPicker";

type BadgeColor = ComponentProps<typeof Badge>["color"];

// Friendly, source-agnostic labels for engine kinds.
const KIND_LABEL: Record<string, string> = {
  EventLog: "Event Log",
  OCEL: "OCEL",
  SlimLinkedOCEL: "OCEL",
  IndexLinkedOCEL: "OCEL",
};
// Colors deliberately off the indigo app accent, so the chip stays legible on the
// Select's accent-highlighted (blue) row as well as on a plain white row.
const KIND_COLOR: Record<string, BadgeColor> = {
  EventLog: "amber",
  OCEL: "jade",
  SlimLinkedOCEL: "jade",
  IndexLinkedOCEL: "jade",
};
// Deterministic, off-accent fallback so an unrecognized kind still gets a stable, distinct color.
const FALLBACK_KIND_COLORS: BadgeColor[] = [
  "tomato",
  "cyan",
  "plum",
  "orange",
  "grass",
  "pink",
  "ruby",
  "teal",
];
function hashKind(kind: string): number {
  let h = 0;
  for (let i = 0; i < kind.length; i++) h = (h * 31 + kind.charCodeAt(i)) >>> 0;
  return h;
}
const defaultKindLabel = (k: string): string => KIND_LABEL[k] ?? k;
const defaultKindColor = (k: string): BadgeColor =>
  KIND_COLOR[k] ?? FALLBACK_KIND_COLORS[hashKind(k) % FALLBACK_KIND_COLORS.length];

type PickerPassthrough = Pick<
  FrequencyPickerProps,
  "value" | "onChange" | "mode" | "searchable" | "showBars" | "colorOf"
>;

export function ActivityChooser({ counts, ...rest }: { counts: Record<string, number> } & PickerPassthrough) {
  return <FrequencyPicker items={counts} scope="activity" emptyText="No activities" {...rest} />;
}

export function ObjectTypeChooser({
  counts,
  ...rest
}: { counts: Record<string, number> } & PickerPassthrough) {
  return <FrequencyPicker items={counts} scope="objectType" emptyText="No object types" {...rest} />;
}

export function ObjectChooser({
  objects,
  ...rest
}: { objects: { id: string; involvement: number }[] } & PickerPassthrough) {
  return (
    <FrequencyPicker
      items={objects.map((o) => ({ key: o.id, count: o.involvement }))}
      scope="object"
      emptyText="No objects"
      {...rest}
    />
  );
}

type Dataset = { id: string; label: string; kind: string };
type ComboRow = { kind: "data"; d: Dataset } | { kind: "import" };

function rowStyle(highlighted: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    width: "100%",
    minHeight: 32,
    padding: "4px 8px",
    border: "none",
    borderRadius: 6,
    background: highlighted ? "var(--accent-a4)" : "transparent",
    cursor: "pointer",
    textAlign: "left",
  };
}

/**
 * Single-select dataset combobox built on Radix Popover (Radix Select cannot host a search box
 * with arrow-key navigation). Optional filter, kind badges, compatibility (`accept`), and an
 * import action. Keyboard: focus stays in the filter; arrows move a highlight, Enter activates,
 * Escape closes.
 */
export function DatasetSelector({
  datasets,
  value,
  onChange,
  accept,
  onImport,
  importLabel = "Import data...",
  colorForKind,
  labelForKind,
  searchable = false,
}: {
  datasets: Dataset[];
  value: string | null;
  onChange: (id: string) => void;
  /** Compatible engine kinds; incompatible datasets show but are disabled. undefined = all. */
  accept?: string[];
  /** "add/import data" action; may return the new dataset id (sync or async) to auto-select it. */
  onImport?: () => undefined | string | null | undefined | Promise<string | null | undefined>;
  importLabel?: string;
  /** External override for the per-kind chip color; falls back to the built-in map + stable hash. */
  colorForKind?: (kind: string) => BadgeColor | undefined;
  /** External override for the per-kind label; falls back to the built-in map + raw kind. */
  labelForKind?: (kind: string) => string | undefined;
  /** Show a filter box at the top of the dropdown. */
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const listId = useId();

  const colorOf = (k: string): BadgeColor => colorForKind?.(k) ?? defaultKindColor(k);
  const labelOf = (k: string): string => labelForKind?.(k) ?? defaultKindLabel(k);
  const compatible = (k: string): boolean => !accept || accept.includes(k);
  const acceptKinds = accept ? [...new Set(accept)] : [];
  const acceptLabels = [...new Set(acceptKinds.map(labelOf))];
  const placeholder = acceptLabels.length === 1 ? `Select ${acceptLabels[0]}` : "Select dataset";

  const q = query.trim().toLowerCase();
  const filtered = searchable && q ? datasets.filter((d) => d.label.toLowerCase().includes(q)) : datasets;
  const rows: ComboRow[] = [
    ...filtered.map((d): ComboRow => ({ kind: "data", d })),
    ...(onImport ? [{ kind: "import" } as ComboRow] : []),
  ];
  const hi = Math.min(highlight, Math.max(0, rows.length - 1));
  const selected = datasets.find((d) => d.id === value) ?? null;

  const doImport = async () => {
    setOpen(false);
    const id = await onImport?.();
    if (id) onChange(id);
  };
  const activate = (r: ComboRow) => {
    if (r.kind === "import") void doImport();
    else if (compatible(r.d.kind)) {
      onChange(r.d.id);
      setOpen(false);
    }
  };

  useEffect(() => {
    if (open) document.getElementById(`${listId}-row-${hi}`)?.scrollIntoView({ block: "nearest" });
  }, [hi, open, listId]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlight(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlight(rows.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rows[hi]) activate(rows[hi]);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
      {accept && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--gray-10)" }}>
          <span>Accepts</span>
          {acceptKinds.map((k) => (
            <Badge key={k} color={colorOf(k)} variant="soft" size="1" radius="full">
              {labelOf(k)}
            </Badge>
          ))}
        </div>
      )}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger>
          <Button
            type="button"
            variant="surface"
            color="gray"
            aria-haspopup="listbox"
            style={{ width: "100%", justifyContent: "space-between" }}
          >
            {selected ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span className="truncate">{selected.label}</span>
                <Badge color={colorOf(selected.kind)} variant="soft" size="1" radius="full">
                  {labelOf(selected.kind)}
                </Badge>
              </span>
            ) : (
              <span style={{ color: "var(--gray-10)" }}>{placeholder}</span>
            )}
            <PiCaretDown style={{ opacity: 0.7, flex: "0 0 auto" }} />
          </Button>
        </Popover.Trigger>
        <Popover.Content width="280px" onKeyDown={onKeyDown} style={{ padding: 6 }}>
          {searchable && (
            <div
              style={{
                margin: "-6px -6px 6px",
                padding: 8,
                borderBottom: "1px solid var(--gray-a4)",
              }}
            >
              <TextField.Root
                size="2"
                variant="soft"
                placeholder="Filter datasets"
                aria-label="Filter datasets"
                aria-controls={listId}
                aria-activedescendant={rows.length ? `${listId}-row-${hi}` : undefined}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlight(0);
                }}
              >
                <TextField.Slot>
                  <PiMagnifyingGlass />
                </TextField.Slot>
              </TextField.Root>
            </div>
          )}
          <div role="listbox" id={listId} style={{ maxHeight: 260, overflowY: "auto" }}>
            {rows.map((r, i) => {
              const highlighted = i === hi;
              if (r.kind === "import") {
                return (
                  <button
                    key="__import"
                    id={`${listId}-row-${i}`}
                    type="button"
                    role="option"
                    aria-selected={false}
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void doImport()}
                    style={{ ...rowStyle(highlighted), borderTop: "1px solid var(--gray-a4)", marginTop: 2 }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        color: "var(--accent-11)",
                      }}
                    >
                      <PiPlus /> {importLabel}
                    </span>
                  </button>
                );
              }
              const d = r.d;
              const ok = compatible(d.kind);
              return (
                <button
                  key={d.id}
                  id={`${listId}-row-${i}`}
                  type="button"
                  role="option"
                  aria-selected={d.id === value}
                  aria-disabled={!ok}
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => activate(r)}
                  style={{ ...rowStyle(highlighted), opacity: ok ? 1 : 0.5 }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span className="truncate">{d.label}</span>
                    <Badge color={colorOf(d.kind)} variant="soft" size="1" radius="full">
                      {labelOf(d.kind)}
                    </Badge>
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--gray-9)" }}>
                {datasets.length === 0 ? "No datasets loaded" : "No matches"}
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Root>
    </div>
  );
}
