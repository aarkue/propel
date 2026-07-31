// The four `Target` variants (Event/Object/E2O/O2O), plus the two reusable sub-editors the model
// itself calls for (spec 1.2): `ObjectEndpointEditor` (id/object_type/split) and
// `EventEndpointEditor` (id/event_type), each used at every position the spec names as the
// factoring win -- Target::Object's own id/type, InlineObjectRef.object, E2O.object + E2O.event,
// O2O.source + O2O.target. Building one of each and reusing it four times (not forking into four
// near-identical forms) is the direct UI payoff of that model decision.
//
// Layout rule: the fields that decide *what this mapping produces* stay visible and sit side by
// side; a setting belonging to one of them (a timestamp's format) hangs off it as an
// `InlineDisclosure`; only open-ended lists (attributes, split rules) keep a boxed `Disclosure`.
import { Button, Select, Text, TextField } from "@r4pm/components/ui";
import { PiPlus } from "react-icons/pi";
import { describeExpr } from "../node-summary";
import { attributeNameFor, knownTypeNames, scoringColumns } from "./node-draft";
import { rankedColumnInfo, type ColumnHint } from "../schema-resolution";
import type {
  AttributeMapping,
  EventEndpoint,
  InlineObjectRef,
  ObjectEndpoint,
  OCELAttributeType,
  Target,
  TimestampFormat,
  TimestampPart,
  TimestampSource,
  ValueExpression,
} from "../types";
import { ColumnPicker } from "./ColumnPicker";
import { Disclosure, Field, FieldGroup, InlineDisclosure, PillGroup } from "./Disclosure";
import { RemoveButton } from "./RemoveButton";
import { SplitSpecEditor } from "./SplitSpecEditor";
import { useEditContext } from "./edit-context";
import { defaultForKind, KIND_LABEL, KIND_ORDER, ValueExpressionEditor } from "./ValueExpressionEditor";

const ATTRIBUTE_TYPES: { value: OCELAttributeType; label: string }[] = [
  { value: "String", label: "String" },
  { value: "Time", label: "Time" },
  { value: "Integer", label: "Integer" },
  { value: "Float", label: "Float" },
  { value: "Boolean", label: "Boolean" },
];

const TARGET_KINDS: { value: Target["type"]; label: string }[] = [
  { value: "event", label: "Event" },
  { value: "object", label: "Object" },
  { value: "e2o", label: "Event -> Object relation" },
  { value: "o2o", label: "Object -> Object relation" },
];

function defaultValueExpr(): ValueExpression {
  return { type: "column", column: "" };
}
/** A blank *constant* type rather than an unset one, so the field renders as an input the user can
 *  see is empty instead of a "Set an object type" button that reads as optional. */
function defaultObjectEndpoint(): ObjectEndpoint {
  return { id: defaultValueExpr(), object_type: { type: "constant", value: "" }, split: undefined };
}
function defaultEventEndpoint(): EventEndpoint {
  return { id: defaultValueExpr(), event_type: undefined };
}
function defaultTimestamp(): TimestampSource {
  return { type: "value", source: { type: "column", column: "" } };
}

function defaultForTargetKind(kind: Target["type"]): Target {
  switch (kind) {
    case "event":
      return {
        type: "event",
        event_type: defaultValueExpr(),
        id: undefined,
        timestamp: defaultTimestamp(),
        attributes: [],
        objects: [],
      };
    case "object":
      return {
        type: "object",
        object_type: defaultValueExpr(),
        id: defaultValueExpr(),
        timestamp: undefined,
        attributes: [],
      };
    case "e2o":
      return {
        type: "e2o",
        event: defaultEventEndpoint(),
        object: defaultObjectEndpoint(),
        qualifier: undefined,
      };
    case "o2o":
      return {
        type: "o2o",
        source: defaultObjectEndpoint(),
        target: defaultObjectEndpoint(),
        qualifier: undefined,
      };
  }
}

