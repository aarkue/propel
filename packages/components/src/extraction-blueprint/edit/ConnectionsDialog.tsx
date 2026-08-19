// Where a blueprint's `source_id`s get pointed at real data. Connection strings live only in
// `EditContext.connections`, never in `EditorBlueprint`/`Blueprint` (spec 1.7, 2.6). Each source
// is edited as a form for its kind, with the string derived and kept authoritative — a kind the
// form doesn't recognize falls back to "Custom" holding the text verbatim.
//
// Type scale is set element by element rather than through Radix's `size` props, since this panel
// reads at 11-14.5px and `size="1"` renders 10-12px.
import { Dialog } from "@r4pm/components/ui";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { TablePreview, TableSchema } from "../types";
import {
  buildConnectionString,
  CONNECTION_KIND_LABEL,
  describeConnection,
  EMPTY_DRAFT,
  isAutoSourceId,
  ITEM_PREFIX,
  parseConnectionString,
  suggestedSourceId,
  type ConnectionDraft,
  type ConnectionKind,
} from "./connection-string";
import { useEditContext, type BlueprintEditCallbacks } from "./edit-context";
import { freshId, renameSourceId } from "./node-draft";

/** What the bytes route can read back once registered as a `TabularSource`. Not derived from
 *  `KIND_EXTENSIONS`: that lists what each *kind* names on disk (csv claims `.tsv` and `.txt`),
 *  while this is what the registry actually accepts. */
const BYTE_SOURCE_EXTENSIONS = ["csv", "parquet", "xlsx", "sqlite", "sqlite3", "db"];

/** File extensions the native picker offers per kind. */
const KIND_EXTENSIONS: Partial<Record<ConnectionKind, string[]>> = {
  csv: ["csv", "tsv", "txt"],
  parquet: ["parquet"],
  xlsx: ["xlsx"],
  sqlite: ["sqlite", "sqlite3", "db"],
  duckdb: ["duckdb"],
};

/** The kinds whose source is a file opened by path, in the order "open a file" should reach for
 *  them: csv is what every host with a filesystem can read. Whether a given build can actually
 *  open DuckDB is the host's answer via `connectionKindAvailability`, since it links a native
 *  library and is desktop/server only. */
const FILE_KINDS = [
  "csv",
  "parquet",
  "xlsx",
  "sqlite",
  "duckdb",
] as const satisfies readonly ConnectionKind[];

// -- 16px line icons ----------------------------------------------------------------------------
// Stroked, not filled, and sized here rather than by an icon set's default, so every one of them
// lines up with the 14.5px text beside it. Never a letter in a box: an icon set's "CSV" glyph puts
// three letters where a 16px mark belongs and reads a size smaller than everything around it.

