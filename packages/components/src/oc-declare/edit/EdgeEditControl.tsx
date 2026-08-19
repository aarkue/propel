import { Flex, IconButton, Popover, SegmentedControl, Separator, Text, TextField } from "@r4pm/components/ui";
import { useEffect, useState } from "react";
import { PiArrowsLeftRight, PiChartBarBold, PiPencilSimpleBold, PiTrashBold } from "react-icons/pi";
import type { OCDeclareArcLabel } from "../index";
import type { ArcType } from "../types";
import {
  type DeclareEdge,
  type EdgeTemplate,
  TEMPLATE_LABELS,
  TEMPLATE_TO_ARC,
  cardinalitySugar,
  toArcs,
} from "../model";
import { ArcGlyph } from "./arc-glyph";
import { useEditContext } from "./edit-context";
import { ObjectInvolvementEditor } from "./ObjectInvolvementEditor";

const POSITIVE: EdgeTemplate[] = ["as", "ef", "ef-rev", "df", "df-rev"];
const NEGATED: EdgeTemplate[] = ["nas", "nef", "nef-rev", "ndf", "ndf-rev"];

function TemplateButton({
  template,
  selected,
  onSelect,
}: {
  template: EdgeTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={TEMPLATE_LABELS[template]}
      aria-pressed={selected}
      className="flex items-center justify-center rounded-md py-1 transition-colors"
      style={{
        flex: "1 1 30%",
        cursor: "pointer",
        color: selected ? "var(--accent-11)" : "var(--gray-10)",
        background: selected ? "var(--accent-a3)" : "var(--gray-a2)",
        border: `1px solid ${selected ? "var(--accent-a7)" : "var(--gray-a4)"}`,
      }}
    >
      <ArcGlyph template={template} />
    </button>
  );
}

const editPencil = (visible: boolean) => (
  <IconButton
    size="1"
    variant="soft"
    radius="full"
    title="Edit constraint"
    style={{
      cursor: "pointer",
      width: 18,
      height: 18,
      minWidth: 18,
      visibility: visible ? "visible" : "hidden",
    }}
  >
    <PiPencilSimpleBold size={11} />
  </IconButton>
);

/** The editing body for a single model edge: header, template picker, inline cardinality + object involvement. */
function EdgeEditForm({ edgeId, onClose }: { edgeId: string; onClose: () => void }) {
  const edit = useEditContext();
  if (!edit) return null;
  const edge = edit.model.edges.find((e) => e.id === edgeId);
  if (!edge) return null;
  const source = edit.model.nodes.find((n) => n.id === edge.source);
  const target = edit.model.nodes.find((n) => n.id === edge.target);

  const setEdge = (patch: Partial<DeclareEdge>) =>
    edit.mutate((m) => ({ ...m, edges: m.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)) }));
  const remove = () => edit.mutate((m) => ({ ...m, edges: m.edges.filter((e) => e.id !== edgeId) }));
  const negated = TEMPLATE_TO_ARC[edge.template].negated;

  return (
    <>
      <Flex justify="between" align="center" mb="2">
        <Text size="1" weight="bold" color="gray" className="truncate">
          {source?.type ?? "?"} → {target?.type ?? "?"}
        </Text>
        <Flex gap="1">
          {edit.callbacks.onEdgeStatistics && (
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              title="View statistics"
              onClick={() => {
                const arc = toArcs({ nodes: edit.model.nodes, edges: [edge] })[0];
                if (arc) {
                  edit.openStats({ kind: "edge", arc });
                  onClose();
                }
              }}
            >
              <PiChartBarBold />
            </IconButton>
          )}
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            title="Switch direction"
            onClick={() => setEdge({ source: edge.target, target: edge.source })}
          >
            <PiArrowsLeftRight />
          </IconButton>
          <IconButton size="1" variant="ghost" color="red" title="Delete constraint" onClick={remove}>
            <PiTrashBold />
          </IconButton>
        </Flex>
      </Flex>

      <Flex gap="1" wrap="wrap">
        {POSITIVE.map((t) => (
          <TemplateButton
            key={t}
            template={t}
            selected={edge.template === t}
            onSelect={() => setEdge({ template: t })}
          />
        ))}
      </Flex>
      <Flex gap="1" wrap="wrap" mt="1">
        {NEGATED.map((t) => (
          <TemplateButton
            key={t}
            template={t}
            selected={edge.template === t}
            onSelect={() => setEdge({ template: t })}
          />
        ))}
      </Flex>

      <Separator my="2" size="4" />
      <InlineCardinality
        arcType={TEMPLATE_TO_ARC[edge.template].arc_type}
        negated={negated}
        value={edge.cardinality}
        onChange={(c) => setEdge({ cardinality: c })}
      />

      <Separator my="2" size="4" />
      <Text size="1" color="gray" weight="medium" as="div" mb="1">
        Objects
      </Text>
      {source && target && (
        <ObjectInvolvementEditor
          value={edge.label}
          objectTypes={edit.palette.objectTypes}
          source={source}
          target={target}
          getSupport={edit.getSupport}
          onChange={(v) => setEdge({ label: v })}
        />
      )}
    </>
  );
}

