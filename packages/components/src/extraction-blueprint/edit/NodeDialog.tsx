// One dialog for adding *and* editing every non-Source node, opened by a node's `+` (add a child)
// or its gear (edit itself). A card grid picks the kind, grouped into "Mappings" and "Transforms",
// and the chosen kind's full configuration form renders directly underneath -- so choosing a kind
// and configuring it is one step, not two. This is OCPQ's `AddChildNodeDialog` shape, which is the
// interaction the previous editor got right.
import {
  Button,
  CardSelector,
  CardSelectorContent,
  Dialog,
  IconButton,
  Text,
  TextField,
  type CardSelectorOption,
} from "@r4pm/components/ui";
import { useState } from "react";
import type { IconType } from "react-icons";
import {
  PiArrowsLeftRight,
  PiCalendarDots,
  PiCube,
  PiFunnel,
  PiListNumbers,
  PiMagicWand,
  PiPlus,
  PiStack,
  PiTreeStructure,
  PiX,
} from "react-icons/pi";
import { entryMappings, singleEntry, withEntryNode } from "../model";
import { KIND_ACCENT } from "../nodes";
import type { Mapping, MappingEntry, NodeOp } from "../types";
import { ColumnPicker } from "./ColumnPicker";
import { Disclosure, Field, FieldGroup } from "./Disclosure";
import { suggestJoinKeys } from "./node-draft";
import { useEditContext } from "./edit-context";
import { SourceIdPicker, TablePicker } from "./TablePicker";
import { describePredicate } from "../node-summary";
import { PredicateEditor } from "./PredicateEditor";
import { RemoveButton } from "./RemoveButton";
import { TargetEditor } from "./TargetEditor";
import {
  convertEntry,
  convertNodeOp,
  defaultEntry,
  defaultNodeOp,
  defaultTarget,
  isTransformKind,
  KIND_META,
  MAPPING_KINDS,
  TRANSFORM_KINDS,
  type DraftKind,
  type MappingSeed,
} from "./node-draft";

const KIND_ICON: Record<DraftKind, IconType> = {
  event: PiCalendarDots,
  object: PiCube,
  e2o: PiArrowsLeftRight,
  o2o: PiArrowsLeftRight,
  ordered: PiListNumbers,
  filter: PiFunnel,
  join: PiTreeStructure,
  union: PiStack,
};

/** Per-kind icon colour, matching the canvas. Both relation kinds share one colour. */
const KIND_ICON_COLOR: Record<DraftKind, string> = {
  event: KIND_ACCENT.event,
  object: KIND_ACCENT.object,
  e2o: KIND_ACCENT.relation,
  o2o: KIND_ACCENT.relation,
  ordered: KIND_ACCENT.event,
  filter: KIND_ACCENT.filter,
  join: KIND_ACCENT.join,
  union: KIND_ACCENT.union,
};

const OPTIONS: CardSelectorOption<DraftKind>[] = [
  ...MAPPING_KINDS.map((k) => cardFor(k, "mappings")),
  ...TRANSFORM_KINDS.map((k) => cardFor(k, "transforms")),
];

function cardFor(kind: DraftKind, group: string): CardSelectorOption<DraftKind> {
  const Icon = KIND_ICON[kind];
  return {
    value: kind,
    title: KIND_META[kind].label,
    description: KIND_META[kind].description,
    icon: <Icon size={16} />,
    // Icon only: `accent` stays unset so border, fill and radio keep the one theme accent.
    iconColor: KIND_ICON_COLOR[kind],
    group,
  };
}

const GROUP_LABELS = { mappings: "OCEL Usages", transforms: "Transforms" };

/** What the dialog is working on. `create` wires the result to `sourceNodeId`; the two `edit`
 *  modes load an existing node/mapping and can still switch its kind. */
export type NodeDialogRequest =
  | { mode: "create"; sourceNodeId: string }
  | { mode: "edit-node"; nodeId: string }
  | { mode: "edit-mapping"; mappingId: string }
  /** A Source has no kind to choose and no input to read, so it gets the dialog without the card
   *  grid rather than a separate side panel. */
  | { mode: "edit-source"; nodeId: string };

export interface NodeDialogProps {
  request: NodeDialogRequest;
  /** Initial kind, when editing. */
  initialKind: DraftKind;
  /** Initial mapping entry, when editing a mapping. */
  initialEntry?: MappingEntry;
  /** Initial op, when editing a transform node. */
  initialOp?: NodeOp;
  /** Node whose resolved schema drives every column picker in the form: the node being read. */
  schemaNodeId: string;
  /** New mappings start pre-filled from the table they read: its name as the type, its id-ish
   *  column as the id. */
  seed?: MappingSeed;
  onCancel: () => void;
  onConfirmMapping: (kind: DraftKind, entry: MappingEntry) => void;
  onConfirmTransform: (kind: DraftKind, op: NodeOp) => void;
}