const ICO: React.CSSProperties = {
  width: 16,
  height: 16,
  flex: "none",
  display: "block",
  stroke: "currentColor",
  fill: "none",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function Ico({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={ICO}>
      {children}
    </svg>
  );
}

const FileIcon = () => (
  <Ico>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </Ico>
);

const DbIcon = () => (
  <Ico>
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
    <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
  </Ico>
);

const DiskIcon = () => (
  <Ico>
    <rect x="3" y="4" width="18" height="7" rx="2" />
    <rect x="3" y="13" width="18" height="7" rx="2" />
    <path d="M7 7.5h.01M7 16.5h.01" />
  </Ico>
);

const TextIcon = () => (
  <Ico>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h5" />
  </Ico>
);

const WarnIcon = () => (
  <Ico>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </Ico>
);

const ChevIcon = () => (
  <Ico>
    <path d="M9 18l6-6-6-6" />
  </Ico>
);

const PlusIcon = () => (
  <Ico>
    <path d="M12 5v14M5 12h14" />
  </Ico>
);

const CloseIcon = () => (
  <Ico>
    <path d="M18 6 6 18M6 6l12 12" />
  </Ico>
);

interface KindOption {
  value: ConnectionKind;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const KIND_OPTIONS: KindOption[] = [
  {
    value: "csv",
    title: CONNECTION_KIND_LABEL.csv,
    description: "One table, from a delimited file",
    icon: <FileIcon />,
  },
  {
    value: "parquet",
    title: CONNECTION_KIND_LABEL.parquet,
    description: "One table, columnar",
    icon: <FileIcon />,
  },
  {
    value: "xlsx",
    title: CONNECTION_KIND_LABEL.xlsx,
    description: "One table per sheet",
    icon: <FileIcon />,
  },
  {
    value: "sqlite",
    title: CONNECTION_KIND_LABEL.sqlite,
    description: "A single-file database",
    icon: <DbIcon />,
  },
  {
    value: "duckdb",
    title: CONNECTION_KIND_LABEL.duckdb,
    description: "A single-file analytical database",
    icon: <DiskIcon />,
  },
  {
    value: "postgres",
    title: CONNECTION_KIND_LABEL.postgres,
    description: "A server, over the network",
    icon: <DbIcon />,
  },
  {
    value: "custom",
    title: CONNECTION_KIND_LABEL.custom,
    description: "Write the connection string yourself",
    icon: <TextIcon />,
  },
];

/** What a source is, at a glance: a file for bytes and delimited files, a database for anything
 *  reached through a connection. Read off the same two things the string carries -- the `item://`
 *  prefix, and the kind the rest of it parses as. */
function SourceIcon({ connectionString }: { connectionString: string }) {
  if (!connectionString || connectionString.startsWith(ITEM_PREFIX)) return <FileIcon />;
  const { kind } = parseConnectionString(connectionString);
  return kind === "csv" || kind === "parquet" || kind === "xlsx" ? <FileIcon /> : <DbIcon />;
}

export function ConnectionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const edit = useEditContext();
  // One card open at a time, and "none" is a legal state: with the sources stacked, a collapsed
  // list is a readable answer to "what does this blueprint read?" rather than an empty pane.
  const [openId, setOpenId] = useState<string | null>(null);
  // The kind of the open source, when the user picked it rather than it being read back out of
  // the string. Held here, not in the card body: the card is keyed by its source id, so
  // auto-naming would remount it and lose the pick. Cleared whenever a different source is opened.
  const [pickedKind, setPickedKind] = useState<ConnectionKind | null>(null);
  // Columns or rows is a preference about how to read a table, not about one source, so it is
  // shared: switching to rows and opening the next source keeps showing rows.
  const [view, setView] = useState<"columns" | "rows">("columns");
  // The map as it stands *now*. A file picker is awaited, so a handler that closed over the map at
  // render time can resume several updates later and write a snapshot that undoes them; every
  // write goes through `write` below, which keeps this in step without waiting for a re-render.
  const connectionsRef = useRef<Record<string, string>>(edit?.connections ?? {});
  // Where an id went when it was renamed. A handler holds the id the card was opened for, and
  // auto-naming can move it while the handler is awaiting, so ids are resolved through this before
  // being written -- otherwise the write lands on a key nothing points at any more.
  const renamedRef = useRef(new Map<string, string>());
  useEffect(() => {
    connectionsRef.current = edit?.connections ?? {};
  }, [edit]);
  if (!edit) return null;

  const entries = Object.entries(edit.connections);
  // Source ids the blueprint's Source nodes name, so the dialog can flag one with no connection --
  // the single most common reason a run fails.
  const referenced = new Set(
    edit.model.nodes.flatMap((n) => (n.op.type === "source" ? [n.op.source_id] : [])),
  );
  const missing = [...referenced].filter((id) => id && !(id in edit.connections));

  const write = (next: Record<string, string>) => {
    connectionsRef.current = next;
    edit.onConnectionsChange(next);
  };

  /** The id `openedAs` has become, following any renames since a handler captured it. */
  const resolveId = (openedAs: string) => {
    let current = openedAs;
    // Bounded rather than `while`: renaming "a" to "b" and back would otherwise loop.
    for (let i = 0; i < 32; i++) {
      // A name that is in use right now is whatever holds it now, not wherever the source that
      // held it earlier went.
      if (current in connectionsRef.current) break;
      const next = renamedRef.current.get(current);
      if (next === undefined || next === current) break;
      current = next;
    }
    return current;
  };

  /** A placeholder id nothing uses. Any record of an earlier source of that name is dropped: the
   *  name has been freed and reused, so following it would point this source at that one. */
  const mintSourceId = () => {
    const id = uniqueSourceId(connectionsRef.current);
    renamedRef.current.delete(id);
    return id;
  };

  const toggle = (id: string) => {
    setPickedKind(null);
    setOpenId((current) => (current === id ? null : id));
  };

  /** Renames a source and every Source node naming it. Returns why it was refused, or null when it
   *  went through -- the field showing the name has to say something, since a silent no-op leaves
   *  it displaying an id no source has. */
  const rename = (from: string, to: string): string | null => {
    if (from === to) return null;
    // An empty id is not a free slot to rename into: the rebuild below would write every cleared
    // source into the same `""` key, and each one after the first would drop a connection string
    // with nothing on screen saying so.
    if (to === "") return "A source id cannot be empty.";
    if (to in connectionsRef.current) return `"${to}" is already used by another source.`;
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(connectionsRef.current)) next[k === from ? to : k] = v;
    write(next);
    edit.mutate((m) => ({ ...m, nodes: renameSourceId(m.nodes, from, to) }));
    renamedRef.current.delete(to);
    renamedRef.current.set(from, to);
    setOpenId(to);
    return null;
  };

  // Only a placeholder id is replaced, so a name the user typed is never overwritten by a later
  // path change. Called on blur, not per keystroke, so the id doesn't settle on the first character.
  const commit = (openedAs: string, connectionString: string) => {
    const sourceId = resolveId(openedAs);
    const next = { ...connectionsRef.current, [sourceId]: connectionString };
    const suggested = isAutoSourceId(sourceId) ? suggestedSourceId(connectionString) : "";
    const taken = Object.keys(next).filter((k) => k !== sourceId);
    if (!suggested || suggested === sourceId) {
      write(next);
      return;
    }
    // One `onConnectionsChange`, not a set followed by a rename: both would derive from the same
    // pre-update map and the second would undo the first.
    const to = taken.includes(suggested) ? freshId(suggested, taken) : suggested;
    write(Object.fromEntries(Object.entries(next).map(([k, v]) => [k === sourceId ? to : k, v])));
    edit.mutate((m) => ({ ...m, nodes: renameSourceId(m.nodes, sourceId, to) }));
    renamedRef.current.delete(to);
    renamedRef.current.set(sourceId, to);
    setOpenId(to);
  };

  const remove = (openedAs: string) => {
    const sourceId = resolveId(openedAs);
    const next = { ...connectionsRef.current };
    delete next[sourceId];
    write(next);
    if (openId === sourceId) {
      setOpenId(null);
      setPickedKind(null);
    }
  };

  const add = (sourceId?: string, kind?: ConnectionKind) => {
    const id = sourceId ?? mintSourceId();
    renamedRef.current.delete(id);
    write({ ...connectionsRef.current, [id]: "" });
    setOpenId(id);
    setPickedKind(kind ?? null);
  };

  const { onAddFileSource, connectionKindAvailability } = edit.callbacks;
  const unavailable = (kind: ConnectionKind) => connectionKindAvailability?.[kind];
  // The first file kind this host can actually open. The bytes route reads a file without a path
  // at all, so a host that has one can always open a file whatever it says about the path kinds.
  const fileKind = FILE_KINDS.find((k) => unavailable(k) === undefined);
  const noFiles = onAddFileSource === undefined && fileKind === undefined;
  // A host that cannot open Postgres cannot open any server database. Tested for presence, not
  // truth: a host naming no alternative maps the kind to "", still "you cannot open one here".
  const noDatabases = onAddFileSource !== undefined || unavailable("postgres") !== undefined;

  const addFile = async () => {
    if (!onAddFileSource) {
      // No byte route, so the source is a path the user picks or types; the file kinds share the
      // path field, so the card opens on the first one this host can read.
      add(undefined, fileKind ?? "csv");
      return;
    }
    const id = mintSourceId();
    const connection = await onAddFileSource(BYTE_SOURCE_EXTENSIONS);
    if (!connection) return;
    setPickedKind(null);
    setOpenId(id);
    commit(id, connection);
  };

  // Postgres is where a database source starts; the kind cards inside the card body are how it
  // becomes a Custom string, so both kinds stay reachable from one button.
  const addDatabase = () => add(undefined, "postgres");

  // A row that names nothing is not connected, whether or not it exists: the run fails on it
  // exactly as it does on a source with no row at all, so neither counts towards "connected".
  const connected = entries.filter(([, v]) => v !== "").length;
  const blank = entries.filter(([id, v]) => v === "" && referenced.has(id)).length;
  const needed = missing.length + blank;
  const status =
    needed > 0
      ? `${connected} connected - ${needed} still needed`
      : `${connected} source${connected === 1 ? "" : "s"}`;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        maxWidth="880px"
        className="bp-sources-dialog flex max-h-[86vh] flex-col"
        // Inline, not classes: `Dialog.Content` carries Radix's own `.rt-DialogContent` rules
        // (a 9px radius, `--shadow-6`, `overflow: auto`, no border) and Radix's stylesheet is
        // imported after Tailwind's, so a utility class would lose. `box-shadow` is the one
        // exception -- it needs a dark-mode pair, so it comes from `.bp-sources-dialog`.
        style={{
          padding: 0,
          fontSize: 14,
          lineHeight: 1.5,
          border: "1px solid var(--gray-a6)",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <div className="flex items-start justify-between gap-4" style={{ padding: "20px 22px 16px" }}>
          <div>
            <Dialog.Title
              style={{
                margin: "0 0 4px",
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: "-0.006em",
                lineHeight: 1.5,
                color: "var(--gray-12)",
              }}
            >
              Data sources
            </Dialog.Title>
            {/* Font size inline, not as a utility class: `Dialog.Description` carries a Radix size
                class, and Radix's stylesheet is imported after Tailwind's, so a class would lose. */}
            <Dialog.Description
              style={{
                margin: 0,
                maxWidth: "66ch",
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--gray-11)",
              }}
            >
              Each source points at one file or database. Kept for this session only, not saved.
            </Dialog.Description>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
            className="flex cursor-pointer rounded-[3px] border-0 bg-transparent p-[5px] [color:var(--gray-9)] hover:bg-[var(--gray-a3)] hover:[color:var(--gray-12)]"
          >
            <CloseIcon />
          </button>
        </div>

        <div
          className="bp-sources-fade min-h-0 flex-1 overflow-auto"
          style={{ padding: "0 22px 4px", maxHeight: 454 }}
        >
          {entries.length === 0 && missing.length === 0 ? (
            <EmptyState
              noFiles={noFiles}
              noDatabases={noDatabases}
              onAddFile={() => void addFile()}
              onAddDatabase={addDatabase}
            />
          ) : (
            <>
              <div className="flex flex-col gap-[10px]">
                {/* A source the blueprint reads with nothing behind it comes first: it is the one
                    thing here that stops a run. */}
                {missing.map((id) => (
                  <MissingCard key={id} sourceId={id} onConnect={() => add(id)} />
                ))}
                {entries.map(([sourceId, connectionString]) => (
                  <SourceCard
                    key={sourceId}
                    sourceId={sourceId}
                    connectionString={connectionString}
                    used={referenced.has(sourceId)}
                    warn={referenced.has(sourceId) && connectionString === ""}
                    isOpen={sourceId === openId}
                    onToggle={() => toggle(sourceId)}
                    view={view}
                    onViewChange={setView}
                    pickedKind={pickedKind}
                    onPickKind={setPickedKind}
                    onRename={(to) => rename(sourceId, to)}
                    onChange={(s) => write({ ...connectionsRef.current, [sourceId]: s })}
                    onCommit={(s) => commit(sourceId, s)}
                    onRemove={() => remove(sourceId)}
                    connections={edit.connections}
                    tableSchemas={edit.catalog.tables[sourceId] ?? {}}
                    domains={edit.catalog.domains[sourceId] ?? {}}
                    callbacks={edit.callbacks}
                  />
                ))}
              </div>
              <AddRow
                noFiles={noFiles}
                noDatabases={noDatabases}
                onAddFile={() => void addFile()}
                onAddDatabase={addDatabase}
              />
            </>
          )}
        </div>

        <div
          className="flex items-center justify-between gap-[10px]"
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--gray-a4)",
            background: "var(--gray-a2)",
            marginTop: 18,
          }}
        >
          <span className="text-[12.5px]" style={{ color: "var(--gray-11)" }}>
            {status}
          </span>
          <PanelButton variant="accent" onClick={() => onOpenChange(false)}>
            Done
          </PanelButton>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function uniqueSourceId(connections: Record<string, string>): string {
  for (let i = 1; ; i++) {
    const id = `source-${i}`;
    if (!(id in connections)) return id;
  }
}

