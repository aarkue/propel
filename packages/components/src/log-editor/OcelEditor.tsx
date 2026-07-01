import { type ReactNode, useState } from "react";
import { Badge, Button, Combobox, IconButton, Popover, Select, Text, TextField } from "@r4pm/components/ui";
import {
  PiClock,
  PiCube,
  PiDotsSixVertical,
  PiLightning,
  PiPlus,
  PiShapes,
  PiTable,
  PiX,
} from "react-icons/pi";
import { useColorOf } from "../viewer/viewer-config";
import { EditableGrid, type GridColumn } from "./EditableGrid";
import { TimeControls } from "./TimeControls";
import { ATTR_TYPES, type AttrColumn, type AttrType } from "./model";
import {
  addEventOfType,
  addObject,
  ensureObject,
  type OcelModel,
  type OcelRel,
  type OcelTypeDef,
  reflowOcelTimes,
  reorderEvents,
  reorderObjects,
} from "./ocel-model";

export interface OcelEditorProps {
  model: OcelModel;
  onChange: (model: OcelModel) => void;
  actions?: ReactNode;
}

function unionAttrs(types: OcelTypeDef[]): AttrColumn[] {
  const seen = new Map<string, AttrColumn>();
  for (const t of types) for (const a of t.attributes) if (!seen.has(a.name)) seen.set(a.name, a);
  return [...seen.values()];
}

/** Hover-revealed drag handle for reordering a row. */
function DragGrip({
  onDragStart,
  onDragEnd,
  dragging,
}: {
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  return (
    <span
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      title="Drag to reorder"
      className="opacity-0 group-hover/row:opacity-100"
      style={{
        cursor: "grab",
        color: "var(--gray-8)",
        display: "flex",
        flexShrink: 0,
        opacity: dragging ? 1 : undefined,
        transition: "opacity 80ms",
      }}
    >
      <PiDotsSixVertical size={14} />
    </span>
  );
}

/** Inset accent line marking where a dragged row will land: top edge = drop before, bottom = after
 *  (the row order after a from->to move). Returns a `boxShadow` value, so it adds no layout shift. */
function dropLine(drag: number | null, over: number | null, idx: number): string | undefined {
  if (drag === null || over !== idx || drag === idx) return undefined;
  return drag < idx ? "inset 0 -2px 0 0 var(--accent-9)" : "inset 0 2px 0 0 var(--accent-9)";
}

/** A colored dot (matches the Combobox swatch). */
function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        background: color,
        boxShadow: "inset 0 0 0 1px var(--black-a3)",
        flexShrink: 0,
      }}
    />
  );
}

