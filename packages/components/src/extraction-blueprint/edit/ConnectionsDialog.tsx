// Where a blueprint's `source_id`s get pointed at real data. Connection strings are never part of
// `EditorBlueprint`/`Blueprint` (spec 1.7, 2.6): this dialog puts them only into
// `EditContext.connections`. It does call `mutate`, but for one thing -- carrying a source-id
// rename into the Source nodes that name it -- and never with a connection string.
//
// A connection string is easy to get subtly wrong by hand (`sqlite://` vs a bare path, a delimiter
// that has to be percent-encoded, a Postgres URL with an "@" in the password), so each source is
// edited as a form for its kind and the string is derived. The string stays authoritative: a kind
// the form does not recognise falls back to "Custom" holding the text verbatim, so a pasted URL is
// never mangled by being round-tripped through fields.
import {
  Badge,
  Button,
  Callout,
  CardSelector,
  Dialog,
  IconButton,
  Select,
  Text,
  TextField,
  type CardSelectorOption,
} from "@r4pm/components/ui";
import { useEffect, useMemo, useState } from "react";
import {
  PiCheckCircle,
  PiDatabase,
  PiFileCsv,
  PiFileText,
  PiFolderOpen,
  PiHardDrives,
  PiPlus,
  PiWarningCircle,
  PiX,
} from "react-icons/pi";
import {
  buildConnectionString,
  CONNECTION_KIND_LABEL,
  describeConnection,
  EMPTY_DRAFT,
  isAutoSourceId,
  parseConnectionString,
  suggestedSourceId,
  type ConnectionDraft,
  type ConnectionKind,
} from "./connection-string";
import { useEditContext } from "./edit-context";
import { freshId, renameSourceId } from "./node-draft";
import { RemoveButton } from "./RemoveButton";

/** File extensions the native picker offers per kind. */
const KIND_EXTENSIONS: Partial<Record<ConnectionKind, string[]>> = {
  csv: ["csv", "tsv", "txt"],
  sqlite: ["sqlite", "sqlite3", "db"],
  duckdb: ["duckdb"],
};

const KIND_OPTIONS: CardSelectorOption<ConnectionKind>[] = [
  {
    value: "csv",
    title: CONNECTION_KIND_LABEL.csv,
    description: "One table, from a delimited file",
    icon: <PiFileCsv size={15} />,
    accent: "green",
  },
  {
    value: "sqlite",
    title: CONNECTION_KIND_LABEL.sqlite,
    description: "A single-file database",
    icon: <PiDatabase size={15} />,
    accent: "blue",
  },
  {
    value: "duckdb",
    title: CONNECTION_KIND_LABEL.duckdb,
    description: "A single-file analytical database",
    icon: <PiHardDrives size={15} />,
    accent: "amber",
  },
  {
    value: "postgres",
    title: CONNECTION_KIND_LABEL.postgres,
    description: "A server, over the network",
    icon: <PiDatabase size={15} />,
    accent: "indigo",
  },
  {
    value: "custom",
    title: CONNECTION_KIND_LABEL.custom,
    description: "Write the connection string yourself",
    icon: <PiFileText size={15} />,
    accent: "gray",
  },
];