export function NodeDialog({
  request,
  initialKind,
  initialEntry,
  initialOp,
  schemaNodeId,
  seed,
  onCancel,
  onConfirmMapping,
  onConfirmTransform,
}: NodeDialogProps) {
  const isEditing = request.mode !== "create";
  const isSource = request.mode === "edit-source";
  const [kind, setKind] = useState<DraftKind>(initialKind);
  const [entry, setEntry] = useState<MappingEntry>(
    () =>
      initialEntry ?? defaultEntry(isTransformKind(initialKind) ? "event" : initialKind, schemaNodeId, seed),
  );
  const [op, setOp] = useState<NodeOp>(
    () => initialOp ?? defaultNodeOp(isTransformKind(initialKind) ? initialKind : "filter", schemaNodeId),
  );

  const changeKind = (next: DraftKind) => {
    if (next === kind) return;
    if (isTransformKind(next))
      setOp(isTransformKind(kind) ? convertNodeOp(op, next) : defaultNodeOp(next, schemaNodeId));
    else
      setEntry(
        isTransformKind(kind)
          ? defaultEntry(next, schemaNodeId, seed)
          : convertEntry(entry, next, schemaNodeId, seed),
      );
    setKind(next);
  };

  const confirm = () => {
    if (isSource) onConfirmTransform("filter", op);
    else if (isTransformKind(kind)) onConfirmTransform(kind, op);
    else onConfirmMapping(kind, withEntryNode(entry, schemaNodeId));
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Content
        maxWidth="760px"
        className="flex max-h-[88vh] flex-col"
        // A configuration form holds unsaved edits, and it is full of popovers and selects that
        // render in their own portals. Closing on any outside interaction meant a click inside a
        // column picker sometimes tore the whole form down; closing is Cancel, Apply or Escape.
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <Dialog.Title size="3" mb="1">
              {isSource ? "Table" : isEditing ? "Edit node" : "Add node"}
            </Dialog.Title>
          </div>
          <IconButton size="1" variant="ghost" color="gray" onClick={onCancel} aria-label="Close">
            <PiX />
          </IconButton>
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          {isSource && initialOp?.type === "source" && (
            <SourceForm op={initialOp} onChange={setOp} value={op} />
          )}
          {!isSource && (
            <CardSelector
              options={OPTIONS}
              value={kind}
              onValueChange={changeKind}
              groupLabels={GROUP_LABELS}
              columns={3}
              aria-label="Node kind"
            >
              <CardSelectorContent>
                {isTransformKind(kind) ? (
                  <TransformForm op={op} onChange={setOp} schemaNodeId={schemaNodeId} />
                ) : (
                  <MappingForm entry={entry} onChange={setEntry} schemaNodeId={schemaNodeId} />
                )}
              </CardSelectorContent>
            </CardSelector>
          )}
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <Button variant="soft" color="gray" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={confirm}>
            {isSource ? "Apply" : isEditing ? "Apply" : `Add ${KIND_META[kind].label}`}
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

/** A Source node's two fields. The table picker is scoped to whatever the chosen source's catalog
 *  reported, so picking a source first narrows the tables rather than offering every name known. */
function SourceForm({ value, onChange }: { op: NodeOp; value: NodeOp; onChange: (o: NodeOp) => void }) {
  if (value.type !== "source") return null;
  return (
    <div className="flex flex-col gap-2.5">
      <Field label="Source">
        <SourceIdPicker
          value={value.source_id}
          onValueChange={(source_id) => onChange({ ...value, source_id })}
        />
      </Field>
      <Field label="Table">
        <TablePicker
          sourceId={value.source_id}
          value={value.table}
          onValueChange={(table) => onChange({ ...value, table })}
        />
      </Field>
    </div>
  );
}

function MappingForm({
  entry,
  onChange,
  schemaNodeId,
}: {
  entry: MappingEntry;
  onChange: (e: MappingEntry) => void;
  schemaNodeId: string;
}) {
  if (entry.type === "ordered") {
    return (
      <OrderedGroupForm
        mappings={entry.mappings}
        onChange={(mappings) => onChange({ type: "ordered", mappings })}
        schemaNodeId={schemaNodeId}
      />
    );
  }
  const [mapping] = entryMappings(entry);
  return (
    <SingleMappingForm
      mapping={mapping}
      onChange={(next) => onChange(singleEntry(next))}
      schemaNodeId={schemaNodeId}
    />
  );
}

function SingleMappingForm({
  mapping,
  onChange,
  schemaNodeId,
  allowKindChange,
}: {
  mapping: Mapping;
  onChange: (m: Mapping) => void;
  schemaNodeId: string;
  /** Show the target-kind selector. Off at the top level, where the card grid already chose the
   *  kind; on inside a rule set, where nothing has yet said what each branch produces. */
  allowKindChange?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <TargetEditor
        value={mapping.target}
        nodeId={schemaNodeId}
        hideKindSelect={!allowKindChange}
        onChange={(target) => onChange({ ...mapping, target })}
      />
      <Disclosure
        title="Row filter"
        summary={describePredicate(mapping.when) ?? "all rows"}
        defaultOpen={!!mapping.when}
      >
        <PredicateEditor
          value={mapping.when ?? null}
          nodeId={schemaNodeId}
          allowEmpty
          onChange={(when) => onChange({ ...mapping, when })}
        />
      </Disclosure>
    </div>
  );
}

/** `Ordered` is surface sugar for "try these in order, first match wins" -- desugaring rewrites
 *  each guard to exclude the earlier ones. The editor shows it as a numbered list so the priority
 *  is the visible thing, since that is the only reason to reach for the construct. */
function OrderedGroupForm({
  mappings,
  onChange,
  schemaNodeId,
}: {
  mappings: Mapping[];
  onChange: (m: Mapping[]) => void;
  schemaNodeId: string;
}) {
  const [openIndex, setOpenIndex] = useState(0);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= mappings.length) return;
    const next = [...mappings];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next);
    setOpenIndex(to);
  };
  return (
    <div className="flex flex-col gap-2">
      <Text size="1" color="gray">
        Each row is matched against these in order; the first whose condition holds produces its target, and
        the rest are skipped for that row.
      </Text>
      {mappings.map((m, i) => (
        <div key={i} className="overflow-hidden rounded-md" style={{ border: "1px solid var(--gray-a6)" }}>
          <div className="flex items-center gap-2 px-2 py-1" style={{ background: "var(--gray-a3)" }}>
            <span className="w-4 shrink-0 text-center text-[11px] font-bold opacity-60">{i + 1}</span>
            <TextField.Root
              size="1"
              className="flex-1"
              value={m.label ?? ""}
              placeholder={`${m.target.type} mapping`}
              onChange={(e) =>
                onChange(
                  mappings.map((mm, ii) => (ii === i ? { ...mm, label: e.target.value || undefined } : mm)),
                )
              }
            />
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              disabled={i === 0}
              title="Move up"
              onClick={() => move(i, i - 1)}
            >
              ↑
            </IconButton>
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              disabled={i === mappings.length - 1}
              title="Move down"
              onClick={() => move(i, i + 1)}
            >
              ↓
            </IconButton>
            <Button size="1" variant="ghost" onClick={() => setOpenIndex(openIndex === i ? -1 : i)}>
              {openIndex === i ? "Hide" : "Edit"}
            </Button>
            <RemoveButton
              label="Remove"
              disabled={mappings.length <= 1}
              onClick={() => onChange(mappings.filter((_, ii) => ii !== i))}
            />
          </div>
          {openIndex === i && (
            <div className="p-2">
              <SingleMappingForm
                mapping={m}
                schemaNodeId={schemaNodeId}
                allowKindChange
                onChange={(next) => onChange(mappings.map((mm, ii) => (ii === i ? next : mm)))}
              />
            </div>
          )}
        </div>
      ))}
      <Button
        size="1"
        variant="soft"
        onClick={() => {
          onChange([
            ...mappings,
            { node: schemaNodeId, label: undefined, when: null, target: defaultTarget("event") },
          ]);
          setOpenIndex(mappings.length);
        }}
      >
        <PiPlus /> Add mapping
      </Button>
    </div>
  );
}