/** Editable attribute schema for one type, in a popover off the type chip. */
function TypeSchemaEditor({ type, onChange }: { type: OcelTypeDef; onChange: (next: OcelTypeDef) => void }) {
  const [name, setName] = useState("");
  const [attrType, setAttrType] = useState<AttrType>("string");
  const add = () => {
    const n = name.trim();
    if (!n || type.attributes.some((a) => a.name === n)) return;
    onChange({ ...type, attributes: [...type.attributes, { name: n, type: attrType }] });
    setName("");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 220 }}>
      <Text size="2" weight="bold">
        {type.name} attributes
      </Text>
      {type.attributes.length === 0 ? (
        <Text size="1" color="gray">
          No attributes.
        </Text>
      ) : (
        type.attributes.map((a) => (
          <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Text size="1" style={{ flex: 1 }}>
              {a.name} <Text color="gray">· {a.type}</Text>
            </Text>
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              aria-label={`Remove ${a.name}`}
              onClick={() =>
                onChange({ ...type, attributes: type.attributes.filter((x) => x.name !== a.name) })
              }
            >
              <PiX size={12} />
            </IconButton>
          </div>
        ))
      )}
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <TextField.Root
          size="1"
          placeholder="attribute"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          style={{ width: 100 }}
        />
        <Select.Root size="1" value={attrType} onValueChange={(v) => setAttrType(v as AttrType)}>
          <Select.Trigger variant="soft" />
          <Select.Content>
            {ATTR_TYPES.map((t) => (
              <Select.Item key={t} value={t}>
                {t}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <IconButton size="1" variant="soft" aria-label="Add attribute" onClick={add}>
          <PiPlus size={12} />
        </IconButton>
      </div>
    </div>
  );
}

/** Types manager (event + object types and their schemas), tucked into a header popover. */
function TypesPopover({ model, onChange }: { model: OcelModel; onChange: (m: OcelModel) => void }) {
  const activityColor = useColorOf("activity");
  const objectTypeColor = useColorOf("objectType");
  const row = (label: string, icon: ReactNode, key: "eventTypes" | "objectTypes") => {
    const types = model[key];
    const colorOf = key === "eventTypes" ? activityColor : objectTypeColor;
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: 4, width: 92, color: "var(--gray-11)" }}
        >
          {icon}
          <Text size="1" color="gray">
            {label}
          </Text>
        </span>
        {types.map((t) => (
          <Popover.Root key={t.name}>
            <Popover.Trigger>
              <Button size="1" variant="soft" color="gray">
                <Dot color={colorOf(t.name)} />
                {t.name}
                {t.attributes.length > 0 ? ` · ${t.attributes.length}` : ""}
              </Button>
            </Popover.Trigger>
            <Popover.Content size="1">
              <TypeSchemaEditor
                type={t}
                onChange={(next) =>
                  onChange({ ...model, [key]: types.map((x) => (x.name === t.name ? next : x)) })
                }
              />
            </Popover.Content>
          </Popover.Root>
        ))}
        <Combobox
          value=""
          options={[]}
          optionColor={colorOf}
          allowCreate
          size="2"
          placeholder="+ type"
          createLabel={(q) => `Add "${q}"`}
          aria-label={`Add ${label}`}
          onValueChange={(name) => {
            const n = name.trim();
            if (n && !types.some((t) => t.name === n))
              onChange({ ...model, [key]: [...types, { name: n, attributes: [] }] });
          }}
        />
      </div>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 300 }}>
      {row("Event types", <PiLightning size={13} />, "eventTypes")}
      {row("Object types", <PiCube size={13} />, "objectTypes")}
    </div>
  );
}

/** Relationship chips with a per-object type-color dot. */
function RelChips({
  rels,
  colorForId,
  onUnlink,
}: {
  rels: OcelRel[];
  colorForId: (id: string) => string;
  onUnlink: (i: number) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
      {rels.map((r, i) => (
        <Badge key={`${r.objectId}-${i}`} variant="soft" color="gray" size="2" style={{ gap: 5 }}>
          <Dot color={colorForId(r.objectId)} />
          {r.objectId}
          {r.qualifier && r.qualifier !== r.objectId ? (
            <Text color="gray">
              <span className="mx-1">·</span>
              {r.qualifier}
            </Text>
          ) : null}
          <button
            type="button"
            aria-label={`Unlink ${r.objectId}`}
            onClick={() => onUnlink(i)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              color: "var(--gray-10)",
            }}
          >
            <PiX size={11} />
          </button>
        </Badge>
      ))}
    </div>
  );
}

/**
 * Attach an object: pick an existing object (any type, color-coded) and it links with its own type;
 * or type a new id, and only THEN pick/create its type. No type-first step for existing objects.
 */