export function ConnectionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const edit = useEditContext();
  const [editingId, setEditingId] = useState<string | null>(null);
  // The kind of the row being edited, when the user picked it rather than it being read back out
  // of the string. Held here, not in the row: a row is keyed by its source id, so auto-naming
  // would remount it and lose the pick. Cleared only when a different row is opened.
  const [pickedKind, setPickedKind] = useState<ConnectionKind | null>(null);
  // Opening with nothing to edit meant "Connect a source" showed "No connections yet." and a
  // second click was needed before a field existed. Start with one, ready to type into.
  const connectionCount = edit ? Object.keys(edit.connections).length : 0;
  useEffect(() => {
    if (!open || !edit || connectionCount > 0) return;
    const id = uniqueSourceId(edit.connections);
    edit.onConnectionsChange({ ...edit.connections, [id]: "" });
    setEditingId(id);
  }, [open, edit, connectionCount]);
  if (!edit) return null;

  const entries = Object.entries(edit.connections);
  // Source ids the blueprint's Source nodes name, so the dialog can flag one with no connection --
  // the single most common reason a run fails.
  const referenced = new Set(
    edit.model.nodes.flatMap((n) => (n.op.type === "source" ? [n.op.source_id] : [])),
  );
  const missing = [...referenced].filter((id) => id && !(id in edit.connections));

  const rename = (from: string, to: string) => {
    if (from === to || (to !== "" && to in edit.connections)) return;
    const next: Record<string, string> = {};
    for (const [k, v] of entries) next[k === from ? to : k] = v;
    edit.onConnectionsChange(next);
    edit.mutate((m) => ({ ...m, nodes: renameSourceId(m.nodes, from, to) }));
    setEditingId(to);
  };

  // A source called "source-1" says nothing; the file it points at does. Only a placeholder id is
  // replaced, so a name the user typed is never overwritten by a later path change. Called when a
  // field is left, never per keystroke -- naming as the path is typed would settle on the first
  // character and, no longer being a placeholder, never correct itself.
  const commit = (sourceId: string, connectionString: string) => {
    const next = { ...edit.connections, [sourceId]: connectionString };
    const suggested = isAutoSourceId(sourceId) ? suggestedSourceId(connectionString) : "";
    const taken = Object.keys(next).filter((k) => k !== sourceId);
    if (!suggested || suggested === sourceId) {
      edit.onConnectionsChange(next);
      return;
    }
    // One `onConnectionsChange`, not a set followed by a rename: both would derive from the same
    // pre-update map and the second would undo the first.
    const to = taken.includes(suggested) ? freshId(suggested, taken) : suggested;
    edit.onConnectionsChange(
      Object.fromEntries(Object.entries(next).map(([k, v]) => [k === sourceId ? to : k, v])),
    );
    edit.mutate((m) => ({ ...m, nodes: renameSourceId(m.nodes, sourceId, to) }));
    setEditingId(to);
  };

  const remove = (sourceId: string) => {
    const next = { ...edit.connections };
    delete next[sourceId];
    edit.onConnectionsChange(next);
    if (editingId === sourceId) setEditingId(null);
  };

  const add = (sourceId?: string) => {
    const id = sourceId ?? uniqueSourceId(edit.connections);
    edit.onConnectionsChange({ ...edit.connections, [id]: "" });
    setEditingId(id);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="640px" className="flex max-h-[86vh] flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Dialog.Title size="3" mb="1">
              Connections
            </Dialog.Title>
            <Dialog.Description size="1" color="gray">
              Each source id in the blueprint points at one database or file. Held for this session only,
              never written into the blueprint itself.
            </Dialog.Description>
          </div>
          <Dialog.Close>
            <IconButton size="1" variant="ghost" color="gray" aria-label="Close">
              <PiX />
            </IconButton>
          </Dialog.Close>
        </div>

        {missing.length > 0 && (
          <Callout.Root color="amber" size="1" className="mt-3">
            <Callout.Icon>
              <PiWarningCircle />
            </Callout.Icon>
            <Callout.Text>
              The blueprint reads{" "}
              {missing.map((id, i) => (
                <span key={id}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    className="cursor-pointer border-none bg-transparent p-0 font-mono underline"
                    onClick={() => add(id)}
                  >
                    {id}
                  </button>
                </span>
              ))}
              , which {missing.length === 1 ? "has" : "have"} no connection yet.
            </Callout.Text>
          </Callout.Root>
        )}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          {entries.length === 0 && (
            <Text size="1" color="gray" className="block py-6 text-center">
              No connections yet.
            </Text>
          )}
          <div className="flex flex-col gap-2">
            {entries.map(([sourceId, connStr]) => (
              <ConnectionRow
                key={sourceId}
                sourceId={sourceId}
                connectionString={connStr}
                used={referenced.has(sourceId)}
                expanded={editingId === sourceId}
                pickedKind={editingId === sourceId ? pickedKind : null}
                onPickKind={setPickedKind}
                onToggle={() => {
                  setPickedKind(null);
                  setEditingId(editingId === sourceId ? null : sourceId);
                }}
                onRename={(to) => rename(sourceId, to)}
                onChange={(s) => edit.onConnectionsChange({ ...edit.connections, [sourceId]: s })}
                onCommit={(s) => commit(sourceId, s)}
                onPickFile={edit.callbacks.onPickFile}
                onRemove={() => remove(sourceId)}
              />
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button size="2" variant="soft" onClick={() => add()}>
            <PiPlus /> Add source
          </Button>
          <Dialog.Close>
            <Button size="2">Done</Button>
          </Dialog.Close>
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

function ConnectionRow({
  sourceId,
  connectionString,
  used,
  expanded,
  pickedKind,
  onPickKind,
  onToggle,
  onRename,
  onChange,
  onCommit,
  onPickFile,
  onRemove,
}: {
  sourceId: string;
  connectionString: string;
  used: boolean;
  expanded: boolean;
  pickedKind: ConnectionKind | null;
  onPickKind: (kind: ConnectionKind) => void;
  onToggle: () => void;
  onRename: (to: string) => void;
  onChange: (connectionString: string) => void;
  /** A field was left, so the string is as finished as it is going to get. */
  onCommit: (connectionString: string) => void;
  onPickFile?: (extensions: string[]) => Promise<string | undefined>;
  onRemove: () => void;
}) {
  // The kind is read back out of the string, but "Custom" has no marker of its own to read: a
  // string that parses as SQLite parses that way whoever chose it, so picking Custom without
  // remembering the choice snapped straight back and the card was unselectable. `pickedKind` is
  // that memory, and the parsed kind is only the starting point.
  const parsed = useMemo(() => parseConnectionString(connectionString), [connectionString]);
  const draft = pickedKind ? { ...parsed, kind: pickedKind } : parsed;
  const update = (patch: Partial<ConnectionDraft>) => onChange(buildConnectionString({ ...draft, ...patch }));

  return (
    <div className="overflow-hidden rounded-md" style={{ border: "1px solid var(--gray-a6)" }}>
      <div className="flex items-center gap-2 px-2 py-1.5" style={{ background: "var(--gray-a2)" }}>
        <TextField.Root
          size="1"
          className="w-[150px] font-mono"
          value={sourceId}
          aria-label="Source id"
          onChange={(e) => onRename(e.target.value)}
        />
        <span className="min-w-0 flex-1 truncate text-[11px] opacity-60">
          {describeConnection(connectionString)}
        </span>
        {used ? (
          <Badge size="1" color="green" variant="soft">
            <PiCheckCircle /> in use
          </Badge>
        ) : (
          <Badge size="1" color="gray" variant="soft">
            unused
          </Badge>
        )}
        <Button size="1" variant="ghost" onClick={onToggle}>
          {expanded ? "Done" : "Edit"}
        </Button>
        <RemoveButton label="Remove source" onClick={onRemove} />
      </div>

      {expanded && (
        // One handler for every field in the form: `onBlur` is focusout, so it bubbles.
        <div className="p-2.5" onBlur={() => onCommit(connectionString)}>
          <CardSelector
            options={KIND_OPTIONS}
            value={draft.kind}
            columns={3}
            aria-label="Connection kind"
            onValueChange={(kind) => {
              onPickKind(kind);
              // Switching kind starts from a clean draft of that kind, keeping only the path, the
              // one field the file-backed kinds share.
              onChange(
                buildConnectionString({
                  ...EMPTY_DRAFT,
                  kind,
                  path: draft.path,
                  raw: connectionString,
                }),
              );
            }}
          />

          {(draft.kind === "csv" || draft.kind === "sqlite" || draft.kind === "duckdb") && (
            <div className="flex flex-col gap-2">
              <LabelledField label="File path">
                <div className="flex items-center gap-1">
                  <TextField.Root
                    size="1"
                    className="min-w-0 flex-1 font-mono"
                    placeholder={draft.kind === "csv" ? "/data/orders.csv" : `/data/warehouse.${draft.kind}`}
                    value={draft.path}
                    onChange={(e) => update({ path: e.target.value })}
                  />
                  {onPickFile && (
                    <Button
                      size="1"
                      variant="soft"
                      color="gray"
                      onClick={async () => {
                        const path = await onPickFile(KIND_EXTENSIONS[draft.kind] ?? []);
                        if (path) onCommit(buildConnectionString({ ...draft, path }));
                      }}
                    >
                      <PiFolderOpen /> Browse
                    </Button>
                  )}
                </div>
              </LabelledField>
              {draft.kind === "csv" && (
                <LabelledField label="Delimiter" hint="Leave as comma unless the file uses another.">
                  <Select.Root
                    size="1"
                    value={draft.delimiter || "default"}
                    onValueChange={(v) => update({ delimiter: v === "default" ? "" : v })}
                  >
                    <Select.Trigger />
                    <Select.Content>
                      <Select.Item value="default">Comma (default)</Select.Item>
                      <Select.Item value=";">Semicolon ;</Select.Item>
                      <Select.Item value="\t">Tab</Select.Item>
                      <Select.Item value="|">Pipe |</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </LabelledField>
              )}
            </div>
          )}

          {draft.kind === "postgres" && (
            <div className="grid grid-cols-2 gap-2">
              <LabelledField label="Host">
                <TextField.Root
                  size="1"
                  value={draft.host}
                  placeholder="localhost"
                  onChange={(e) => update({ host: e.target.value })}
                />
              </LabelledField>
              <LabelledField label="Port">
                <TextField.Root
                  size="1"
                  value={draft.port}
                  placeholder="5432"
                  onChange={(e) => update({ port: e.target.value })}
                />
              </LabelledField>
              <LabelledField label="User">
                <TextField.Root
                  size="1"
                  value={draft.user}
                  onChange={(e) => update({ user: e.target.value })}
                />
              </LabelledField>
              <LabelledField label="Password">
                <TextField.Root
                  size="1"
                  type="password"
                  value={draft.password}
                  onChange={(e) => update({ password: e.target.value })}
                />
              </LabelledField>
              <LabelledField label="Database">
                <TextField.Root
                  size="1"
                  value={draft.database}
                  onChange={(e) => update({ database: e.target.value })}
                />
              </LabelledField>
            </div>
          )}

          {draft.kind === "custom" && (
            <LabelledField label="Connection string" hint="Anything dbcon accepts. Used verbatim.">
              <TextField.Root
                size="1"
                className="font-mono"
                value={connectionString}
                placeholder="postgres://user@host:5432/db"
                onChange={(e) => onChange(e.target.value)}
              />
            </LabelledField>
          )}

          {draft.kind !== "custom" && connectionString && (
            <div className="mt-2 rounded px-2 py-1" style={{ background: "var(--gray-a3)" }}>
              <Text size="1" color="gray" className="text-[10px]">
                Resolves to <span className="font-mono">{describeConnection(connectionString)}</span>
              </Text>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LabelledField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Text size="1" color="gray" weight="medium">
        {label}
      </Text>
      {children}
      {hint && (
        <Text size="1" color="gray" className="text-[10px]">
          {hint}
        </Text>
      )}
    </div>
  );
}
