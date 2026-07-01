import { Fragment, type KeyboardEvent, type ReactNode, useMemo, useRef, useState } from "react";
import {
  Button,
  Combobox,
  Flex,
  IconButton,
  Kbd,
  Popover,
  Select,
  Text,
  TextField,
} from "@r4pm/components/ui";
import { PiClock, PiCopy, PiGear, PiPlus, PiTable, PiTreeView, PiX } from "react-icons/pi";
import { ActivityChip } from "../shared/ActivitySequence";
import { useColorOf } from "../viewer/viewer-config";
import { EditableGrid, type GridColumn } from "./EditableGrid";
import { TimeControls } from "./TimeControls";
import {
  addCaseAttrColumn,
  appendEvents,
  ATTR_TYPES,
  type AttrColumn,
  type AttrType,
  type CaseMeta,
  duplicateCase,
  type EventLogModel,
  type EventRow,
  getCaseMeta,
  nextCaseId,
  reflowTimes,
  removeCase,
  removeCaseAttrColumn,
  renameCaseId,
  reorderWithinCase,
  rowsByCase,
  setCaseAttr,
  setCaseCount,
} from "./model";

export interface EventLogEditorProps {
  model: EventLogModel;
  onChange: (model: EventLogModel) => void;
  /** Optional action bar rendered at the top-right (e.g. studio Save / Import). */
  actions?: ReactNode;
}

function TraceChip({ activity, onRemove }: { activity: string; onRemove: () => void }) {
  const colorOf = useColorOf("activity");
  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      className="group/chip"
    >
      <ActivityChip activity={activity} color={colorOf(activity)} chain={false} />
      <button
        type="button"
        aria-label={`Remove ${activity}`}
        onClick={onRemove}
        className="opacity-0 group-hover/chip:opacity-100"
        style={{
          position: "absolute",
          top: -5,
          right: -5,
          width: 15,
          height: 15,
          borderRadius: 999,
          border: "none",
          background: "var(--gray-12)",
          color: "var(--gray-1)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "opacity 80ms",
        }}
      >
        <PiX size={9} />
      </button>
    </span>
  );
}

/** Vertical insertion marker shown between chips while drag-reordering a trace. */
function InsertBar() {
  return (
    <span
      aria-hidden
      style={{
        width: 3,
        alignSelf: "stretch",
        minHeight: 22,
        background: "var(--accent-9)",
        borderRadius: 2,
      }}
    />
  );
}

/** One case: editable id, activity chips, and a color-coded combobox to append the next activity.
 *  `keepOpenOnSelect` lets a whole trace be typed activity-by-activity without reopening. */