function ObjectLinker({
  objectTypes,
  objectIds,
  isKnown,
  colorForId,
  onLink,
  autoOpen,
}: {
  objectTypes: string[];
  objectIds: string[];
  /** True if the id already exists in the model (so we link it directly, no type prompt). */
  isKnown: (id: string) => boolean;
  colorForId: (id: string) => string;
  onLink: (objectId: string, mintType?: string) => void;
  /** Open the object picker on mount (continues the keyboard flow after adding an event). */
  autoOpen?: boolean;
}) {
  const objectTypeColor = useColorOf("objectType");
  const [pending, setPending] = useState<string | null>(null);

  if (pending !== null) {
    return (
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <Text size="1" color="gray">
          type for “{pending}”:
        </Text>
        <Combobox
          value=""
          options={objectTypes}
          optionColor={objectTypeColor}
          allowCreate
          autoOpen
          size="2"
          placeholder="pick type"
          searchPlaceholder="find or add type…"
          createLabel={(q) => `New type "${q}"`}
          aria-label={`Type for ${pending}`}
          onValueChange={(t) => {
            if (t.trim()) {
              onLink(pending, t.trim());
              setPending(null);
            }
          }}
          style={{ minWidth: 120 }}
        />
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          aria-label="Cancel"
          onClick={() => setPending(null)}
        >
          <PiX size={12} />
        </IconButton>
      </span>
    );
  }

  return (
    <Combobox
      value=""
      options={objectIds}
      optionColor={colorForId}
      allowCreate
      keepOpenOnSelect
      autoOpen={autoOpen}
      size="2"
      placeholder="+ object"
      searchPlaceholder="find or mint object…"
      createLabel={(q) => `Mint new object "${q}"`}
      aria-label="Link object"
      onValueChange={(id) => {
        if (!id) return;
        if (isKnown(id)) onLink(id);
        else setPending(id);
      }}
      style={{ minWidth: 130 }}
    />
  );
}

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "8px 10px",
        position: "sticky",
        top: 0,
        background: "var(--gray-2)",
        zIndex: 1,
        borderBottom: "1px solid var(--gray-4)",
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: "var(--gray-10)",
        }}
      >
        {title}
      </span>
      {action}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <Text size="1" color="gray" style={{ padding: 14, textAlign: "center" }}>
      {children}
    </Text>
  );
}

/** Controlled, backend-free OCEL authoring surface. Combobox-driven builder by default (pick or
 *  create event/object types and objects, color-coded); an opt-in table view has the flat grids. */