/** Per-edge editing surface: a hover pencil opening a visual popover with {@link EdgeEditForm}. */
export function EdgeEditControl({ edgeId, showPencil = true }: { edgeId: string; showPencil?: boolean }) {
  const edit = useEditContext();
  const [open, setOpen] = useState(false);
  if (!edit) return null;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>{editPencil(showPencil || open)}</Popover.Trigger>
      <Popover.Content size="1" width="320px" side="top" align="center" className="nodrag nopan">
        <EdgeEditForm edgeId={edgeId} onClose={() => setOpen(false)} />
      </Popover.Content>
    </Popover.Root>
  );
}

/** Editing surface for a collapsed EFEP/DFDP arc: an EF | EP | Both chooser; "Both" applies the shared label to both edges. */
export function MergedEdgeEditControl({
  pair,
  showPencil = true,
}: {
  pair: { forward: string; backward: string };
  showPencil?: boolean;
}) {
  const edit = useEditContext();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"forward" | "backward" | "both">("forward");
  if (!edit) return null;
  const fwd = edit.model.edges.find((e) => e.id === pair.forward);
  const bwd = edit.model.edges.find((e) => e.id === pair.backward);
  if (!fwd || !bwd) return null;
  const fwdArc = TEMPLATE_TO_ARC[fwd.template].arc_type;
  const bwdArc = TEMPLATE_TO_ARC[bwd.template].arc_type;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>{editPencil(showPencil || open)}</Popover.Trigger>
      <Popover.Content size="1" width="320px" side="top" align="center" className="nodrag nopan">
        <SegmentedControl.Root
          size="1"
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="mb-2 w-full"
        >
          <SegmentedControl.Item value="forward">{fwdArc}</SegmentedControl.Item>
          <SegmentedControl.Item value="backward">{bwdArc}</SegmentedControl.Item>
          <SegmentedControl.Item value="both">Both</SegmentedControl.Item>
        </SegmentedControl.Root>
        {tab === "forward" && <EdgeEditForm edgeId={pair.forward} onClose={() => setOpen(false)} />}
        {tab === "backward" && <EdgeEditForm edgeId={pair.backward} onClose={() => setOpen(false)} />}
        {tab === "both" && <BothObjectsForm forwardId={pair.forward} backwardId={pair.backward} />}
      </Popover.Content>
    </Popover.Root>
  );
}

/** The "Both" tab: one object-involvement editor whose changes apply the shared label to both edges. */
function BothObjectsForm({ forwardId, backwardId }: { forwardId: string; backwardId: string }) {
  const edit = useEditContext();
  if (!edit) return null;
  const fwd = edit.model.edges.find((e) => e.id === forwardId);
  const source = edit.model.nodes.find((n) => n.id === fwd?.source);
  const target = edit.model.nodes.find((n) => n.id === fwd?.target);
  if (!fwd || !source || !target) return null;
  const setBoth = (label: OCDeclareArcLabel) =>
    edit.mutate((m) => ({
      ...m,
      edges: m.edges.map((e) => (e.id === forwardId || e.id === backwardId ? { ...e, label } : e)),
    }));
  return (
    <>
      <Text size="1" color="gray" weight="medium" as="div" mb="1">
        Objects (applies to both directions)
      </Text>
      <ObjectInvolvementEditor
        value={fwd.label}
        objectTypes={edit.palette.objectTypes}
        source={source}
        target={target}
        getSupport={edit.getSupport}
        onChange={setBoth}
      />
    </>
  );
}

/** Inline `[min] - [max]` cardinality with a live sugar preview; disabled for negated templates. */
function InlineCardinality({
  arcType,
  negated,
  value,
  onChange,
}: {
  arcType: ArcType;
  negated: boolean;
  value?: [number | null, number | null];
  onChange: (c?: [number | null, number | null]) => void;
}) {
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  useEffect(() => {
    setMin(value?.[0] != null ? String(value[0]) : "");
    setMax(value?.[1] != null ? String(value[1]) : "");
  }, [value]);

  const commit = (mnStr: string, mxStr: string) => {
    const mn = mnStr.trim() === "" ? null : Number(mnStr);
    const mx = mxStr.trim() === "" ? null : Number(mxStr);
    const bad = (mn != null && !Number.isFinite(mn)) || (mx != null && !Number.isFinite(mx));
    onChange(bad || (mn == null && mx == null) ? undefined : [mn, mx]);
  };

  return (
    <Flex align="center" gap="2">
      <Text size="1" color="gray" weight="medium" style={{ width: 62 }}>
        {arcType} count
      </Text>
      <TextField.Root
        size="1"
        type="number"
        placeholder="min"
        disabled={negated}
        value={min}
        onChange={(e) => {
          setMin(e.currentTarget.value);
          commit(e.currentTarget.value, max);
        }}
        style={{ width: 64 }}
      />
      <Text size="1" color="gray">
        –
      </Text>
      <TextField.Root
        size="1"
        type="number"
        placeholder="max"
        disabled={negated}
        value={max}
        onChange={(e) => {
          setMax(e.currentTarget.value);
          commit(min, e.currentTarget.value);
        }}
        style={{ width: 64 }}
      />
      <Text size="1" color={negated ? "gray" : undefined} className="ml-auto">
        {negated ? "0" : (cardinalitySugar(value) ?? "≥ 1")}
      </Text>
    </Flex>
  );
}