// -- panel controls -----------------------------------------------------------------------------
// Plain elements, not Radix controls: every size in this panel is set per element, and a Radix
// `Button`/`TextField`/`Select` brings its own scale (14px text in a 32px box at `size="2"`) that a
// class cannot fully talk it out of.

function PanelButton({
  variant = "plain",
  disabled,
  title,
  onClick,
  children,
}: {
  variant?: "plain" | "accent" | "quiet" | "danger";
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  // `danger` is the plain button; only its hover says anything. A destructive action that already
  // looks destructive before it is reached is a warning about nothing.
  const tone = disabled
    ? "cursor-default bg-transparent [color:var(--gray-9)]"
    : variant === "accent"
      ? "cursor-pointer bg-[var(--accent-9)] [font-weight:550] [color:var(--accent-contrast)] hover:bg-[var(--accent-11)]"
      : variant === "quiet"
        ? "cursor-pointer bg-transparent [color:var(--gray-11)] hover:bg-[var(--gray-a3)] hover:[color:var(--gray-12)]"
        : variant === "danger"
          ? "cursor-pointer bg-[var(--color-panel-solid)] [color:var(--gray-12)] hover:bg-[var(--gray-a3)] hover:[color:var(--red-11)]"
          : "cursor-pointer bg-[var(--color-panel-solid)] [color:var(--gray-12)] hover:bg-[var(--gray-a3)]";
  const borderColor = disabled
    ? "var(--gray-a5)"
    : variant === "accent"
      ? "var(--accent-9)"
      : variant === "quiet"
        ? "transparent"
        : "var(--gray-a7)";
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      // Focus stays where it is. Otherwise pressing this blurs the field the user was in, the blur
      // commits and can auto-rename the source, the card is keyed by that id and so remounts, and
      // the button this press landed on is detached before its own `click` is ever dispatched --
      // the picker never opens and the user has to press twice.
      onMouseDown={(e) => e.preventDefault()}
      onClick={disabled ? undefined : onClick}
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-[3px] border px-3 py-[7px] text-[13px] leading-[1.5] ${tone}`}
      style={{ borderColor }}
    >
      {children}
    </button>
  );
}

/** Border colour as a class rather than an inline style, so `:focus` can rewrite it -- an inline
 *  `borderColor` wins over any rule a focus state could add. */
const FIELD_BORDER =
  "border-[var(--gray-a7)] focus:border-[var(--accent-8)] focus:-outline-offset-1 focus:outline-2 focus:[outline-color:var(--accent-8)]";
const FIELD_BORDER_INVALID =
  "border-[var(--red-8)] focus:-outline-offset-1 focus:outline-2 focus:[outline-color:var(--red-8)]";

function PanelInput({
  mono,
  invalid,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; invalid?: boolean }) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={`w-full rounded-[3px] border px-[10px] py-[7px] text-[13.5px] leading-[1.5] ${
        invalid ? FIELD_BORDER_INVALID : FIELD_BORDER
      } ${mono ? "font-mono" : ""} ${className ?? ""}`}
      style={{ background: "var(--color-panel-solid)", color: "var(--gray-12)" }}
    />
  );
}

/** The panel's own select. A Radix `Select` would sit at `size="2"` -- 14px in a 32px box -- right
 *  under a 13.5px input in the same field. */
function PanelSelect({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full cursor-pointer rounded-[3px] border px-[10px] py-[7px] text-[13.5px] leading-[1.5] ${FIELD_BORDER} ${className ?? ""}`}
      style={{ background: "var(--color-panel-solid)", color: "var(--gray-12)" }}
    />
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold" style={{ color: "var(--gray-11)" }}>
        {label}
      </span>
      {children}
      {(error || hint) && (
        <span className="text-[12px]" style={{ color: error ? "var(--red-11)" : "var(--gray-9)" }}>
          {error || hint}
        </span>
      )}
    </div>
  );
}