export function OcelEditor({ model, onChange, actions }: OcelEditorProps) {
  const activityColor = useColorOf("activity");
  const objectTypeColor = useColorOf("objectType");
  const [view, setView] = useState<"builder" | "table">("builder");
  const [autoOpenEvent, setAutoOpenEvent] = useState<string | null>(null);
  const [eventDrag, setEventDrag] = useState<number | null>(null);
  const [objectDrag, setObjectDrag] = useState<number | null>(null);
  const [eventOver, setEventOver] = useState<number | null>(null);
  const [objectOver, setObjectOver] = useState<number | null>(null);

  const objectIds = model.objects.map((o) => o.id);
  const eventTypeNames = model.eventTypes.map((t) => t.name);
  const objectTypeNames = model.objectTypes.map((t) => t.name);
  const objTypeOf = new Map(model.objects.map((o) => [o.id, o.type] as const));
  const colorForId = (id: string) => objectTypeColor(objTypeOf.get(id) ?? "");
  const isKnownObject = (id: string) => objTypeOf.has(id);

  const setEvent = (rowId: string, patch: (e: OcelModel["events"][number]) => OcelModel["events"][number]) =>
    onChange({ ...model, events: model.events.map((e) => (e.rowId === rowId ? patch(e) : e)) });
  const setObject = (
    rowId: string,
    patch: (o: OcelModel["objects"][number]) => OcelModel["objects"][number],
  ) => onChange({ ...model, objects: model.objects.map((o) => (o.rowId === rowId ? patch(o) : o)) });

  const ensureTypeName = (m: OcelModel, side: "event" | "object", name: string): OcelModel => {
    const key = side === "event" ? "eventTypes" : "objectTypes";
    if (m[key].some((t) => t.name === name)) return m;
    return { ...m, [key]: [...m[key], { name, attributes: [] }] };
  };

  const defaultType = () => model.objectTypes[0]?.name ?? "object";
  /** Link an object (existing -> its own type; new -> minted under `mintType`) to an event's E2O. */
  const linkE2O = (eventRowId: string, objectId: string, mintType?: string) => {
    const existing = model.objects.find((o) => o.id === objectId);
    const type = existing?.type ?? mintType ?? defaultType();
    const m = ensureObject(model, objectId, type);
    onChange({
      ...m,
      events: m.events.map((e) =>
        e.rowId === eventRowId && !e.e2o.some((r) => r.objectId === objectId)
          ? { ...e, e2o: [...e.e2o, { objectId, qualifier: type }] }
          : e,
      ),
    });
  };
  const linkO2O = (objectRowId: string, targetId: string, mintType?: string) => {
    const existing = model.objects.find((o) => o.id === targetId);
    const type = existing?.type ?? mintType ?? defaultType();
    const m = ensureObject(model, targetId, type);
    onChange({
      ...m,
      objects: m.objects.map((o) =>
        o.rowId === objectRowId && o.id !== targetId && !o.o2o.some((r) => r.objectId === targetId)
          ? { ...o, o2o: [...o.o2o, { objectId: targetId, qualifier: type }] }
          : o,
      ),
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      <div
        data-export-ignore
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          // Reserve the top-right corner for the export frame's floating download-image button.
          paddingRight: 48,
          borderBottom: "1px solid var(--gray-5)",
        }}
      >
        <Button
          size="1"
          variant={view === "builder" ? "solid" : "soft"}
          color="gray"
          onClick={() => setView("builder")}
        >
          <PiCube size={13} /> Builder
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
              <PiShapes size={13} /> Types ({model.eventTypes.length}/{model.objectTypes.length})
            </Button>
          </Popover.Trigger>
          <Popover.Content size="1">
            <TypesPopover model={model} onChange={onChange} />
          </Popover.Content>
        </Popover.Root>
        <Popover.Root>
          <Popover.Trigger>
            <Button size="1" variant="ghost" color="gray">
              <PiClock size={13} /> Time
            </Button>
          </Popover.Trigger>
          <Popover.Content size="1">
            <TimeControls
              time={model.time}
              onChange={(time) => onChange(reflowOcelTimes({ ...model, time }))}
              onReflow={() => onChange(reflowOcelTimes(model))}
            />
          </Popover.Content>
        </Popover.Root>
        <Text size="1" color="gray">
          {model.events.length} events · {model.objects.length} objects
        </Text>
        <div style={{ flex: 1 }} />
        {actions}
      </div>

      {view === "builder" ? (
        <div
          data-export-root
          style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }}
        >
          <SectionHeader
            title="Events"
            action={
              <Combobox
                value=""
                options={eventTypeNames}
                optionColor={activityColor}
                allowCreate
                size="2"
                placeholder="+ event"
                searchPlaceholder="pick or create event type…"
                createLabel={(q) => `New "${q}" event`}
                aria-label="Add event"
                onValueChange={(t) => {
                  if (!t.trim()) return;
                  const next = addEventOfType(model, t.trim());
                  const prev = new Set(model.events.map((e) => e.rowId));
                  const created = next.events.find((e) => !prev.has(e.rowId));
                  onChange(next);
                  setAutoOpenEvent(created?.rowId ?? null);
                }}
                style={{ minWidth: 150 }}
              />
            }
          />
          {model.events.length === 0 ? (
            <Empty>No events. Pick or create an event type above to add one.</Empty>
          ) : (
            model.events.map((e, idx) => (
              <div
                key={e.rowId}
                className="group/row"
                onDragEnter={() => eventDrag !== null && setEventOver(idx)}
                onDragOver={(ev) => {
                  if (eventDrag === null) return;
                  ev.preventDefault();
                  ev.dataTransfer.dropEffect = "move";
                  setEventOver(idx);
                }}
                onDrop={() => {
                  if (eventDrag !== null && eventDrag !== idx) onChange(reorderEvents(model, eventDrag, idx));
                  setEventDrag(null);
                  setEventOver(null);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--gray-3)",
                  opacity: eventDrag === idx ? 0.4 : 1,
                  boxShadow: dropLine(eventDrag, eventOver, idx),
                }}
              >
                <DragGrip
                  dragging={eventDrag === idx}
                  onDragStart={() => setEventDrag(idx)}
                  onDragEnd={() => {
                    setEventDrag(null);
                    setEventOver(null);
                  }}
                />
                <Text
                  size="1"
                  color="gray"
                  style={{ width: 40, flexShrink: 0, fontFamily: "var(--code-font-family, monospace)" }}
                >
                  {e.id}
                </Text>
                <Combobox
                  value={e.type || undefined}
                  options={eventTypeNames}
                  optionColor={activityColor}
                  allowCreate
                  size="2"
                  placeholder="type"
                  aria-label="Event type"
                  onValueChange={(t) =>
                    onChange(
                      ensureTypeName(
                        {
                          ...model,
                          events: model.events.map((x) => (x.rowId === e.rowId ? { ...x, type: t } : x)),
                        },
                        "event",
                        t,
                      ),
                    )
                  }
                />
                <span style={{ color: "var(--gray-8)", flexShrink: 0 }}>:</span>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <RelChips
                    rels={e.e2o}
                    colorForId={colorForId}
                    onUnlink={(i) =>
                      setEvent(e.rowId, (ev) => ({ ...ev, e2o: ev.e2o.filter((_, j) => j !== i) }))
                    }
                  />
                  <ObjectLinker
                    objectTypes={objectTypeNames}
                    objectIds={objectIds.filter((id) => !e.e2o.some((r) => r.objectId === id))}
                    isKnown={isKnownObject}
                    colorForId={colorForId}
                    onLink={(id, type) => linkE2O(e.rowId, id, type)}
                    autoOpen={autoOpenEvent === e.rowId}
                  />
                </div>
                <IconButton
                  className="opacity-0 group-hover/row:opacity-100"
                  size="1"
                  variant="ghost"
                  color="gray"
                  aria-label="Delete event"
                  onClick={() =>
                    onChange({ ...model, events: model.events.filter((x) => x.rowId !== e.rowId) })
                  }
                  style={{ flexShrink: 0, transition: "opacity 80ms" }}
                >
                  <PiX size={14} />
                </IconButton>
              </div>
            ))
          )}

          <SectionHeader
            title="Objects"
            action={
              <Combobox
                value=""
                options={objectTypeNames}
                optionColor={objectTypeColor}
                allowCreate
                size="2"
                placeholder="+ object"
                searchPlaceholder="pick or create object type…"
                createLabel={(q) => `New "${q}" object`}
                aria-label="Add object"
                onValueChange={(t) => {
                  if (t.trim()) onChange(addObject(model, t.trim()));
                }}
                style={{ minWidth: 150 }}
              />
            }
          />
          {model.objects.length === 0 ? (
            <Empty>No objects. Link one from an event above, or add by type.</Empty>
          ) : (
            model.objects.map((o, idx) => (
              <div
                key={o.rowId}
                className="group/row"
                onDragEnter={() => objectDrag !== null && setObjectOver(idx)}
                onDragOver={(ev) => {
                  if (objectDrag === null) return;
                  ev.preventDefault();
                  ev.dataTransfer.dropEffect = "move";
                  setObjectOver(idx);
                }}
                onDrop={() => {
                  if (objectDrag !== null && objectDrag !== idx)
                    onChange(reorderObjects(model, objectDrag, idx));
                  setObjectDrag(null);
                  setObjectOver(null);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderBottom: "1px solid var(--gray-3)",
                  opacity: objectDrag === idx ? 0.4 : 1,
                  boxShadow: dropLine(objectDrag, objectOver, idx),
                }}
              >
                <DragGrip
                  dragging={objectDrag === idx}
                  onDragStart={() => setObjectDrag(idx)}
                  onDragEnd={() => {
                    setObjectDrag(null);
                    setObjectOver(null);
                  }}
                />
                <TextField.Root
                  size="1"
                  value={o.id}
                  onChange={(e) => setObject(o.rowId, (ob) => ({ ...ob, id: e.target.value }))}
                  aria-label="Object id"
                  style={{ width: 110, flexShrink: 0 }}
                />
                <Combobox
                  value={o.type || undefined}
                  options={objectTypeNames}
                  optionColor={objectTypeColor}
                  allowCreate
                  size="2"
                  placeholder="type"
                  aria-label="Object type"
                  onValueChange={(t) =>
                    onChange(
                      ensureTypeName(
                        {
                          ...model,
                          objects: model.objects.map((x) => (x.rowId === o.rowId ? { ...x, type: t } : x)),
                        },
                        "object",
                        t,
                      ),
                    )
                  }
                />
                <span style={{ color: "var(--gray-8)", flexShrink: 0 }}>↔</span>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <RelChips
                    rels={o.o2o}
                    colorForId={colorForId}
                    onUnlink={(i) =>
                      setObject(o.rowId, (ob) => ({ ...ob, o2o: ob.o2o.filter((_, j) => j !== i) }))
                    }
                  />
                  <ObjectLinker
                    objectTypes={objectTypeNames}
                    objectIds={objectIds.filter((id) => id !== o.id && !o.o2o.some((r) => r.objectId === id))}
                    isKnown={isKnownObject}
                    colorForId={colorForId}
                    onLink={(id, type) => linkO2O(o.rowId, id, type)}
                  />
                </div>
                <IconButton
                  className="opacity-0 group-hover/row:opacity-100"
                  size="1"
                  variant="ghost"
                  color="gray"
                  aria-label="Delete object"
                  onClick={() =>
                    onChange({ ...model, objects: model.objects.filter((x) => x.rowId !== o.rowId) })
                  }
                  style={{ flexShrink: 0, transition: "opacity 80ms" }}
                >
                  <PiX size={14} />
                </IconButton>
              </div>
            ))
          )}
        </div>
      ) : (
        <OcelTableView
          model={model}
          onChange={onChange}
          setEvent={setEvent}
          setObject={setObject}
          linkE2O={linkE2O}
          linkO2O={linkO2O}
          objectTypeNames={objectTypeNames}
          colorForId={colorForId}
          isKnown={isKnownObject}
        />
      )}
    </div>
  );
}

