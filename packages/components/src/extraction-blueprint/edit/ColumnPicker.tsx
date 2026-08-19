// Each row carries a type icon, name, declared type, and a sample of real values (from
// `catalog.domains`), ordered by what the field is asking for: an "id" field floats `*_id`
// columns, a timestamp field floats date/time ones.
import { Popover, ScrollArea, Text, TextField } from "@r4pm/components/ui";
import { useMemo, useState } from "react";
import { PiCalendarBlank, PiCaretDown, PiCheck, PiHash, PiLink, PiToggleLeft } from "react-icons/pi";
import type { IconType } from "react-icons";
import { rankedColumnInfo, type ColumnHint, type ColumnInfo, type ValueKind } from "../schema-resolution";
import { useEditContext } from "./edit-context";

const KIND_ICON: Record<ValueKind, { icon: IconType; color: string }> = {
  integer: { icon: PiHash, color: "var(--blue-11)" },
  float: { icon: PiHash, color: "var(--blue-11)" },
  timestamp: { icon: PiCalendarBlank, color: "var(--orange-11)" },
  boolean: { icon: PiToggleLeft, color: "var(--amber-11)" },
  text: { icon: PiLink, color: "var(--gray-10)" },
};

function ColumnIcon({ info }: { info: ColumnInfo }) {
  const entry = info.kind ? KIND_ICON[info.kind] : undefined;
  if (!entry) {
    return <span className="w-3.5 shrink-0 text-center font-mono text-[9px] opacity-50">Aa</span>;
  }
  const Icon = info.kind === "text" && !/id$|_id/.test(info.name) ? undefined : entry.icon;
  if (!Icon) {
    return <span className="w-3.5 shrink-0 text-center font-mono text-[9px] opacity-50">Aa</span>;
  }
  return <Icon size={13} className="shrink-0" style={{ color: entry.color }} />;
}

/** One row: icon, name, then type and example values on a muted second line. */
function ColumnRow({ info, muted }: { info: ColumnInfo; muted?: boolean }) {
  const samples = info.samples?.filter(Boolean).slice(0, 2) ?? [];
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <ColumnIcon info={info} />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-[13px] font-medium ${muted ? "opacity-50" : ""}`}>{info.name}</div>
        {(info.colType || samples.length > 0) && (
          <div className="flex min-w-0 gap-1.5 text-[11px] opacity-60">
            {info.colType && <span className="shrink-0">{info.colType}</span>}
            {samples.length > 0 && <span className="truncate font-mono">e.g. {samples.join(", ")}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export interface ColumnPickerProps {
  /** Node whose resolved schema this picks from -- a node downstream of a Join/Union has a derived
   *  schema (see ../schema-resolution.ts), not the raw table schema. */
  nodeId: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** Floats the columns a field of this sort usually wants to the top of the list. */
  hint?: ColumnHint;
  /** Offer a "None" row that clears the value. */
  allowEmpty?: boolean;
  className?: string;
}

export function ColumnPicker({
  nodeId,
  value,
  onValueChange,
  placeholder = "Select column...",
  hint,
  allowEmpty,
  className,
}: ColumnPickerProps) {
  const edit = useEditContext();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the real inputs, not on `edit` -- the context object is rebuilt on every model change, which would re-rank every picker on screen for an edit in an unrelated field.
  const columns = useMemo(
    () => (edit ? rankedColumnInfo(edit.model.nodes, edit.catalog, nodeId, hint) : []),
    [edit?.model.nodes, edit?.catalog, nodeId, hint],
  );
  const filtered = query
    ? columns.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : columns;
  const selected = columns.find((c) => c.name === value);

  const choose = (name: string) => {
    onValueChange(name);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <Popover.Trigger>
        <button
          type="button"
          className={`flex w-full min-w-0 cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-left transition-colors border-[var(--gray-a7)] bg-[var(--color-surface)] hover:border-[var(--gray-a8)] hover:bg-[var(--gray-a2)] focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:[outline-color:var(--accent-8)] ${className ?? ""}`}
        >
          {selected ? (
            <ColumnRow info={selected} />
          ) : (
            <span className="min-w-0 flex-1 truncate text-[13px] opacity-50">{value || placeholder}</span>
          )}
          <PiCaretDown size={12} className="shrink-0 opacity-50" />
        </button>
      </Popover.Trigger>
      <Popover.Content size="1" width="300px" className="p-1">
        <TextField.Root
          size="1"
          autoFocus
          value={query}
          placeholder="Search columns..."
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter picks the only remaining match, so typing a unique prefix is enough.
            if (e.key === "Enter" && filtered.length > 0) {
              e.preventDefault();
              choose(filtered[0].name);
            }
            // Escape closes this popover only -- without stopping it, the key also reaches an
            // enclosing Dialog and closes the whole form.
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
        <ScrollArea style={{ maxHeight: 260 }} className="mt-1">
          {allowEmpty && (
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 rounded border-none bg-transparent px-1.5 py-1 text-left hover:bg-[var(--gray-a3)]"
              onClick={() => choose("")}
            >
              <span className="w-3.5 shrink-0">{!value && <PiCheck size={12} />}</span>
              <span className="text-[12px] italic opacity-55">None</span>
            </button>
          )}
          {filtered.length === 0 && (
            <Text size="1" color="gray" className="block px-2 py-2">
              {columns.length === 0 ? "No columns resolved yet." : "No match."}
            </Text>
          )}
          {filtered.map((info) => (
            <button
              key={info.name}
              type="button"
              className="flex w-full cursor-pointer items-center gap-1 rounded border-none bg-transparent px-1.5 py-1 text-left hover:bg-[var(--gray-a3)]"
              onClick={() => choose(info.name)}
            >
              <span className="w-3.5 shrink-0">{value === info.name && <PiCheck size={12} />}</span>
              <ColumnRow info={info} />
            </button>
          ))}
        </ScrollArea>
      </Popover.Content>
    </Popover.Root>
  );
}