function TraceCard({
  caseId,
  events,
  knownActivities,
  meta,
  caseAttrColumns,
  onAddActivity,
  onRemoveEvent,
  onRename,
  onDuplicate,
  onSetCount,
  onSetCaseAttr,
  onAddCaseColumn,
  onDelete,
  onReorder,
  autoOpen,
}: {
  caseId: string;
  events: EventRow[];
  knownActivities: string[];
  meta: CaseMeta;
  caseAttrColumns: AttrColumn[];
  onAddActivity: (activity: string) => void;
  onRemoveEvent: (rowId: string) => void;
  onRename: (next: string) => void;
  onDuplicate: () => void;
  /** Set this case's export multiplier (>= 1). */
  onSetCount: (n: number) => void;
  /** Set one case-attribute value for this case. */
  onSetCaseAttr: (name: string, value: string) => void;
  /** Define a new shared case-attribute column. */
  onAddCaseColumn: (name: string, type: AttrType) => void;
  onDelete: () => void;
  /** Move the event at `from` to `to` within this case (drag-reorder the trace). */
  onReorder: (from: number, to: number) => void;
  /** Open and focus this trace's activity combobox on mount (fresh trace continues keyboard entry). */
  autoOpen?: boolean;
}) {
  const colorOf = useColorOf("activity");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  // A from->to move lands the chip after the hovered chip when dragging rightward, before it when
  // dragging leftward; render the insertion bar on that side.
  const barSide = (i: number): "before" | "after" | null => {
    if (dragIdx === null || overIdx !== i || dragIdx === i) return null;
    return dragIdx < i ? "after" : "before";
  };
  return (
    <div
      className="group/row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 10px",
        borderBottom: "1px solid var(--gray-3)",
      }}
    >
      <TextField.Root
        size="1"
        value={caseId}
        onChange={(e) => onRename(e.target.value)}
        aria-label="Case id"
        style={{ width: 92, flexShrink: 0 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
        {events.map((ev, i) => (
          <Fragment key={ev.rowId}>
            {barSide(i) === "before" && <InsertBar />}
            <span
              draggable
              onDragStart={(e) => {
                setDragIdx(i);
                e.dataTransfer.effectAllowed = "move";
                // Mark as an internal drag so the app's global file-drop overlay ignores it
                // (a browser reports empty dataTransfer.types for an untagged element drag).
                e.dataTransfer.setData("application/x-r4pm-dnd", "reorder");
              }}
              onDragEnter={() => dragIdx !== null && setOverIdx(i)}
              onDragOver={(e) => {
                if (dragIdx === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverIdx(i);
              }}
              onDrop={() => {
                if (dragIdx !== null && dragIdx !== i) onReorder(dragIdx, i);
                setDragIdx(null);
                setOverIdx(null);
              }}
              onDragEnd={() => {
                setDragIdx(null);
                setOverIdx(null);
              }}
              style={{ cursor: "grab", opacity: dragIdx === i ? 0.4 : 1, display: "inline-flex" }}
            >
              <TraceChip activity={ev.activity || "(unnamed)"} onRemove={() => onRemoveEvent(ev.rowId)} />
            </span>
            {barSide(i) === "after" && <InsertBar />}
          </Fragment>
        ))}
        <Combobox
          value=""
          options={knownActivities}
          optionColor={colorOf}
          allowCreate
          keepOpenOnSelect
          autoOpen={autoOpen}
          size="2"
          placeholder="+ activity"
          searchPlaceholder="type or pick activity…"
          createLabel={(q) => `Add "${q}"`}
          aria-label={`Add activity to ${caseId}`}
          onValueChange={(a) => {
            const name = a.trim();
            if (name) onAddActivity(name);
          }}
        />
      </div>
      {meta.count > 1 && (
        <span
          title={`Exported ${meta.count} times as ${caseId}-1 … ${caseId}-${meta.count}`}
          style={{
            flexShrink: 0,
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1,
            padding: "3px 5px",
            borderRadius: 4,
            color: "var(--accent-11)",
            background: "var(--accent-3)",
          }}
        >
          ×{meta.count}
        </span>
      )}
      <div
        className="opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100"
        style={{ display: "flex", gap: 2, flexShrink: 0, transition: "opacity 80ms" }}
      >
        <CaseSettings
          caseId={caseId}
          meta={meta}
          caseAttrColumns={caseAttrColumns}
          onSetCount={onSetCount}
          onSetCaseAttr={onSetCaseAttr}
          onAddCaseColumn={onAddCaseColumn}
        />
        <IconButton size="1" variant="ghost" color="gray" aria-label="Duplicate case" onClick={onDuplicate}>
          <PiCopy size={14} />
        </IconButton>
        <IconButton size="1" variant="ghost" color="gray" aria-label="Delete case" onClick={onDelete}>
          <PiX size={14} />
        </IconButton>
      </div>
    </div>
  );
}

/** Per-case settings popover: the export multiplier (count) and case-level attribute values.
 *  Count only stores a weight - copies materialize at export, never in the editor. Case attributes
 *  are shared columns (`caseAttrColumns`); the popover edits this case's value per column and can
 *  define a new column. */
function CaseSettings({
  caseId,
  meta,
  caseAttrColumns,
  onSetCount,
  onSetCaseAttr,
  onAddCaseColumn,
}: {
  caseId: string;
  meta: CaseMeta;
  caseAttrColumns: AttrColumn[];
  onSetCount: (n: number) => void;
  onSetCaseAttr: (name: string, value: string) => void;
  onAddCaseColumn: (name: string, type: AttrType) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AttrType>("string");
  const addColumn = () => {
    const name = newName.trim();
    if (!name) return;
    onAddCaseColumn(name, newType);
    setNewName("");
  };
  const hasValues = Object.values(meta.attrs).some((v) => v.trim() !== "");
  return (
    <Popover.Root>
      <Popover.Trigger>
        <IconButton
          size="1"
          variant={meta.count > 1 || hasValues ? "soft" : "ghost"}
          color="gray"
          aria-label={`Case settings for ${caseId}`}
          title="Case count and attributes"
        >
          <PiGear size={14} />
        </IconButton>
      </Popover.Trigger>
      <Popover.Content size="1" style={{ width: 300 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Text size="1" weight="bold" style={{ width: 52, flexShrink: 0 }}>
              Copies
            </Text>
            <TextField.Root
              size="1"
              type="number"
              min={1}
              value={String(meta.count)}
              onChange={(e) => onSetCount(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              aria-label={`Export copies for ${caseId}`}
              style={{ width: 70 }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Text size="1" weight="bold">
              Case attributes
            </Text>
            {caseAttrColumns.length === 0 && (
              <Text size="1" color="gray">
                No case attributes defined. Add one below.
              </Text>
            )}
            {caseAttrColumns.map((c) => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Text
                  size="1"
                  style={{ width: 90, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis" }}
                  title={`${c.name} (${c.type})`}
                >
                  {c.name}
                </Text>
                {c.type === "boolean" ? (
                  <input
                    type="checkbox"
                    aria-label={`${c.name} for ${caseId}`}
                    checked={(meta.attrs[c.name] ?? "") === "true"}
                    onChange={(e) => onSetCaseAttr(c.name, e.target.checked ? "true" : "false")}
                  />
                ) : (
                  <TextField.Root
                    size="1"
                    placeholder="value"
                    inputMode={c.type === "int" ? "numeric" : c.type === "float" ? "decimal" : "text"}
                    value={meta.attrs[c.name] ?? ""}
                    onChange={(e) => onSetCaseAttr(c.name, e.target.value)}
                    aria-label={`${c.name} for ${caseId}`}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                )}
              </div>
            ))}
            <Flex
              direction="column"
              gap="2"
              style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--gray-a4)" }}
            >
              <Text size="1" color="gray">
                New attribute
              </Text>
              <Flex align="center" gap="2">
                <TextField.Root
                  size="1"
                  placeholder="name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addColumn();
                    }
                  }}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <Select.Root size="1" value={newType} onValueChange={(v) => setNewType(v as AttrType)}>
                  <Select.Trigger />
                  <Select.Content>
                    {ATTR_TYPES.map((t) => (
                      <Select.Item key={t} value={t}>
                        {t}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
                <Button size="1" variant="soft" onClick={addColumn} disabled={!newName.trim()}>
                  Add
                </Button>
              </Flex>
            </Flex>
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

/** Controlled, backend-free event-log authoring surface. Combobox-driven trace builder by default;
 *  an opt-in table view exposes timestamps, typed attributes and the grammar quick-add. */
export function EventLogEditor({ model, onChange, actions }: EventLogEditorProps) {
  const [view, setView] = useState<"traces" | "table">("traces");
  // Start an empty log with one ready-to-type trace rather than a bare "New case" button.
  const seedFirst = model.rows.length === 0;
  const [draftCases, setDraftCases] = useState<string[]>(() => (seedFirst ? ["case-1"] : []));
  // The case whose activity combobox should open+focus on its next mount (a just-added trace).
  const [autoOpenCase, setAutoOpenCase] = useState<string | null>(() => (seedFirst ? "case-1" : null));

  const cases = rowsByCase(model);
  const modelCaseIds = useMemo(() => new Set(cases.map((c) => c.caseId)), [cases]);
  const knownActivities = useMemo(
    () => [...new Set(model.rows.map((r) => r.activity).filter(Boolean))].sort(),
    [model.rows],
  );

  const visibleCases: Array<{ caseId: string; rows: EventRow[] }> = useMemo(
    () => [
      ...cases,
      ...draftCases.filter((c) => !modelCaseIds.has(c)).map((caseId) => ({ caseId, rows: [] })),
    ],
    [cases, draftCases, modelCaseIds],
  );

  const newCase = () => {
    const used = new Set([...modelCaseIds, ...draftCases]);
    let n = 1;
    while (used.has(`case-${n}`)) n += 1;
    const id = `case-${n}`;
    setDraftCases((d) => [...d, id]);
    setAutoOpenCase(id);
  };
  // Ctrl/Cmd+Enter adds a trace from anywhere in the editor. React synthetic events bubble through
  // the component tree, so this catches keydowns from an open activity popover (a portaled child)
  // too, while staying scoped to this editor - unlike a document listener.
  const onKeyDown = (e: KeyboardEvent) => {
    if (view === "traces" && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      newCase();
    }
  };
  const addActivity = (caseId: string, activity: string) => {
    onChange(appendEvents(model, caseId, [activity]));
    setDraftCases((d) => d.filter((c) => c !== caseId));
  };
  const removeEvent = (rowId: string) =>
    onChange({ ...model, rows: model.rows.filter((r) => r.rowId !== rowId) });
  const renameCase = (from: string, to: string) => onChange(renameCaseId(model, from, to));
  const deleteCase = (caseId: string) => {
    onChange(removeCase(model, caseId));
    setDraftCases((d) => d.filter((c) => c !== caseId));
  };

  return (
    <div
      onKeyDown={onKeyDown}
      style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}
    >
      <div
        data-export-ignore
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderBottom: "1px solid var(--gray-5)",
        }}
      >
        <Button
          size="1"
          variant={view === "traces" ? "solid" : "soft"}
          color="gray"
          onClick={() => setView("traces")}
        >
          <PiTreeView size={13} /> Traces
        </Button>
        <Button
          size="1"
          variant={view === "table" ? "solid" : "soft"}
          color="gray"
          onClick={() => setView("table")}
        >
          <PiTable size={13} /> Table
        </Button>
        <Popover.Root>
          <Popover.Trigger>
            <Button size="1" variant="ghost" color="gray">
              <PiClock size={13} /> Time
            </Button>
          </Popover.Trigger>
          <Popover.Content size="1">
            <TimeControls
              time={model.time}
              onChange={(time) => onChange(reflowTimes({ ...model, time }))}
              onReflow={() => onChange(reflowTimes(model))}
            />
          </Popover.Content>
        </Popover.Root>
        <Text size="1" color="gray">
          {visibleCases.length} case{visibleCases.length === 1 ? "" : "s"} · {model.rows.length} event
          {model.rows.length === 1 ? "" : "s"}
        </Text>
        <div style={{ flex: 1 }} />
        {actions}
      </div>

      {view === "traces" ? (
        <div
          data-export-root
          style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }}
        >
          {visibleCases.map((c) => (
            <TraceCard
              key={c.caseId}
              caseId={c.caseId}
              events={c.rows}
              knownActivities={knownActivities}
              meta={getCaseMeta(model, c.caseId)}
              caseAttrColumns={model.caseAttrColumns}
              onAddActivity={(a) => addActivity(c.caseId, a)}
              onRemoveEvent={removeEvent}
              onRename={(to) => renameCase(c.caseId, to)}
              onDuplicate={() => onChange(duplicateCase(model, c.caseId))}
              onSetCount={(n) => onChange(setCaseCount(model, c.caseId, n))}
              onSetCaseAttr={(name, value) => onChange(setCaseAttr(model, c.caseId, name, value))}
              onAddCaseColumn={(name, type) => onChange(addCaseAttrColumn(model, name, type))}
              onDelete={() => deleteCase(c.caseId)}
              onReorder={(from, to) => onChange(reorderWithinCase(model, c.caseId, from, to))}
              autoOpen={c.caseId === autoOpenCase}
            />
          ))}
          <div style={{ padding: "10px", display: "flex", alignItems: "center", gap: 8 }}>
            <Button size="2" variant="soft" onClick={newCase} title="Add another case">
              <PiPlus size={14} /> New case
            </Button>
            <Text size="1" color="gray" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              or press <Kbd size="1">Ctrl</Kbd>
              <Kbd size="1">Enter</Kbd>
            </Text>
          </div>
        </div>
      ) : (
        <TableView model={model} onChange={onChange} />
      )}
    </div>
  );
}

/** Labelled band above each table section: eyebrow title and a right-aligned action. */
function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div
      data-export-ignore
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "7px 12px",
        background: "var(--gray-2)",
        borderBottom: "1px solid var(--gray-a4)",
      }}
    >
      <Text size="1" weight="medium" style={{ letterSpacing: "0.04em", color: "var(--gray-12)" }}>
        {title}
      </Text>
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

/** A small "+ Attribute" button that opens a tidy name + type form in a popover. */
function AddColumnControl({ onAdd }: { onAdd: (name: string, type: AttrType) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<AttrType>("string");
  const add = () => {
    const n = name.trim();
    if (!n) return;
    onAdd(n, type);
    setName("");
    setOpen(false);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <Button size="1" variant="soft" color="gray">
          <PiPlus size={12} /> Attribute
        </Button>
      </Popover.Trigger>
      <Popover.Content size="1" style={{ width: 240 }}>
        <Flex direction="column" gap="2">
          <Text size="1" weight="medium">
            New attribute
          </Text>
          <TextField.Root
            autoFocus
            size="2"
            placeholder="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Flex gap="2" align="center">
            <Select.Root size="2" value={type} onValueChange={(v) => setType(v as AttrType)}>
              <Select.Trigger style={{ flex: 1 }} />
              <Select.Content>
                {ATTR_TYPES.map((t) => (
                  <Select.Item key={t} value={t}>
                    {t}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
            <Button size="2" onClick={add} disabled={!name.trim()}>
              Add
            </Button>
          </Flex>
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
}

/** Plain, labelled "add event" row for the table view: pick/type a case + activity, then Add.
 *  Case autocompletes from existing ids; blank makes a fresh case. Replaces the old text grammar. */
function AddEventControl({
  model,
  onChange,
}: {
  model: EventLogModel;
  onChange: (model: EventLogModel) => void;
}) {
  const [caseId, setCaseId] = useState("");
  const [activity, setActivity] = useState("");
  const activityRef = useRef<HTMLInputElement>(null);
  const caseIds = useMemo(() => [...new Set(model.rows.map((r) => r.caseId))], [model.rows]);
  const activities = useMemo(
    () => [...new Set(model.rows.map((r) => r.activity).filter(Boolean))].sort(),
    [model.rows],
  );
  const add = () => {
    const act = activity.trim();
    if (!act) return;
    const resolved = caseId.trim() || nextCaseId(model);
    onChange(appendEvents(model, resolved, [act]));
    setCaseId(resolved); // keep the case so consecutive events land in the same trace
    setActivity("");
    activityRef.current?.focus();
  };
  return (
    <Flex align="center" gap="2" wrap="wrap">
      <Text size="1" color="gray" style={{ flexShrink: 0 }}>
        Add event
      </Text>
      <datalist id="eg-add-cases">
        {caseIds.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="eg-add-activities">
        {activities.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
      <TextField.Root
        size="1"
        list="eg-add-cases"
        placeholder="Case ID (optional)"
        value={caseId}
        onChange={(e) => setCaseId(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            activityRef.current?.focus();
          }
        }}
        style={{ width: 190 }}
      />
      <TextField.Root
        ref={activityRef}
        size="1"
        list="eg-add-activities"
        placeholder="activity"
        value={activity}
        onChange={(e) => setActivity(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        style={{ width: 180 }}
      />
      <Button size="1" onClick={add} disabled={!activity.trim()}>
        <PiPlus size={12} /> Add event
      </Button>
    </Flex>
  );
}

/** A removable, typed attribute-column header: `name ·t` with a hover-revealed remove button. */
function attrColumn(c: AttrColumn, onRemove: () => void): GridColumn {
  return {
    key: c.name,
    header: (
      <span title={`${c.name} (${c.type})`}>
        {c.name}{" "}
        <Text size="1" color="gray" weight="regular">
          ·{c.type[0]}
        </Text>
      </span>
    ),
    width: "120px",
    kind: c.type === "boolean" ? "boolean" : "text",
    inputMode: c.type === "int" ? "numeric" : c.type === "float" ? "decimal" : "text",
    headerExtra: (
      <IconButton
        size="1"
        variant="ghost"
        color="gray"
        aria-label={`Remove column ${c.name}`}
        onClick={onRemove}
        style={{ margin: "-2px 0" }}
      >
        <PiX size={12} />
      </IconButton>
    ),
  };
}

/** Power view: an Events table (row per event, grouped by case) and a Cases table (export count +
 *  case attributes), each with typed attribute columns and its own add-column control. */
function TableView({ model, onChange }: { model: EventLogModel; onChange: (model: EventLogModel) => void }) {
  const setCell = (rowId: string, key: string, value: string) => {
    onChange({
      ...model,
      rows: model.rows.map((r): EventRow => {
        if (r.rowId !== rowId) return r;
        if (key === "caseId") return { ...r, caseId: value };
        if (key === "activity") return { ...r, activity: value };
        if (key === "time") return { ...r, time: value, timeManual: true };
        return { ...r, attrs: { ...r.attrs, [key]: value } };
      }),
    });
  };
  const addEventColumn = (name: string, type: AttrType) => {
    if (model.attrColumns.some((c) => c.name === name)) return;
    onChange({ ...model, attrColumns: [...model.attrColumns, { name, type }] });
  };
  const removeEventColumn = (name: string) =>
    onChange({ ...model, attrColumns: model.attrColumns.filter((c) => c.name !== name) });

  const columns: GridColumn[] = [
    { key: "caseId", header: "Case", width: "120px" },
    { key: "activity", header: "Activity" },
    { key: "time", header: "Timestamp", width: "210px" },
    ...model.attrColumns.map((c) => attrColumn(c, () => removeEventColumn(c.name))),
  ];

  // Cases grid: one row per case (id + export count + shared case-attribute columns).
  const caseRows = rowsByCase(model).map((c) => ({ rowId: c.caseId, caseId: c.caseId }));
  const caseColumns: GridColumn[] = [
    {
      key: "caseId",
      header: "Case",
      width: "130px",
      kind: "custom",
      render: ({ value }) => (
        <span
          style={{
            display: "block",
            padding: "5px 8px",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--gray-12)",
          }}
        >
          {value}
        </span>
      ),
    },
    {
      key: "count",
      header: <span title="How many times this case is written to the exported log">Copies</span>,
      width: "76px",
      inputMode: "numeric",
      align: "right",
    },
    ...model.caseAttrColumns.map((c) => attrColumn(c, () => onChange(removeCaseAttrColumn(model, c.name)))),
  ];
  const caseCell = (row: { caseId: string }, k: string) =>
    k === "caseId"
      ? row.caseId
      : k === "count"
        ? String(getCaseMeta(model, row.caseId).count)
        : (getCaseMeta(model, row.caseId).attrs[k] ?? "");
  const setCaseCell = (caseId: string, k: string, value: string) =>
    onChange(
      k === "count" ? setCaseCount(model, caseId, Number(value) || 1) : setCaseAttr(model, caseId, k, value),
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <SectionHeader title="Events" right={<AddColumnControl onAdd={addEventColumn} />} />
      <div data-export-ignore style={{ padding: "8px 12px", borderBottom: "1px solid var(--gray-a3)" }}>
        <AddEventControl model={model} onChange={onChange} />
      </div>
      <div data-export-root style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <EditableGrid
          columns={columns}
          rows={model.rows}
          cell={(row, k) =>
            k === "caseId"
              ? row.caseId
              : k === "activity"
                ? row.activity
                : k === "time"
                  ? row.time
                  : (row.attrs[k] ?? "")
          }
          onCell={setCell}
          onDeleteRow={(rowId) => onChange({ ...model, rows: model.rows.filter((r) => r.rowId !== rowId) })}
          isGroupStart={(row, prev) => !prev || prev.caseId !== row.caseId}
          emptyHint="No events yet. Use the Add event fields above to start a trace."
        />
      </div>
      <SectionHeader
        title="Cases"
        right={<AddColumnControl onAdd={(name, type) => onChange(addCaseAttrColumn(model, name, type))} />}
      />
      <div style={{ maxHeight: 240, overflow: "auto" }}>
        <EditableGrid
          columns={caseColumns}
          rows={caseRows}
          cell={caseCell}
          onCell={setCaseCell}
          onDeleteRow={(caseId) => onChange(removeCase(model, caseId))}
          emptyHint="No cases yet."
        />
      </div>
    </div>
  );
}