/** What a node is called on the canvas, for the transform forms to name their inputs by. */
function useNodeLabel(): (id: string) => string {
  const edit = useEditContext();
  return (id: string) => {
    const n = edit?.model.nodes.find((x) => x.id === id);
    if (!n) return "not connected";
    return n.label || (n.op.type === "source" ? n.op.table || n.id : n.op.type);
  };
}

/** A named input slot, so a transform's form says what it is actually reading rather than leaving
 *  the user to match it up against the canvas. */
function InputChip({ label, name, connected }: { label: string; name: string; connected: boolean }) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5"
      style={{
        border: `1px solid ${connected ? "var(--gray-a6)" : "var(--amber-a7)"}`,
        background: connected ? "var(--gray-a2)" : "var(--amber-a2)",
      }}
    >
      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider opacity-55">{label}</span>
      <span className="min-w-0 truncate font-mono text-[12px]" title={name}>
        {connected ? name : "not connected"}
      </span>
    </div>
  );
}

function TransformForm({
  op,
  onChange,
  schemaNodeId,
}: {
  op: NodeOp;
  onChange: (o: NodeOp) => void;
  schemaNodeId: string;
}) {
  const edit = useEditContext();
  const nameOf = useNodeLabel();

  if (op.type === "filter") {
    return (
      <>
        <FieldGroup>
          <InputChip label="Input" name={nameOf(op.input)} connected={!!op.input} />
        </FieldGroup>
        <div className="mt-3">
          <Field label="Keep rows where">
            <PredicateEditor
              value={op.condition}
              nodeId={op.input || schemaNodeId}
              onChange={(condition) =>
                onChange({ ...op, condition: condition ?? { type: "and", conditions: [] } })
              }
            />
          </Field>
        </div>
      </>
    );
  }

  if (op.type === "join") {
    const suggestions =
      edit && op.left && op.right ? suggestJoinKeys(edit.model.nodes, edit.catalog, op.left, op.right) : [];
    const blank = op.on.every(([l, r]) => !l && !r);
    return (
      <>
        <FieldGroup>
          <div className="grid grid-cols-2 gap-2">
            <InputChip label="Left" name={nameOf(op.left)} connected={!!op.left} />
            <InputChip label="Right" name={nameOf(op.right)} connected={!!op.right} />
          </div>
          {!op.right && (
            <Text size="1" color="amber" className="text-[11px] leading-snug">
              Drag an edge from another node onto this one's lower-left handle to connect the right input. Its
              columns become available here once it is wired.
            </Text>
          )}
        </FieldGroup>

        <div className="mt-3">
          <Field
            label="Matching rows"
            hint="A row on the left is joined to a row on the right when every pair below is equal. Inner join: a row with no match on the other side is dropped."
          >
            <div className="flex flex-col gap-1.5">
              {op.on.length === 0 && (
                <Text size="1" color="gray" className="text-[11px] italic">
                  No key columns: every left row would be paired with every right row.
                </Text>
              )}
              {op.on.map(([left, right], i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="min-w-0 flex-1">
                    <ColumnPicker
                      nodeId={op.left || schemaNodeId}
                      value={left}
                      placeholder="left column..."
                      onValueChange={(v) =>
                        onChange({ ...op, on: op.on.map((p, ii) => (ii === i ? [v, p[1]] : p)) })
                      }
                    />
                  </div>
                  <span className="shrink-0 font-mono text-[13px] opacity-50">=</span>
                  <div className="min-w-0 flex-1">
                    <ColumnPicker
                      nodeId={op.right || schemaNodeId}
                      value={right}
                      placeholder={op.right ? "right column..." : "connect the right input"}
                      onValueChange={(v) =>
                        onChange({ ...op, on: op.on.map((p, ii) => (ii === i ? [p[0], v] : p)) })
                      }
                    />
                  </div>
                  <RemoveButton
                    label="Remove key pair"
                    onClick={() => onChange({ ...op, on: op.on.filter((_, ii) => ii !== i) })}
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <Button size="1" variant="soft" onClick={() => onChange({ ...op, on: [...op.on, ["", ""]] })}>
                  <PiPlus /> Add key pair
                </Button>
                {suggestions.length > 0 && blank && (
                  <Button
                    size="1"
                    variant="soft"
                    color="orange"
                    onClick={() => onChange({ ...op, on: suggestions })}
                  >
                    <PiMagicWand /> Use {suggestions.map(([l, r]) => `${l} = ${r}`).join(", ")}
                  </Button>
                )}
              </div>
            </div>
          </Field>
        </div>
      </>
    );
  }

  if (op.type === "union") {
    return (
      <>
        <FieldGroup title={`Inputs (${op.inputs.length})`}>
          {op.inputs.length === 0 ? (
            <Text size="1" color="amber" className="text-[11px]">
              Nothing connected yet. Drag edges from the nodes whose rows you want concatenated.
            </Text>
          ) : (
            <div className="flex flex-col gap-1.5">
              {op.inputs.map((input, i) => (
                <div key={input} className="flex items-center gap-2">
                  <InputChip label={`${i + 1}`} name={nameOf(input)} connected />
                  <RemoveButton
                    label="Disconnect this input"
                    onClick={() => onChange({ ...op, inputs: op.inputs.filter((x) => x !== input) })}
                  />
                </div>
              ))}
            </div>
          )}
        </FieldGroup>
        <Text size="1" color="gray" className="mt-2 block text-[11px] leading-snug">
          Rows from every input, one after another. Duplicates are kept, because dropping them would drop the
          entities they produce. Columns line up by name, and an input missing one contributes null for it --
          so unioning two near-identical tables that differ by a column is fine.
        </Text>
      </>
    );
  }

  return null;
}