export interface TargetEditorProps {
  value: Target;
  onChange: (next: Target) => void;
  /** Node whose resolved schema drives every column picker/autocomplete in this form. */
  nodeId: string;
  /** Hide the kind dropdown. Set by `NodeDialog`, where the card grid already picks the kind and
   *  a second selector for the same choice would be two controls disagreeing about who is in
   *  charge. */
  hideKindSelect?: boolean;
}

export function TargetEditor({ value, onChange, nodeId, hideKindSelect }: TargetEditorProps) {
  return (
    <div className="flex flex-col gap-2.5">
      {!hideKindSelect && (
        <Field label="Kind">
          <Select.Root
            size="1"
            value={value.type}
            onValueChange={(k) => onChange(defaultForTargetKind(k as Target["type"]))}
          >
            <Select.Trigger />
            <Select.Content>
              {TARGET_KINDS.map((k) => (
                <Select.Item key={k.value} value={k.value}>
                  {k.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Field>
      )}
      {value.type === "event" && <EventTargetForm value={value} onChange={onChange} nodeId={nodeId} />}
      {value.type === "object" && <ObjectTargetForm value={value} onChange={onChange} nodeId={nodeId} />}
      {value.type === "e2o" && <E2OTargetForm value={value} onChange={onChange} nodeId={nodeId} />}
      {value.type === "o2o" && <O2OTargetForm value={value} onChange={onChange} nodeId={nodeId} />}
    </div>
  );
}

/** A real value from the column an expression reads, when the host has fetched that column's
 *  domain into the catalog -- feeds the split preview so a rule is checked against actual data.
 *  Only a plain `Column` expression names one cell; anything computed does not. */
function useColumnSample(nodeId: string, expr: ValueExpression | null | undefined): string | undefined {
  const edit = useEditContext();
  if (!edit || expr?.type !== "column" || !expr.column) return undefined;
  return rankedColumnInfo(edit.model.nodes, edit.catalog, nodeId).find((c) => c.name === expr.column)
    ?.samples?.[0];
}

/** Type names the blueprint already uses. An endpoint almost always names a type some other
 *  mapping produces, so offering that list turns a free-text field into a pick-or-create one and
 *  makes a typo visible immediately. */
function useKnownTypes(): { objects: string[]; events: string[] } {
  const edit = useEditContext();
  return knownTypeNames(edit?.model.mappings ?? []);
}

// ---- Event ----

function EventTargetForm({
  value,
  onChange,
  nodeId,
}: {
  value: Extract<Target, { type: "event" }>;
  onChange: (next: Target) => void;
  nodeId: string;
}) {
  const attributes = value.attributes ?? [];
  const objects = value.objects ?? [];
  const known = useKnownTypes();
  return (
    <>
      <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
        <Field label="Event type">
          <ValueExpressionEditor
            value={value.event_type}
            nodeId={nodeId}
            hint="type"
            suggestions={known.events}
            constantPlaceholder="e.g. place order"
            onChange={(event_type) => onChange({ ...value, event_type })}
          />
        </Field>
        {/* A date+time pair is itself two columns, so it takes the whole row. */}
        <Field
          label="Timestamp"
          className={value.timestamp?.type === "components" ? "sm:col-span-2" : undefined}
        >
          <TimestampSourceEditor
            value={value.timestamp}
            nodeId={nodeId}
            onChange={(timestamp) => onChange({ ...value, timestamp })}
          />
        </Field>
      </div>

      <Field label="Event id">
        <OptionalValueExpression
          value={value.id}
          nodeId={nodeId}
          hint="id"
          noneLabel="Auto (UUID)"
          noneHint="A random UUID per event, so every row makes its own event. Pick a column to make ids stable, let this mapping compile to SQL, and merge rows sharing an id into one event related to all of their objects."
          onChange={(id) => onChange({ ...value, id })}
        />
      </Field>

      <Field
        label={objects.length > 0 ? `Related objects (${objects.length})` : "Related objects"}
        hint={
          objects.length === 0
            ? "None yet. Add one to link this event to an object named by a column in the same row."
            : undefined
        }
      >
        <InlineObjectRefList
          value={objects}
          nodeId={nodeId}
          onChange={(next) => onChange({ ...value, objects: next })}
        />
      </Field>

      <Disclosure
        title="Attributes"
        count={attributes.length}
        summary={attributes.length === 0 ? "none" : undefined}
        defaultOpen={attributes.length > 0}
      >
        <AttributeMappingList
          value={attributes}
          nodeId={nodeId}
          onChange={(next) => onChange({ ...value, attributes: next })}
        />
      </Disclosure>
    </>
  );
}

// ---- Object ----

function ObjectTargetForm({
  value,
  onChange,
  nodeId,
}: {
  value: Extract<Target, { type: "object" }>;
  onChange: (next: Target) => void;
  nodeId: string;
}) {
  const attributes = value.attributes ?? [];
  const known = useKnownTypes();
  return (
    <>
      <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
        <Field label="Object type">
          <ValueExpressionEditor
            value={value.object_type}
            nodeId={nodeId}
            hint="type"
            suggestions={known.objects}
            constantPlaceholder="e.g. order"
            onChange={(object_type) => onChange({ ...value, object_type })}
          />
        </Field>
        <Field label="Object id">
          <ValueExpressionEditor
            value={value.id}
            nodeId={nodeId}
            hint="id"
            onChange={(id) => onChange({ ...value, id })}
          />
        </Field>
      </div>

      <Disclosure
        title="Attributes"
        count={attributes.length}
        summary={attributes.length === 0 ? "none" : undefined}
        defaultOpen={attributes.length > 0}
      >
        <AttributeMappingList
          value={attributes}
          nodeId={nodeId}
          onChange={(next) => onChange({ ...value, attributes: next })}
        />
        <Field
          label="Observed at"
          hint="Set this when the rows are a change table: each row then records the attribute values as of that moment, rather than one static value per object."
        >
          <OptionalTimestampSource
            value={value.timestamp}
            nodeId={nodeId}
            setLabel="Track changes over time"
            onChange={(timestamp) => onChange({ ...value, timestamp })}
          />
        </Field>
      </Disclosure>
    </>
  );
}

// ---- Relations ----

function E2OTargetForm({
  value,
  onChange,
  nodeId,
}: {
  value: Extract<Target, { type: "e2o" }>;
  onChange: (next: Target) => void;
  nodeId: string;
}) {
  return (
    <>
      <Field label="Event">
        <EventEndpointEditor
          value={value.event}
          nodeId={nodeId}
          onChange={(event) => onChange({ ...value, event })}
        />
      </Field>
      <Field label="Object">
        <ObjectEndpointEditor
          value={value.object}
          nodeId={nodeId}
          onChange={(object) => onChange({ ...value, object })}
        />
      </Field>
      <Disclosure
        title="Qualifier"
        summary={describeExpr(value.qualifier) ?? "none"}
        defaultOpen={!!value.qualifier}
      >
        <OptionalValueExpression
          value={value.qualifier}
          nodeId={nodeId}
          hint="string"
          noneLabel="None"
          onChange={(qualifier) => onChange({ ...value, qualifier })}
        />
        <Text size="1" color="gray" className="text-[10px] leading-snug">
          Names the role the object plays in the event, for example "concerns" or "performed-by".
        </Text>
      </Disclosure>
    </>
  );
}

function O2OTargetForm({
  value,
  onChange,
  nodeId,
}: {
  value: Extract<Target, { type: "o2o" }>;
  onChange: (next: Target) => void;
  nodeId: string;
}) {
  return (
    <>
      <Field label="Source object">
        <ObjectEndpointEditor
          value={value.source}
          nodeId={nodeId}
          onChange={(source) => onChange({ ...value, source })}
        />
      </Field>
      <Field label="Target object">
        <ObjectEndpointEditor
          value={value.target}
          nodeId={nodeId}
          onChange={(target) => onChange({ ...value, target })}
        />
      </Field>
      <Disclosure
        title="Qualifier"
        summary={describeExpr(value.qualifier) ?? "none"}
        defaultOpen={!!value.qualifier}
      >
        <OptionalValueExpression
          value={value.qualifier}
          nodeId={nodeId}
          hint="string"
          noneLabel="None"
          onChange={(qualifier) => onChange({ ...value, qualifier })}
        />
        <Text size="1" color="gray" className="text-[10px] leading-snug">
          Names how the source relates to the target, for example "part-of" or "placed-by".
        </Text>
      </Disclosure>
    </>
  );
}

// ---- Endpoints ----

/** Reusable across `Target::Object`, `InlineObjectRef.object`, `E2O.object`, `O2O.source`/`target`.
 *  The id is the endpoint; its type and split rule are refinements, so they collapse. */
export function ObjectEndpointEditor({
  value,
  onChange,
  nodeId,
}: {
  value: ObjectEndpoint;
  onChange: (next: ObjectEndpoint) => void;
  nodeId: string;
}) {
  const idSample = useColumnSample(nodeId, value.id);
  const known = useKnownTypes();
  return (
    <FieldGroup>
      <Field label="Id">
        <ValueExpressionEditor
          value={value.id}
          nodeId={nodeId}
          hint="id"
          onChange={(id) => onChange({ ...value, id })}
        />
      </Field>
      {/* Not collapsed, unlike the rest of the tail. Under the editor's default policies
          (type-prefixed ids, create-on-missing) an endpoint with no type cannot resolve at all, so
          hiding the field behind "optional" was hiding the most important thing on the form. */}
      <Field
        label="Object type"
        hint="Which type of object this id refers to. Required to rebuild a type-prefixed id, and to create the object when it does not exist yet."
      >
        <OptionalValueExpression
          value={value.object_type}
          nodeId={nodeId}
          hint="type"
          suggestions={known.objects}
          constantPlaceholder="e.g. order"
          noneLabel="Infer"
          onChange={(object_type) => onChange({ ...value, object_type })}
        />
      </Field>
      <Disclosure
        title="Multiple ids in one cell"
        summary={value.split ? "split into several" : "one id per cell"}
        defaultOpen={!!value.split}
      >
        <SplitSpecEditor
          value={value.split}
          sample={idSample}
          onChange={(split) => onChange({ ...value, split })}
        />
      </Disclosure>
    </FieldGroup>
  );
}

/** Reusable across `Target::Event` and `E2O.event`. Mirrors `ObjectEndpointEditor`. */
export function EventEndpointEditor({
  value,
  onChange,
  nodeId,
}: {
  value: EventEndpoint;
  onChange: (next: EventEndpoint) => void;
  nodeId: string;
}) {
  const known = useKnownTypes();
  return (
    <FieldGroup>
      <Field label="Id">
        <ValueExpressionEditor
          value={value.id}
          nodeId={nodeId}
          hint="id"
          onChange={(id) => onChange({ ...value, id })}
        />
      </Field>
      <Field
        label="Event type"
        hint="Which type of event this id refers to. Required to rebuild a type-prefixed id."
      >
        <OptionalValueExpression
          value={value.event_type}
          nodeId={nodeId}
          hint="type"
          suggestions={known.events}
          constantPlaceholder="e.g. place order"
          noneLabel="Infer"
          onChange={(event_type) => onChange({ ...value, event_type })}
        />
      </Field>
    </FieldGroup>
  );
}

// ---- Optional wrappers ----

/** An expression that may be absent: "no expression" is the first option in the same pill group as
 *  Column/Template/Constant/Coalesce, so the whole choice is one control. */
function OptionalValueExpression({
  value,
  onChange,
  nodeId,
  hint,
  suggestions,
  constantPlaceholder,
  noneLabel = "Auto",
  noneHint,
}: {
  value: ValueExpression | null | undefined;
  onChange: (next: ValueExpression | undefined) => void;
  nodeId: string;
  hint?: ColumnHint;
  suggestions?: readonly string[];
  constantPlaceholder?: string;
  /** What "no expression" is called here: "Auto" for a synthesized id, "None"/"Infer" otherwise. */
  noneLabel?: string;
  /** One line shown in place of the editor while nothing is set, saying what happens then. */
  noneHint?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex justify-end">
        <PillGroup
          value={value?.type ?? "none"}
          options={[
            { value: "none", label: noneLabel },
            ...KIND_ORDER.map((k) => ({ value: k, label: KIND_LABEL[k] })),
          ]}
          onChange={(k) => onChange(k === "none" ? undefined : defaultForKind(k as ValueExpression["type"]))}
        />
      </div>
      {value ? (
        <ValueExpressionEditor
          value={value}
          nodeId={nodeId}
          hint={hint}
          suggestions={suggestions}
          constantPlaceholder={constantPlaceholder}
          hideKindSwitch
          onChange={onChange}
        />
      ) : (
        noneHint && (
          <Text size="1" color="gray" className="text-[12px] leading-snug">
            {noneHint}
          </Text>
        )
      )}
    </div>
  );
}

function OptionalTimestampSource({
  value,
  onChange,
  nodeId,
  setLabel = "Set",
}: {
  value: TimestampSource | null | undefined;
  onChange: (next: TimestampSource | undefined) => void;
  nodeId: string;
  setLabel?: string;
}) {
  if (!value) {
    return (
      <Button
        size="1"
        variant="outline"
        color="gray"
        className="bp-add-row"
        onClick={() => onChange(defaultTimestamp())}
      >
        <PiPlus /> {setLabel}
      </Button>
    );
  }
  return (
    <div className="flex items-start gap-1">
      <div className="min-w-0 flex-1">
        <TimestampSourceEditor value={value} nodeId={nodeId} onChange={onChange} />
      </div>
      <RemoveButton label="Clear" onClick={() => onChange(undefined)} />
    </div>
  );
}

// ---- Timestamps ----

const TIMESTAMP_FORMATS: { value: TimestampFormat["type"]; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "format-string", label: "Format string" },
  { value: "unix-seconds", label: "Unix seconds" },
  { value: "unix-millis", label: "Unix millis" },
];

function TimestampFormatEditor({
  value,
  onChange,
}: {
  value: TimestampFormat;
  onChange: (next: TimestampFormat) => void;
}) {
  return (
    // Wraps and shrinks: a select plus a pattern input does not fit one half-width cell.
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Select.Root
        size="1"
        value={value.type}
        onValueChange={(t) =>
          onChange(
            t === "format-string" ? { type: "format-string", format: "" } : ({ type: t } as TimestampFormat),
          )
        }
      >
        <Select.Trigger className="min-w-0" />
        <Select.Content>
          {TIMESTAMP_FORMATS.map((f) => (
            <Select.Item key={f.value} value={f.value}>
              {f.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      {value.type === "format-string" && (
        <TextField.Root
          size="1"
          className="min-w-0 flex-1 basis-32 font-mono"
          value={value.format}
          onChange={(e) => onChange({ type: "format-string", format: e.target.value })}
          placeholder="%Y-%m-%d %H:%M:%S"
        />
      )}
    </div>
  );
}

/** One half of a "separate date and time" pair. Each side is a full `ValueExpression` with its own
 *  format, since the two halves are routinely spelled differently (SAP's `UDATE`/`UTIME`). */
function TimestampPartEditor({
  label,
  value,
  onChange,
  nodeId,
  formatPlaceholder,
}: {
  label: string;
  value: TimestampPart | undefined;
  onChange: (next: TimestampPart | undefined) => void;
  nodeId: string;
  formatPlaceholder: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center justify-between gap-1">
        <Text size="2" weight="medium" className="truncate" style={{ color: "var(--gray-12)" }}>
          {label}
        </Text>
        {value && (
          <RemoveButton label={`Remove ${label.toLowerCase()}`} onClick={() => onChange(undefined)} />
        )}
      </div>
      {value ? (
        <>
          <ValueExpressionEditor
            value={value.source}
            onChange={(source) => onChange({ ...value, source })}
            nodeId={nodeId}
            hint="timestamp"
            constantPlaceholder={formatPlaceholder}
          />
          <InlineDisclosure label="Format" defaultOpen={value.format !== undefined}>
            <TimestampFormatEditor
              value={value.format ?? { type: "auto" }}
              onChange={(format) =>
                onChange({ ...value, format: format.type === "auto" ? undefined : format })
              }
            />
          </InlineDisclosure>
        </>
      ) : (
        <Button
          size="1"
          variant="outline"
          color="gray"
          className="bp-add-row"
          onClick={() => onChange({ source: { type: "column", column: "" } })}
        >
          <PiPlus /> Add {label.toLowerCase()}
        </Button>
      )}
    </div>
  );
}

/** A timestamp is one ordinary `ValueExpression` by default, so it gets the same kind switch every
 *  other field has; "separate date and time" is a distinct mode because a pair is a different
 *  shape, not a different expression. */
function TimestampSourceEditor({
  value,
  onChange,
  nodeId,
}: {
  value: TimestampSource;
  onChange: (next: TimestampSource) => void;
  nodeId: string;
}) {
  const modeSwitch = (
    <PillGroup<"value" | "components">
      value={value.type}
      options={[
        { value: "value", label: "One value" },
        { value: "components", label: "Date + time" },
      ]}
      onChange={(mode) =>
        onChange(
          mode === "components"
            ? {
                type: "components",
                date: { source: { type: "column", column: "" } },
                time: { source: { type: "constant", value: "00:00:00" } },
              }
            : { type: "value", source: { type: "column", column: "" } },
        )
      }
    />
  );
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {value.type === "components" ? (
        <div
          className="flex min-w-0 flex-col gap-2 rounded-lg p-2.5"
          style={{ border: "1px solid var(--gray-a5)", background: "var(--gray-a2)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <Text size="1" style={{ color: "var(--gray-11)" }}>
              Combined from two values
            </Text>
            {modeSwitch}
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            <TimestampPartEditor
              label="Date"
              value={value.date ?? undefined}
              onChange={(date) => onChange({ ...value, date })}
              nodeId={nodeId}
              formatPlaceholder="2024-01-02"
            />
            <TimestampPartEditor
              label="Time"
              value={value.time ?? undefined}
              onChange={(time) => onChange({ ...value, time })}
              nodeId={nodeId}
              formatPlaceholder="00:00:00"
            />
          </div>
        </div>
      ) : (
        <>
          {/* Pulled up onto the kind pills' row, so both switches sit by what they change. */}
          <div className="-mt-6.75 flex justify-end">{modeSwitch}</div>
          <ValueExpressionEditor
            value={value.source}
            onChange={(source) => onChange({ ...value, source })}
            nodeId={nodeId}
            hint="timestamp"
            constantPlaceholder="1970-01-01T00:00:00+00:00"
          />
          <InlineDisclosure label="Format" defaultOpen={value.format != null}>
            <TimestampFormatEditor
              value={value.format ?? { type: "auto" }}
              onChange={(format) =>
                onChange({ ...value, format: format.type === "auto" ? undefined : format })
              }
            />
          </InlineDisclosure>
        </>
      )}
    </div>
  );
}

// ---- Lists ----

function AttributeMappingList({
  value,
  onChange,
  nodeId,
}: {
  value: AttributeMapping[];
  onChange: (next: AttributeMapping[]) => void;
  nodeId: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 && (
        <Text size="1" color="gray" className="text-[11px] italic">
          No attributes carried over from the row.
        </Text>
      )}
      {value.map((row, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 basis-40">
            <ColumnPicker
              nodeId={nodeId}
              value={row.source_column}
              placeholder="source column..."
              onValueChange={(source_column) =>
                onChange(
                  value.map((r, ii) =>
                    ii === i
                      ? {
                          ...r,
                          source_column,
                          name: attributeNameFor(r.name, r.source_column, source_column),
                        }
                      : r,
                  ),
                )
              }
            />
          </div>
          <Text size="1" color="gray" className="shrink-0">
            as
          </Text>
          <TextField.Root
            size="1"
            className="w-[110px] min-w-0 shrink"
            value={row.name}
            placeholder="attribute"
            onChange={(e) => onChange(value.map((r, ii) => (ii === i ? { ...r, name: e.target.value } : r)))}
          />
          <Select.Root
            size="1"
            value={row.value_type ?? "auto"}
            onValueChange={(v) =>
              onChange(
                value.map((r, ii) =>
                  ii === i ? { ...r, value_type: v === "auto" ? undefined : (v as OCELAttributeType) } : r,
                ),
              )
            }
          >
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="auto">Infer</Select.Item>
              {ATTRIBUTE_TYPES.map((t) => (
                <Select.Item key={t.value} value={t.value}>
                  {t.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <RemoveButton
            label="Remove attribute"
            onClick={() => onChange(value.filter((_, ii) => ii !== i))}
          />
        </div>
      ))}
      <Button
        size="1"
        variant="outline"
        color="gray"
        className="bp-add-row"
        onClick={() => onChange([...value, { source_column: "", name: "", value_type: undefined }])}
      >
        <PiPlus /> Add attribute
      </Button>
    </div>
  );
}

/** Objects an event names in its own row. Each is a collapsed card summarising the id it reads, so
 *  an event linking three objects is three lines rather than three open forms. */
function InlineObjectRefList({
  value,
  onChange,
  nodeId,
}: {
  value: InlineObjectRef[];
  onChange: (next: InlineObjectRef[]) => void;
  nodeId: string;
}) {
  const edit = useEditContext();
  /** An event usually links one object per foreign key, so the next reference starts from the best
   *  id-ish column none of the existing ones already reads. */
  const nextIdColumn = () => {
    if (!edit) return undefined;
    const taken = new Set(
      value.map((r) => (r.object.id.type === "column" ? r.object.id.column : "")).filter(Boolean),
    );
    return scoringColumns(edit.model.nodes, edit.catalog, nodeId, "id").find((c) => !taken.has(c));
  };
  return (
    <div className="flex flex-col gap-2">
      {value.length === 0 && (
        <Text size="1" color="gray" className="text-[11px] italic">
          No objects linked from this row. Add one to relate the event to an object named in the same row.
        </Text>
      )}
      {value.map((row, i) => (
        <Disclosure
          key={i}
          title={describeExpr(row.object.id) ?? `Object ${i + 1}`}
          summary={describeExpr(row.qualifier) ?? "no qualifier"}
        >
          <ObjectEndpointEditor
            value={row.object}
            nodeId={nodeId}
            onChange={(object) => onChange(value.map((r, ii) => (ii === i ? { ...r, object } : r)))}
          />
          <Field label="Qualifier">
            <OptionalValueExpression
              value={row.qualifier}
              nodeId={nodeId}
              hint="string"
              noneLabel="None"
              onChange={(qualifier) => onChange(value.map((r, ii) => (ii === i ? { ...r, qualifier } : r)))}
            />
          </Field>
          <div className="flex justify-end">
            <RemoveButton
              withLabel
              label="Remove object"
              onClick={() => onChange(value.filter((_, ii) => ii !== i))}
            />
          </div>
        </Disclosure>
      ))}
      <Button
        size="1"
        variant="outline"
        color="gray"
        className="bp-add-row"
        onClick={() => {
          const column = nextIdColumn();
          const object = defaultObjectEndpoint();
          onChange([
            ...value,
            { object: column ? { ...object, id: { type: "column", column } } : object, qualifier: undefined },
          ]);
        }}
      >
        <PiPlus /> Link an object
      </Button>
    </div>
  );
}
