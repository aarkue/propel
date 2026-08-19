// "Add table": the searchable, source-grouped table list from OCPQ's top-left panel. Rendered
// both as a toolbar popover and inside the canvas context menu, so adding a table is reachable
// the same two ways it was there.
import { Button, Flex, Popover, Text, TextField } from "@r4pm/components/ui";
import { useMemo, useState } from "react";
import { PiDatabase, PiMagnifyingGlass, PiPlus, PiTable } from "react-icons/pi";
import type { ExtractionCatalog } from "../types";

export interface TableRef {
  sourceId: string;
  table: string;
}

/** Highlight the matched span, so a long table list scanned with a query reads at a glance. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark style={{ background: "var(--amber-a5)", color: "inherit", borderRadius: 2 }}>
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  );
}

/** Sources whose id or any table name matches `query`, with the non-matching tables filtered out
 *  when only tables matched. Pure, so the filtering rule is testable on its own. */
export function filterCatalog(
  catalog: ExtractionCatalog,
  query: string,
): { sourceId: string; tables: string[] }[] {
  const q = query.trim().toLowerCase();
  const out: { sourceId: string; tables: string[] }[] = [];
  for (const [sourceId, tables] of Object.entries(catalog.tables)) {
    const names = Object.keys(tables).sort();
    if (!q) {
      out.push({ sourceId, tables: names });
      continue;
    }
    const sourceMatches = sourceId.toLowerCase().includes(q);
    const matching = names.filter((t) => t.toLowerCase().includes(q));
    if (sourceMatches) out.push({ sourceId, tables: names });
    else if (matching.length > 0) out.push({ sourceId, tables: matching });
  }
  return out;
}

export function TableList({
  catalog,
  onSelect,
}: {
  catalog: ExtractionCatalog;
  onSelect: (ref: TableRef) => void;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => filterCatalog(catalog, query), [catalog, query]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (Object.keys(catalog.tables).length === 0) {
    return (
      <Text size="1" color="gray" style={{ display: "block", padding: "10px 6px", textAlign: "center" }}>
        No discovered sources. Add a connection first.
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="1" style={{ minWidth: 240 }}>
      <TextField.Root
        size="1"
        autoFocus
        value={query}
        placeholder="Search tables..."
        onChange={(e) => setQuery(e.target.value)}
      >
        <TextField.Slot>
          <PiMagnifyingGlass />
        </TextField.Slot>
      </TextField.Root>
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {groups.length === 0 && (
          <Text size="1" color="gray" style={{ display: "block", padding: "8px 4px" }}>
            No match.
          </Text>
        )}
        {groups.map((g) => {
          // A query expands everything it matched; without one, a source starts expanded and can
          // be collapsed, which keeps a many-source catalog navigable.
          const open = query ? true : !collapsed[g.sourceId];
          return (
            <div key={g.sourceId}>
              {/* Hover and focus need classes, not inline `style`, which can't express either. */}
              <button
                type="button"
                onClick={() => !query && setCollapsed((c) => ({ ...c, [g.sourceId]: !c[g.sourceId] }))}
                className={`flex w-full items-center gap-[5px] rounded border-none bg-transparent px-[5px] py-1 transition-colors focus-visible:outline-2 focus-visible:[outline-color:var(--accent-8)] focus-visible:-outline-offset-1 ${
                  query ? "cursor-default" : "cursor-pointer hover:bg-[var(--gray-a3)]"
                }`}
                style={{ color: "var(--gray-12)" }}
              >
                <PiDatabase style={{ flexShrink: 0, color: "var(--gray-10)" }} />
                <Text size="1" weight="medium" style={{ flex: 1, textAlign: "left" }}>
                  <Highlight text={g.sourceId} query={query} />
                </Text>
                <Text size="1" color="gray" style={{ fontSize: 10 }}>
                  {g.tables.length}
                </Text>
              </button>
              {open && (
                <div style={{ marginLeft: 8, paddingLeft: 5, borderLeft: "1px solid var(--gray-a5)" }}>
                  {g.tables.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onSelect({ sourceId: g.sourceId, table: t })}
                      className="flex w-full cursor-pointer items-center gap-[5px] rounded border-none bg-transparent px-[5px] py-[3px] transition-colors hover:bg-[var(--gray-a3)] focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:[outline-color:var(--accent-8)]"
                      style={{ color: "var(--gray-12)" }}
                    >
                      <PiTable style={{ flexShrink: 0, color: "var(--gray-10)" }} />
                      <Text size="1" style={{ textAlign: "left" }}>
                        <Highlight text={t} query={query} />
                      </Text>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Flex>
  );
}

export function AddTableMenu({
  catalog,
  onSelect,
}: {
  catalog: ExtractionCatalog;
  onSelect: (ref: TableRef) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <Button size="1" variant="soft">
          <PiPlus /> Add table
        </Button>
      </Popover.Trigger>
      <Popover.Content size="1" align="start" width="270px">
        <TableList
          catalog={catalog}
          onSelect={(ref) => {
            onSelect(ref);
            setOpen(false);
          }}
        />
      </Popover.Content>
    </Popover.Root>
  );
}