/** The label row above a block inside a card, with room for one control on the right. Nothing
 *  taller than the 11px label belongs here: a button in this row triples its height and doubles
 *  the gap above whatever the block opens with. */
function SecRow({ label, right, first }: { label: string; right?: React.ReactNode; first?: boolean }) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5" style={first ? undefined : { marginTop: 16 }}>
      <span
        className="text-[11px] [font-weight:650] uppercase"
        style={{ letterSpacing: "0.08em", color: "var(--gray-9)" }}
      >
        {label}
      </span>
      <span className="flex-1" />
      {right}
    </div>
  );
}

// -- cards --------------------------------------------------------------------------------------

/** A source the blueprint reads that has no row at all. No body and no chevron: there is nothing
 *  inside it yet, and the only useful move is to connect something. */
function MissingCard({ sourceId, onConnect }: { sourceId: string; onConnect: () => void }) {
  return (
    <div
      className="overflow-hidden rounded-[5px] border"
      style={{ borderColor: "var(--amber-a6)", background: "var(--amber-a2)" }}
    >
      <div className="flex items-center gap-[11px] px-[14px] py-[13px]" style={{ color: "var(--gray-12)" }}>
        <span className="flex items-center" style={{ color: "var(--amber-11)" }}>
          <WarnIcon />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-mono text-[14.5px] font-semibold" style={{ letterSpacing: "-0.003em" }}>
            {sourceId}
          </span>
          <span className="truncate text-[12.5px]" style={{ color: "var(--amber-11)" }}>
            The blueprint reads this, but nothing is connected to it yet.
          </span>
        </span>
        <PanelButton onClick={onConnect}>
          <PlusIcon /> Connect
        </PanelButton>
      </div>
    </div>
  );
}