/** Power view: the flat events/objects grids with typed attribute columns + relationship linkers. */
function OcelTableView({
  model,
  onChange,
  setEvent,
  setObject,
  linkE2O,
  linkO2O,
  objectTypeNames,
  colorForId,
  isKnown,
}: {
  model: OcelModel;
  onChange: (m: OcelModel) => void;
  setEvent: (rowId: string, patch: (e: OcelModel["events"][number]) => OcelModel["events"][number]) => void;
  setObject: (
    rowId: string,
    patch: (o: OcelModel["objects"][number]) => OcelModel["objects"][number],
  ) => void;
  linkE2O: (eventRowId: string, objectId: string, mintType?: string) => void;
  linkO2O: (objectRowId: string, targetId: string, mintType?: string) => void;
  objectTypeNames: string[];
  colorForId: (id: string) => string;
  isKnown: (id: string) => boolean;
}) {
  const objectIds = model.objects.map((o) => o.id);
  const evAttrCols = unionAttrs(model.eventTypes);
  const obAttrCols = unionAttrs(model.objectTypes);

  const attrColumn = (c: AttrColumn): GridColumn => ({
    key: `attr:${c.name}`,
    header: (
      <span title={`${c.name} (${c.type})`}>
        {c.name}{" "}
        <Text size="1" color="gray">
          <span className="mx-1">·</span>
          {c.type[0]}
        </Text>
      </span>
    ),
    width: "100px",
    kind: c.type === "boolean" ? "boolean" : "text",
  });

  const eventColumns: GridColumn[] = [
    { key: "id", header: "Event ID", width: "110px" },
    { key: "type", header: "Type", width: "130px" },
    { key: "time", header: "Timestamp", width: "200px" },
    ...evAttrCols.map(attrColumn),
    {
      key: "e2o",
      header: "Related objects",
      kind: "custom",
      render: ({ rowId }) => {
        const ev = model.events.find((e) => e.rowId === rowId);
        if (!ev) return null;
        return (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "2px 0" }}>
            <RelChips
              rels={ev.e2o}
              colorForId={colorForId}
              onUnlink={(i) => setEvent(rowId, (e) => ({ ...e, e2o: e.e2o.filter((_, j) => j !== i) }))}
            />
            <ObjectLinker
              objectTypes={objectTypeNames}
              objectIds={objectIds.filter((id) => !ev.e2o.some((r) => r.objectId === id))}
              isKnown={isKnown}
              colorForId={colorForId}
              onLink={(id, type) => linkE2O(rowId, id, type)}
            />
          </div>
        );
      },
    },
  ];

  const objectColumns: GridColumn[] = [
    { key: "id", header: "Object ID", width: "110px" },
    { key: "type", header: "Type", width: "130px" },
    ...obAttrCols.map(attrColumn),
    {
      key: "o2o",
      header: "Related objects",
      kind: "custom",
      render: ({ rowId }) => {
        const ob = model.objects.find((o) => o.rowId === rowId);
        if (!ob) return null;
        return (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "2px 0" }}>
            <RelChips
              rels={ob.o2o}
              colorForId={colorForId}
              onUnlink={(i) => setObject(rowId, (o) => ({ ...o, o2o: o.o2o.filter((_, j) => j !== i) }))}
            />
            <ObjectLinker
              objectTypes={objectTypeNames}
              objectIds={objectIds.filter((id) => id !== ob.id && !ob.o2o.some((r) => r.objectId === id))}
              isKnown={isKnown}
              colorForId={colorForId}
              onLink={(id, type) => linkO2O(rowId, id, type)}
            />
          </div>
        );
      },
    },
  ];

  const eventCell = (e: OcelModel["events"][number], k: string) =>
    k === "id"
      ? e.id
      : k === "type"
        ? e.type
        : k === "time"
          ? e.time
          : (e.attrs[k.replace(/^attr:/, "")] ?? "");
  const objectCell = (o: OcelModel["objects"][number], k: string) =>
    k === "id" ? o.id : k === "type" ? o.type : (o.attrs[k.replace(/^attr:/, "")] ?? "");

  return (
    <div data-export-root style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      <SectionHeader title="Events" />
      <EditableGrid
        columns={eventColumns}
        rows={model.events}
        cell={eventCell}
        onCell={(rowId, k, value) => {
          if (k === "id") setEvent(rowId, (e) => ({ ...e, id: value }));
          else if (k === "type") setEvent(rowId, (e) => ({ ...e, type: value }));
          else if (k === "time") setEvent(rowId, (e) => ({ ...e, time: value, timeManual: true }));
          else setEvent(rowId, (e) => ({ ...e, attrs: { ...e.attrs, [k.replace(/^attr:/, "")]: value } }));
        }}
        onDeleteRow={(rowId) => onChange({ ...model, events: model.events.filter((e) => e.rowId !== rowId) })}
        emptyHint="No events yet."
      />
      <SectionHeader title="Objects" />
      <EditableGrid
        columns={objectColumns}
        rows={model.objects}
        cell={objectCell}
        onCell={(rowId, k, value) => {
          if (k === "id") setObject(rowId, (o) => ({ ...o, id: value }));
          else if (k === "type") setObject(rowId, (o) => ({ ...o, type: value }));
          else setObject(rowId, (o) => ({ ...o, attrs: { ...o.attrs, [k.replace(/^attr:/, "")]: value } }));
        }}
        onDeleteRow={(rowId) =>
          onChange({ ...model, objects: model.objects.filter((o) => o.rowId !== rowId) })
        }
        emptyHint="No objects yet."
      />
    </div>
  );
}