function SourceCard({
  sourceId,
  connectionString,
  used,
  warn,
  isOpen,
  onToggle,
  view,
  onViewChange,
  pickedKind,
  onPickKind,
  onRename,
  onChange,
  onCommit,
  onRemove,
  connections,
  tableSchemas,
  domains,
  callbacks,
}: {
  sourceId: string;
  connectionString: string;
  used: boolean;
  /** The blueprint reads this source and it names nothing yet -- the same state `MissingCard`
   *  flags, reached by adding a row and not finishing. */
  warn: boolean;
  isOpen: boolean;
  onToggle: () => void;
  view: "columns" | "rows";
  onViewChange: (v: "columns" | "rows") => void;
  pickedKind: ConnectionKind | null;
  onPickKind: (kind: ConnectionKind) => void;
  /** Returns why the rename was refused, or null when it went through. */
  onRename: (to: string) => string | null;
  onChange: (connectionString: string) => void;
  /** A field was left, so the string is as finished as it is going to get. */
  onCommit: (connectionString: string) => void;
  onRemove: () => void;
  connections: Record<string, string>;
  /** The catalog's schema for this source, keyed by table name. */
  tableSchemas: Record<string, TableSchema>;
  /** Column domains for this source, keyed table -> column -> values. */
  domains: Record<string, Record<string, string[]>>;
  callbacks: BlueprintEditCallbacks;
}) {
  const tables = Object.keys(tableSchemas);
  return (
    <div
      className="overflow-hidden rounded-[5px] border"
      style={{
        borderColor: warn ? "var(--amber-a6)" : "var(--gray-a6)",
        background: warn ? "var(--amber-a2)" : "var(--color-panel-solid)",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full cursor-pointer items-center gap-[11px] border-0 bg-transparent px-[14px] py-[13px] text-left leading-[1.5] hover:bg-[var(--gray-a2)]"
        style={{
          color: "var(--gray-12)",
          borderBottom: isOpen ? "1px solid var(--gray-a4)" : undefined,
        }}
      >
        <span className="flex items-center" style={{ color: warn ? "var(--amber-11)" : "var(--gray-11)" }}>
          {warn ? <WarnIcon /> : <SourceIcon connectionString={connectionString} />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-mono text-[14.5px] font-semibold" style={{ letterSpacing: "-0.003em" }}>
            {sourceId}
          </span>
          <span
            className="truncate text-[12.5px]"
            style={{ color: warn ? "var(--amber-11)" : "var(--gray-11)" }}
          >
            {warn
              ? "The blueprint reads this, but nothing is connected to it yet."
              : describeConnection(connectionString)}
          </span>
        </span>
        {/* Nothing is said about a source that is read and connected: that is the normal case. */}
        {!used && (
          <span
            className="inline-flex items-center whitespace-nowrap text-[12px]"
            style={{ color: "var(--gray-9)" }}
          >
            not read by any step
          </span>
        )}
        <span
          className="flex items-center"
          style={{
            color: "var(--gray-9)",
            transition: "transform .15s",
            transform: isOpen ? "rotate(90deg)" : undefined,
          }}
        >
          <ChevIcon />
        </span>
      </button>
      {isOpen && (
        <div style={{ padding: "16px 14px" }}>
          {tables.length > 0 && (
            <DataBlock
              sourceId={sourceId}
              connectionString={connectionString}
              connections={connections}
              tableSchemas={tableSchemas}
              domains={domains}
              view={view}
              onViewChange={onViewChange}
              onTablePreview={callbacks.onTablePreview}
            />
          )}
          <ConnectionBlock
            sourceId={sourceId}
            connectionString={connectionString}
            first={tables.length === 0}
            pickedKind={pickedKind}
            onPickKind={onPickKind}
            onRename={onRename}
            onChange={onChange}
            onCommit={onCommit}
            onRemove={onRemove}
            callbacks={callbacks}
          />
        </div>
      )}
    </div>
  );
}

// -- data ---------------------------------------------------------------------------------------

/** What the source actually holds. Columns is the default view, not rows, since building a
 *  blueprint means choosing columns; rows stay one click away. */
function DataBlock({
  sourceId,
  connectionString,
  connections,
  tableSchemas,
  domains,
  view,
  onViewChange,
  onTablePreview,
}: {
  sourceId: string;
  connectionString: string;
  connections: Record<string, string>;
  tableSchemas: Record<string, TableSchema>;
  domains: Record<string, Record<string, string[]>>;
  view: "columns" | "rows";
  onViewChange: (v: "columns" | "rows") => void;
  onTablePreview: BlueprintEditCallbacks["onTablePreview"];
}) {
  const tables = Object.keys(tableSchemas);
  const [picked, setPicked] = useState<string | null>(null);
  const table = picked !== null && tables.includes(picked) ? picked : tables[0];
  const [preview, setPreview] = useState<TablePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The whole map is what the callback takes, but only *this* source's string decides whether a
  // refetch is warranted -- keying the effect on the map itself would refetch on every keystroke
  // in an unrelated source's password field.
  const connectionsRef = useRef(connections);
  useEffect(() => {
    connectionsRef.current = connections;
  }, [connections]);

  // A string still being typed is not worth a round trip: the form rewrites it per keystroke, so
  // without this a twelve-character password issues twelve previews and blanks the table between
  // each one. Seeded with the current string, so opening a card still reads immediately.
  const [settled, setSettled] = useState(connectionString);
  useEffect(() => {
    if (settled === connectionString) return;
    const t = setTimeout(() => setSettled(connectionString), 400);
    return () => clearTimeout(t);
  }, [connectionString, settled]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `settled` is the trigger, not an input -- the map is read through the ref, so repointing this source refetches while an edit elsewhere does not.
  useEffect(() => {
    if (!onTablePreview || !table) return;
    // A reply that arrives after the user moved on describes a table no longer on screen.
    let live = true;
    setLoading(true);
    setError(null);
    setPreview(null);
    onTablePreview(connectionsRef.current, sourceId, table, 8)
      .then((p) => {
        if (!live) return;
        setPreview(p);
        setLoading(false);
      })
      .catch((e) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [onTablePreview, sourceId, table, settled]);

  const tableDomains = table ? (domains[table] ?? {}) : {};
  const columns = table ? Object.values(tableSchemas[table]?.columns ?? {}) : [];

  /** A column's values: its full domain when the catalog has one, else what the preview showed. */
  const valuesFor = (name: string): { values: string[]; exact: boolean } => {
    const domain = tableDomains[name];
    if (domain) return { values: domain, exact: true };
    const i = preview?.columns.indexOf(name) ?? -1;
    if (!preview || i < 0) return { values: [], exact: false };
    const seen = new Set<string>();
    for (const row of preview.rows) {
      const v = row[i];
      if (v !== null && v !== "") seen.add(v);
    }
    return { values: [...seen], exact: false };
  };

  // Without a preview callback there are no rows to switch to, so the toggle would offer an empty
  // view; the columns and their domains still come from the catalog.
  const showRows = view === "rows" && onTablePreview !== undefined;

  const toggle = onTablePreview ? (
    <div className="flex gap-0.5 rounded-[4px] p-0.5" style={{ background: "var(--gray-a3)" }}>
      {(["columns", "rows"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onViewChange(v)}
          // Every state as a class, none inline: an inline `background` outranks any `:hover` rule
          // a class could add, so the unselected half gave no feedback at all under the pointer.
          className={`cursor-pointer rounded-[3px] border-0 px-[9px] py-[3px] text-[12px] leading-[1.5] transition-colors ${
            view === v
              ? "bg-[var(--color-panel-solid)] shadow-[0_1px_2px_rgba(0,0,0,.08)] [font-weight:550] [color:var(--gray-12)]"
              : "bg-transparent [color:var(--gray-11)] hover:bg-[var(--gray-a4)] hover:[color:var(--gray-12)]"
          }`}
        >
          {v === "columns" ? "Columns" : "Rows"}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <div>
      {tables.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {tables.map((t) => {
            const on = t === table;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setPicked(t)}
                className={`cursor-pointer rounded-[3px] border px-2.5 py-1 text-[12.5px] leading-[1.5] ${
                  on
                    ? "bg-[var(--accent-9)] [font-weight:550] [color:var(--accent-contrast)]"
                    : "bg-[var(--color-panel-solid)] [color:var(--gray-11)] hover:bg-[var(--gray-a3)] hover:[color:var(--gray-12)]"
                }`}
                style={{ borderColor: on ? "var(--accent-9)" : "var(--gray-a6)" }}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}

      <SecRow label={table ?? "Data"} right={toggle} first />

      {!showRows ? (
        <div className="overflow-hidden rounded-[4px] border" style={{ borderColor: "var(--gray-a5)" }}>
          {columns.map((col, i) => {
            const { values, exact } = valuesFor(col.name);
            return (
              <div
                key={col.name}
                className="grid items-center gap-[14px] px-3 py-[9px] hover:bg-[var(--gray-a2)]"
                style={{
                  gridTemplateColumns: "minmax(0,176px) 92px minmax(0,1fr)",
                  borderTop: i === 0 ? undefined : "1px solid var(--gray-a4)",
                }}
              >
                <span
                  className="truncate font-mono text-[13px] [font-weight:550]"
                  style={{ color: "var(--gray-12)" }}
                >
                  {col.name}
                </span>
                <span
                  className="truncate text-[11px] uppercase"
                  style={{ letterSpacing: "0.04em", color: "var(--gray-9)" }}
                  title={col.nullable ? `${col.col_type}, nullable` : col.col_type}
                >
                  {col.col_type}
                  {col.nullable && <span style={{ opacity: 0.6 }}> ?</span>}
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-[5px]">
                  {values.slice(0, 5).map((v) => (
                    <span
                      key={v}
                      className="rounded-[3px] px-1.5 py-px font-mono text-[11.5px]"
                      style={{ background: "var(--gray-a3)", color: "var(--gray-12)" }}
                    >
                      {v}
                    </span>
                  ))}
                  {values.length > 5 && (
                    <span
                      className="rounded-[3px] px-1.5 py-px text-[11.5px]"
                      style={{ color: "var(--gray-9)" }}
                    >
                      +{values.length - 5}
                    </span>
                  )}
                  {/* Say which it is: a domain is the exact set the compiler emits views from, a
                      preview is only what the first rows happened to contain. */}
                  {values.length > 0 && !exact && (
                    <span className="text-[11px] italic" style={{ color: "var(--gray-9)" }}>
                      seen
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ) : loading ? (
        <span className="text-[12.5px]" style={{ color: "var(--gray-11)" }}>
          Reading…
        </span>
      ) : error ? (
        <span className="block truncate text-[12.5px]" style={{ color: "var(--gray-11)" }} title={error}>
          Could not read a preview: {error}
        </span>
      ) : preview && preview.columns.length > 0 ? (
        <div className="overflow-hidden rounded-[4px] border" style={{ borderColor: "var(--gray-a5)" }}>
          <div className="max-h-[240px] overflow-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  {preview.columns.map((c) => (
                    <th
                      key={c}
                      className="sticky top-0 whitespace-nowrap px-3 py-[7px] text-left font-mono text-[11px] font-semibold"
                      style={{
                        background: "var(--gray-a2)",
                        borderBottom: "1px solid var(--gray-a5)",
                        color: "var(--gray-9)",
                      }}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td
                        key={c}
                        className="whitespace-nowrap px-3 py-[7px] font-mono"
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          borderBottom:
                            r === preview.rows.length - 1 ? undefined : "1px solid var(--gray-a4)",
                          color: "var(--gray-12)",
                        }}
                      >
                        {cell === null ? (
                          <span style={{ opacity: 0.45, fontStyle: "italic" }}>null</span>
                        ) : cell === "" ? (
                          <span style={{ opacity: 0.45, fontStyle: "italic" }}>empty</span>
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <span className="text-[12.5px]" style={{ color: "var(--gray-11)" }}>
          No rows to show.
        </span>
      )}
    </div>
  );
}

// -- connection ---------------------------------------------------------------------------------

/** The kind grid, in the panel's own geometry rather than the shared `CardSelector`'s. An
 *  unavailable kind is shown disabled with the host's own phrase for where it does work, rather
 *  than dropped, so a browser user can still see what the desktop app adds. */
function KindGrid({
  value,
  availability,
  onChange,
}: {
  value: ConnectionKind;
  availability: Partial<Record<ConnectionKind, string>> | undefined;
  onChange: (kind: ConnectionKind) => void;
}) {
  // One `name` per instance, so two open cards stay independent radio groups.
  const groupName = useId();
  return (
    <div
      role="radiogroup"
      aria-label="Connection kind"
      className="grid gap-2"
      style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
    >
      {KIND_OPTIONS.map((option) => {
        const unavailable = availability?.[option.value];
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            // Border and background as classes, not inline: an inline value outranks any `:hover`
            // rule a class could add, so an unpicked kind card stayed inert under the pointer.
            className={`flex flex-col gap-1 rounded-[4px] border p-2.5 text-left transition-colors focus-within:outline-2 focus-within:outline-offset-1 ${
              selected
                ? "border-[var(--accent-9)] bg-[var(--accent-a4)]"
                : "border-[var(--gray-a6)] bg-[var(--color-panel-solid)]"
            } ${
              unavailable !== undefined
                ? "cursor-default"
                : selected
                  ? "cursor-pointer"
                  : "cursor-pointer hover:border-[var(--gray-a8)] hover:bg-[var(--gray-a3)]"
            }`}
            style={{ opacity: unavailable === undefined ? 1 : 0.55, outlineColor: "var(--accent-8)" }}
          >
            {/* A real radio, visually hidden: native grouping gives arrow-key navigation, roving
                tabindex and screen-reader semantics a role="radio" button has to reimplement. */}
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={selected}
              disabled={unavailable !== undefined}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="flex shrink-0"
                style={{ color: selected ? "var(--accent-11)" : "var(--gray-11)" }}
              >
                {option.icon}
              </span>
              <span className="truncate text-[13px] [font-weight:550]" style={{ color: "var(--gray-12)" }}>
                {option.title}
              </span>
            </span>
            <span className="text-[12px] leading-snug" style={{ color: "var(--gray-11)" }}>
              {unavailable === undefined ? option.description : unavailable || "Not available on this build"}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function ConnectionBlock({
  sourceId,
  connectionString,
  first,
  pickedKind,
  onPickKind,
  onRename,
  onChange,
  onCommit,
  onRemove,
  callbacks,
}: {
  sourceId: string;
  connectionString: string;
  first: boolean;
  pickedKind: ConnectionKind | null;
  onPickKind: (kind: ConnectionKind) => void;
  onRename: (to: string) => string | null;
  onChange: (connectionString: string) => void;
  onCommit: (connectionString: string) => void;
  onRemove: () => void;
  callbacks: BlueprintEditCallbacks;
}) {
  const { onPickFile, onAddFileSource, connectionKindAvailability } = callbacks;
  // The kind is read back out of the string, but "Custom" has no marker of its own to read: a
  // string that parses as SQLite parses that way whoever chose it, so picking Custom without
  // remembering the choice snapped straight back and the card was unselectable. `pickedKind` is
  // that memory, and the parsed kind is only the starting point.
  const parsed = useMemo(() => parseConnectionString(connectionString), [connectionString]);
  const draft = pickedKind ? { ...parsed, kind: pickedKind } : parsed;
  const update = (patch: Partial<ConnectionDraft>) => onChange(buildConnectionString({ ...draft, ...patch }));

  return (
    <div>
      <SecRow label="Source" first={first} />

      {/* One handler for every field in the form: `onBlur` is focusout, so it bubbles. Focus moving
          *within* the form is not "the field was left" -- committing there can auto-rename the
          source, which remounts the card (its key is the id) and pulls the focus out of the field
          the user was tabbing into. */}
      <div
        className="flex flex-col gap-3"
        onBlur={(e) => {
          if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
          onCommit(connectionString);
        }}
      >
        {/* Byte mode has no kind to pick. The format is read off the file's own extension when
            its bytes are registered, so a kind selector here would decide nothing -- and every
            other field it gates (a path to type, a CSV delimiter) is unrepresentable in an
            `item://` string, which carries a registry id and nothing else. */}
        {!onAddFileSource && (
          <KindGrid
            value={draft.kind}
            availability={connectionKindAvailability}
            onChange={(kind) => {
              onPickKind(kind);
              // Switching kind starts from a clean draft of that kind, keeping only the path, the
              // one field the file-backed kinds share.
              onChange(
                buildConnectionString({ ...EMPTY_DRAFT, kind, path: draft.path, raw: connectionString }),
              );
            }}
          />
        )}

        {onAddFileSource ? (
          // No path field: the picker hands back a finished `item://` string, and the bytes live
          // in the registry, so there is nothing for the user to type or correct.
          <div className="flex min-w-0 items-center gap-2.5">
            <PanelButton
              onClick={async () => {
                const conn = await onAddFileSource(BYTE_SOURCE_EXTENSIONS);
                if (conn) onCommit(conn);
              }}
            >
              <FileIcon /> {connectionString ? "Replace file…" : "Choose a file…"}
            </PanelButton>
            {connectionString && (
              <span
                className="truncate font-mono text-[12.5px]"
                style={{ color: "var(--gray-11)" }}
                title={connectionString}
              >
                {connectionString.startsWith(ITEM_PREFIX)
                  ? connectionString.slice(ITEM_PREFIX.length)
                  : connectionString}
              </span>
            )}
          </div>
        ) : (
          (FILE_KINDS as readonly ConnectionKind[]).includes(draft.kind) && (
            <>
              <Field label={draft.kind === "sqlite" || draft.kind === "duckdb" ? "Database file" : "File"}>
                <div className="flex items-center gap-2">
                  <PanelInput
                    mono
                    aria-label="File path"
                    placeholder={
                      draft.kind === "sqlite" || draft.kind === "duckdb"
                        ? `/data/warehouse.${draft.kind}`
                        : `/data/orders.${draft.kind}`
                    }
                    value={draft.path}
                    onChange={(e) => update({ path: e.target.value })}
                  />
                  {/* A host with no filesystem has nothing to browse. */}
                  {onPickFile && (
                    <PanelButton
                      onClick={async () => {
                        const path = await onPickFile(KIND_EXTENSIONS[draft.kind] ?? []);
                        if (path) onCommit(buildConnectionString({ ...draft, path }));
                      }}
                    >
                      Browse…
                    </PanelButton>
                  )}
                </div>
              </Field>
              {draft.kind === "csv" && (
                <Field label="Delimiter">
                  <PanelSelect
                    aria-label="Delimiter"
                    value={draft.delimiter || "default"}
                    onChange={(e) =>
                      update({ delimiter: e.target.value === "default" ? "" : e.target.value })
                    }
                  >
                    <option value="default">Comma (default)</option>
                    <option value=";">Semicolon ;</option>
                    {/* JSX attribute strings do not process escapes, so this is a literal
                        backslash-t -- what the delimiter has always been written as here. */}
                    <option value="\t">Tab</option>
                    <option value="|">Pipe |</option>
                  </PanelSelect>
                </Field>
              )}
            </>
          )
        )}

        {!onAddFileSource && draft.kind === "postgres" && (
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Host">
              <PanelInput
                value={draft.host}
                placeholder="localhost"
                onChange={(e) => update({ host: e.target.value })}
              />
            </Field>
            <Field label="Port">
              <PanelInput
                value={draft.port}
                placeholder="5432"
                onChange={(e) => update({ port: e.target.value })}
              />
            </Field>
            <Field label="User">
              <PanelInput value={draft.user} onChange={(e) => update({ user: e.target.value })} />
            </Field>
            <Field label="Password">
              <PanelInput
                type="password"
                value={draft.password}
                onChange={(e) => update({ password: e.target.value })}
              />
            </Field>
            <Field label="Database">
              <PanelInput value={draft.database} onChange={(e) => update({ database: e.target.value })} />
            </Field>
          </div>
        )}

        {!onAddFileSource && draft.kind === "custom" && (
          <Field label="Connection string" hint="Anything dbcon accepts. Used verbatim.">
            <PanelInput
              mono
              value={connectionString}
              placeholder="postgres://user@host:5432/db"
              onChange={(e) => onChange(e.target.value)}
            />
          </Field>
        )}
      </div>

      {/* Outside the form's blur handler: renaming already writes the map, and committing the
          connection string in the same breath would derive its update from the pre-rename map. */}
      <div className="mt-3">
        <SourceIdField sourceId={sourceId} onRename={onRename} />
      </div>

      {/* At the end of the block rather than in the "Source" label row: a 13px button in that row
          triples its height and doubles the gap above the first field. */}
      <div className="mt-4 flex justify-end">
        <PanelButton variant="danger" onClick={onRemove}>
          Remove source
        </PanelButton>
      </div>
    </div>
  );
}

/** The name the blueprint's Source nodes use. Held locally while typing and renamed on the way
 *  out, since renaming per keystroke remounts the card (its key is the id) and steals focus. A
 *  refused rename is said out loud rather than silently reverted. */
function SourceIdField({
  sourceId,
  onRename,
}: {
  sourceId: string;
  onRename: (to: string) => string | null;
}) {
  const [draft, setDraft] = useState(sourceId);
  const [error, setError] = useState<string | null>(null);
  // A rename that lands remounts this component (the card's key is the id), so this is for the id
  // moving underneath us -- auto-naming from a path typed in the field above.
  useEffect(() => {
    setDraft(sourceId);
    setError(null);
  }, [sourceId]);
  return (
    <Field label="Source id" hint="Renames every Source node using it." error={error}>
      <PanelInput
        mono
        value={draft}
        invalid={error !== null}
        aria-label="Source id"
        onChange={(e) => {
          setDraft(e.target.value);
          setError(null);
        }}
        onBlur={() => setError(onRename(draft))}
        onKeyDown={(e) => {
          if (e.key === "Enter") setError(onRename(draft));
          if (e.key === "Escape") {
            setDraft(sourceId);
            setError(null);
          }
        }}
      />
    </Field>
  );
}

// -- adding -------------------------------------------------------------------------------------

function AddRow({
  noFiles,
  noDatabases,
  onAddFile,
  onAddDatabase,
}: {
  noFiles: boolean;
  noDatabases: boolean;
  onAddFile: () => void;
  onAddDatabase: () => void;
}) {
  return (
    <div>
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <PanelButton disabled={noFiles} onClick={onAddFile}>
          <FileIcon /> Open a file…
        </PanelButton>
        <PanelButton disabled={noDatabases} onClick={onAddDatabase}>
          <DbIcon /> Connect a database…
        </PanelButton>
      </div>
    </div>
  );
}

function EmptyState({
  noFiles,
  noDatabases,
  onAddFile,
  onAddDatabase,
}: {
  noFiles: boolean;
  noDatabases: boolean;
  onAddFile: () => void;
  onAddDatabase: () => void;
}) {
  return (
    <div
      className="rounded-[5px] border border-dashed text-center"
      style={{ padding: "34px 22px", borderColor: "var(--gray-a7)", background: "var(--gray-a2)" }}
    >
      <h3 className="mb-[5px] text-[15px] font-semibold" style={{ color: "var(--gray-12)" }}>
        No data sources yet
      </h3>
      <p className="mx-auto mb-4 text-[13px]" style={{ maxWidth: "46ch", color: "var(--gray-11)" }}>
        A blueprint turns tables into an event log. Point it at a file or a database to begin.
      </p>
      <div className="flex justify-center gap-2">
        <PanelButton variant="accent" disabled={noFiles} onClick={onAddFile}>
          <FileIcon /> Open a file…
        </PanelButton>
        <PanelButton disabled={noDatabases} onClick={onAddDatabase}>
          <DbIcon /> Connect a database…
        </PanelButton>
      </div>
      {noDatabases && (
        <div className="mt-2 text-[12px]" style={{ color: "var(--gray-9)" }}>
          Databases need the desktop app or a server.
        </div>
      )}
    </div>
  );
}
